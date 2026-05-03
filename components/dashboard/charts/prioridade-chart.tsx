"use client";

import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from "recharts";
import { tooltipStyle, PRIORIDADE_COLORS } from "./chart-utils";

interface PrioridadeChartProps {
  data: Array<{ prioridade: string; count: number }>;
}

const RADIAN = Math.PI / 180;
const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
  if (percent < 0.04) return null;
  const r = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

export function PrioridadeChart({ data }: PrioridadeChartProps) {
  if (!data?.length) {
    return (
      <div className="flex items-center justify-center h-[300px] text-sm text-muted-foreground">
        Sem dados de prioridade
      </div>
    );
  }

  const chartData = data.map((item) => ({
    name: item.prioridade || "Normal",
    value: item.count,
    fill: PRIORIDADE_COLORS[item.prioridade] ?? "#94a3b8",
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          outerRadius={100}
          dataKey="value"
          labelLine={false}
          label={renderLabel}
        >
          {chartData.map((entry, idx) => (
            <Cell key={idx} fill={entry.fill} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v: number) => [v.toLocaleString("pt-BR"), "Demandas"]}
        />
        <Legend formatter={(value) => <span className="text-xs">{value}</span>} />
      </PieChart>
    </ResponsiveContainer>
  );
}
