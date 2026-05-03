"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer } from "recharts";
import { tooltipStyle, cursorFill, gridStroke, PALETTE_PRIMARY } from "./chart-utils";

interface TRFChartProps {
  data: Array<{ trf: number | null; count: number }>;
}

export function TRFChart({ data }: TRFChartProps) {
  const chartData = data
    .filter((item) => item.trf !== null)
    .sort((a, b) => (a.trf ?? 0) - (b.trf ?? 0))
    .map((item) => ({ trf: `TRF ${item.trf}ª`, count: item.count }));

  if (!chartData.length) {
    return (
      <div className="flex items-center justify-center h-[300px] text-sm text-muted-foreground">
        Sem dados por TRF
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
        <XAxis dataKey="trf" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
        <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v: number) => v.toLocaleString("pt-BR")} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: cursorFill }} formatter={(v: number) => [v.toLocaleString("pt-BR"), "Demandas"]} />
        <Bar dataKey="count" name="Demandas" radius={[4, 4, 0, 0]}>
          {chartData.map((_, idx) => (
            <Cell key={idx} fill={PALETTE_PRIMARY[idx % PALETTE_PRIMARY.length]} fillOpacity={0.9} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
