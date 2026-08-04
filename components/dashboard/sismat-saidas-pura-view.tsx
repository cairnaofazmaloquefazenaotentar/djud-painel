"use client";

import { useSaidasRedmineOverview } from "@/hooks/useSismatSaidasRedmine";
import type { RankItem } from "@/lib/sismat-saidas-redmine-metrics";
import { MetricCard } from "./metric-card";
import { Panel } from "./sismat-shared";
import { fmtBRL, fmtBRLCompact, colorAt } from "./charts/sismat-format";
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
import {
  Coins,
  FileText,
  Pill,
  ArrowUpFromLine,
  Loader2,
  AlertTriangle,
  PackageOpen,
} from "lucide-react";

// ── Tooltip do gráfico de barras ──────────────────────────────────────────────

function HBarTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { nome: string; valor: number } }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-background/95 backdrop-blur-md border border-border rounded-lg px-3 py-2 shadow-lg text-xs max-w-xs">
      <p className="font-semibold text-foreground leading-snug">{d.nome}</p>
      <p className="text-muted-foreground tabular-nums mt-1">{fmtBRL(d.valor)}</p>
    </div>
  );
}

// ── Barras horizontais ────────────────────────────────────────────────────────

function RankingBarChart({
  items,
  height,
  maxLabel = 36,
}: {
  items: RankItem[];
  height: number;
  maxLabel?: number;
}) {
  const data = items.map((d) => ({
    nome: d.l,
    label: d.l.length > maxLabel ? d.l.slice(0, maxLabel - 1) + "…" : d.l,
    valor: d.v,
  }));
  if (!data.length) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted-foreground"
        style={{ height }}
      >
        Sem dados para o ranking.
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 4, bottom: 4 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          horizontal={false}
          stroke="hsl(var(--border))"
          opacity={0.25}
        />
        <XAxis
          type="number"
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          tickFormatter={(v: number) => fmtBRLCompact(v)}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={Math.min(250, maxLabel * 7)}
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          interval={0}
        />
        <Tooltip
          content={<HBarTooltip />}
          cursor={{ fill: "hsl(var(--muted))", opacity: 0.25 }}
        />
        <Bar dataKey="valor" radius={[0, 3, 3, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={colorAt(i)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

/**
 * Saídas SISMAT — visão pura (sem cruzamento Redmine).
 * Exibe KPIs globais e ranking Top 20 de medicamentos por valor de saída.
 * Os dados vêm do mesmo endpoint que SismatSaidasView, portanto o TanStack
 * Query reutiliza o cache sem disparar um segundo request.
 */
export function SismatSaidasPuraView() {
  const { data: over, isLoading, error } = useSaidasRedmineOverview();

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-6 space-y-2">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4" />
          <span className="font-medium text-sm">Erro ao carregar as saídas do SISMAT</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {error instanceof Error ? error.message : "Não foi possível consultar o banco de dados."}
        </p>
      </div>
    );
  }

  if (!over || !over.hasData) {
    return (
      <div className="rounded-lg border border-border bg-card p-10 text-center space-y-2">
        <PackageOpen className="h-8 w-8 mx-auto text-muted-foreground" />
        <p className="text-sm font-medium">Nenhuma saída do SISMAT encontrada</p>
        <p className="text-xs text-muted-foreground">
          Após <code>npx prisma db push</code>, rode:{" "}
          <code>
            npm run import:sismat-saidas -- --truncate --confirm --file=&quot;…Saidas.xlsx&quot;
          </code>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── KPIs globais ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          label="Valor Total de Saída"
          value={fmtBRL(over.kpis.valor)}
          subtext="SISMAT"
          icon={<Coins className="h-4 w-4" />}
        />
        <MetricCard
          label="Processos Únicos"
          value={over.kpis.processos}
          subtext="por nº SEI"
          icon={<FileText className="h-4 w-4" />}
        />
        <MetricCard
          label="Medicamentos"
          value={over.kpis.medicamentos}
          subtext="distintos"
          icon={<Pill className="h-4 w-4" />}
        />
        <MetricCard
          label="Total de Saídas"
          value={over.kpis.saidas}
          subtext="linhas SISMAT"
          icon={<ArrowUpFromLine className="h-4 w-4" />}
        />
      </div>

      {/* ── Top 20 medicamentos ──────────────────────────────────────────── */}
      <Panel
        icon={<Pill className="h-4 w-4" />}
        title="Top 20 Medicamentos por Valor Total de Saída"
        subtitle="Soma do valor das saídas SISMAT por material"
      >
        <RankingBarChart items={over.topMed} height={560} maxLabel={38} />
      </Panel>
    </div>
  );
}
