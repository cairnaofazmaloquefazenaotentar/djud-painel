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
  data: Array<{ medicamento: string | null; count: number }>;
}

// Gradiente de cores para o ranking
const COLORS = [
  "#1d4ed8", "#2563eb", "#3b82f6", "#60a5fa",
  "#93c5fd", "#bfdbfe", "#dbeafe", "#e0f2fe",
  "#e0f7fa", "#b2ebf2",
];

const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ value: number; payload: { medicamento: string | null } }> }) => {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="bg-background border border-border rounded-lg px-3 py-2 shadow text-xs max-w-[240px]">
      <p className="font-medium text-foreground leading-snug mb-1">{item.payload.medicamento || "Não informado"}</p>
      <p className="text-muted-foreground">{item.value.toLocaleString("pt-BR")} processos</p>
    </div>
  );
};

export function TopMedicamentosChart({ data }: Props) {
  if (!data?.length) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        Sem dados de princípio ativo disponíveis
      </div>
    );
  }

  const chartData = data
    .filter((d) => d.medicamento)
    .map((d) => ({
      medicamento: d.medicamento!,
      // Abreviar nomes longos para o eixo Y
      label: d.medicamento!.length > 28 ? d.medicamento!.slice(0, 26) + "…" : d.medicamento!,
      count: d.count,
    }))
    .reverse(); // maior no topo

  return (
    <ResponsiveContainer width="100%" height={380}>
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
          width={190}
          tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
          {chartData.map((_, idx) => (
            <Cell
              key={idx}
              fill={COLORS[Math.min(idx, COLORS.length - 1)]}
              fillOpacity={0.9}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
