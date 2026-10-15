import { URL_BPS, getJson, montarUrl, type RespostaApi } from "@/lib/dados-abertos/cliente";
import { codigoCatmat } from "@/lib/dados-abertos/mapear";

// ─────────────────────────────────────────────────────────────────────────────
// BPS — API de Dados Abertos do Ministério da Saúde
// (GET /economia-da-saude/bps, sem o prefixo /v1, que dá 404).
//
// Diferente do Compras.gov.br: a resposta é { "bps": [...] } SEM total, então a
// paginação vai até a primeira página curta; o CATMAT vai sem zeros à
// esquerda ("0410020" devolve lista vazia); datas só em AAAA-MM-DD. Servidor
// e cota próprios — a cota de ~100/min do Compras.gov.br não se aplica.
// ─────────────────────────────────────────────────────────────────────────────

export const TAMANHO_PAGINA_BPS = 500;

export interface PaginaBps {
  itens: Record<string, unknown>[];
  /** Página curta = fim da consulta. */
  ultima: boolean;
}

export async function paginaBps(p: { catmat: string; inicio: string; fim: string; pagina: number }): Promise<RespostaApi<PaginaBps>> {
  const url = montarUrl(URL_BPS, "", {
    codigoCatmat: codigoCatmat(p.catmat) ?? p.catmat,
    dataCompraInicio: p.inicio,
    dataCompraFim: p.fim,
    pagina: p.pagina,
    tamanhoPagina: TAMANHO_PAGINA_BPS,
  });
  // Sem Retry-After no BPS: espera padrão de 15 s, como o extrator.
  const r = await getJson<{ bps?: unknown }>(url, { padraoAguardarSeg: 15, contratoAlteradoEm: [404] });
  if (r.tipo !== "ok") return r;
  if (!r.dados || !Array.isArray(r.dados.bps)) {
    return { tipo: "contrato_alterado", status: r.status, detalhe: "resposta sem a lista `bps`" };
  }
  const itens = r.dados.bps as Record<string, unknown>[];
  return { tipo: "ok", dados: { itens, ultima: itens.length < TAMANHO_PAGINA_BPS }, status: r.status, ms: r.ms };
}
