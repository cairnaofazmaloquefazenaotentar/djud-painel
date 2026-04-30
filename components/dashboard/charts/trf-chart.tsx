"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface TRFChartProps {
  data: Array<{ trf: number | null; count: number }>;
}

export function TRFChart({ data }: TRFChartProps) {
  const chartData = data
    .filter((item) => item.trf !== null)
    .map((item) => ({
      trf: `TRF ${item.trf}`,
      count: item.count,
    }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={chartData}
        margin={{ top: 20, right: 30, left: 0, bottom: 20 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(240, 4%, 85%)" />
        <XAxis dataKey="trf" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
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
