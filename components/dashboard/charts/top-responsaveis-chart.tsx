"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer } from "recharts";
import { motion } from "framer-motion";
import { PALETTE_CATEGORICAL } from "./chart-utils";

interface TopResponsaveisChartProps {
  data: Array<{ id: string; name: string | null; count: number }>;
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
        <p className="text-sm font-semibold text-foreground">{data.name}</p>
        <p className="text-lg font-bold text-primary">{data.count.toLocaleString("pt-BR")}</p>
        <p className="text-xs text-muted-foreground mt-1">demandas sob responsabilidade</p>
      </motion.div>
    );
  }
  return null;
};

export function TopResponsaveisChart({ data }: TopResponsaveisChartProps) {
  if (!data?.length) {
    return (
      <div className="flex items-center justify-center h-[340px] text-sm text-muted-foreground">
        Sem dados de responsáveis
      </div>
    );
  }

  const chartData = data
    .map((item) => ({
      name: item.name || "Sem responsável",
      count: item.count,
    }))
    .reverse();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="w-full"
    >
      <ResponsiveContainer width="100%" height={340}>
        <BarChart
          layout="vertical"
          data={chartData}
          margin={{ top: 8, right: 30, left: 10, bottom: 8 }}
        >
          <defs>
            {chartData.map((_, idx) => (
              <linearGradient
                key={`grad-resp-${idx}`}
                id={`gradResp${idx}`}
                x1="0"
                y1="0"
                x2="1"
                y2="0"
              >
                <stop
                  offset="0%"
                  stopColor={PALETTE_CATEGORICAL[idx % PALETTE_CATEGORICAL.length]}
                  stopOpacity={0.8}
                />
                <stop
                  offset="100%"
                  stopColor={PALETTE_CATEGORICAL[idx % PALETTE_CATEGORICAL.length]}
                  stopOpacity={1}
                />
              </linearGradient>
            ))}
          </defs>

          <CartesianGrid
            strokeDasharray="3 3"
            stroke="hsl(var(--border))"
            vertical={true}
            horizontal={false}
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
            dataKey="name"
            type="category"
            tick={{ fontSize: 12, fill: "hsl(var(--foreground))", fontWeight: 500 }}
            width={180}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tickLine={{ stroke: "hsl(var(--border))" }}
          />

          <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--primary))", opacity: 0.1 }} />

          <Bar
            dataKey="count"
            name="Demandas"
            radius={[0, 8, 8, 0]}
            isAnimationActive={true}
            animationDuration={800}
          >
            {chartData.map((_, idx) => (
              <Cell
                key={idx}
                fill={`url(#gradResp${idx})`}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
