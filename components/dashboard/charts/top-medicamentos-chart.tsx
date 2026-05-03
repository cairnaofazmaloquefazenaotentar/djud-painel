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
import { motion } from "framer-motion";

interface Props {
  data: Array<{ medicamento: string | null; count: number }>;
}

// Gradiente premium de cores (azul → ciano → verde)
const COLORS = [
  "#0ea5e9", "#06b6d4", "#10b981", "#14b8a6",
  "#8b5cf6", "#d946ef", "#ec4899", "#f43f5e",
  "#f97316", "#eab308",
];

const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ value: number; payload: { medicamento: string | null; count: number } }> }) => {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-background/95 backdrop-blur-md border border-primary/30 rounded-lg px-4 py-3 shadow-lg max-w-[280px]"
    >
      <p className="font-semibold text-foreground text-sm leading-snug mb-2">
        {item.medicamento || "Não informado"}
      </p>
      <p className="text-primary font-bold text-base">
        {item.count.toLocaleString("pt-BR")}
      </p>
      <p className="text-xs text-muted-foreground mt-1">processos judiciais</p>
    </motion.div>
  );
};

export function TopMedicamentosChart({ data }: Props) {
  if (!data?.length) {
    return (
      <div className="flex items-center justify-center h-96 text-sm text-muted-foreground">
        Sem dados de princípio ativo disponíveis
      </div>
    );
  }

  const chartData = data
    .filter((d) => d.medicamento)
    .map((d, idx) => ({
      medicamento: d.medicamento!,
      label: d.medicamento!.length > 28 ? d.medicamento!.slice(0, 26) + "…" : d.medicamento!,
      count: d.count,
      rank: idx + 1,
    }))
    .reverse();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="w-full"
    >
      <ResponsiveContainer width="100%" height={420}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 8, right: 30, left: 8, bottom: 8 }}
        >
          <defs>
            {chartData.map((_, idx) => (
              <linearGradient
                key={`grad-${idx}`}
                id={`gradient${idx}`}
                x1="0"
                y1="0"
                x2="1"
                y2="0"
              >
                <stop offset="0%" stopColor={COLORS[idx % COLORS.length]} stopOpacity={0.8} />
                <stop offset="100%" stopColor={COLORS[idx % COLORS.length]} stopOpacity={1} />
              </linearGradient>
            ))}
          </defs>

          <CartesianGrid
            strokeDasharray="3 3"
            horizontal={true}
            vertical={false}
            stroke="hsl(var(--border))"
            opacity={0.2}
          />

          <XAxis
            type="number"
            tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))", fontWeight: 500 }}
            tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toString())}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tickLine={{ stroke: "hsl(var(--border))" }}
          />

          <YAxis
            type="category"
            dataKey="label"
            width={200}
            tick={{ fontSize: 12, fill: "hsl(var(--foreground))", fontWeight: 500 }}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tickLine={{ stroke: "hsl(var(--border))" }}
          />

          <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--primary))", opacity: 0.1 }} />

          <Bar dataKey="count" radius={[0, 8, 8, 0]} isAnimationActive={true} animationDuration={800}>
            {chartData.map((_, idx) => (
              <Cell
                key={idx}
                fill={`url(#gradient${idx})`}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
