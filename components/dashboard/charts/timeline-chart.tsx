"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { tooltipStyle } from "./chart-utils";

interface TimelineChartProps {
  // date vem como string JSON do servidor (ISO 8601) — não pressupor Date object
  data: Array<{ date: Date | string; count: number }>;
}

export function TimelineChart({ data }: TimelineChartProps) {
  if (!data?.length) {
    return (
      <div className="flex items-center justify-center h-[300px] text-sm text-muted-foreground">
        Sem dados de timeline disponíveis
      </div>
    );
  }

  // Converte string → Date antes de formatar (evita TypeError em runtime)
  const chartData = data.map((item) => {
    const d = item.date instanceof Date ? item.date : new Date(item.date);
    return {
      // Formato "jan/24" — compacto e legível no eixo X
      date: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
      count: item.count,
    };
  });

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart
        data={chartData}
        margin={{ top: 20, right: 30, left: 0, bottom: 60 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="date"
          angle={-45}
          textAnchor="end"
          height={80}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickFormatter={(v: number) => v.toLocaleString("pt-BR")}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v: number) => [v.toLocaleString("pt-BR"), "Demandas"]}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="count"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          dot={{ fill: "hsl(var(--primary))", r: 3 }}
          activeDot={{ r: 5 }}
          name="Demandas"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
