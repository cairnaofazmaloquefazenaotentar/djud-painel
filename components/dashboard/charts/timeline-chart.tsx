"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import { motion } from "framer-motion";
import { tooltipStyle } from "./chart-utils";

interface TimelineChartProps {
  data: Array<{ date: Date | string; count: number }>;
}

// Custom animated tooltip
function CustomTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-background/95 border border-primary/50 rounded-lg px-3 py-2 shadow-lg backdrop-blur-sm"
      >
        <p className="text-sm font-semibold text-foreground">
          {data.count.toLocaleString("pt-BR")}
        </p>
        <p className="text-xs text-muted-foreground">{data.date}</p>
      </motion.div>
    );
  }
  return null;
}

export function TimelineChart({ data }: TimelineChartProps) {
  if (!data?.length) {
    return (
      <div className="flex items-center justify-center h-[350px] text-sm text-muted-foreground">
        Sem dados de timeline disponíveis
      </div>
    );
  }

  const chartData = data.map((item) => {
    const d = item.date instanceof Date ? item.date : new Date(item.date);
    return {
      date: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
      count: item.count,
    };
  });

  // Encontra min/max para animação
  const maxCount = Math.max(...chartData.map((d) => d.count));

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full"
    >
      <ResponsiveContainer width="100%" height={350}>
        <AreaChart
          data={chartData}
          margin={{ top: 20, right: 30, left: 0, bottom: 60 }}
        >
          <defs>
            <linearGradient id="gradTimeline" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(217 91% 60%)" stopOpacity={0.4} />
              <stop offset="100%" stopColor="hsl(217 91% 60%)" stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid
            strokeDasharray="3 3"
            stroke="hsl(var(--border))"
            opacity={0.3}
            vertical={false}
          />

          <XAxis
            dataKey="date"
            angle={-45}
            textAnchor="end"
            height={80}
            tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))", fontWeight: 500 }}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tickLine={{ stroke: "hsl(var(--border))" }}
          />

          <YAxis
            tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))", fontWeight: 500 }}
            tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toString())}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tickLine={{ stroke: "hsl(var(--border))" }}
          />

          <Tooltip content={<CustomTooltip />} />

          <Area
            type="monotone"
            dataKey="count"
            stroke="hsl(217 91% 60%)"
            strokeWidth={3}
            fill="url(#gradTimeline)"
            isAnimationActive={true}
            animationDuration={1200}
            dot={(props) => {
              const { cx, cy, payload } = props;
              const isMax = payload.count === maxCount;
              return (
                <motion.circle
                  key={`dot-${payload.date}`}
                  cx={cx}
                  cy={cy}
                  r={isMax ? 6 : 4}
                  fill="hsl(217 91% 60%)"
                  stroke="hsl(var(--background))"
                  strokeWidth={2}
                  initial={{ r: 0 }}
                  animate={{ r: isMax ? 6 : 4 }}
                  whileHover={{ r: 7 }}
                  transition={{ duration: 0.3 }}
                />
              );
            }}
            activeDot={{
              r: 8,
              fill: "hsl(217 91% 60%)",
              stroke: "hsl(var(--background))",
              strokeWidth: 3,
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
