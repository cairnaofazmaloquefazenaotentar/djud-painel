"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer } from "recharts";
import { tooltipStyle, cursorFill, gridStroke, PALETTE_CATEGORICAL } from "./chart-utils";

interface UFChartProps {
  data: Array<{ uf: string | null; count: number }>;
}

export function UFChart({ data }: UFChartProps) {
  const chartData = data
    .filter((item) => item.uf !== null)
    .sort((a, b) => b.count - a.count)
    .slice(0, 15)
    .reverse();

  if (!chartData.length) {
    return (
      <div className="flex items-center justify-center h-[300px] text-sm text-muted-foreground">
        Sem dados por UF
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={360}>
      <BarChart layout="vertical" data={chartData} margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v: number) => v.toLocaleString("pt-BR")} />
        <YAxis dataKey="uf" type="category" tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }} width={36} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: cursorFill }} formatter={(v: number) => [v.toLocaleString("pt-BR"), "Demandas"]} />
        <Bar dataKey="count" name="Demandas" radius={[0, 4, 4, 0]}>
          {chartData.map((_, idx) => (
            <Cell key={idx} fill={PALETTE_CATEGORICAL[idx % PALETTE_CATEGORICAL.length]} fillOpacity={0.9} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
