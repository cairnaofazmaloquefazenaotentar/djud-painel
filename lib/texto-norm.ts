// ─────────────────────────────────────────────────────────────────────────────
// Normalização de texto para busca. Módulo puro (a tela também usa). Espelho
// Python em scripts/precos_norm.py (normalizar_texto) — mexeu numa, mexa na
// outra: as colunas "descricaoNorm" e "buscaNorm" são gravadas pelos scripts
// Python e comparadas em runtime com esta função.
// ─────────────────────────────────────────────────────────────────────────────

/** Sem acentos, minúsculas, só [a-z0-9 ,-]; espaços colapsados. */
export function normalizarTexto(texto: string | null | undefined): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s,\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
