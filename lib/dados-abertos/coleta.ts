import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { normalizarTexto, normalizarUnidade } from "@/lib/pesquisa-preco";
import { paginaBps } from "@/lib/dados-abertos/bps";
import { itemDoCatalogo, paginaItensAta, paginaPrecosMaterial, type Assinatura } from "@/lib/dados-abertos/comprasgov";
import {
  mapearArpItem,
  mapearBps,
  mapearComprasGov,
  type LinhaDadosAbertos,
  type Mapeado,
  type OrigemCarga,
} from "@/lib/dados-abertos/mapear";
import type { OrigemColeta } from "@/lib/dados-abertos/situacao";

// ─────────────────────────────────────────────────────────────────────────────
// Coleta das APIs de dados abertos pelo painel — UMA página por chamada.
//
// A tela repete a chamada até a última página e obedece `aguardarMs` num 429:
// uma coleta de dezenas de páginas não cabe numa função serverless, e a função
// não pode dormir esperando a cota (P24). Cada página é gravada na hora, com o
// id determinístico do registro (COMPRASGOV:<chave22>, BPS:<sha1>…): recoletar
// substitui a linha sem mudar o id, e as exclusões da curadoria continuam
// valendo. Ao fim de uma coleta completa, o que a API não devolveu mais na
// janela é removido (a base fica igual à origem).
//
// Janela: 36 meses para Compras.gov.br e BPS — cobre os períodos de 12, 24 e
// 36 meses da pesquisa (D1) sem nova coleta; 365 dias para atas (P17).
// ─────────────────────────────────────────────────────────────────────────────

export const JANELA_COLETA_DIAS: Record<OrigemColeta, number> = {
  COMPRASGOV: 3 * 365 + 1,
  BPS: 3 * 365 + 1,
  ARP_ITEM: 365,
};

export type StatusColeta = "EM_ANDAMENTO" | "OK" | "PARCIAL" | "ERRO" | "CONTRATO_ALTERADO";

export interface ResultadoPaginaColeta {
  coletaId: string | null;
  origem: OrigemColeta;
  catmat: string;
  pagina: number;
  /** null = coleta terminada. */
  proximaPagina: number | null;
  totalPaginas: number | null;
  esperados: number | null;
  baixados: number;
  gravadosNestaPagina: number;
  /** Itens que a API devolveu mas não puderam ser mapeados (chave/preço inválidos). */
  rejeitados: number;
  /** Itens recebidos em dobro na mesma página (mesma chave). */
  repetidos?: number;
  status: StatusColeta;
  /** 429: espere e repita a MESMA página. */
  aguardarMs?: number;
  erro?: string;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const dataDb = (s: string | null) => (s ? new Date(`${s}T00:00:00Z`) : null);

function janela(origem: OrigemColeta, hoje = new Date()): { inicio: string; fim: string } {
  const inicio = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate()) - (JANELA_COLETA_DIAS[origem] - 1) * 86_400_000);
  return { inicio: iso(inicio), fim: iso(hoje) };
}

function paraBanco(l: LinhaDadosAbertos, bruto: unknown, coletadoEm: Date): Prisma.DadosAbertosPrecoCreateManyInput {
  return {
    ...l,
    unidadeNorm: l.unidade ? normalizarUnidade(l.unidade) : null,
    dataCompra: dataDb(l.dataCompra),
    dataResultado: dataDb(l.dataResultado),
    dataInsercao: dataDb(l.dataInsercao),
    bruto: bruto as Prisma.InputJsonValue,
    coletadoEm,
  };
}

/** Grava as linhas de uma página: apaga pelo id e recria — dois comandos, não 500 upserts. */
export async function gravarLinhas(
  linhas: Array<{ linha: LinhaDadosAbertos; bruto: unknown }>,
  coletadoEm = new Date()
): Promise<number> {
  // A mesma chave pode vir duas vezes na mesma página (a API repete itens):
  // fica a última, como num upsert.
  const porId = new Map(linhas.map((x) => [x.linha.id, x]));
  if (!porId.size) return 0;
  const dados = Array.from(porId.values()).map((x) => paraBanco(x.linha, x.bruto, coletadoEm));
  await db.$transaction([
    db.dadosAbertosPreco.deleteMany({ where: { id: { in: Array.from(porId.keys()) } } }),
    db.dadosAbertosPreco.createMany({ data: dados }),
  ]);
  return dados.length;
}

/** CATMAT fora do catálogo local (ex.: 640532): busca no catálogo oficial e grava em CatmatItem. */
export async function garantirItemCatalogo(catmat: string): Promise<"existia" | "incluido" | "nao_encontrado" | "erro"> {
  const existe = await db.catmatItem.findUnique({ where: { codigoItem: catmat }, select: { codigoItem: true } });
  if (existe) return "existia";
  const r = await itemDoCatalogo(catmat);
  if (r.tipo !== "ok") return "erro";
  const i = r.dados;
  if (!i) return "nao_encontrado";
  const s = (v: unknown) => String(v ?? "").trim();
  const descricao = s(i.descricaoItem);
  await db.catmatItem.create({
    data: {
      codigoItem: catmat,
      descricaoItem: descricao,
      descricaoNorm: normalizarTexto(descricao),
      codigoPdm: s(i.codigoPdm),
      nomePdm: s(i.nomePdm),
      codigoClasse: s(i.codigoClasse),
      nomeClasse: s(i.nomeClasse),
      codigoGrupo: s(i.codigoGrupo),
      nomeGrupo: s(i.nomeGrupo),
      codigoNcm: s(i.codigo_ncm) || null,
    },
  });
  return "incluido";
}

/**
 * A API de atas não informa a unidade de fornecimento: ela vem do registro do
 * Compras.gov.br com a mesma chave de 22 dígitos (mesma compra, mesmo item).
 * Sem a compra coletada, o item de ata fica sem unidade e fora da pesquisa,
 * que é por unidade — por isso a tela coleta o Compras.gov.br antes das atas.
 */
async function unidadeDasAtas(linhas: LinhaDadosAbertos[]): Promise<void> {
  const chaves = linhas.map((l) => l.chaveItemCompra22).filter((c): c is string => !!c);
  if (!chaves.length) return;
  const compras = await db.dadosAbertosPreco.findMany({
    where: { origem: "COMPRASGOV", chaveItemCompra22: { in: chaves } },
    select: { chaveItemCompra22: true, unidade: true },
  });
  const porChave = new Map(compras.map((c) => [c.chaveItemCompra22, c.unidade]));
  for (const l of linhas) {
    if (!l.unidade && l.chaveItemCompra22) l.unidade = porChave.get(l.chaveItemCompra22) ?? null;
  }
}

export async function coletarPagina(p: {
  origem: OrigemColeta;
  catmat: string;
  pagina: number;
  coletaId?: string | null;
  usuarioId: string | null;
}): Promise<ResultadoPaginaColeta> {
  const base = { origem: p.origem, catmat: p.catmat, pagina: p.pagina };
  const { inicio, fim } = janela(p.origem);

  // Primeira página abre a coleta; as seguintes continuam a mesma.
  let coleta = p.coletaId ? await db.dadosAbertosColeta.findUnique({ where: { id: p.coletaId } }) : null;
  if (p.coletaId && (!coleta || coleta.codigoCatmat !== p.catmat || coleta.origem !== p.origem)) {
    return { ...base, coletaId: null, proximaPagina: null, totalPaginas: null, esperados: null, baixados: 0, gravadosNestaPagina: 0, rejeitados: 0, status: "ERRO", erro: "coleta não encontrada" };
  }
  if (!coleta) {
    if (p.origem === "COMPRASGOV") await garantirItemCatalogo(p.catmat).catch(() => "erro");
    coleta = await db.dadosAbertosColeta.create({
      data: {
        origem: p.origem,
        codigoCatmat: p.catmat,
        dataInicio: new Date(`${inicio}T00:00:00Z`),
        dataFim: new Date(`${fim}T00:00:00Z`),
        status: "EM_ANDAMENTO",
        origemCarga: "API_PAINEL",
        usuarioId: p.usuarioId,
      },
    });
  }
  const inicioColeta = coleta.dataInicio.toISOString().slice(0, 10);
  const fimColeta = coleta.dataFim.toISOString().slice(0, 10);

  // Uma página da origem.
  let itens: Record<string, unknown>[] = [];
  let totalPaginas: number | null = null;
  let esperados: number | null = coleta.esperados;
  let assinatura: Assinatura | null = (coleta.assinatura as Assinatura | null) ?? null;
  let proxima: number | null = null;
  const resposta =
    p.origem === "COMPRASGOV"
      ? await paginaPrecosMaterial({ catmat: p.catmat, inicio: inicioColeta, fim: fimColeta, pagina: p.pagina, assinatura }).then((r) => {
          assinatura = r.assinatura;
          return r.resposta;
        })
      : p.origem === "ARP_ITEM"
        ? await paginaItensAta({ catmat: p.catmat, vigenciaInicio: inicioColeta, vigenciaFim: fimColeta, pagina: p.pagina })
        : await paginaBps({ catmat: p.catmat, inicio: inicioColeta, fim: fimColeta, pagina: p.pagina });

  const resumo = { ...base, coletaId: coleta.id, baixados: coleta.baixados, esperados: coleta.esperados, totalPaginas: null, rejeitados: 0, gravadosNestaPagina: 0 };
  if (resposta.tipo === "aguardar") {
    return { ...resumo, proximaPagina: p.pagina, status: "EM_ANDAMENTO", aguardarMs: resposta.aguardarMs };
  }
  if (resposta.tipo !== "ok") {
    const status: StatusColeta = resposta.tipo === "contrato_alterado" ? "CONTRATO_ALTERADO" : "ERRO";
    await db.dadosAbertosColeta.update({
      where: { id: coleta.id },
      data: { status, erro: `${resposta.status ?? "sem HTTP"}: ${resposta.detalhe}`.slice(0, 2000), concluidoEm: new Date() },
    });
    return {
      ...resumo,
      proximaPagina: null,
      status,
      erro:
        status === "CONTRATO_ALTERADO"
          ? "O endpoint respondeu fora do contrato conhecido (a API mudou). Nenhum dado foi descartado; avise o suporte do painel."
          : `Falha ao consultar a API: ${resposta.detalhe}`,
    };
  }

  if ("ultima" in resposta.dados) {
    itens = resposta.dados.itens;
    proxima = resposta.dados.ultima ? null : p.pagina + 1;
  } else {
    itens = resposta.dados.itens;
    totalPaginas = resposta.dados.totalPaginas;
    if (p.pagina === 1) esperados = resposta.dados.totalRegistros;
    proxima = p.pagina < totalPaginas ? p.pagina + 1 : null;
  }

  const origemCarga: OrigemCarga = "API_PAINEL";
  const mapeados: Array<{ m: Mapeado; bruto: unknown }> = itens.map((i) => ({
    m: p.origem === "COMPRASGOV" ? mapearComprasGov(i, origemCarga) : p.origem === "BPS" ? mapearBps(i, origemCarga) : mapearArpItem(i, origemCarga),
    bruto: i,
  }));
  const validos = mapeados.flatMap(({ m, bruto }) => (m.ok ? [{ linha: m.linha, bruto }] : []));
  const rejeitados = mapeados.length - validos.length;
  if (p.origem === "ARP_ITEM") await unidadeDasAtas(validos.map((v) => v.linha));
  const gravados = await gravarLinhas(validos);
  // `baixados` conta os itens RECEBIDOS da API, como o relatório de
  // integridade do extrator (esperados × baixados). A API às vezes repete um
  // item na mesma página: ele foi recebido, só não vira linha nova.
  const baixados = coleta.baixados + itens.length;

  let status: StatusColeta = "EM_ANDAMENTO";
  if (proxima === null) {
    status = esperados !== null && baixados < esperados ? "PARCIAL" : "OK";
    // Coleta completa: o que a origem não devolveu mais na janela sai da base.
    if (status === "OK") {
      await db.dadosAbertosPreco.deleteMany({
        where: {
          origem: p.origem,
          codigoCatmat: p.catmat,
          dataCompra: { gte: coleta.dataInicio, lte: coleta.dataFim },
          coletadoEm: { lt: coleta.iniciadoEm },
        },
      });
    }
  }
  await db.dadosAbertosColeta.update({
    where: { id: coleta.id },
    data: {
      paginas: Math.max(coleta.paginas, p.pagina),
      baixados,
      esperados,
      assinatura,
      status,
      erro:
        rejeitados || validos.length > gravados
          ? [coleta.erro, `página ${p.pagina}: ${rejeitados} rejeitado(s) no mapeamento, ${validos.length - gravados} repetido(s)`]
              .filter(Boolean)
              .join("; ")
              .slice(0, 2000)
          : coleta.erro,
      concluidoEm: proxima === null ? new Date() : null,
    },
  });

  return {
    ...base,
    coletaId: coleta.id,
    proximaPagina: proxima,
    totalPaginas,
    esperados,
    baixados,
    gravadosNestaPagina: gravados,
    rejeitados,
    repetidos: validos.length - gravados,
    status,
  };
}
