"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface Props {
  data: Array<{ objeto: string | null; count: number }>;
}

const COLORS = [
  "#7c3aed", "#8b5cf6", "#a78bfa", "#c4b5fd",
  "#ddd6fe", "#ede9fe", "#6d28d9", "#5b21b6",
  "#4c1d95", "#3b0764",
];

const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ value: number; payload: { objeto: string | null } }> }) => {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="bg-background border border-border rounded-lg px-3 py-2 shadow text-xs max-w-[240px]">
      <p className="font-medium text-foreground leading-snug mb-1">{item.payload.objeto || "Não informado"}</p>
      <p className="text-muted-foreground">{item.value.toLocaleString("pt-BR")} processos</p>
    </div>
  );
};

export function ObjetoAcaoChart({ data }: Props) {
  if (!data?.length) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        Sem dados de objeto da ação disponíveis
      </div>
    );
  }

  const chartData = data
    .filter((d) => d.objeto)
    .map((d) => ({
      objeto: d.objeto!,
      label:  d.objeto!.length > 28 ? d.objeto!.slice(0, 26) + "…" : d.objeto!,
      count:  d.count,
    }));
    // Ordem decrescente do topo para a base (item 3.3): maior volume em cima.

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
      >
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickFormatter={(v: number) => v.toLocaleString("pt-BR")}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={200}
          tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
          {chartData.map((_, idx) => (
            <Cell key={idx} fill={COLORS[Math.min(idx, COLORS.length - 1)]} fillOpacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
