"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface AreaTematicaChartProps {
  data: Array<{ area: string | null; count: number }>;
}

const COLORS = [
  "hsl(217, 91%, 55%)",
  "hsl(262, 83%, 58%)",
  "hsl(142, 71%, 45%)",
  "hsl(38, 92%, 50%)",
  "hsl(346, 87%, 55%)",
  "hsl(199, 89%, 48%)",
  "hsl(24, 95%, 53%)",
  "hsl(172, 66%, 50%)",
  "hsl(291, 64%, 42%)",
  "hsl(60, 100%, 40%)",
];

export function AreaTematicaChart({ data }: AreaTematicaChartProps) {
  const chartData = data
    .filter((item) => item.area !== null)
    .slice(0, 10)
    .map((item) => ({
      // Abreviar nomes longos
      area: item.area!.length > 28 ? item.area!.substring(0, 26) + "…" : item.area!,
      fullName: item.area!,
      count: item.count,
    }));

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
        Sem dados de grupo temático
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(240, 4%, 88%)" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11 }} />
        <YAxis
          type="category"
          dataKey="area"
          width={170}
          tick={{ fontSize: 10 }}
        />
        <Tooltip
          formatter={(value: number, _: string, props: any) => [
            value.toLocaleString("pt-BR"),
            props.payload.fullName,
          ]}
          contentStyle={{
            backgroundColor: "hsl(0, 0%, 100%)",
            border: "1px solid hsl(240, 4%, 85%)",
            borderRadius: "0.5rem",
            fontSize: "12px",
          }}
          cursor={{ fill: "hsl(240, 4%, 95%)" }}
        />
        <Bar dataKey="count" name="Demandas" radius={[0, 4, 4, 0]}>
          {chartData.map((_, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
