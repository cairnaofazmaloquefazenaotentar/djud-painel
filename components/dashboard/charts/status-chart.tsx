"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface StatusChartProps {
  data: Array<{ status: string; count: number }>;
}

const statusColors: Record<string, string> = {
  Aberta: "hsl(142, 71%, 45%)",
  Fechada: "hsl(0, 84%, 60%)",
  Arquivada: "hsl(38, 92%, 50%)",
  Pendente: "hsl(217, 91%, 60%)",
  "Sem status": "hsl(240, 4%, 46%)",
};

export function StatusChart({ data }: StatusChartProps) {
  const chartData = data.map((item) => ({
    ...item,
    fill: statusColors[item.status] || "hsl(240, 4%, 46%)",
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={chartData}
        margin={{ top: 20, right: 30, left: 0, bottom: 60 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(240, 4%, 85%)" />
        <XAxis
          dataKey="status"
          angle={-45}
          textAnchor="end"
          height={80}
          tick={{ fontSize: 12 }}
        />
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
