"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LabelList,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { fmtMoney, PMVG_RED, PMVG_BLUE } from "./pmvg-format";

// ─────────────────────────────────────────────────────────────────────────────
// Ranking de materiais por diferença total (pago − PMVG), em coluna única.
// A barra usa o módulo da diferença (comprimento) e a cor indica o sentido:
// vermelho = sobrepreço · azul = economia. O rótulo mostra o valor com sinal.
// ─────────────────────────────────────────────────────────────────────────────

export interface RankDatum {
  material: string;
  diff: number; // diferença total com sinal (R$)
}

interface ChartDatum extends RankDatum {
  mag: number; // |diff| — comprimento da barra
  label: string; // R$ com sinal — rótulo à direita
}

const truncar = (s: string, n = 26) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

const RankTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartDatum }>;
}) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-background/95 border border-primary/40 rounded-lg px-3 py-2 shadow-lg backdrop-blur-sm max-w-xs">
      <p className="text-xs font-medium text-foreground break-words">{d.material}</p>
      <p className="text-sm font-semibold" style={{ color: d.diff >= 0 ? PMVG_RED : PMVG_BLUE }}>
        {fmtMoney(d.diff)}
      </p>
    </div>
  );
};

export function PmvgRankChart({
  data,
  color,
  emptyText = "Nenhum item com os filtros atuais.",
}: {
  /** Itens já ordenados (maior primeiro). */
  data: RankDatum[];
  color: string;
  emptyText?: string;
}) {
  if (!data.length) {
    return <p className="text-xs text-muted-foreground py-6 text-center">{emptyText}</p>;
  }

  const chartData: ChartDatum[] = data.map((d) => ({
    ...d,
    mag: Math.abs(d.diff),
    label: fmtMoney(d.diff),
  }));

  const height = chartData.length * 30 + 16;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        layout="vertical"
        data={chartData}
        margin={{ top: 4, right: 96, bottom: 4, left: 4 }}
        barCategoryGap={6}
      >
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="material"
          width={190}
          tick={{ fontSize: 11 }}
          tickFormatter={(v: string) => truncar(v)}
          interval={0}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<RankTooltip />} cursor={{ fill: "color-mix(in oklch, var(--muted) 60%, transparent)" }} />
        <Bar dataKey="mag" radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {chartData.map((_, i) => (
            <Cell key={i} fill={color} />
          ))}
          <LabelList
            dataKey="label"
            position="right"
            style={{ fontSize: 11, fill: "var(--foreground)" }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
