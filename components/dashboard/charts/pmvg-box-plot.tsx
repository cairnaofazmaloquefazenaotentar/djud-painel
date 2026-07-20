"use client";

import type { DistributionStats } from "./pmvg-format";

// ─────────────────────────────────────────────────────────────────────────────
// Box plot mínimo (SVG puro) da diferença percentual pago-vs-PMVG. Caixa de Q1
// a Q3, mediana ao centro, bigodes até o menor/maior valor dentro de 1,5×IQR e
// linha pontilhada em 0% (pago = PMVG). Escala horizontal compartilhada entre
// todas as linhas (computeBoxDomain). Portado do dashboard de origem.
// ─────────────────────────────────────────────────────────────────────────────

export interface BoxDomain {
  lo: number;
  hi: number;
}

/** Domínio horizontal comum a todas as alíquotas (inclui sempre o 0%). */
export function computeBoxDomain(groups: DistributionStats[]): BoxDomain {
  const withData = groups.filter((g) => g.n >= 1);
  if (!withData.length) return { lo: -1, hi: 1 };
  const lo = Math.min(0, ...withData.map((g) => (g.whiskerLow !== null ? g.whiskerLow : (g.median ?? 0))));
  const hi = Math.max(0, ...withData.map((g) => (g.whiskerHigh !== null ? g.whiskerHigh : (g.median ?? 0))));
  const span = hi - lo || 1;
  const pad = span * 0.08;
  return { lo: lo - pad, hi: hi + pad };
}

export function PmvgBoxPlot({
  stats,
  domain,
  width = 220,
  height = 22,
}: {
  stats: DistributionStats;
  domain: BoxDomain;
  width?: number;
  height?: number;
}) {
  const g = stats;
  if (!g.n || g.q1 === null || g.whiskerLow === null || g.whiskerHigh === null || g.q3 === null) {
    return <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="block" />;
  }

  const xScale = (v: number) => ((v - domain.lo) / (domain.hi - domain.lo)) * width;
  const midY = height / 2;
  const boxStroke = "var(--primary)";
  const boxFill = "color-mix(in oklch, var(--primary) 15%, transparent)";
  const whiskerStroke = "var(--muted-foreground)";

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="block">
      {/* linha do 0% */}
      <line
        x1={xScale(0)}
        x2={xScale(0)}
        y1={1}
        y2={height - 1}
        stroke="var(--muted-foreground)"
        strokeWidth={1}
        strokeDasharray="2 2"
        opacity={0.7}
      />
      {/* bigode */}
      <line
        x1={xScale(g.whiskerLow)}
        x2={xScale(g.whiskerHigh)}
        y1={midY}
        y2={midY}
        stroke={whiskerStroke}
        strokeWidth={1}
      />
      {[g.whiskerLow, g.whiskerHigh].map((v, i) => (
        <line
          key={i}
          x1={xScale(v)}
          x2={xScale(v)}
          y1={midY - 4}
          y2={midY + 4}
          stroke={whiskerStroke}
          strokeWidth={1}
        />
      ))}
      {/* caixa Q1–Q3 */}
      <rect
        x={xScale(g.q1)}
        y={2}
        width={Math.max(xScale(g.q3) - xScale(g.q1), 1)}
        height={height - 4}
        rx={2}
        fill={boxFill}
        stroke={boxStroke}
        strokeWidth={1}
      />
      {/* mediana */}
      {g.median !== null && (
        <line
          x1={xScale(g.median)}
          x2={xScale(g.median)}
          y1={1}
          y2={height - 1}
          stroke={boxStroke}
          strokeWidth={2}
        />
      )}
    </svg>
  );
}
