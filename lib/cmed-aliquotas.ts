// ─────────────────────────────────────────────────────────────────────────────
// Alíquotas de ICMS das listas mensais da CMED — módulo PURO (sem Prisma), que
// pode ser importado tanto pelo servidor quanto pela página client.
//
// ALIQUOTAS_ICMS define a posição de cada alíquota nos arrays JSON `pf`/`pmvg`
// de public."CmedPrecoVersao" (gravados por scripts/import_cmed_mensal.py).
// ESPELHO de scripts/cmed_layout.py — o autoteste de lá compara as duas listas.
// NUNCA reordenar nem remover: alíquota nova entra no FIM, nos dois arquivos.
// Versões gravadas antes de um acréscimo têm arrays mais curtos: posição
// ausente = sem preço publicado naquela alíquota.
// ─────────────────────────────────────────────────────────────────────────────

export const ALIQUOTAS_ICMS = [
  "SEM_IMPOSTOS", "0", "12", "12_ALC", "17", "17_ALC", "17,5", "17,5_ALC", "18", "18_ALC",
  "19", "19_ALC", "19,5", "19,5_ALC", "20", "20_ALC", "20,5", "20,5_ALC", "21", "21_ALC",
  "22", "22_ALC", "22,5", "22,5_ALC", "23", "23_ALC",
] as const;

export type CodigoAliquota = (typeof ALIQUOTAS_ICMS)[number];

export function isCodigoAliquota(valor: string): valor is CodigoAliquota {
  return (ALIQUOTAS_ICMS as readonly string[]).includes(valor);
}

/** "SEM_IMPOSTOS" → "Sem impostos"; "0" → "0%"; "17,5_ALC" → "17,5% ALC". */
export function rotuloAliquota(codigo: CodigoAliquota): string {
  if (codigo === "SEM_IMPOSTOS") return "Sem impostos";
  const alc = codigo.endsWith("_ALC");
  const taxa = alc ? codigo.slice(0, -"_ALC".length) : codigo;
  return alc ? `${taxa}% ALC` : `${taxa}%`;
}

function posicaoExibicao(codigo: CodigoAliquota): number {
  if (codigo === "SEM_IMPOSTOS") return -1;
  const alc = codigo.endsWith("_ALC");
  const taxa = Number((alc ? codigo.slice(0, -"_ALC".length) : codigo).replace(",", "."));
  return taxa * 10 + (alc ? 1 : 0);
}

/** Ordem de exibição: "Sem impostos", depois numérica crescente, cada ALC logo após a cheia. */
export function ordenarAliquotas(codigos: readonly string[]): CodigoAliquota[] {
  return codigos.filter(isCodigoAliquota).sort((a, b) => posicaoExibicao(a) - posicaoExibicao(b));
}

/** Alíquota padrão do teto: "Sem impostos" quando a competência a publica; senão "0%". */
export function aliquotaPadrao(disponiveis: readonly string[]): CodigoAliquota {
  return disponiveis.includes("SEM_IMPOSTOS") ? "SEM_IMPOSTOS" : "0";
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2017-01" (ou "2017-01-01") → "jan/2017". */
export function rotuloCompetencia(iso: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const mes = MESES[Number(m[2]) - 1];
  return mes ? `${mes}/${m[1]}` : iso;
}
