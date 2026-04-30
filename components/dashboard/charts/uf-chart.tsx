"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface UFChartProps {
  data: Array<{ uf: string | null; count: number }>;
}

export function UFChart({ data }: UFChartProps) {
  const chartData = data
    .filter((item) => item.uf !== null)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        layout="vertical"
        data={chartData}
        margin={{ top: 5, right: 30, left: 50, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(240, 4%, 85%)" />
        <XAxis type="number" tick={{ fontSize: 12 }} />
        <YAxis dataKey="uf" type="category" tick={{ fontSize: 12 }} width={40} />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(0, 0%, 100%)",
            border: "1px solid hsl(240, 4%, 85%)",
            borderRadius: "0.5rem",
          }}
          cursor={{ fill: "hsl(240, 4%, 95%)" }}
        />
        <Bar dataKey="count" fill="hsl(217, 91%, 60%)" name="Quantidade" />
      </BarChart>
    </ResponsiveContainer>
  );
}
