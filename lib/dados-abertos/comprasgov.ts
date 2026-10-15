import {
  URL_COMPRAS,
  getJson,
  inteiroDoEnvelope,
  montarUrl,
  type EnvelopeCompras,
  type RespostaApi,
} from "@/lib/dados-abertos/cliente";

// ─────────────────────────────────────────────────────────────────────────────
// Compras.gov.br — Painel de Preços (/modulo-pesquisa-preco/1_consultarMaterial)
// e itens de atas de registro de preços (/modulo-arp/2_consultarARPItem).
//
// Assinatura: desde ago/2026 a API pede `tipo` + `codigo`; antes era
// `codigoItemCatalogo=<n>`. Como o extrator, tenta a nova e, num 400/404, cai
// UMA vez para a antiga e memoriza a escolha (aqui, por processo; na coleta, a
// assinatura usada fica gravada em DadosAbertosColeta.assinatura).
// ─────────────────────────────────────────────────────────────────────────────

export const TAMANHO_PAGINA = 500;

export type Assinatura = "tipo+codigo" | "codigoItemCatalogo";

let assinaturaMemorizada: Assinatura | null = null;

export interface PaginaApi {
  itens: Record<string, unknown>[];
  totalRegistros: number | null;
  /** Fonte de verdade da paginação; sem rodapé, estimado (ver `totalPaginasDe`). */
  totalPaginas: number;
}

/**
 * Total de páginas: o rodapé manda; ceil(totalRegistros/500) confere e o
 * substitui quando ele falta; sem nenhum dos dois e com a página cheia, pede
 * mais uma para confirmar o fim.
 */
export function totalPaginasDe(env: EnvelopeCompras<unknown>, pagina: number, itensNaPagina: number): number {
  const rodape = inteiroDoEnvelope(env.totalPaginas);
  const total = inteiroDoEnvelope(env.totalRegistros);
  if (rodape !== null && rodape > 0) return rodape;
  if (total !== null) return Math.max(1, Math.ceil(total / TAMANHO_PAGINA));
  return itensNaPagina >= TAMANHO_PAGINA ? pagina + 1 : pagina;
}

function paginaDoEnvelope(env: EnvelopeCompras<Record<string, unknown>>, pagina: number): PaginaApi | null {
  if (!env || typeof env !== "object" || (env.resultado !== null && env.resultado !== undefined && !Array.isArray(env.resultado))) {
    return null;
  }
  const itens = env.resultado ?? [];
  return { itens, totalRegistros: inteiroDoEnvelope(env.totalRegistros), totalPaginas: totalPaginasDe(env, pagina, itens.length) };
}

export async function paginaPrecosMaterial(p: {
  catmat: string;
  inicio: string;
  fim: string;
  pagina: number;
  assinatura?: Assinatura | null;
}): Promise<{ resposta: RespostaApi<PaginaApi>; assinatura: Assinatura }> {
  const tentar = async (assinatura: Assinatura) => {
    const chave = assinatura === "tipo+codigo" ? { tipo: "codigoItemCatalogo", codigo: p.catmat } : { codigoItemCatalogo: p.catmat };
    const url = montarUrl(URL_COMPRAS, "/modulo-pesquisa-preco/1_consultarMaterial", {
      ...chave,
      dataCompraInicio: p.inicio,
      dataCompraFim: p.fim,
      pagina: p.pagina,
      tamanhoPagina: TAMANHO_PAGINA,
    });
    return getJson<EnvelopeCompras<Record<string, unknown>>>(url, { contratoAlteradoEm: [400, 404] });
  };

  const primeira: Assinatura = p.assinatura ?? assinaturaMemorizada ?? "tipo+codigo";
  let assinatura = primeira;
  let r = await tentar(assinatura);
  if (r.tipo === "contrato_alterado" && !p.assinatura && primeira === "tipo+codigo") {
    const recuo = await tentar("codigoItemCatalogo");
    if (recuo.tipo === "ok") {
      assinatura = "codigoItemCatalogo";
      r = recuo;
    }
  }
  if (r.tipo !== "ok") return { resposta: r, assinatura };
  assinaturaMemorizada = assinatura;
  const pagina = paginaDoEnvelope(r.dados, p.pagina);
  if (!pagina) {
    return { resposta: { tipo: "contrato_alterado", status: r.status, detalhe: "resposta sem a lista `resultado`" }, assinatura };
  }
  return { resposta: { tipo: "ok", dados: pagina, status: r.status, ms: r.ms }, assinatura };
}

/** Itens de ata com vigência iniciada na janela (P17: até 365 dias por consulta). */
export async function paginaItensAta(p: {
  catmat: string;
  vigenciaInicio: string;
  vigenciaFim: string;
  pagina: number;
}): Promise<RespostaApi<PaginaApi>> {
  const url = montarUrl(URL_COMPRAS, "/modulo-arp/2_consultarARPItem", {
    codigoItem: p.catmat,
    dataVigenciaInicialMin: p.vigenciaInicio,
    dataVigenciaInicialMax: p.vigenciaFim,
    pagina: p.pagina,
    tamanhoPagina: TAMANHO_PAGINA,
  });
  const r = await getJson<EnvelopeCompras<Record<string, unknown>>>(url, { contratoAlteradoEm: [404] });
  if (r.tipo !== "ok") return r;
  const pagina = paginaDoEnvelope(r.dados, p.pagina);
  return pagina
    ? { tipo: "ok", dados: pagina, status: r.status, ms: r.ms }
    : { tipo: "contrato_alterado", status: r.status, detalhe: "resposta sem a lista `resultado`" };
}

/** Item do catálogo (/modulo-material/4_consultarItemMaterial), para CATMAT fora do CatmatItem local. */
export async function itemDoCatalogo(catmat: string): Promise<RespostaApi<Record<string, unknown> | null>> {
  const url = montarUrl(URL_COMPRAS, "/modulo-material/4_consultarItemMaterial", {
    codigoItem: catmat,
    pagina: 1,
    tamanhoPagina: 10,
  });
  const r = await getJson<EnvelopeCompras<Record<string, unknown>>>(url);
  if (r.tipo !== "ok") return r;
  return { tipo: "ok", dados: r.dados?.resultado?.[0] ?? null, status: r.status, ms: r.ms };
}
