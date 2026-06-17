"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { motion } from "framer-motion";

interface ValorTimelineChartProps {
  data: Array<{ mes: Date | string; valor: number }>;
}

// Formata R$ de forma compacta (mil / mi / bi)
export function fmtBRLCompacto(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return `R$ ${(v / 1_000_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} bi`;
  if (abs >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mi`;
  if (abs >= 1_000) return `R$ ${(v / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  return `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}

function mesLabel(m: Date | string) {
  const d = m instanceof Date ? m : new Date(m);
  return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-background/95 border border-primary/40 rounded-lg px-3 py-2 shadow-lg backdrop-blur-sm"
    >
      <p className="text-sm font-bold text-primary">{fmtBRLCompacto(d.valor)}</p>
      <p className="text-xs text-muted-foreground">{d.mes}</p>
    </motion.div>
  );
};

export function ValorTimelineChart({ data }: ValorTimelineChartProps) {
  if (!data?.length) {
    return (
      <div className="flex flex-col items-center justify-center h-[350px] text-sm text-muted-foreground text-center px-6 gap-1">
        <p>Sem valores disponíveis para a série histórica.</p>
        <p className="text-xs">
          Os valores são carregados do campo &quot;Valor do Depósito (em reais)&quot; — confira se a importação foi
          executada após o ajuste do <code>valorEstimado</code>.
        </p>
      </div>
    );
  }

  const chartData = data.map((d) => ({ mes: mesLabel(d.mes), valor: d.valor }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full"
    >
      <ResponsiveContainer width="100%" height={350}>
        <AreaChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 60 }}>
          <defs>
            <linearGradient id="gradValor" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(160 84% 39%)" stopOpacity={0.4} />
              <stop offset="100%" stopColor="hsl(160 84% 39%)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} vertical={false} />
          <XAxis
            dataKey="mes"
            angle={-45}
            textAnchor="end"
            height={70}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tickLine={{ stroke: "hsl(var(--border))" }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickFormatter={(v: number) => fmtBRLCompacto(v)}
            width={90}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tickLine={{ stroke: "hsl(var(--border))" }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="valor"
            stroke="hsl(160 84% 39%)"
            strokeWidth={3}
            fill="url(#gradValor)"
            isAnimationActive
            animationDuration={1000}
          />
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
