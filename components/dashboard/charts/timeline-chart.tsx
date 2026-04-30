"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface TimelineChartProps {
  data: Array<{ date: Date; count: number }>;
}

export function TimelineChart({ data }: TimelineChartProps) {
  const chartData = data.map((item) => ({
    date: item.date.toLocaleDateString("pt-BR"),
    count: item.count,
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart
        data={chartData}
        margin={{ top: 20, right: 30, left: 0, bottom: 60 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(240, 4%, 85%)" />
        <XAxis
          dataKey="date"
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
          cursor={{ stroke: "hsl(240, 4%, 85%)" }}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="count"
          stroke="hsl(217, 91%, 60%)"
          dot={{ fill: "hsl(217, 91%, 60%)", r: 4 }}
          activeDot={{ r: 6 }}
          name="Demandas"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
