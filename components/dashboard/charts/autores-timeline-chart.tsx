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
import { motion } from "framer-motion";
import { AutoresMesData } from "@/hooks/useAutoresMetrics";

interface AutoresTimelineChartProps {
  data: AutoresMesData[];
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-background/95 border border-border rounded-lg px-3 py-2 shadow-lg backdrop-blur-sm space-y-1"
    >
      <p className="text-xs font-semibold text-muted-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-sm">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-semibold tabular-nums">{p.value.toLocaleString("pt-BR")}</span>
        </div>
      ))}
    </motion.div>
  );
}

export function AutoresTimelineChart({ data }: AutoresTimelineChartProps) {
  if (!data?.length) {
    return (
      <div className="flex items-center justify-center h-[350px] text-sm text-muted-foreground">
        Sem dados de autores disponíveis. Certifique-se de que o campo "Autor(a)" foi importado.
      </div>
    );
  }

  const chartData = data.map((d) => ({
    mes: new Date(d.mes).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
    "Autores únicos":       d.autoresUnicos,
    "Novos autores":        d.autoresNovos,
    "Autores reincidentes": d.autoresReincidentes,
  }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full"
    >
      <ResponsiveContainer width="100%" height={380}>
        <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 70 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} vertical={false} />
          <XAxis
            dataKey="mes"
            angle={-45}
            textAnchor="end"
            height={80}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tickLine={{ stroke: "hsl(var(--border))" }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tickLine={{ stroke: "hsl(var(--border))" }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ paddingTop: "8px", fontSize: "12px" }}
            iconType="circle"
            iconSize={8}
          />
          <Line
            type="monotone"
            dataKey="Autores únicos"
            stroke="hsl(217 91% 60%)"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 5 }}
            animationDuration={1000}
          />
          <Line
            type="monotone"
            dataKey="Novos autores"
            stroke="hsl(142 71% 45%)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5 }}
            animationDuration={1100}
          />
          <Line
            type="monotone"
            dataKey="Autores reincidentes"
            stroke="hsl(38 92% 50%)"
            strokeWidth={2}
            strokeDasharray="5 3"
            dot={false}
            activeDot={{ r: 5 }}
            animationDuration={1200}
          />
        </LineChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
