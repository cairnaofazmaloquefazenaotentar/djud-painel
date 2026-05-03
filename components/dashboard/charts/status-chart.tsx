"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer } from "recharts";
import { tooltipStyle, cursorFill, gridStroke, STATUS_COLORS } from "./chart-utils";

interface StatusChartProps {
  data: Array<{ status: string; count: number }>;
}

export function StatusChart({ data }: StatusChartProps) {
  if (!data?.length) {
    return (
      <div className="flex items-center justify-center h-[300px] text-sm text-muted-foreground">
        Sem dados de status
      </div>
    );
  }

  const chartData = data.map((item) => ({
    ...item,
    fill: STATUS_COLORS[item.status] ?? "#94a3b8",
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 60 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
        <XAxis dataKey="status" angle={-45} textAnchor="end" height={80} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
        <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v: number) => v.toLocaleString("pt-BR")} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: cursorFill }} formatter={(v: number) => [v.toLocaleString("pt-BR"), "Demandas"]} />
        <Bar dataKey="count" name="Demandas" radius={[4, 4, 0, 0]}>
          {chartData.map((entry, idx) => (
            <Cell key={idx} fill={entry.fill} fillOpacity={0.9} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
