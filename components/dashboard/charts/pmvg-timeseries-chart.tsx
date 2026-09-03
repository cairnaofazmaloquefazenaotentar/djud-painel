"use client";

import { useMemo } from "react";
import {
  ComposedChart,
  Line,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { PmvgRowCalc } from "./pmvg-format";
import { fmtMoney, fmtDate, PMVG_RED, PMVG_BLUE } from "./pmvg-format";

// ─────────────────────────────────────────────────────────────────────────────
// Série temporal de UM material: pago unitário (pontos vermelhos) sobre o PMVG
// unitário aplicável na data (linha azul). Reproduz o gráfico do dashboard de
// origem, em Recharts. As datas viram timestamp para o eixo X numérico.
// ─────────────────────────────────────────────────────────────────────────────

interface Ponto {
  ts: number;
  d: string;
  vu: number | null;
  pmvgUnit: number | null;
}

const DIA_MS = 24 * 3600 * 1000;

function fmtDataCurta(ts: number): string {
  return new Date(ts).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
}

function fmtMoneyEixo(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (abs >= 10_000) return `R$ ${(v / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  if (abs >= 100) return `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
  return `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`;
}

const TsTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: Ponto }>;
}) => {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="bg-background/95 border border-primary/40 rounded-lg px-3 py-2 shadow-lg backdrop-blur-sm">
      <p className="text-xs text-muted-foreground">{fmtDate(p.d)}</p>
      <p className="text-sm">
        <span style={{ color: PMVG_RED }}>Pago:</span>{" "}
        <span className="font-semibold text-foreground">{fmtMoney(p.vu)}</span>
      </p>
      <p className="text-sm">
        <span style={{ color: PMVG_BLUE }}>PMVG:</span>{" "}
        <span className="font-semibold text-foreground">{fmtMoney(p.pmvgUnit)}</span>
      </p>
    </div>
  );
};

export function PmvgTimeSeriesChart({ rows }: { rows: PmvgRowCalc[] }) {
  const { data, xDomain, yMax } = useMemo(() => {
    const det = rows
      .filter((r) => r.d)
      .slice()
      .sort((a, b) => a.d.localeCompare(b.d))
      .map<Ponto>((r) => ({
        ts: new Date(r.d + "T00:00:00Z").getTime(),
        d: r.d,
        vu: r.vu,
        pmvgUnit: r.pmvgUnit,
      }));

    const tempos = det.map((p) => p.ts);
    const minT = Math.min(...tempos);
    const maxT = Math.max(...tempos);
    const padT = Math.max((maxT - minT) * 0.04, 3 * DIA_MS);

    const vals: number[] = [];
    det.forEach((p) => {
      if (p.vu !== null) vals.push(p.vu);
      if (p.pmvgUnit !== null) vals.push(p.pmvgUnit);
    });

    return {
      data: det,
      xDomain: [minT - padT, maxT + padT] as [number, number],
      yMax: Math.max(1, ...vals),
    };
  }, [rows]);

  if (!data.length) {
    return <p className="text-xs text-muted-foreground py-6 text-center">Nenhum item com os filtros atuais.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={330}>
      <ComposedChart data={data} margin={{ top: 12, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          type="number"
          dataKey="ts"
          domain={xDomain}
          tickFormatter={fmtDataCurta}
          tick={{ fontSize: 11 }}
          tickCount={6}
          scale="time"
        />
        <YAxis
          type="number"
          domain={[0, yMax * 1.05]}
          tickFormatter={fmtMoneyEixo}
          tick={{ fontSize: 11 }}
          width={78}
        />
        <Tooltip content={<TsTooltip />} cursor={{ strokeDasharray: "3 3" }} />
        <Line
          type="linear"
          dataKey="pmvgUnit"
          stroke={PMVG_BLUE}
          strokeWidth={2}
          dot={{ r: 3, fill: PMVG_BLUE, strokeWidth: 0 }}
          connectNulls
          isAnimationActive={false}
        />
        <Scatter dataKey="vu" fill={PMVG_RED} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
