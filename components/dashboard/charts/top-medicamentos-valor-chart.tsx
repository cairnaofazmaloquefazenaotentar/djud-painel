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
import { fmtBRLCompacto } from "./valor-timeline-chart";

interface Props {
  data: Array<{ medicamento: string | null; valor: number }>;
}

// Verde → teal → azul, para diferenciar do gráfico por quantidade (que usa azul → roxo)
const COLORS = [
  "#059669", "#10b981", "#14b8a6", "#0d9488",
  "#0ea5e9", "#0284c7", "#6366f1", "#8b5cf6",
  "#a855f7", "#d946ef",
];

const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: { medicamento: string | null; valor: number } }> }) => {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-background/95 backdrop-blur-md border border-primary/30 rounded-lg px-4 py-3 shadow-lg max-w-[280px]"
    >
      <p className="font-semibold text-foreground text-sm leading-snug mb-2">{item.medicamento || "Não informado"}</p>
      <p className="text-emerald-600 font-bold text-base">{fmtBRLCompacto(item.valor)}</p>
      <p className="text-xs text-muted-foreground mt-1">valor total dos processos</p>
    </motion.div>
  );
};

export function TopMedicamentosValorChart({ data }: Props) {
  if (!data?.length) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-sm text-muted-foreground text-center px-6 gap-1">
        <p>Sem valores por princípio ativo disponíveis.</p>
        <p className="text-xs">Depende do carregamento do campo de valor na importação.</p>
      </div>
    );
  }

  // Ordem decrescente do topo para a base: maior valor em cima (sem reverse).
  const chartData = data
    .filter((d) => d.medicamento)
    .map((d) => ({
      medicamento: d.medicamento!,
      label: d.medicamento!.length > 28 ? d.medicamento!.slice(0, 26) + "…" : d.medicamento!,
      valor: d.valor,
    }));

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }} className="w-full">
      <ResponsiveContainer width="100%" height={420}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 80, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} stroke="hsl(var(--border))" opacity={0.2} />
          <XAxis
            type="number"
            tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))", fontWeight: 500 }}
            tickFormatter={(v: number) => fmtBRLCompacto(v)}
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
          <Bar dataKey="valor" radius={[0, 8, 8, 0]} isAnimationActive animationDuration={800}>
            {chartData.map((_, idx) => (
              <Cell key={idx} fill={COLORS[Math.min(idx, COLORS.length - 1)]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
