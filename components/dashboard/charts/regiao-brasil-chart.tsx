"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface RegiaoBrasilChartProps {
  data: Array<{ regiao: string | null; count: number }>;
}

const REGIAO_COLORS: Record<string, string> = {
  "Norte": "hsl(199, 89%, 48%)",
  "Nordeste": "hsl(38, 92%, 50%)",
  "Centro-Oeste": "hsl(142, 71%, 45%)",
  "Sudeste": "hsl(346, 87%, 55%)",
  "Sul": "hsl(262, 83%, 58%)",
};

const DEFAULT_COLORS = [
  "hsl(217, 91%, 55%)",
  "hsl(262, 83%, 58%)",
  "hsl(142, 71%, 45%)",
  "hsl(38, 92%, 50%)",
  "hsl(346, 87%, 55%)",
];

const RADIAN = Math.PI / 180;
const renderCustomLabel = ({
  cx, cy, midAngle, innerRadius, outerRadius, percent,
}: any) => {
  if (percent < 0.04) return null;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={600}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

export function RegiaoBrasilChart({ data }: RegiaoBrasilChartProps) {
  const chartData = data
    .filter((item) => item.regiao !== null)
    .map((item) => ({
      name: item.regiao!,
      value: item.count,
    }));

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
        Sem dados de região
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          outerRadius={110}
          dataKey="value"
          labelLine={false}
          label={renderCustomLabel}
        >
          {chartData.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={REGIAO_COLORS[entry.name] || DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
            />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number) => [value.toLocaleString("pt-BR"), "Demandas"]}
          contentStyle={{
            backgroundColor: "hsl(0, 0%, 100%)",
            border: "1px solid hsl(240, 4%, 85%)",
            borderRadius: "0.5rem",
            fontSize: "12px",
          }}
        />
        <Legend
          formatter={(value) => <span className="text-xs">{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
