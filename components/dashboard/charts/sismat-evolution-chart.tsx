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
import { motion } from "framer-motion";
import { fmtBRL, fmtBRLCompact, colorAt, SISMAT_GRAY } from "./sismat-format";

export const SISMAT_TOTAL_KEY = "__total";

interface SismatEvolutionChartProps {
  /** Uma linha por período; cada entidade é uma chave; `__total` é a linha tracejada. */
  data: Array<Record<string, string | number>>;
  /** Nomes das entidades a plotar (na ordem/cor desejada). */
  entities: string[];
  /** Exibe a linha "Total geral"? */
  showTotal?: boolean;
  /** "monthly" → rótulo "mmm/aa"; "yearly" → o próprio ano. */
  periodType: "monthly" | "yearly";
}

function periodLabel(p: string, type: "monthly" | "yearly"): string {
  if (type === "yearly") return p;
  const [y, m] = p.split("-");
  if (!m) return p;
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
}

type TooltipEntry = { value?: number; name?: string; dataKey?: string | number; color?: string };

function EvolutionTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const rows = payload
    .filter((p) => (p.value || 0) > 0)
    .sort((a, b) => (b.value || 0) - (a.value || 0));
  if (!rows.length) return null;
  return (
    <div className="bg-background/95 backdrop-blur-md border border-border rounded-lg px-3 py-2 shadow-lg text-xs max-w-xs">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {rows.map((p) => (
        <p key={String(p.dataKey)} className="flex justify-between gap-4" style={{ color: p.color }}>
          <span className="truncate">{p.name === SISMAT_TOTAL_KEY ? "Total geral" : p.name}</span>
          <span className="font-medium tabular-nums whitespace-nowrap">{fmtBRL(p.value || 0)}</span>
        </p>
      ))}
    </div>
  );
}

export function SismatEvolutionChart({
  data,
  entities,
  showTotal = true,
  periodType,
}: SismatEvolutionChartProps) {
  if (!data.length || !entities.length) {
    return (
      <div className="flex items-center justify-center h-[360px] text-sm text-muted-foreground">
        Sem dados para exibir a evolução.
      </div>
    );
  }

  const chartData = data.map((row) => ({
    ...row,
    __label: periodLabel(String(row.period), periodType),
  }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full"
    >
      <ResponsiveContainer width="100%" height={380}>
        <LineChart data={chartData} margin={{ top: 16, right: 24, left: 12, bottom: 64 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} vertical={false} />
          <XAxis
            dataKey="__label"
            angle={-45}
            textAnchor="end"
            height={70}
            interval="preserveStartEnd"
            minTickGap={periodType === "monthly" ? 24 : 8}
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
          <Tooltip content={<EvolutionTooltip />} />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
          {entities.map((e, i) => (
            <Line
              key={e}
              type="monotone"
              dataKey={e}
              name={e}
              stroke={colorAt(i)}
              strokeWidth={2}
              dot={{ r: 1.5 }}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
              connectNulls
            />
          ))}
          {showTotal && (
            <Line
              type="monotone"
              dataKey={SISMAT_TOTAL_KEY}
              name={SISMAT_TOTAL_KEY}
              stroke={SISMAT_GRAY}
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
