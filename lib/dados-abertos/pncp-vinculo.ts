import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { URL_COMPRAS, getJson, montarUrl, type EnvelopeCompras, type RespostaApi } from "@/lib/dados-abertos/cliente";
import { normalizarIdCompra } from "@/lib/dados-abertos/mapear";
import { urlPncp } from "@/lib/pncp";

// ─────────────────────────────────────────────────────────────────────────────
// Vínculo compra → contratação no PNCP (P22; obs. 7 e 8 da DLOG).
//
// Uma consulta por idCompra DISTINTO dos registros da pesquisa (dezenas ou
// centenas, nunca a base inteira — lote grande é o Extrator-CATMAT-DA):
//   1.1_consultarContratacoes_PNCP_14133_Id → nº de controle, processo, situação;
//   2.1_consultarItensContratacoes_PNCP_14133_Id → situação, critério e valor
//     homologado de cada item (coluna F "Anulada/Revogada" do mapa).
// O `tipo` só aceita idCompra ou numeroControlePNCPCompra; o idCompra vai com
// 17 dígitos (com 16, a API devolve lista vazia — conferido em 15/10/2026).
//
// Cache em PncpVinculo: encontrado = permanente; "não encontrado" (lista
// vazia, compra anterior à Lei 14.133 ou não publicada) vale 30 dias.
// ─────────────────────────────────────────────────────────────────────────────

export const VALIDADE_NAO_ENCONTRADO_DIAS = 30;

/** `type` (e não `interface`): vai para o Json de PncpVinculo.itens. */
export type ItemVinculo = {
  situacao: string | null;
  criterio: string | null;
  valorHomologado: number | null;
};

export interface DadosVinculo {
  idCompra: string;
  encontrado: boolean;
  numeroControlePncp: string | null;
  situacao: string | null;
  modalidade: string | null;
  numeroCompra: string | null;
  processo: string | null;
  objeto: string | null;
  cnpjOrgao: string | null;
  url: string | null;
  /** nº do item na compra → situação/critério/valor homologado. */
  itens: Record<string, ItemVinculo> | null;
  bruto: Record<string, unknown> | null;
}

const txt = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s || null;
};

export async function consultarVinculo(idCompraBruto: string): Promise<RespostaApi<DadosVinculo>> {
  const idCompra = normalizarIdCompra(idCompraBruto);
  if (!idCompra) return { tipo: "erro", status: null, detalhe: `idCompra inválido: ${idCompraBruto}` };
  const params = { tipo: "idCompra", codigo: idCompra };

  const cab = await getJson<EnvelopeCompras<Record<string, unknown>>>(
    montarUrl(URL_COMPRAS, "/modulo-contratacoes/1.1_consultarContratacoes_PNCP_14133_Id", params)
  );
  if (cab.tipo !== "ok") return cab;
  const contratacao = cab.dados?.resultado?.[0];
  if (!contratacao) {
    return {
      tipo: "ok",
      status: cab.status,
      ms: cab.ms,
      dados: {
        idCompra,
        encontrado: false,
        numeroControlePncp: null,
        situacao: null,
        modalidade: null,
        numeroCompra: null,
        processo: null,
        objeto: null,
        cnpjOrgao: null,
        url: null,
        itens: null,
        bruto: null,
      },
    };
  }

  const itensResp = await getJson<EnvelopeCompras<Record<string, unknown>>>(
    montarUrl(URL_COMPRAS, "/modulo-contratacoes/2.1_consultarItensContratacoes_PNCP_14133_Id", params)
  );
  if (itensResp.tipo === "aguardar") return itensResp;
  const itens: Record<string, ItemVinculo> = {};
  if (itensResp.tipo === "ok") {
    for (const i of itensResp.dados?.resultado ?? []) {
      const n = Number(i.numeroItemCompra ?? i.numeroItemPncp);
      if (!Number.isFinite(n)) continue;
      itens[String(n)] = {
        situacao: txt(i.situacaoCompraItemNome),
        criterio: txt(i.criterioJulgamentoNome),
        valorHomologado: typeof i.valorUnitarioResultado === "number" ? i.valorUnitarioResultado : null,
      };
    }
  }
  const numeroControlePncp = txt(contratacao.numeroControlePNCP);
  const excluida = contratacao.contratacaoExcluida === true;
  return {
    tipo: "ok",
    status: cab.status,
    ms: cab.ms,
    dados: {
      idCompra,
      encontrado: true,
      numeroControlePncp,
      situacao: excluida ? "Contratação excluída do PNCP" : txt(contratacao.situacaoCompraNomePncp),
      modalidade: txt(contratacao.modalidadeNome),
      numeroCompra: txt(contratacao.numeroCompra),
      processo: txt(contratacao.processo),
      objeto: txt(contratacao.objetoCompra),
      cnpjOrgao: txt(contratacao.orgaoEntidadeCnpj),
      url: urlPncp(numeroControlePncp),
      itens: itensResp.tipo === "ok" ? itens : null,
      bruto: contratacao,
    },
  };
}

/** Vínculos já em cache e ainda válidos, por idCompra (17 dígitos). */
export async function vinculosEmCache(ids: string[]): Promise<Map<string, DadosVinculo>> {
  const mapa = new Map<string, DadosVinculo>();
  const normalizados = Array.from(new Set(ids.map((i) => normalizarIdCompra(i)).filter((i): i is string => !!i)));
  if (!normalizados.length) return mapa;
  const limite = new Date(Date.now() - VALIDADE_NAO_ENCONTRADO_DIAS * 86_400_000);
  try {
    const linhas = await db.pncpVinculo.findMany({ where: { idCompra: { in: normalizados } } });
    for (const l of linhas) {
      if (!l.encontrado && l.consultadoEm < limite) continue;
      mapa.set(l.idCompra, {
        idCompra: l.idCompra,
        encontrado: l.encontrado,
        numeroControlePncp: l.numeroControlePncp,
        situacao: l.situacao,
        modalidade: l.modalidade,
        numeroCompra: l.numeroCompra,
        processo: l.processo,
        objeto: l.objeto,
        cnpjOrgao: l.cnpjOrgao,
        url: l.url,
        itens: (l.itens as Record<string, ItemVinculo> | null) ?? null,
        bruto: null,
      });
    }
  } catch (error) {
    // Tabela ainda não criada (scripts/create_dadosabertos_tables.py): segue sem vínculo.
    console.warn("[pncp-vinculo] cache indisponível:", (error as Error).message);
  }
  return mapa;
}

export async function gravarVinculo(v: DadosVinculo): Promise<void> {
  const dados = {
    encontrado: v.encontrado,
    numeroControlePncp: v.numeroControlePncp,
    situacao: v.situacao,
    modalidade: v.modalidade,
    numeroCompra: v.numeroCompra,
    processo: v.processo,
    objeto: v.objeto,
    cnpjOrgao: v.cnpjOrgao,
    url: v.url,
    itens: v.itens ?? undefined,
    bruto: (v.bruto as Prisma.InputJsonObject | null) ?? undefined,
    consultadoEm: new Date(),
  };
  await db.pncpVinculo.upsert({ where: { idCompra: v.idCompra }, create: { idCompra: v.idCompra, ...dados }, update: dados });
}
