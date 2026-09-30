"use client";

import {
  ComposedChart,
  Bar,
  Line,
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
  fmtQty,
  fmtQtyCompact,
  SISMAT_ENTRADA_COLOR,
  SISMAT_SAIDA_COLOR,
  SISMAT_SALDO_COLOR,
} from "./sismat-format";

export type FluxMode = "brl" | "qty";

export interface SismatFluxDatum {
  period: string;
  entradas: number;
  saidas: number;
  saldoAcumulado?: number;
  entradasQty?: number;
  saidasQty?: number;
  saldoAcumuladoQty?: number;
}

interface SismatFluxChartProps {
  data: SismatFluxDatum[];
  periodType: "monthly" | "yearly";
  mode?: FluxMode;
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
  mode,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
  mode: FluxMode;
}) {
  if (!active || !payload?.length) return null;
  const fmt = mode === "brl" ? fmtBRL : fmtQty;
  const e = payload.find((p) => p.name === "Entradas")?.value ?? 0;
  const s = payload.find((p) => p.name === "Saídas")?.value ?? 0;
  const acc = payload.find((p) => p.name === "Saldo acumulado")?.value ?? 0;
  return (
    <div className="bg-background/95 backdrop-blur-md border border-border rounded-lg px-3 py-2 shadow-lg text-xs space-y-1">
      <p className="font-semibold text-foreground">{label}</p>
      <p className="flex justify-between gap-4" style={{ color: SISMAT_ENTRADA_COLOR }}>
        <span>Entradas</span>
        <span className="font-medium tabular-nums">{fmt(e)}</span>
      </p>
      <p className="flex justify-between gap-4" style={{ color: SISMAT_SAIDA_COLOR }}>
        <span>Saídas</span>
        <span className="font-medium tabular-nums">{fmt(s)}</span>
      </p>
      <p className="flex justify-between gap-4 text-muted-foreground border-t border-border pt-1">
        <span>Saldo do período</span>
        <span className="font-medium tabular-nums">{fmt(e - s)}</span>
      </p>
      <p className="flex justify-between gap-4 border-t border-border pt-1" style={{ color: SISMAT_SALDO_COLOR }}>
        <span>Saldo acumulado</span>
        <span className="font-medium tabular-nums">{fmt(acc)}</span>
      </p>
    </div>
  );
}

export function SismatFluxChart({ data, periodType, mode = "brl" }: SismatFluxChartProps) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-[340px] text-sm text-muted-foreground">
        Sem dados para o fluxo Entradas × Saídas.
      </div>
    );
  }

  const fmtCompact = mode === "brl" ? fmtBRLCompact : fmtQtyCompact;

  const chartData = data.map((d) => ({
    ...d,
    __label: periodLabel(d.period, periodType),
    __entradas: mode === "brl" ? d.entradas : (d.entradasQty ?? 0),
    __saidas: mode === "brl" ? d.saidas : (d.saidasQty ?? 0),
    __saldo: mode === "brl" ? (d.saldoAcumulado ?? 0) : (d.saldoAcumuladoQty ?? 0),
  }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full"
    >
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={chartData} margin={{ top: 16, right: 24, left: 12, bottom: 24 }} barGap={2}>
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
          {/* Eixo esquerdo: barras (entradas / saídas) */}
          <YAxis
            yAxisId="bars"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickFormatter={(v: number) => fmtCompact(v)}
            width={72}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tickLine={{ stroke: "hsl(var(--border))" }}
          />
          <Tooltip
            content={(props) => (
              <FluxTooltip
                active={props.active}
                payload={props.payload as TooltipEntry[]}
                label={props.label as string}
                mode={mode}
              />
            )}
            cursor={{ fill: "hsl(var(--muted))", opacity: 0.25 }}
          />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
          <Bar
            yAxisId="bars"
            dataKey="__entradas"
            name="Entradas"
            fill={SISMAT_ENTRADA_COLOR}
            radius={[3, 3, 0, 0]}
            isAnimationActive={false}
          />
          <Bar
            yAxisId="bars"
            dataKey="__saidas"
            name="Saídas"
            fill={SISMAT_SAIDA_COLOR}
            radius={[3, 3, 0, 0]}
            isAnimationActive={false}
          />
          <Line
            yAxisId="bars"
            type="monotone"
            dataKey="__saldo"
            name="Saldo acumulado"
            stroke={SISMAT_SALDO_COLOR}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
