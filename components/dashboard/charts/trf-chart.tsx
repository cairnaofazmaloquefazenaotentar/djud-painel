"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer } from "recharts";
import { motion } from "framer-motion";
import { PALETTE_PRIMARY } from "./chart-utils";

interface TRFChartProps {
  data: Array<{ trf: number | null; count: number }>;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-background/95 backdrop-blur-md border border-primary/30 rounded-lg px-4 py-3 shadow-lg"
      >
        <p className="text-sm font-semibold text-foreground">{data.trf}</p>
        <p className="text-lg font-bold text-primary">{data.count.toLocaleString("pt-BR")}</p>
        <p className="text-xs text-muted-foreground mt-1">demandas judiciais</p>
      </motion.div>
    );
  }
  return null;
};

export function TRFChart({ data }: TRFChartProps) {
  const chartData = data
    .filter((item) => item.trf !== null)
    .sort((a, b) => (a.trf ?? 0) - (b.trf ?? 0))
    .map((item) => ({ trf: `TRF ${item.trf}ª`, count: item.count }));

  if (!chartData.length) {
    return (
      <div className="flex items-center justify-center h-[320px] text-sm text-muted-foreground">
        Sem dados por TRF
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full"
    >
      <ResponsiveContainer width="100%" height={320}>
        <BarChart
          data={chartData}
          margin={{ top: 20, right: 30, left: 0, bottom: 20 }}
        >
          <defs>
            {chartData.map((_, idx) => (
              <linearGradient
                key={`grad-trf-${idx}`}
                id={`gradTRF${idx}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor={PALETTE_PRIMARY[idx % PALETTE_PRIMARY.length]}
                  stopOpacity={1}
                />
                <stop
                  offset="100%"
                  stopColor={PALETTE_PRIMARY[idx % PALETTE_PRIMARY.length]}
                  stopOpacity={0.7}
                />
              </linearGradient>
            ))}
          </defs>

          <CartesianGrid
            strokeDasharray="3 3"
            stroke="hsl(var(--border))"
            vertical={false}
            opacity={0.2}
          />

          <XAxis
            dataKey="trf"
            tick={{ fontSize: 12, fill: "hsl(var(--foreground))", fontWeight: 500 }}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tickLine={{ stroke: "hsl(var(--border))" }}
          />

          <YAxis
            tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))", fontWeight: 500 }}
            tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toString())}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tickLine={{ stroke: "hsl(var(--border))" }}
          />

          <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--primary))", opacity: 0.1 }} />

          <Bar
            dataKey="count"
            name="Demandas"
            radius={[8, 8, 0, 0]}
            isAnimationActive={true}
            animationDuration={800}
          >
            {chartData.map((_, idx) => (
              <Cell
                key={idx}
                fill={`url(#gradTRF${idx})`}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
