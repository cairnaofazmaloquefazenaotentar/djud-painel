"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { motion } from "framer-motion";
import { fmtBRL, colorAt, SISMAT_OUTROS } from "./sismat-format";

export interface SismatPieDatum {
  name: string;
  valor: number;
  isOutros?: boolean;
}

interface SismatPieChartProps {
  data: SismatPieDatum[];
  grandTotal: number;
}

function PieTooltip({
  active,
  payload,
  grandTotal,
}: {
  active?: boolean;
  payload?: Array<{ payload: SismatPieDatum }>;
  grandTotal: number;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const pct = grandTotal > 0 ? (d.valor / grandTotal) * 100 : 0;
  return (
    <div className="bg-background/95 backdrop-blur-md border border-border rounded-lg px-3 py-2 shadow-lg text-xs max-w-xs">
      <p className="font-semibold text-foreground truncate">{d.name}</p>
      <p className="text-muted-foreground tabular-nums">
        {fmtBRL(d.valor)} · {pct.toFixed(1)}%
      </p>
    </div>
  );
}

export function SismatPieChart({ data, grandTotal }: SismatPieChartProps) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-[360px] text-sm text-muted-foreground">
        Sem dados para a distribuição.
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="w-full"
    >
      <ResponsiveContainer width="100%" height={360}>
        <PieChart>
          <Pie
            data={data}
            dataKey="valor"
            nameKey="name"
            cx="45%"
            cy="50%"
            innerRadius={62}
            outerRadius={110}
            paddingAngle={1}
            isAnimationActive={false}
          >
            {data.map((d, i) => (
              <Cell key={d.name} fill={d.isOutros ? SISMAT_OUTROS : colorAt(i)} />
            ))}
          </Pie>
          <Tooltip content={<PieTooltip grandTotal={grandTotal} />} />
          <Legend
            layout="vertical"
            align="right"
            verticalAlign="middle"
            wrapperStyle={{ fontSize: 11, maxWidth: "42%", lineHeight: "1.4" }}
            formatter={(value: string) => (
              <span className="text-muted-foreground" title={value}>
                {value.length > 26 ? value.slice(0, 25) + "…" : value}
              </span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
