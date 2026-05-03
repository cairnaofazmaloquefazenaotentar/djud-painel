"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer } from "recharts";
import { motion } from "framer-motion";
import { STATUS_COLORS } from "./chart-utils";

interface StatusChartProps {
  data: Array<{ status: string; count: number }>;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-background/95 backdrop-blur-md border border-primary/30 rounded-lg px-4 py-3 shadow-lg"
      >
        <p className="text-sm font-semibold text-foreground">{data.status}</p>
        <p className="text-lg font-bold text-primary">{data.count.toLocaleString("pt-BR")}</p>
        <p className="text-xs text-muted-foreground mt-1">processos em gargalo</p>
      </motion.div>
    );
  }
  return null;
};

export function StatusChart({ data }: StatusChartProps) {
  if (!data?.length) {
    return (
      <div className="flex items-center justify-center h-[320px] text-sm text-muted-foreground">
        Sem dados de status
      </div>
    );
  }

  const chartData = data.map((item) => ({
    ...item,
    fill: STATUS_COLORS[item.status] ?? "#94a3b8",
  }));

  const maxValue = Math.max(...chartData.map((d) => d.count));

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
          margin={{ top: 20, right: 30, left: 0, bottom: 70 }}
        >
          <defs>
            {chartData.map((item, idx) => (
              <linearGradient
                key={`grad-status-${idx}`}
                id={`gradStatus${idx}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={item.fill} stopOpacity={1} />
                <stop offset="100%" stopColor={item.fill} stopOpacity={0.7} />
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
            dataKey="status"
            angle={-45}
            textAnchor="end"
            height={90}
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
            {chartData.map((entry, idx) => (
              <Cell
                key={idx}
                fill={`url(#gradStatus${idx})`}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
