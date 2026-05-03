"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer } from "recharts";
import { tooltipStyle, cursorFill, gridStroke, PALETTE_CATEGORICAL } from "./chart-utils";

interface AreaTematicaChartProps {
  data: Array<{ area: string | null; count: number }>;
}

export function AreaTematicaChart({ data }: AreaTematicaChartProps) {
  const chartData = data
    .filter((item) => item.area !== null)
    .slice(0, 10)
    .map((item) => ({
      area: item.area!.length > 28 ? item.area!.substring(0, 26) + "…" : item.area!,
      fullName: item.area!,
      count: item.count,
    }));

  if (!chartData.length) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
        Sem dados de grupo temático
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v: number) => v.toLocaleString("pt-BR")} />
        <YAxis type="category" dataKey="area" width={170} tick={{ fontSize: 10, fill: "hsl(var(--foreground))" }} />
        <Tooltip
          contentStyle={tooltipStyle}
          cursor={{ fill: cursorFill }}
          formatter={(value: number, _: string, props: any) => [value.toLocaleString("pt-BR"), props.payload.fullName]}
        />
        <Bar dataKey="count" name="Demandas" radius={[0, 4, 4, 0]}>
          {chartData.map((_, idx) => (
            <Cell key={idx} fill={PALETTE_CATEGORICAL[idx % PALETTE_CATEGORICAL.length]} fillOpacity={0.9} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
