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
import { Building2 } from "lucide-react";

interface Props {
  data: Array<{ fornecedor: string | null; count: number }>;
}

const COLORS = [
  "#0891b2", "#06b6d4", "#22d3ee", "#0e7490",
  "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7",
  "#ec4899", "#f43f5e",
];

const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: { fornecedor: string | null; count: number } }> }) => {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div className="bg-background border border-border rounded-lg px-3 py-2 shadow text-xs max-w-[260px]">
      <p className="font-medium text-foreground leading-snug mb-1">{item.fornecedor || "Não informado"}</p>
      <p className="text-muted-foreground">{item.count.toLocaleString("pt-BR")} processos</p>
    </div>
  );
};

export function FornecedorChart({ data }: Props) {
  // Estado-vazio: a base ainda não tem o campo de fornecedor preenchido.
  if (!data?.length) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-center text-sm text-muted-foreground gap-1 px-6">
        <Building2 className="h-6 w-6 mb-1 opacity-50" />
        <p>A base do Redmine ainda não possui um campo de fornecedor/laboratório preenchido.</p>
        <p className="text-xs">
          Assim que a coluna de fornecedor for incluída na exportação e a base reimportada, este ranking aparece
          automaticamente.
        </p>
      </div>
    );
  }

  // Maior volume no topo (decrescente, sem reverse).
  const chartData = data
    .filter((d) => d.fornecedor)
    .map((d) => ({
      fornecedor: d.fornecedor!,
      label: d.fornecedor!.length > 28 ? d.fornecedor!.slice(0, 26) + "…" : d.fornecedor!,
      count: d.count,
    }));

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }} className="w-full">
      <ResponsiveContainer width="100%" height={420}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 30, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} stroke="hsl(var(--border))" opacity={0.2} />
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
          <Bar dataKey="count" radius={[0, 8, 8, 0]} isAnimationActive animationDuration={800}>
            {chartData.map((_, idx) => (
              <Cell key={idx} fill={COLORS[Math.min(idx, COLORS.length - 1)]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
