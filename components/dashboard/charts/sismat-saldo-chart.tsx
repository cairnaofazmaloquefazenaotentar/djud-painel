"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { motion } from "framer-motion";
import { fmtBRL, fmtBRLCompact, SISMAT_SALDO_COLOR, SISMAT_GRAY } from "./sismat-format";

export interface SismatSaldoDatum {
  period: string; // "YYYY-MM"
  saldoAcumulado: number;
}

interface SismatSaldoChartProps {
  data: SismatSaldoDatum[];
}

function periodLabel(p: string): string {
  const [y, m] = p.split("-");
  if (!m) return p;
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
}

function SaldoTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background/95 backdrop-blur-md border border-border rounded-lg px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-foreground">{label}</p>
      <p className="text-muted-foreground tabular-nums">
        Saldo acumulado: <span className="font-medium text-foreground">{fmtBRL(payload[0].value ?? 0)}</span>
      </p>
    </div>
  );
}

export function SismatSaldoChart({ data }: SismatSaldoChartProps) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-[300px] text-sm text-muted-foreground">
        Sem dados para a evolução do saldo.
      </div>
    );
  }

  const chartData = data.map((d) => ({ ...d, __label: periodLabel(d.period) }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full"
    >
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={chartData} margin={{ top: 12, right: 24, left: 12, bottom: 40 }}>
          <defs>
            <linearGradient id="sismatSaldoFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SISMAT_SALDO_COLOR} stopOpacity={0.35} />
              <stop offset="100%" stopColor={SISMAT_SALDO_COLOR} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} vertical={false} />
          <XAxis
            dataKey="__label"
            angle={-45}
            textAnchor="end"
            height={54}
            interval="preserveStartEnd"
            minTickGap={24}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tickLine={{ stroke: "hsl(var(--border))" }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickFormatter={(v: number) => fmtBRLCompact(v)}
            width={78}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tickLine={{ stroke: "hsl(var(--border))" }}
          />
          <Tooltip content={<SaldoTooltip />} />
          <ReferenceLine y={0} stroke={SISMAT_GRAY} strokeDasharray="4 4" />
          <Area
            type="monotone"
            dataKey="saldoAcumulado"
            stroke={SISMAT_SALDO_COLOR}
            strokeWidth={2}
            fill="url(#sismatSaldoFill)"
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
