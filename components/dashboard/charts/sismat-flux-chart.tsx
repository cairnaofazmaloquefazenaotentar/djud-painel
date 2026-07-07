"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { motion } from "framer-motion";
import {
  fmtBRL,
  fmtBRLCompact,
  SISMAT_ENTRADA_COLOR,
  SISMAT_SAIDA_COLOR,
} from "./sismat-format";

export interface SismatFluxDatum {
  period: string;
  entradas: number;
  saidas: number;
}

interface SismatFluxChartProps {
  data: SismatFluxDatum[];
  periodType: "monthly" | "yearly";
}

function periodLabel(p: string, type: "monthly" | "yearly"): string {
  if (type === "yearly") return p;
  const [y, m] = p.split("-");
  if (!m) return p;
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
}

type TooltipEntry = { value?: number; name?: string; color?: string };

function FluxTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const e = payload.find((p) => p.name === "Entradas")?.value ?? 0;
  const s = payload.find((p) => p.name === "Saídas")?.value ?? 0;
  return (
    <div className="bg-background/95 backdrop-blur-md border border-border rounded-lg px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      <p className="flex justify-between gap-4" style={{ color: SISMAT_ENTRADA_COLOR }}>
        <span>Entradas</span>
        <span className="font-medium tabular-nums">{fmtBRL(e)}</span>
      </p>
      <p className="flex justify-between gap-4" style={{ color: SISMAT_SAIDA_COLOR }}>
        <span>Saídas</span>
        <span className="font-medium tabular-nums">{fmtBRL(s)}</span>
      </p>
      <p className="flex justify-between gap-4 text-muted-foreground border-t border-border mt-1 pt-1">
        <span>Saldo do período</span>
        <span className="font-medium tabular-nums">{fmtBRL(e - s)}</span>
      </p>
    </div>
  );
}

export function SismatFluxChart({ data, periodType }: SismatFluxChartProps) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-[340px] text-sm text-muted-foreground">
        Sem dados para o fluxo Entradas × Saídas.
      </div>
    );
  }

  const chartData = data.map((d) => ({
    ...d,
    __label: periodLabel(d.period, periodType),
  }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full"
    >
      <ResponsiveContainer width="100%" height={340}>
        <BarChart data={chartData} margin={{ top: 16, right: 24, left: 12, bottom: 24 }} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} vertical={false} />
          <XAxis
            dataKey="__label"
            angle={periodType === "monthly" ? -45 : 0}
            textAnchor={periodType === "monthly" ? "end" : "middle"}
            height={periodType === "monthly" ? 56 : 30}
            interval="preserveStartEnd"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tickLine={{ stroke: "hsl(var(--border))" }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickFormatter={(v: number) => fmtBRLCompact(v)}
            width={72}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tickLine={{ stroke: "hsl(var(--border))" }}
          />
          <Tooltip content={<FluxTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.25 }} />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
          <Bar dataKey="entradas" name="Entradas" fill={SISMAT_ENTRADA_COLOR} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="saidas" name="Saídas" fill={SISMAT_SAIDA_COLOR} radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
