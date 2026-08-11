"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useSismatSaidasMetrics } from "@/hooks/useSismatSaidasMetrics";
import { useSismatSaidasIndicadores } from "@/hooks/useSismatSaidasIndicadores";
import {
  SISMAT_SAIDAS_DIMENSOES,
  SISMAT_SAIDAS_DIM_LABELS,
  type SismatSaidasDimensao,
} from "@/lib/sismat-saidas-metrics";
import type { PontoIndicador } from "@/lib/sismat-saidas-indicadores";
import type { SismatPeriodo } from "@/lib/sismat-metrics";
import { SismatEvolutionChart, SISMAT_TOTAL_KEY } from "./charts/sismat-evolution-chart";
import { SismatPieChart, type SismatPieDatum } from "./charts/sismat-pie-chart";
import { fmtBRL, colorAt } from "./charts/sismat-format";
import { MetricCard } from "./metric-card";
import { Combobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Coins,
  Pill,
  Truck,
  Globe,
  Users,
  TrendingUp,
  Calendar,
  Trophy,
  Loader2,
  AlertTriangle,
  ArrowUpDown,
  PackageOpen,
  Scale,
  BarChart2,
  Flame,
  X,
} from "lucide-react";

// ── Constantes de UI ──────────────────────────────────────────────────────────

const DIMENSOES: { value: SismatSaidasDimensao; label: string; icon: ReactNode }[] = [
  { value: "material",     label: "Material",          icon: <Pill className="h-3.5 w-3.5" /> },
  { value: "fornecedor",   label: "Fornecedor",        icon: <Truck className="h-3.5 w-3.5" /> },
  { value: "esfera",       label: "Esfera",            icon: <Globe className="h-3.5 w-3.5" /> },
  { value: "destinatario", label: "Tipo Destinatário", icon: <Users className="h-3.5 w-3.5" /> },
];

const PERIODOS: { value: SismatPeriodo; label: string }[] = [
  { value: "monthly", label: "Mensal" },
  { value: "yearly",  label: "Anual" },
];

const TOP_N_OPCOES = [4, 8, 10, 15];

const selectCn =
  "h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

// ── Formatadores de indicadores ───────────────────────────────────────────────

function fmtHhi(v: number) {
  const d = v >= 100 ? 0 : v >= 1 ? 1 : v >= 0.01 ? 2 : 3;
  return v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtInstab(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
}

// ── Tooltip do gráfico de série temporal ──────────────────────────────────────

function SerieTooltip({
  active,
  payload,
  label,
  fmt,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  fmt: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background/95 backdrop-blur-md border border-border rounded-lg px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-foreground">{label}</p>
      <p className="text-primary tabular-nums mt-0.5">{fmt(payload[0].value)}</p>
    </div>
  );
}

// ── Modal de série temporal ───────────────────────────────────────────────────

function ModalSerie({
  open,
  onClose,
  title,
  subtitle,
  serie,
  fmt,
  icon,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  serie: PontoIndicador[];
  fmt: (v: number) => string;
  icon?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8 bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-3 border-b border-border">
          <div className="flex items-start gap-2">
            {icon && <span className="text-primary mt-0.5 flex-shrink-0">{icon}</span>}
            <div>
              <h2 className="text-base font-semibold leading-tight">{title}</h2>
              {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 mt-0.5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-5">
          {serie.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
              Sem dados suficientes para gerar a série temporal.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={serie} margin={{ top: 4, right: 16, left: 4, bottom: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis
                  dataKey="mes"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  angle={-45}
                  textAnchor="end"
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={fmt}
                  width={72}
                />
                <Tooltip content={<SerieTooltip fmt={fmt} />} />
                <Line
                  type="monotone"
                  dataKey="valor"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "hsl(var(--primary))" }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Card de indicador clicável ────────────────────────────────────────────────

function IndicadorCard({
  icon,
  label,
  value,
  subtext,
  serie,
  fmt,
  modalTitle,
  modalSubtitle,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  subtext?: string;
  serie: PontoIndicador[];
  fmt: (v: number) => string;
  modalTitle: string;
  modalSubtitle?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="text-left w-full rounded-lg border border-border bg-card p-4 hover:border-primary/50 hover:bg-accent/30 transition-colors cursor-pointer group"
        onClick={() => setOpen(true)}
        title="Clique para ver a evolução temporal"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-primary mt-0.5 flex-shrink-0">{icon}</span>
          <TrendingUp className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary/60 transition-colors flex-shrink-0 mt-0.5" />
        </div>
        <div className="mt-3">
          <p className="text-2xl font-bold tabular-nums text-foreground leading-none">{value}</p>
          <p className="text-xs font-medium text-foreground/80 mt-1.5 leading-snug">{label}</p>
          {subtext && <p className="text-[11px] text-muted-foreground mt-0.5">{subtext}</p>}
        </div>
      </button>
      <ModalSerie
        open={open}
        onClose={() => setOpen(false)}
        title={modalTitle}
        subtitle={modalSubtitle}
        serie={serie}
        fmt={fmt}
        icon={icon}
      />
    </>
  );
}

// ── Painel ────────────────────────────────────────────────────────────────────

function Panel({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-start gap-2 mb-1">
        <span className="text-primary mt-0.5 flex-shrink-0">{icon}</span>
        <div>
          <h3 className="text-base font-semibold leading-tight">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function SismatSaidasPuraView() {
  const [dimension, setDimension] = useState<SismatSaidasDimensao>("material");
  const [period, setPeriod] = useState<SismatPeriodo>("monthly");
  const [topN, setTopN] = useState(8);
  const [entity, setEntity] = useState("");
  const [year, setYear] = useState("");
  const [sortField, setSortField] = useState<"name" | "valor">("valor");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  const { data, isLoading, error } = useSismatSaidasMetrics(dimension, period);
  const { data: indicadores } = useSismatSaidasIndicadores();

  const view = useMemo(() => {
    if (!data) return null;
    const { series, totalsByPeriod, years, grandTotal, hasData } = data;

    const yearOf = (p: string) => Number(period === "monthly" ? p.slice(0, 4) : p);
    const fy = year ? Number(year) : null;

    const periods = totalsByPeriod
      .map((t) => t.period)
      .sort((a, b) => (period === "monthly" ? a.localeCompare(b) : Number(a) - Number(b)));
    const totalByPeriod: Record<string, number> = {};
    totalsByPeriod.forEach((t) => (totalByPeriod[t.period] = t.valor));

    const aggregateByEntity = (filterYear: number | null) => {
      const m = new Map<string, number>();
      for (const s of series) {
        if (filterYear && yearOf(s.period) !== filterYear) continue;
        m.set(s.key, (m.get(s.key) ?? 0) + s.valor);
      }
      return m;
    };

    const totalsAll = aggregateByEntity(null);
    const entityOptions = Array.from(totalsAll.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => ({ value: k }));

    const totalsFiltered = aggregateByEntity(fy);
    const rankingSorted = Array.from(totalsFiltered.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, valor]) => ({ name, valor }));
    const grandFiltered = rankingSorted.reduce((s, r) => s + r.valor, 0);
    const tableRows = rankingSorted.map((r) => ({
      ...r,
      pct: grandFiltered ? (r.valor / grandFiltered) * 100 : 0,
    }));

    // Pizza: Top 10 + "Outros"
    const top10 = rankingSorted.slice(0, 10);
    const outrosSum = rankingSorted.slice(10).reduce((s, r) => s + r.valor, 0);
    const pieData: SismatPieDatum[] = top10.map((r) => ({ name: r.name, valor: r.valor }));
    if (outrosSum > 0) pieData.push({ name: "Outros", valor: outrosSum, isOutros: true });

    // Evolução
    const entitiesToShow = entity
      ? [entity]
      : Array.from(totalsAll.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, topN)
          .map(([k]) => k);
    const byEntity: Record<string, Record<string, number>> = {};
    entitiesToShow.forEach((e) => (byEntity[e] = {}));
    for (const s of series) {
      if (byEntity[s.key]) byEntity[s.key][s.period] = (byEntity[s.key][s.period] ?? 0) + s.valor;
    }
    const evoData = periods.map((p) => {
      const row: Record<string, string | number> = { period: p };
      entitiesToShow.forEach((e) => (row[e] = byEntity[e][p] ?? 0));
      row[SISMAT_TOTAL_KEY] = totalByPeriod[p] ?? 0;
      return row;
    });

    // KPIs
    const totalGeral = fy
      ? totalsByPeriod.filter((t) => yearOf(t.period) === fy).reduce((s, t) => s + t.valor, 0)
      : grandTotal;
    const periodLabel = fy
      ? `Ano ${fy}`
      : years.length
        ? `${years[0]} – ${years[years.length - 1]}`
        : "—";

    return {
      hasData,
      years,
      periods,
      evoData,
      entitiesToShow,
      entityOptions,
      tableRows,
      pieData,
      grandFiltered,
      totalGeral,
      nEntities: totalsFiltered.size,
      periodLabel,
      maiorItem: rankingSorted[0]?.name ?? "—",
    };
  }, [data, period, topN, entity, year]);

  const dimLabel = SISMAT_SAIDAS_DIM_LABELS[dimension];

  const tableRowsSorted = useMemo(() => {
    if (!view) return [];
    return [...view.tableRows].sort((a, b) =>
      sortField === "name"
        ? sortDir * a.name.localeCompare(b.name, "pt-BR")
        : sortDir * (a.valor - b.valor)
    );
  }, [view, sortField, sortDir]);

  function toggleSort(field: "name" | "valor") {
    if (sortField === field) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortField(field);
      setSortDir(field === "name" ? 1 : -1);
    }
  }

  // ── Estados de carregamento / erro / vazio ──────────────────────────────────

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
          <span className="font-medium text-sm">Erro ao carregar dados de saídas do SISMAT</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {error instanceof Error ? error.message : "Não foi possível consultar o banco de dados."}
        </p>
      </div>
    );
  }

  if (!view || !view.hasData) {
    return (
      <div className="rounded-lg border border-border bg-card p-10 text-center space-y-2">
        <PackageOpen className="h-8 w-8 mx-auto text-muted-foreground" />
        <p className="text-sm font-medium">Nenhuma saída do SISMAT encontrada</p>
        <p className="text-xs text-muted-foreground">
          Rode a importação:{" "}
          <code>
            npm run import:sismat-saidas -- --file=&quot;…Saidas.xlsx&quot; --truncate --confirm
          </code>
        </p>
      </div>
    );
  }

  const maxTabela = Math.max(...tableRowsSorted.map((r) => r.valor), 1);

  return (
    <div className="space-y-6">
      {/* ── Controles ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-4 bg-card border border-border rounded-xl p-4 shadow-sm">
        {/* Dimensão */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">Dimensão</span>
          <div className="flex flex-wrap gap-1">
            {DIMENSOES.map((d) => (
              <Button
                key={d.value}
                size="sm"
                variant={dimension === d.value ? "default" : "outline"}
                onClick={() => {
                  setDimension(d.value);
                  setEntity("");
                }}
              >
                {d.icon}
                <span className="ml-1.5">{d.label}</span>
              </Button>
            ))}
          </div>
        </div>

        {/* Período */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">Período</span>
          <div className="flex gap-1">
            {PERIODOS.map((p) => (
              <Button
                key={p.value}
                size="sm"
                variant={period === p.value ? "default" : "outline"}
                onClick={() => setPeriod(p.value)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Top N */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">Top N (evolução)</span>
          <select
            className={selectCn}
            value={topN}
            onChange={(e) => setTopN(Number(e.target.value))}
            disabled={!!entity}
          >
            {TOP_N_OPCOES.map((n) => (
              <option key={n} value={n}>
                Top {n}
              </option>
            ))}
          </select>
        </div>

        {/* Entidade */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">{dimLabel} específico</span>
          <Combobox
            value={entity}
            onChange={setEntity}
            options={view.entityOptions}
            placeholder="(Top N automático)"
            searchPlaceholder={`Buscar ${dimLabel.toLowerCase()}...`}
            allLabel="(Top N automático)"
            emptyText="Nenhum item encontrado."
            className="w-60"
          />
        </div>

        {/* Ano */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">Ano (ranking/pizza)</span>
          <select className={selectCn} value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">Todos os anos</option>
            {view.years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── KPIs ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Total de Saídas"
          value={fmtBRL(view.totalGeral)}
          icon={<Coins className="h-5 w-5" />}
        />
        <MetricCard
          label={`${dimLabel}s ativos`}
          value={view.nEntities}
          icon={<Users className="h-5 w-5" />}
          description={`Distintos${year ? ` em ${year}` : ""}`}
        />
        <MetricCard
          label="Período coberto"
          value={view.periodLabel}
          icon={<Calendar className="h-5 w-5" />}
        />
        <MetricCard
          label="Maior item"
          value={view.maiorItem.length > 22 ? view.maiorItem.slice(0, 21) + "…" : view.maiorItem}
          icon={<Trophy className="h-5 w-5" />}
          description={`Por ${dimLabel.toLowerCase()}`}
        />
      </div>

      {/* ── Indicadores estruturais ────────────────────────────────────────── */}
      {indicadores?.hasData && (
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Indicadores estruturais — clique para ver evolução temporal
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <IndicadorCard
              icon={<Scale className="h-4 w-4" />}
              label="HHI de Materiais"
              value={fmtHhi(indicadores.hhi.recente)}
              subtext={`${indicadores.hhi.entidades.toLocaleString("pt-BR")} materiais · último trimestre`}
              serie={indicadores.hhi.serie}
              fmt={fmtHhi}
              modalTitle="HHI de Materiais"
              modalSubtitle="Índice de Herfindahl-Hirschman (0–10.000) com janela móvel de 3 meses, ponderado pelo valor das saídas por material. Alto = concentrado; baixo = diversificado."
            />
            <IndicadorCard
              icon={<BarChart2 className="h-4 w-4" />}
              label="Instabilidade do Ranking"
              value={fmtInstab(indicadores.rankInstab.recente)}
              subtext={`distância ponderada · ${indicadores.rankInstab.entidades.toLocaleString("pt-BR")} materiais · último trimestre`}
              serie={indicadores.rankInstab.serie}
              fmt={fmtInstab}
              modalTitle="Instabilidade do Ranking de Materiais"
              modalSubtitle="Distância ponderada de rank entre trimestres consecutivos: Σ |rank(i,M) − rank(i,M-1)| × share(i,M). Zero = ranking idêntico; maior = mais volatilidade."
            />
            <IndicadorCard
              icon={<Flame className="h-4 w-4" />}
              label="Proporção para Incineração"
              value={fmtPct(indicadores.incineracao.recente)}
              subtext={`${fmtBRL(indicadores.incineracao.valorIncineracao)} de ${fmtBRL(indicadores.incineracao.valorTotal)} · último trimestre`}
              serie={indicadores.incineracao.serie}
              fmt={fmtPct}
              modalTitle="Proporção de Saídas para Incineração"
              modalSubtitle="% do valor enviado à Pioneira Saneamento ou Sistema Nova Ambiental (janela móvel de 3 meses)."
            />
          </div>
        </div>
      )}

      {/* ── Evolução ───────────────────────────────────────────────────────── */}
      <Panel
        icon={<TrendingUp className="h-4 w-4" />}
        title={`Evolução ${period === "monthly" ? "mensal" : "anual"} das saídas por ${dimLabel.toLowerCase()}`}
        subtitle={
          entity
            ? `Série de "${entity}" vs. total geral (linha tracejada)`
            : `Top ${topN} ${dimLabel.toLowerCase()}s por valor + total geral (linha tracejada)`
        }
      >
        <SismatEvolutionChart
          data={view.evoData}
          entities={view.entitiesToShow}
          periodType={period}
        />
      </Panel>

      {/* ── Ranking + Pizza ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel
          icon={<Coins className="h-4 w-4" />}
          title={`Ranking por ${dimLabel.toLowerCase()}`}
          subtitle={`Valor total${year ? ` — ano ${year}` : ""} · ${view.tableRows.length} itens`}
        >
          <div className="max-h-[360px] overflow-y-auto pr-1">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="text-left py-2 font-medium">
                    <button
                      className="inline-flex items-center gap-1 hover:text-foreground"
                      onClick={() => toggleSort("name")}
                    >
                      {dimLabel} <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="text-right py-2 font-medium">
                    <button
                      className="inline-flex items-center gap-1 hover:text-foreground"
                      onClick={() => toggleSort("valor")}
                    >
                      Valor <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="text-right py-2 font-medium w-14">%</th>
                </tr>
              </thead>
              <tbody>
                {tableRowsSorted.map((r, i) => (
                  <tr key={r.name} className="border-b border-border/50">
                    <td className="py-2 pr-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: colorAt(i) }}
                        />
                        <span className="truncate" title={r.name}>
                          {r.name}
                        </span>
                      </div>
                    </td>
                    <td className="py-2 text-right tabular-nums whitespace-nowrap">
                      <div>{fmtBRL(r.valor)}</div>
                      <div className="h-1 mt-1 rounded bg-muted overflow-hidden">
                        <div
                          className="h-full rounded"
                          style={{
                            width: `${(r.valor / maxTabela) * 100}%`,
                            backgroundColor: colorAt(i),
                          }}
                        />
                      </div>
                    </td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">
                      {r.pct.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel
          icon={<Coins className="h-4 w-4" />}
          title="Distribuição (Top 10)"
          subtitle={`Participação no valor de saída${year ? ` — ano ${year}` : ""}`}
        >
          <SismatPieChart data={view.pieData} grandTotal={view.grandFiltered} />
        </Panel>
      </div>
    </div>
  );
}
