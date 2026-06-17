"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { motion } from "framer-motion";
import { PALETTE_CATEGORICAL } from "./chart-utils";

interface TribunalTimelineChartProps {
  // Formato longo: uma linha por (mês, tribunal). `value` é a métrica empilhada (volume ou R$).
  data: Array<{ mes: Date | string; trf: number | null; value: number }>;
  // Formatação do eixo Y / tooltip (ex.: número de processos ou moeda)
  format?: (n: number) => string;
  unidade?: string; // rótulo curto exibido no tooltip ("processos", "R$")
  emptyLabel?: string;
}

function mesLabel(m: Date | string) {
  const d = m instanceof Date ? m : new Date(m);
  return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
}

export function TribunalTimelineChart({
  data,
  format = (n) => n.toLocaleString("pt-BR"),
  unidade = "processos",
  emptyLabel = "Sem dados disponíveis para decomposição por tribunal",
}: TribunalTimelineChartProps) {
  if (!data?.length) {
    return (
      <div className="flex items-center justify-center h-[350px] text-sm text-muted-foreground text-center px-6">
        {emptyLabel}
      </div>
    );
  }

  // Tribunais presentes, ordenados (TRF1..TRF6)
  const trfs = Array.from(new Set(data.map((d) => d.trf).filter((t): t is number => t != null))).sort(
    (a, b) => a - b
  );

  // Pivotagem: long-form → wide-form (uma coluna por tribunal). data já vem ordenado por mês.
  const ordemMeses: string[] = [];
  const mapa = new Map<string, Record<string, number | string>>();
  for (const d of data) {
    const label = mesLabel(d.mes);
    if (!mapa.has(label)) {
      const base: Record<string, number | string> = { mes: label };
      trfs.forEach((t) => (base[`TRF${t}`] = 0));
      mapa.set(label, base);
      ordemMeses.push(label);
    }
    if (d.trf != null) {
      const row = mapa.get(label)!;
      row[`TRF${d.trf}`] = (row[`TRF${d.trf}`] as number) + d.value;
    }
  }
  const chartData = ordemMeses.map((m) => mapa.get(m)!);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const total = payload.reduce((s: number, p: any) => s + (p.value || 0), 0);
    return (
      <div className="bg-background/95 backdrop-blur-md border border-border rounded-lg px-3 py-2 shadow-lg text-xs">
        <p className="font-semibold text-foreground mb-1">{label}</p>
        {payload
          .filter((p: any) => p.value > 0)
          .map((p: any) => (
            <p key={p.dataKey} className="flex justify-between gap-4" style={{ color: p.color }}>
              <span>{p.dataKey}</span>
              <span className="font-medium">{format(p.value)}</span>
            </p>
          ))}
        <p className="flex justify-between gap-4 mt-1 pt-1 border-t border-border text-foreground">
          <span>Total ({unidade})</span>
          <span className="font-bold">{format(total)}</span>
        </p>
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full"
    >
      <ResponsiveContainer width="100%" height={380}>
        <AreaChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} vertical={false} />
          <XAxis
            dataKey="mes"
            angle={-45}
            textAnchor="end"
            height={70}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tickLine={{ stroke: "hsl(var(--border))" }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickFormatter={(v: number) => format(v)}
            width={70}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tickLine={{ stroke: "hsl(var(--border))" }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {trfs.map((t, idx) => (
            <Area
              key={t}
              type="monotone"
              dataKey={`TRF${t}`}
              stackId="1"
              stroke={PALETTE_CATEGORICAL[idx % PALETTE_CATEGORICAL.length]}
              fill={PALETTE_CATEGORICAL[idx % PALETTE_CATEGORICAL.length]}
              fillOpacity={0.7}
              isAnimationActive
              animationDuration={800}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
