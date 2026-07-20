import type { PmvgRow } from "@/lib/pmvg-metrics";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers puros da sub-aba PMVG — formatação, ordenação das alíquotas, cálculo
// pago-vs-PMVG por linha e estatísticas de distribuição. Portados 1:1 do
// dashboard SISMAT × PMVG de origem para manter os números idênticos.
// ─────────────────────────────────────────────────────────────────────────────

/** Vermelho = pago acima do PMVG (sobrepreço) · Azul = pago abaixo (economia). */
export const PMVG_RED = "#dc2626";
export const PMVG_BLUE = "#2563eb";

export const QTY_METHOD_LABEL: Record<string, string> = {
  leading_count: 'contagem no texto (ex: "CX 40 FR")',
  trailing_x: 'sufixo "X n" no texto',
  default_single: "assumido 1 (padrão ANVISA)",
};

export function fmtMoney(v: number | null | undefined): string {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  });
}

export function fmtNum(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return v.toLocaleString("pt-BR", { maximumFractionDigits: digits });
}

export function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return (v >= 0 ? "+" : "") + v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export type BadgeTone = "good" | "warning" | "critical";
export function scoreBadgeTone(sc: number | null | undefined): BadgeTone {
  if (sc === null || sc === undefined) return "critical";
  if (sc >= 80) return "good";
  if (sc >= 60) return "warning";
  return "critical";
}

// ── Ordem de exibição das alíquotas ──────────────────────────────────────────
// "Sem Impostos" faz mais sentido logo acima de "0%" do que por último. Guarda
// os índices ORIGINAIS de cols (o índice que indexa row.p); só a ordem muda.
export function buildPmvgOrder(cols: string[]): number[] {
  const idxs = cols.map((_, i) => i);
  const semIdx = cols.indexOf("PMVG Sem Impostos");
  const zeroIdx = cols.indexOf("PMVG 0%");
  if (semIdx === -1 || zeroIdx === -1) return idxs;
  const rest = idxs.filter((i) => i !== semIdx);
  const zeroPos = rest.indexOf(zeroIdx);
  return [...rest.slice(0, zeroPos), semIdx, ...rest.slice(zeroPos)];
}

// ── Cálculo pago-vs-PMVG por linha ───────────────────────────────────────────
// Como o PMVG é publicado por embalagem e o SISMAT compra por unidade, o preço
// de embalagem é dividido pela quantidade de unidades da embalagem (qp).
export interface PmvgRowCalc extends PmvgRow {
  pmvgPack: number | null; // preço de embalagem na alíquota escolhida
  pmvgUnit: number | null; // PMVG unitário estimado = pmvgPack / qp
  diffUnit: number | null; // pago − PMVG (unitário)
  diffPct: number | null; // (diffUnit / pmvgUnit) × 100
  diffTotal: number | null; // diffUnit × quantidade
  pmvgTotal: number | null; // pmvgUnit × quantidade
}

export function withPmvgCalcs(baseRows: PmvgRow[], pmvgIdx: number): PmvgRowCalc[] {
  return baseRows.map((r) => {
    const pmvgPack = r.p[pmvgIdx] ?? null;
    const pmvgUnit = pmvgPack !== null && r.qp ? pmvgPack / r.qp : null;
    const diffUnit = pmvgUnit !== null && r.vu !== null ? r.vu - pmvgUnit : null;
    const diffPct = diffUnit !== null && pmvgUnit ? (diffUnit / pmvgUnit) * 100 : null;
    const diffTotal = diffUnit !== null && r.q !== null ? diffUnit * r.q : null;
    const pmvgTotal = pmvgUnit !== null && r.q !== null ? pmvgUnit * r.q : null;
    return { ...r, pmvgPack, pmvgUnit, diffUnit, diffPct, diffTotal, pmvgTotal };
  });
}

// ── Estatística: média, desvio padrão amostral, percentil, box plot ──────────
export function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function stddev(arr: number[], m?: number): number | null {
  if (arr.length < 2) return null;
  const mm = m === undefined ? mean(arr) : m;
  const variance = arr.reduce((s, v) => s + (v - mm) * (v - mm), 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

export function percentile(sortedArr: number[], p: number): number | null {
  if (!sortedArr.length) return null;
  const idx = (sortedArr.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedArr[lo];
  return sortedArr[lo] + (sortedArr[hi] - sortedArr[lo]) * (idx - lo);
}

export interface DistributionStats {
  n: number;
  mean: number | null;
  std: number | null;
  min: number | null;
  max: number | null;
  q1: number | null;
  median: number | null;
  q3: number | null;
  whiskerLow: number | null;
  whiskerHigh: number | null;
}

export function distributionStats(vals: number[]): DistributionStats {
  const n = vals.length;
  if (!n) {
    return {
      n: 0,
      mean: null,
      std: null,
      min: null,
      max: null,
      q1: null,
      median: null,
      q3: null,
      whiskerLow: null,
      whiskerHigh: null,
    };
  }
  const sorted = vals.slice().sort((a, b) => a - b);
  const m = mean(vals);
  const sd = stddev(vals, m);
  const q1 = percentile(sorted, 0.25) as number;
  const median = percentile(sorted, 0.5);
  const q3 = percentile(sorted, 0.75) as number;
  const iqr = q3 - q1;
  const lowBound = q1 - 1.5 * iqr;
  const highBound = q3 + 1.5 * iqr;
  const withinLow = sorted.filter((v) => v >= lowBound);
  const withinHigh = sorted.filter((v) => v <= highBound);
  const whiskerLow = withinLow.length ? withinLow[0] : sorted[0];
  const whiskerHigh = withinHigh.length ? withinHigh[withinHigh.length - 1] : sorted[sorted.length - 1];
  return {
    n,
    mean: m,
    std: sd,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    q1,
    median,
    q3,
    whiskerLow,
    whiskerHigh,
  };
}
