"use client";

import {
  FunnelChart,
  Funnel,
  LabelList,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from "recharts";
import { motion } from "framer-motion";
import { STATUS_COLORS } from "./chart-utils";

interface StatusChartProps {
  // Espera-se que os dados já cheguem ordenados pelo fluxo de execução (ver lib/metrics.ts → FLUXO_DJUD).
  data: Array<{ status: string; count: number }>;
}

const CustomTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { status: string; count: number; etapa: number } }>;
}) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-background/95 backdrop-blur-md border border-primary/30 rounded-lg px-4 py-3 shadow-lg"
      >
        <p className="text-sm font-semibold text-foreground">
          {data.etapa}. {data.status}
        </p>
        <p className="text-lg font-bold text-primary">{data.count.toLocaleString("pt-BR")}</p>
        <p className="text-xs text-muted-foreground mt-1">processos nesta etapa</p>
      </motion.div>
    );
  }
  return null;
};

export function StatusChart({ data }: StatusChartProps) {
  if (!data?.length) {
    return (
      <div className="flex items-center justify-center h-[320px] text-sm text-muted-foreground">
        Sem dados de status
      </div>
    );
  }

  // Mantém a ordem do fluxo recebida do backend e anexa o número da etapa + cor.
  const chartData = data.map((item, idx) => ({
    ...item,
    etapa: idx + 1,
    fill: STATUS_COLORS[item.status] ?? "#94a3b8",
  }));

  // Altura proporcional ao número de etapas para não espremer os rótulos.
  const height = Math.max(360, chartData.length * 42);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full"
    >
      <ResponsiveContainer width="100%" height={height}>
        <FunnelChart margin={{ top: 8, right: 160, left: 16, bottom: 8 }}>
          <Tooltip content={<CustomTooltip />} />
          <Funnel
            dataKey="count"
            data={chartData}
            isAnimationActive
            animationDuration={800}
            // orientation vertical (padrão): primeira etapa no topo, última embaixo
          >
            {chartData.map((entry, idx) => (
              <Cell key={idx} fill={entry.fill} fillOpacity={0.9} stroke="hsl(var(--background))" strokeWidth={1} />
            ))}
            {/* Nome da etapa à direita de cada faixa */}
            <LabelList
              position="right"
              dataKey="status"
              stroke="none"
              fill="hsl(var(--foreground))"
              fontSize={12}
              fontWeight={500}
            />
            {/* Quantidade dentro de cada faixa */}
            <LabelList
              position="inside"
              dataKey="count"
              stroke="none"
              fill="#ffffff"
              fontSize={12}
              fontWeight={700}
              formatter={(v: number) => v.toLocaleString("pt-BR")}
            />
          </Funnel>
        </FunnelChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
