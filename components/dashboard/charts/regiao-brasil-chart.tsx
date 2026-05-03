"use client";

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { tooltipStyle, REGIAO_COLORS, PALETTE_CATEGORICAL } from "./chart-utils";

interface RegiaoBrasilChartProps {
  data: Array<{ regiao: string | null; count: number }>;
}

const RADIAN = Math.PI / 180;
const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
  if (percent < 0.04) return null;
  const r = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={600}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

export function RegiaoBrasilChart({ data }: RegiaoBrasilChartProps) {
  const chartData = data
    .filter((item) => item.regiao !== null)
    .map((item, idx) => ({
      name: item.regiao!,
      value: item.count,
      fill: REGIAO_COLORS[item.regiao!] ?? PALETTE_CATEGORICAL[idx % PALETTE_CATEGORICAL.length],
    }));

  if (!chartData.length) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
        Sem dados de região
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie data={chartData} cx="50%" cy="50%" outerRadius={110} dataKey="value" labelLine={false} label={renderLabel}>
          {chartData.map((entry, idx) => (
            <Cell key={idx} fill={entry.fill} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v.toLocaleString("pt-BR"), "Demandas"]} />
        <Legend formatter={(value) => <span className="text-xs">{value}</span>} />
      </PieChart>
    </ResponsiveContainer>
  );
}
