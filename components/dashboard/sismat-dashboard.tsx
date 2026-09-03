"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useSismatMetrics } from "@/hooks/useSismatMetrics";
import { useSismatSubMaterials } from "@/hooks/useSismatSubMaterials";
import type { SismatDimensao, SismatPeriodo } from "@/lib/sismat-metrics";
import { SismatEvolutionChart, SISMAT_TOTAL_KEY } from "./charts/sismat-evolution-chart";
import { SismatPieChart, type SismatPieDatum } from "./charts/sismat-pie-chart";
import { fmtBRL, colorAt, SISMAT_ENTRADA_COLOR, SISMAT_SAIDA_COLOR } from "./charts/sismat-format";
import { MetricCard } from "./metric-card";
import { SismatSaidasPuraView } from "./sismat-saidas-pura-view";
import { SismatEstoqueView } from "./sismat-estoque-view";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Combobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import {
  Coins,
  Building2,
  Factory,
  Truck,
  Pill,
  TrendingUp,
  Calendar,
  Trophy,
  Loader2,
  AlertTriangle,
  ArrowUpDown,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
} from "lucide-react";

// ── Constantes de UI (client-safe: não importa valores da lib server) ─────────

const DIMENSOES: { value: SismatDimensao; label: string; icon: ReactNode }[] = [
  { value: "material", label: "Material", icon: <Pill className="h-3.5 w-3.5" /> },
  { value: "fornecedor", label: "Fornecedor", icon: <Building2 className="h-3.5 w-3.5" /> },
  { value: "fabricante", label: "Fabricante", icon: <Factory className="h-3.5 w-3.5" /> },
  { value: "distribuidor", label: "Distribuidor", icon: <Truck className="h-3.5 w-3.5" /> },
];
const DIM_LABEL: Record<SismatDimensao, string> = {
  fornecedor: "Fornecedor",
  fabricante: "Fabricante",
  distribuidor: "Distribuidor",
  material: "Material",
};
const PERIODOS: { value: SismatPeriodo; label: string }[] = [
  { value: "monthly", label: "Mensal" },
  { value: "yearly", label: "Anual" },
];
const TOP_N_OPCOES = [4, 8, 10, 15];

const selectCn =
  "h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

// ── Painel (mesmo visual da Section do dashboard) ─────────────────────────────

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

export function SismatEntradasView() {
  const [dimension, setDimension] = useState<SismatDimensao>("material");
  const [period, setPeriod] = useState<SismatPeriodo>("monthly");
  const [topN, setTopN] = useState(8);
  const [entity, setEntity] = useState("");
  const [subMaterial, setSubMaterial] = useState("");
  const [year, setYear] = useState("");
  const [sortField, setSortField] = useState<"name" | "valor">("valor");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  const { data: subMaterials } = useSismatSubMaterials(
    "entradas",
    dimension === "material" ? entity : ""
  );
  const subMaterialOptions = (subMaterials ?? []).map((m) => ({ value: m }));

  // Base: sempre sem filtro de sub-material (para entityOptions e linha de comparação)
  const { data: baseData, isLoading, error } = useSismatMetrics(dimension, period);
  // Filtrado: só difere do base quando um sub-material está selecionado
  const { data: subData } = useSismatMetrics(dimension, period, subMaterial || undefined);
  const data = subMaterial && subData ? subData : baseData;

  const view = useMemo(() => {
    if (!data) return null;
    const { series, totalsByPeriod, years, grandTotal, hasData } = data;

    // baseData é idêntico a data quando não há subMaterial; difere quando há filtro
    const baseSeries = baseData?.series ?? series;

    const yearOf = (p: string) => Number(period === "monthly" ? p.slice(0, 4) : p);
    const fy = year ? Number(year) : null;
    const sortPeriods = (arr: string[]) =>
      arr.sort((a, b) => (period === "monthly" ? a.localeCompare(b) : Number(a) - Number(b)));

    // Períodos da série atual (usado em KPIs e como fallback)
    const periods = sortPeriods(totalsByPeriod.map((t) => t.period));
    const totalByPeriod: Record<string, number> = {};
    totalsByPeriod.forEach((t) => (totalByPeriod[t.period] = t.valor));

    // Períodos para o gráfico de evolução: sempre da base, para não perder meses
    // onde o sub-material teve zero (mas o material pai tinha atividade)
    const evoPeriods = sortPeriods(
      (baseData?.totalsByPeriod ?? totalsByPeriod).map((t) => t.period)
    );

    // Agrega da série atual (filtrada por subMaterial quando aplicável)
    const aggregateByEntity = (filterYear: number | null) => {
      const m = new Map<string, number>();
      for (const s of series) {
        if (filterYear && yearOf(s.period) !== filterYear) continue;
        m.set(s.key, (m.get(s.key) ?? 0) + s.valor);
      }
      return m;
    };

    // Opções de entidade e Top N sempre da série base (sem filtro de sub-material)
    const totalsAll = new Map<string, number>();
    for (const s of baseSeries) totalsAll.set(s.key, (totalsAll.get(s.key) ?? 0) + s.valor);
    const entityOptions = Array.from(totalsAll.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => ({ value: k }));

    // KPIs, ranking e pizza da série atual (filtrada)
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

    // Entidades a mostrar no gráfico de evolução (da base para Top N correto)
    const entitiesToShow = entity
      ? [entity]
      : Array.from(totalsAll.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, topN)
          .map(([k]) => k);

    // byEntity: usa a série atual (filtrada por subMaterial quando selecionado)
    const byEntity: Record<string, Record<string, number>> = {};
    entitiesToShow.forEach((e) => (byEntity[e] = {}));
    for (const s of series) {
      if (byEntity[s.key]) byEntity[s.key][s.period] = (byEntity[s.key][s.period] ?? 0) + s.valor;
    }

    // Linha de comparação (tracejada): total do material pai quando subMaterial selecionado,
    // ou total geral de todas as aquisições caso contrário.
    const evoTotalByPeriod: Record<string, number> = {};
    if (subMaterial && entity && baseData) {
      // Total do materialNome selecionado (princípio ativo), sem filtro de sub-material
      for (const s of baseData.series) {
        if (s.key === entity)
          evoTotalByPeriod[s.period] = (evoTotalByPeriod[s.period] ?? 0) + s.valor;
      }
    } else {
      // Total geral de todas as aquisições
      (baseData?.totalsByPeriod ?? totalsByPeriod).forEach(
        (t) => (evoTotalByPeriod[t.period] = t.valor)
      );
    }

    const evoTotalLabel = subMaterial && entity ? `Total ${entity}` : "Total geral";

    const evoData = evoPeriods.map((p) => {
      const row: Record<string, string | number> = { period: p };
      entitiesToShow.forEach((e) => (row[e] = byEntity[e]?.[p] ?? 0));
      row[SISMAT_TOTAL_KEY] = evoTotalByPeriod[p] ?? 0;
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
      evoTotalLabel,
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
  }, [data, baseData, period, topN, entity, subMaterial, year]);

  const dimLabel = DIM_LABEL[dimension];

  const tableRowsSorted = useMemo(() => {
    if (!view) return [];
    return [...view.tableRows].sort((a, b) =>
      sortField === "name" ? sortDir * a.name.localeCompare(b.name, "pt-BR") : sortDir * (a.valor - b.valor)
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
          <span className="font-medium text-sm">Erro ao carregar dados do SISMAT</span>
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
        <Coins className="h-8 w-8 mx-auto text-muted-foreground" />
        <p className="text-sm font-medium">Nenhum dado de aquisição do SISMAT encontrado</p>
        <p className="text-xs text-muted-foreground">
          Rode a importação: <code>npx tsx scripts/import-sismat-entradas.ts --truncate --confirm</code> após
          aplicar o schema com <code>prisma db push</code>.
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
                  setSubMaterial("");
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
            onChange={(v) => { setEntity(v); setSubMaterial(""); }}
            options={view.entityOptions}
            placeholder="(Top N automático)"
            searchPlaceholder={`Buscar ${dimLabel.toLowerCase()}...`}
            allLabel="(Top N automático)"
            emptyText="Nenhum item encontrado."
            className="w-60"
          />
        </div>

        {/* Sub-material (só aparece quando dimensão = material e entity selecionado) */}
        {dimension === "material" && entity && subMaterialOptions.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">Especificação do material</span>
            <Combobox
              value={subMaterial}
              onChange={setSubMaterial}
              options={subMaterialOptions}
              placeholder="(Todos)"
              searchPlaceholder="Buscar especificação..."
              allLabel="(Todos)"
              emptyText="Nenhuma especificação encontrada."
              className="w-72"
            />
          </div>
        )}

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
        <MetricCard label="Gasto Total" value={fmtBRL(view.totalGeral)} icon={<Coins className="h-5 w-5" />} />
        <MetricCard
          label={`${dimLabel}s ativos`}
          value={view.nEntities}
          icon={<Building2 className="h-5 w-5" />}
          description={`Distintos${year ? ` em ${year}` : ""}`}
        />
        <MetricCard label="Período coberto" value={view.periodLabel} icon={<Calendar className="h-5 w-5" />} />
        <MetricCard
          label="Maior item"
          value={view.maiorItem.length > 22 ? view.maiorItem.slice(0, 21) + "…" : view.maiorItem}
          icon={<Trophy className="h-5 w-5" />}
          description={`Por ${dimLabel.toLowerCase()}`}
        />
      </div>

      {/* ── Evolução ───────────────────────────────────────────────────────── */}
      <Panel
        icon={<TrendingUp className="h-4 w-4" />}
        title={`Evolução ${period === "monthly" ? "mensal" : "anual"} dos gastos por ${dimLabel.toLowerCase()}`}
        subtitle={
          subMaterial
            ? `"${subMaterial}" vs. total de ${entity} (linha tracejada)`
            : entity
              ? `Série de "${entity}" vs. total geral (linha tracejada)`
              : `Top ${topN} ${dimLabel.toLowerCase()}s por valor + total geral (linha tracejada)`
        }
      >
        <SismatEvolutionChart
          data={view.evoData}
          entities={view.entitiesToShow}
          periodType={period}
          totalLabel={view.evoTotalLabel}
        />
      </Panel>

      {/* ── Ranking + Pizza ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[65%_1fr]">
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
                    <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("name")}>
                      {dimLabel} <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="text-right py-2 font-medium">
                    <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("valor")}>
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
                          style={{ width: `${(r.valor / maxTabela) * 100}%`, backgroundColor: colorAt(i) }}
                        />
                      </div>
                    </td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">{r.pct.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel
          icon={<Coins className="h-4 w-4" />}
          title={`Distribuição (Top 10)`}
          subtitle={`Participação no gasto${year ? ` — ano ${year}` : ""}`}
        >
          <SismatPieChart data={view.pieData} grandTotal={view.grandFiltered} />
        </Panel>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Wrapper do SISMAT: 4 sub-abas navegáveis
//   Entradas        → aquisições recebidas (SISMAT Entradas)
//   Saídas          → entregas realizadas — KPIs e Top 20 medicamentos
//   Saídas × Redmine→ cruzamento com Redmine por nº SEI (CRM, OAB, filtros)
//   Entradas × Saídas → comparativo fluxo + saldo derivado acumulado
// ─────────────────────────────────────────────────────────────────────────────

export function SismatDashboard() {
  return (
    <Tabs defaultValue="entradas" className="space-y-6">
      <TabsList className="flex-wrap h-auto gap-1">
        <TabsTrigger value="entradas" className="gap-1.5">
          <ArrowDownToLine className="h-3.5 w-3.5" style={{ color: SISMAT_ENTRADA_COLOR }} />
          Entradas
        </TabsTrigger>
        <TabsTrigger value="saidas" className="gap-1.5">
          <ArrowUpFromLine className="h-3.5 w-3.5" style={{ color: SISMAT_SAIDA_COLOR }} />
          Saídas
        </TabsTrigger>

        <TabsTrigger value="entradas-saidas" className="gap-1.5">
          <ArrowLeftRight className="h-3.5 w-3.5" />
          Entradas × Saídas
        </TabsTrigger>
      </TabsList>

      <TabsContent value="entradas">
        <SismatEntradasView />
      </TabsContent>

      <TabsContent value="saidas">
        <SismatSaidasPuraView />
      </TabsContent>


      <TabsContent value="entradas-saidas">
        <SismatEstoqueView />
      </TabsContent>
    </Tabs>
  );
}
