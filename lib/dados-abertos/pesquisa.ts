import type { DadosAbertosPreco, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { variantesCnpj, type FiltrosOpcionais } from "@/lib/pesquisa-preco-filtros";
import type { ContratacaoRef } from "@/lib/pesquisa-preco-fontes";
import type { RegistroMercado } from "@/lib/pesquisa-preco";
import { urlPncp } from "@/lib/pncp";
import { vinculosEmCache, type DadosVinculo } from "@/lib/dados-abertos/pncp-vinculo";
import type { OrigemColeta } from "@/lib/dados-abertos/situacao";

// ─────────────────────────────────────────────────────────────────────────────
// Leitura de DadosAbertosPreco para a pesquisa de preços: o mesmo recorte das
// outras fontes (CATMAT, unidade de fornecimento já normalizada, UF, filtros
// opcionais e, quando houver, a janela do art. 5º) e a identificação da
// contratação de cada registro (D3), com o vínculo PNCP em cache (P22).
// Sem as tabelas (create_dadosabertos_tables.py ainda não rodou), devolve
// vazio: a pesquisa segue com as bases carregadas no painel.
// ─────────────────────────────────────────────────────────────────────────────

export type RegistroBrutoDA = Omit<RegistroMercado, "outlierIqr" | "excluidoPor">;

export interface ConsultaDadosAbertos {
  origem: OrigemColeta;
  catmat: string;
  unidade: string;
  uf: string | null;
  filtros: FiltrosOpcionais;
  /** Janela do art. 5º sobre dataCompra (D1); null = sem recorte. */
  inicio?: Date | null;
  fim?: Date | null;
  amostra: number;
}

export interface ResultadoDadosAbertos {
  total: number;
  registros: RegistroBrutoDA[];
  /** Registros fora da janela, para o aviso do período (D1). */
  foraDoPeriodo: number;
  maisRecenteFora: string | null;
}

const contem = (termo: string) => ({ contains: termo, mode: "insensitive" as const });

function where(c: ConsultaDadosAbertos, comJanela: boolean): Prisma.DadosAbertosPrecoWhereInput {
  const e: Prisma.DadosAbertosPrecoWhereInput[] = [
    { origem: c.origem, codigoCatmat: c.catmat, unidadeNorm: c.unidade },
  ];
  if (c.uf) e.push({ uf: c.uf });
  if (c.filtros.fornecedor) e.push({ nomeFornecedor: contem(c.filtros.fornecedor) });
  if (c.filtros.fabricante) {
    e.push({ OR: [{ marca: contem(c.filtros.fabricante) }, { nomeFabricante: contem(c.filtros.fabricante) }] });
  }
  const cnpj = variantesCnpj(c.filtros.cnpjComprador);
  if (cnpj) e.push({ cnpjOrgao: { startsWith: cnpj[0] } }); // gravado só com dígitos
  if (comJanela && (c.inicio || c.fim)) {
    e.push({ dataCompra: { ...(c.inicio ? { gte: c.inicio } : {}), ...(c.fim ? { lte: c.fim } : {}) } });
  }
  return { AND: e };
}

function whereFora(c: ConsultaDadosAbertos): Prisma.DadosAbertosPrecoWhereInput | null {
  if (!c.inicio) return null;
  return { AND: [where(c, false), { OR: [{ dataCompra: { lt: c.inicio } }, { dataCompra: null }] }] };
}

/** Identificação da contratação de um registro de dados abertos. */
export function contratacaoDe(r: DadosAbertosPreco, vinculo: DadosVinculo | undefined): ContratacaoRef {
  if (r.origem === "BPS") {
    return {
      tipo: r.modalidade,
      numero: r.processoCompra ? `Processo ${r.processoCompra}` : null,
      uasg: null,
      nomeUasg: null,
      numeroItem: null,
      processo: r.processoCompra,
      criterioJulgamento: null,
      situacao: null,
      numeroControlePncp: null,
      numeroControlePncpAta: null,
      url: null,
      referencia: [r.numeroAta ? `Ata ${r.numeroAta}` : null, r.validadeCompra ? `validade ${r.validadeCompra} meses` : null]
        .filter(Boolean)
        .join(", ") || null,
      indisponivel: "não disponível no BPS",
    };
  }
  if (r.origem === "ARP_ITEM") {
    return {
      tipo: "Ata de registro de preços",
      numero: [r.numeroAta ? `Ata ${r.numeroAta}` : null, r.numeroCompra ? `compra ${r.numeroCompra}` : null].filter(Boolean).join(" · ") || null,
      uasg: r.codigoUasg,
      nomeUasg: r.nomeUasg,
      numeroItem: r.numeroItemCompra,
      processo: null,
      criterioJulgamento: null,
      situacao: r.situacao,
      numeroControlePncp: r.numeroControlePncp,
      numeroControlePncpAta: r.numeroControlePncpAta,
      url: urlPncp(r.numeroControlePncpAta) ?? urlPncp(r.numeroControlePncp),
      referencia: null,
      indisponivel: null,
    };
  }
  // Compras.gov.br — com o vínculo PNCP quando já consultado.
  const itemVinculo = vinculo?.itens?.[r.numeroItemCompra ?? ""];
  return {
    tipo: r.modalidade,
    numero: r.numeroCompra,
    uasg: r.codigoUasg,
    nomeUasg: r.nomeUasg,
    numeroItem: r.numeroItemCompra,
    processo: vinculo?.processo ?? null,
    criterioJulgamento: itemVinculo?.criterio ?? r.criterioJulgamento,
    situacao: itemVinculo?.situacao ?? vinculo?.situacao ?? null,
    numeroControlePncp: vinculo?.numeroControlePncp ?? r.numeroControlePncp,
    numeroControlePncpAta: null,
    url: vinculo?.url ?? urlPncp(r.numeroControlePncp),
    referencia: null,
    indisponivel: vinculo
      ? vinculo.encontrado
        ? null
        : "compra sem registro no PNCP (anterior à Lei 14.133/2021 ou não publicada)"
      : "vínculo com o PNCP ainda não consultado",
  };
}

function registroDe(r: DadosAbertosPreco, vinculo: DadosVinculo | undefined): RegistroBrutoDA {
  return {
    id: r.id,
    descricao: r.descricao,
    unidade: r.unidade,
    preco: r.precoUnitario,
    qtd: r.quantidade,
    data: (r.dataCompra ?? r.coletadoEm).toISOString(),
    uf: r.uf,
    modalidade: r.modalidade,
    orgao: r.orgao ?? r.nomeUasg,
    fornecedor: r.nomeFornecedor,
    cnpjFornecedor: r.niFornecedor,
    marca: r.marca,
    fabricante: r.nomeFabricante,
    esfera: r.esfera,
    contratacao: contratacaoDe(r, vinculo),
    coletadoEm: r.coletadoEm.toISOString(),
    registroAnvisa: r.registroAnvisa,
  };
}

export async function consultarDadosAbertos(c: ConsultaDadosAbertos): Promise<ResultadoDadosAbertos> {
  try {
    const wJanela = where(c, true);
    const wFora = whereFora(c);
    const [linhas, total, fora, ultimaFora] = await Promise.all([
      db.dadosAbertosPreco.findMany({ where: wJanela, orderBy: [{ dataCompra: "desc" }, { id: "asc" }], take: c.amostra }),
      db.dadosAbertosPreco.count({ where: wJanela }),
      wFora ? db.dadosAbertosPreco.count({ where: wFora }) : Promise.resolve(0),
      wFora
        ? db.dadosAbertosPreco.findFirst({ where: wFora, orderBy: { dataCompra: "desc" }, select: { dataCompra: true } })
        : Promise.resolve(null),
    ]);
    const vinculos =
      c.origem === "COMPRASGOV"
        ? await vinculosEmCache(linhas.map((l) => l.idCompra).filter((i): i is string => !!i))
        : new Map<string, DadosVinculo>();
    return {
      total,
      registros: linhas.map((l) => registroDe(l, l.idCompra ? vinculos.get(l.idCompra) : undefined)),
      foraDoPeriodo: fora,
      maisRecenteFora: ultimaFora?.dataCompra ? ultimaFora.dataCompra.toISOString() : null,
    };
  } catch (error) {
    console.warn(`[dados-abertos] ${c.origem} indisponível:`, (error as Error).message);
    return { total: 0, registros: [], foraDoPeriodo: 0, maisRecenteFora: null };
  }
}
