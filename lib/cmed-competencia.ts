import { ALIQUOTAS_ICMS, rotuloCompetencia, type CodigoAliquota } from "@/lib/cmed-aliquotas";

// ─────────────────────────────────────────────────────────────────────────────
// Competência (mês) da lista CMED usada no teto — módulo PURO, importado pela
// tela e pelo servidor.
//
// Decisão do usuário (out/2026): na Pesquisa de Preços a pessoa pode consultar
// o teto em qualquer lista mensal carregada, mas o RELATÓRIO usa sempre a
// última lista publicada até a data de referência — a que vale para a compra.
// `competenciaVigenteEm` é a regra única dessa escolha (tela, HTML, XLSX e
// cesta chamam a mesma função).
// ─────────────────────────────────────────────────────────────────────────────

/** Lista CMED efetivamente usada numa pesquisa. */
export type ListaCmedUsada = {
  /** "2026-08" — a lista consultada. */
  competencia: string;
  rotulo: string;
  /** A última publicada até a data de referência — a que o relatório usa. */
  vigente: string;
  rotuloVigente: string;
  /** CAP da competência (mediana de 1 − PMVG 0% / PF 0%), em %. */
  capPercentual: number | null;
  /** A lista publica o PMVG "sem impostos"; senão o teto do painel usa o de 0%. */
  semImpostosPublicado: boolean;
};

/** Mês (AAAA-MM) da lista que vale para a data de referência; null se nenhuma é anterior a ela. */
export function competenciaVigenteEm(competencias: readonly string[], dataReferencia: string): string | null {
  const mesReferencia = dataReferencia.slice(0, 7);
  let vigente: string | null = null;
  for (const c of competencias) {
    if (c <= mesReferencia && (vigente === null || c > vigente)) vigente = c;
  }
  return vigente;
}

/** Valor publicado numa alíquota: `pf`/`pmvg` são arrays alinhados a ALIQUOTAS_ICMS (ausente = sem preço). */
export function valorNaAliquota(precos: unknown, codigo: CodigoAliquota): number | null {
  if (!Array.isArray(precos)) return null;
  const v = precos[ALIQUOTAS_ICMS.indexOf(codigo)];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Chave da apresentação na CMED (registro + GGREM), a mesma em qualquer
 * competência: é por ela que a curadoria desconsidera um registro do teto, e a
 * decisão vale para a lista que o relatório usar. Sem GGREM, a versão do preço.
 */
export function chaveApresentacaoCmed(registro: string, codigoGgrem: string | null, versaoId: number): string {
  return `cmed:${registro}:${codigoGgrem || `v${versaoId}`}`;
}

/** "lista CMED de ago/2026" ou, consultando outra, "lista CMED de mar/2026 (o relatório usa a de ago/2026)". */
export function descreverListaCmed(lista: ListaCmedUsada): string {
  return lista.competencia === lista.vigente
    ? `lista CMED de ${lista.rotulo}, a última publicada até a data de referência`
    : `lista CMED de ${lista.rotulo} (consulta; o relatório usa a de ${lista.rotuloVigente}, a última publicada até a data de referência)`;
}

/** CAP impresso: o da lista mensal usada; sem as listas mensais, o vigente em 2026 (21,53%). */
export function rotuloCap(capPercentual: number | null | undefined): string {
  return `${(capPercentual ?? 21.53).toFixed(2).replace(".", ",")}%`;
}

export { rotuloCompetencia };
