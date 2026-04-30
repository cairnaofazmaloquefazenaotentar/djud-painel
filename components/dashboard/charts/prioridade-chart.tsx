"use client";

import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from "recharts";

interface PrioridadeChartProps {
  data: Array<{ prioridade: string; count: number }>;
}

const prioridadeColors: Record<string, string> = {
  Baixa: "hsl(142, 71%, 45%)",
  Média: "hsl(38, 92%, 50%)",
  Alta: "hsl(25, 95%, 53%)",
  Crítica: "hsl(0, 84%, 60%)",
};

export function PrioridadeChart({ data }: PrioridadeChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={({ prioridade, count }) => `${prioridade}: ${count}`}
          outerRadius={80}
          fill="#8884d8"
          dataKey="count"
        >
          {data.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={prioridadeColors[entry.prioridade] || "hsl(240, 4%, 46%)"}
            />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(0, 0%, 100%)",
            border: "1px solid hsl(240, 4%, 85%)",
            borderRadius: "0.5rem",
          }}
        />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
