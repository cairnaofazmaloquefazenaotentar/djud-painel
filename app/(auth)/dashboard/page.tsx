"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { MetricCard } from "@/components/dashboard/metric-card";
import { StatusChart } from "@/components/dashboard/charts/status-chart";
import { PrioridadeChart } from "@/components/dashboard/charts/prioridade-chart";
import { TimelineChart } from "@/components/dashboard/charts/timeline-chart";
import { TRFChart } from "@/components/dashboard/charts/trf-chart";
import { UFChart } from "@/components/dashboard/charts/uf-chart";
import { TopResponsaveisChart } from "@/components/dashboard/charts/top-responsaveis-chart";
import { AreaTematicaChart } from "@/components/dashboard/charts/area-tematica-chart";
import { RegiaoBrasilChart } from "@/components/dashboard/charts/regiao-brasil-chart";
import { TopMedicamentosChart } from "@/components/dashboard/charts/top-medicamentos-chart";
import { ObjetoAcaoChart } from "@/components/dashboard/charts/objeto-acao-chart";
import { TribunalTimelineChart } from "@/components/dashboard/charts/tribunal-timeline-chart";
import { ValorTimelineChart, fmtBRLCompacto } from "@/components/dashboard/charts/valor-timeline-chart";
import { TopMedicamentosValorChart } from "@/components/dashboard/charts/top-medicamentos-valor-chart";
import { FornecedorChart } from "@/components/dashboard/charts/fornecedor-chart";
import { SismatEntradasView } from "@/components/dashboard/sismat-dashboard";
import { SismatSaidasPuraView } from "@/components/dashboard/sismat-saidas-pura-view";
import { SismatEstoqueView } from "@/components/dashboard/sismat-estoque-view";
import { SismatSaidasView } from "@/components/dashboard/sismat-saidas-view";
import { AutoresTimelineChart } from "@/components/dashboard/charts/autores-timeline-chart";
import { RankingAnualChart } from "@/components/dashboard/charts/ranking-anual-chart";
import { paramsDeMetrics, useMetrics } from "@/hooks/useMetrics";
import { useRankingAnual } from "@/hooks/useRankingAnual";
// Só o tipo: lib/metrics-ranking-anual.ts importa o Prisma, e um import de
// valor arrastaria o client do banco para o bundle do navegador. Os rótulos
// das dimensões vêm prontos na resposta da API (`rotulo`).
import type { DimensaoRanking } from "@/lib/metrics-ranking-anual";
import { useAutoresMetrics } from "@/hooks/useAutoresMetrics";
import { usePrincipiosAtivos } from "@/hooks/usePrincipiosAtivos";
import { Combobox } from "@/components/ui/combobox";
import { FilterSelect } from "@/components/backoffice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Activity,
  AlertTriangle,
  TrendingUp,
  FileText,
  RotateCcw,
  Loader2,
  Pill,
  Scale,
  MapPin,
  BarChart2,
  ListChecks,
  Coins,
  Landmark,
  Building2,
  Users,
  PieChart,
  Hash,
  ArrowUpDown,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  CalendarRange,
  Download,
  FileSpreadsheet,
} from "lucide-react";

// ─── Seção com título padronizado ────────────────────────────────────────────
function Section({
  icon, title, subtitle, children, full,
}: {
  icon: React.ReactNode; title: string; subtitle?: string;
  children: React.ReactNode; full?: boolean;
}) {
  return (
    <div className={`rounded-lg border border-border bg-card p-6 ${full ? "col-span-full" : ""}`}>
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

// ─── Indicador de risco ───────────────────────────────────────────────────────
function RiskBadge({ value, max, label, color }: { value: number; max: number; label: string; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums">{value.toLocaleString("pt-BR")}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

// ─── Tipos de abas ────────────────────────────────────────────────────────────
const TENDENCIAS_TABS = [
  { value: "demandas",        label: "Demandas",          icon: <Hash className="h-3.5 w-3.5" /> },
  { value: "valores",         label: "Valores",           icon: <Coins className="h-3.5 w-3.5" /> },
  { value: "autores",         label: "Autores",           icon: <Users className="h-3.5 w-3.5" /> },
  { value: "entradas",        label: "Entradas",          icon: <ArrowDownToLine className="h-3.5 w-3.5" /> },
  { value: "saidas",          label: "Saídas",            icon: <ArrowUpFromLine className="h-3.5 w-3.5" /> },
  { value: "entradas-saidas", label: "Estoque", icon: <ArrowLeftRight className="h-3.5 w-3.5" /> },
] as const;

const INDICADORES_TABS = [
  { value: "principios-ativos",  label: "Princípios Ativos",     icon: <Pill className="h-3.5 w-3.5" /> },
  { value: "ranking-anual",      label: "Ranking por Ano",       icon: <CalendarRange className="h-3.5 w-3.5" /> },
  { value: "indicadores-saidas", label: "Indicadores de Saídas", icon: <ArrowUpDown className="h-3.5 w-3.5" /> },
] as const;

const INTERNOS_TABS = [
  { value: "servidores", label: "Servidores", icon: <BarChart2 className="h-3.5 w-3.5" /> },
  { value: "tramitacao", label: "Tramitação", icon: <ListChecks className="h-3.5 w-3.5" /> },
] as const;

type TendenciasTab  = (typeof TENDENCIAS_TABS)[number]["value"];
type IndicadoresTab = (typeof INDICADORES_TABS)[number]["value"];
type InternosTab    = (typeof INTERNOS_TABS)[number]["value"];
type AnyTab         = TendenciasTab | IndicadoresTab | InternosTab;

const TENDENCIAS_VALUES  = TENDENCIAS_TABS.map((t) => t.value)  as readonly string[];
const INDICADORES_VALUES = INDICADORES_TABS.map((t) => t.value) as readonly string[];

// Abas que usam dados do Redmine (precisam dos filtros e métricas)
const NEEDS_REDMINE = [
  "demandas", "valores", "autores", "principios-ativos", "ranking-anual", "servidores", "tramitacao",
] as const;
function needsRedmine(v: AnyTab): boolean { return (NEEDS_REDMINE as readonly string[]).includes(v); }

function group(v: AnyTab): "tendencias" | "indicadores" | "internos" {
  if (TENDENCIAS_VALUES.includes(v))  return "tendencias";
  if (INDICADORES_VALUES.includes(v)) return "indicadores";
  return "internos";
}

// ─── Botão de sub-aba ─────────────────────────────────────────────────────────
function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap ${
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function DashboardPage() {
  // Uma única aba ativa cobre todas as seções
  const [activeTab, setActiveTab] = useState<AnyTab>("demandas");

  const activeGroup = group(activeTab);

  const [startDate,            setStartDate]            = useState("");
  const [endDate,              setEndDate]              = useState("");
  const [filterStatus,         setFilterStatus]         = useState("");
  const [filterPrioridade,     setFilterPrioridade]     = useState("");
  const [filterPrincipioAtivo, setFilterPrincipioAtivo] = useState("");

  // CATMAT / registro ANVISA — mesmo filtro da lista de demandas. O valor
  // aplicado só acompanha o digitado depois de uma pausa: um código tem de 4 a
  // 13 dígitos e cada tecla dispararia a resolução de um código parcial.
  const [catmatInput, setCatmatInput] = useState("");
  const [catmat,      setCatmat]      = useState("");
  useEffect(() => {
    const t = setTimeout(() => setCatmat(catmatInput.replace(/[^\d.\-]/g, "").trim()), 450);
    return () => clearTimeout(t);
  }, [catmatInput]);

  // Ranking por ano: sete agregações a mais, só buscadas na aba que as usa.
  const [dimensaoRanking, setDimensaoRanking] = useState<DimensaoRanking>("medicamento");
  const [exportando, setExportando] = useState<"csv" | "html" | null>(null);

  const { data: principios, isLoading: principiosLoading } = usePrincipiosAtivos();
  const principioOptions = (principios ?? []).map((p) => ({ value: p.value, count: p.count }));
  const hasActiveFilters = !!(
    startDate || endDate || filterStatus || filterPrioridade || filterPrincipioAtivo || catmatInput
  );

  const metricsFilters = {
    startDate:      startDate      ? new Date(startDate)  : undefined,
    endDate:        endDate        ? new Date(endDate)     : undefined,
    status:         filterStatus      || undefined,
    prioridade:     filterPrioridade  || undefined,
    principioAtivo: filterPrincipioAtivo || undefined,
    catmat:         catmat || undefined,
  };

  const { data: metrics, isLoading, error } = useMetrics(metricsFilters);
  const { data: autoresData, isLoading: autoresLoading } = useAutoresMetrics({
    startDate: metricsFilters.startDate,
    endDate:   metricsFilters.endDate,
  });
  const { data: rankingAnual, isLoading: rankingLoading } = useRankingAnual(
    metricsFilters,
    activeTab === "ranking-anual"
  );

  const handleReset = () => {
    setStartDate(""); setEndDate(""); setFilterStatus("");
    setFilterPrioridade(""); setFilterPrincipioAtivo("");
    setCatmatInput(""); setCatmat("");
  };

  // A exportação refaz a apuração no servidor com os mesmos filtros: a planilha
  // sai com a série mensal inteira, não só com os pontos que couberam no gráfico.
  const exportar = async (formato: "csv" | "html") => {
    setExportando(formato);
    // A janela é aberta antes do await para o bloqueador de pop-up não barrar.
    const janela = formato === "html" ? window.open("", "_blank") : null;
    try {
      const params = paramsDeMetrics(metricsFilters);
      params.set("format", formato);
      if (activeTab === "ranking-anual") params.set("rankingAnual", "1");
      const res = await fetch(`/api/demandas/metrics/export?${params.toString()}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        janela?.close();
        throw new Error(d.error || "Erro ao exportar o painel");
      }
      if (formato === "html") {
        const html = await res.text();
        if (janela) {
          janela.document.open();
          janela.document.write(html);
          janela.document.close();
        }
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `painel_djud_${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao exportar o painel");
    } finally {
      setExportando(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Painel de Inteligência DJUD"
        description="Dimensionamento, tendência e gestão de riscos das demandas judiciais de medicamentos — Ministério da Saúde"
      />

      {/* ── Navegação: 3 grupos sempre visíveis ───────────────────────────── */}
      <div className="rounded-lg border border-border bg-card p-1.5 flex flex-col gap-1">

        {/* Grupo 1: Tendências */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setActiveTab("demandas")}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors mr-0.5 ${
              activeGroup === "tendencias"
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <TrendingUp className="h-3.5 w-3.5" />
            Tendências
          </button>
          <div className="w-px h-5 bg-border mx-1 shrink-0" />
          {TENDENCIAS_TABS.map((tab) => (
            <TabBtn key={tab.value} active={activeTab === tab.value} onClick={() => setActiveTab(tab.value)}>
              {tab.icon}
              {tab.label}
            </TabBtn>
          ))}
        </div>

        {/* Separador horizontal */}
        <div className="h-px bg-border" />

        {/* Grupo 2: Indicadores */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setActiveTab("principios-ativos")}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors mr-0.5 ${
              activeGroup === "indicadores"
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <PieChart className="h-3.5 w-3.5" />
            Indicadores
          </button>
          <div className="w-px h-5 bg-border mx-1 shrink-0" />
          {INDICADORES_TABS.map((tab) => (
            <TabBtn key={tab.value} active={activeTab === tab.value} onClick={() => setActiveTab(tab.value)}>
              {tab.icon}
              {tab.label}
            </TabBtn>
          ))}
        </div>

        {/* Separador horizontal */}
        <div className="h-px bg-border" />

        {/* Grupo 3: Internos */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setActiveTab("servidores")}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors mr-0.5 ${
              activeGroup === "internos"
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Building2 className="h-3.5 w-3.5" />
            Internos
          </button>
          <div className="w-px h-5 bg-border mx-1 shrink-0" />
          {INTERNOS_TABS.map((tab) => (
            <TabBtn key={tab.value} active={activeTab === tab.value} onClick={() => setActiveTab(tab.value)}>
              {tab.icon}
              {tab.label}
            </TabBtn>
          ))}
        </div>
      </div>

      {/* ── Conteúdo: componentes de estoque sem filtros ────────────────── */}
      {activeTab === "entradas"          && <SismatEntradasView />}
      {activeTab === "saidas"            && <SismatSaidasPuraView />}
      {activeTab === "entradas-saidas"   && <SismatEstoqueView />}
      {activeTab === "indicadores-saidas" && <SismatSaidasView />}

      {/* ── Conteúdo: abas que usam dados do Redmine ─────────────────── */}
      {needsRedmine(activeTab) && (
        <>
          {/* Filtros */}
              <div className="flex flex-wrap gap-4 items-end bg-card border border-border rounded-xl p-4 shadow-sm">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">Data início</Label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-36" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">Data fim</Label>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-36" />
                </div>
                <FilterSelect
                  label="Status" value={filterStatus} onChange={setFilterStatus}
                  placeholder="Todos os status"
                  options={[
                    { value: "Em Análise COAJUD", label: "Em Análise COAJUD" },
                    { value: "Entrega Pendente",  label: "Entrega Pendente" },
                    { value: "Cessar Atos",       label: "Cessar Atos" },
                    { value: "Concluída",         label: "Concluída" },
                    { value: "Cancelada",         label: "Cancelada" },
                    { value: "Suspensa",          label: "Suspensa" },
                  ]}
                />
                <FilterSelect
                  label="Prioridade" value={filterPrioridade} onChange={setFilterPrioridade}
                  placeholder="Todas as prioridades"
                  options={[
                    { value: "Crítica", label: "Crítica" },
                    { value: "Alta",    label: "Alta" },
                    { value: "Média",   label: "Média" },
                    { value: "Normal",  label: "Normal" },
                    { value: "Baixa",   label: "Baixa" },
                  ]}
                />
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">Princípio Ativo</Label>
                  <Combobox
                    value={filterPrincipioAtivo} onChange={setFilterPrincipioAtivo}
                    options={principioOptions} loading={principiosLoading}
                    placeholder="Selecione o medicamento..."
                    searchPlaceholder="Buscar princípio ativo..."
                    allLabel="Todos os princípios ativos"
                    emptyText="Nenhum princípio ativo encontrado."
                    className="w-64"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">CATMAT / Registro ANVISA</Label>
                  <Input
                    inputMode="numeric"
                    placeholder="Ex.: 267140"
                    value={catmatInput}
                    onChange={(e) => setCatmatInput(e.target.value)}
                    className="w-44"
                  />
                </div>
                {hasActiveFilters && (
                  <Button variant="outline" size="sm" onClick={handleReset} className="self-end">
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                    Limpar
                  </Button>
                )}
                {/* Exportação do que está na tela, com os mesmos filtros. */}
                <div className="ml-auto flex items-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={exportando !== null}
                    onClick={() => exportar("csv")}
                  >
                    {exportando === "csv" ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Planilha (CSV)
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={exportando !== null}
                    onClick={() => exportar("html")}
                  >
                    {exportando === "html" ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Relatório (PDF)
                  </Button>
                </div>
              </div>

              {/* Tradução do código: a Demanda não tem coluna CATMAT — o filtro
                  é por substância (ver lib/demandas-catmat.ts). */}
              {catmat && metrics?.filtroCatmat && (
                <div
                  className={`rounded-lg border p-3 text-xs ${
                    metrics.filtroCatmat.encontrado
                      ? "bg-muted/40"
                      : "border-amber-500/50 bg-amber-500/10"
                  }`}
                >
                  {metrics.filtroCatmat.encontrado ? (
                    <>
                      <span className="font-medium">
                        {metrics.filtroCatmat.tipo === "REGISTRO"
                          ? `Registro ANVISA ${metrics.filtroCatmat.registro}`
                          : `CATMAT ${metrics.filtroCatmat.catmat}`}
                      </span>
                      {metrics.filtroCatmat.descricao && (
                        <span className="text-muted-foreground"> — {metrics.filtroCatmat.descricao}</span>
                      )}
                      <p className="mt-1 text-muted-foreground">
                        A demanda não guarda o código: o painel está filtrando pelas substâncias{" "}
                        <strong>
                          {metrics.filtroCatmat.grupos.map((g) => g.rotulo).join(" · ")}
                        </strong>{" "}
                        no princípio ativo, no título e na descrição.
                      </p>
                    </>
                  ) : (
                    <p className="text-amber-700 dark:text-amber-400">
                      {metrics.filtroCatmat.motivo}
                    </p>
                  )}
                </div>
              )}

              {/* Erro */}
              {error && (
                <div className="rounded-lg border border-destructive bg-destructive/10 p-6 space-y-3">
                  <div className="flex items-center gap-2 text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="font-medium text-sm">Erro ao carregar métricas</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {error instanceof Error ? error.message : "Não foi possível consultar o banco de dados."}
                  </p>
                  <button onClick={() => window.location.reload()} className="text-xs text-primary underline">
                    Recarregar página
                  </button>
                </div>
              )}

              {/* Loading */}
              {isLoading && (
                <div className="flex justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              )}

              {/* Conteúdo */}
              {!isLoading && metrics && (
                <div className="space-y-6">
                  {/* Indicadores */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <MetricCard label="Total de Processos" value={metrics.totalDemandas.toLocaleString("pt-BR")} icon={<FileText className="h-5 w-5" />} />
                    <MetricCard label="Passivo Ativo" value={metrics.demandasAtivas.toLocaleString("pt-BR")} icon={<Activity className="h-5 w-5" />} description="Processos não concluídos" />
                    <MetricCard label="Demandas Críticas" value={metrics.demandasCriticas.toLocaleString("pt-BR")} icon={<AlertTriangle className="h-5 w-5" />} description="Prioridade Alta ou Crítica" />
                    <MetricCard label="Taxa de Resolução" value={`${metrics.taxaResolucao.toFixed(1)}%`} icon={<TrendingUp className="h-5 w-5" />} description="Processos finalizados" />
                  </div>

                  {/* A.1) Contagem */}
                  {activeTab === "demandas" && (
                    <div className="space-y-6">
                      <Section icon={<TrendingUp className="h-4 w-4" />} title="Série Histórica de Demandas" subtitle="Evolução mensal dos processos registrados" full>
                        <TimelineChart data={metrics.demandasTimeline} />
                      </Section>
                      <Section icon={<Landmark className="h-4 w-4" />} title="Volume por Tribunal ao Longo do Tempo" subtitle="Decomposição mensal das demandas por TRF" full>
                        <TribunalTimelineChart
                          data={metrics.tribunalTimeline.map((d) => ({ mes: d.mes, trf: d.trf, value: d.count }))}
                          unidade="processos"
                          emptyLabel="Sem dados de tribunal (TRF) no período selecionado."
                        />
                      </Section>
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <Section icon={<MapPin className="h-4 w-4" />} title="Por Região do Brasil" subtitle="Volume de judicializações por macrorregião">
                          <RegiaoBrasilChart data={metrics.regiaoBrasilDistribution} />
                        </Section>
                        <Section icon={<Scale className="h-4 w-4" />} title="Por TRF Região" subtitle="Tribunal Regional Federal de origem do processo">
                          <TRFChart data={metrics.trfRegiaoDistribution} />
                        </Section>
                        <Section icon={<MapPin className="h-4 w-4" />} title="Top 15 UFs de Residência" subtitle="Unidade federativa do paciente autor da ação">
                          <UFChart data={metrics.ufResidenciaDistribution} />
                        </Section>
                      </div>
                    </div>
                  )}

                  {/* A.2) Valores */}
                  {activeTab === "valores" && (
                    <div className="space-y-6">
                      <Section icon={<Coins className="h-4 w-4" />} title="Série Histórica de Valores" subtitle="Evolução mensal do valor total dos processos (R$)" full>
                        <ValorTimelineChart data={metrics.valorTimeline} />
                      </Section>
                      <Section icon={<Landmark className="h-4 w-4" />} title="Valores por Tribunal ao Longo do Tempo" subtitle="Decomposição mensal do valor (R$) por TRF" full>
                        <TribunalTimelineChart
                          data={metrics.valorTribunalTimeline.map((d) => ({ mes: d.mes, trf: d.trf, value: d.valor }))}
                          format={fmtBRLCompacto}
                          unidade="R$"
                          emptyLabel="Nenhuma demanda com valor e tribunal identificado nos filtros selecionados."
                        />
                      </Section>
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <Section icon={<MapPin className="h-4 w-4" />} title="Por Região do Brasil" subtitle="Concentração geográfica do portfólio de processos">
                          <RegiaoBrasilChart data={metrics.regiaoBrasilDistribution} />
                        </Section>
                        <Section icon={<Scale className="h-4 w-4" />} title="Por TRF Região" subtitle="Série de valores por TRF no gráfico de evolução acima">
                          <TRFChart data={metrics.trfRegiaoDistribution} />
                        </Section>
                        <Section icon={<MapPin className="h-4 w-4" />} title="Top 15 UFs de Residência" subtitle="Unidade federativa do paciente autor da ação">
                          <UFChart data={metrics.ufResidenciaDistribution} />
                        </Section>
                      </div>
                    </div>
                  )}

                  {/* A.3) Princípios Ativos */}
                  {activeTab === "principios-ativos" && (
                    <div className="space-y-6">
                      <Section icon={<Pill className="h-4 w-4" />} title="Top 15 Princípios Ativos Mais Demandados" subtitle="Ranking por volume de processos — subsidia o quantitativo para ARPs" full>
                        <TopMedicamentosChart data={metrics.topMedicamentosDistribution} />
                      </Section>
                      <Section icon={<Coins className="h-4 w-4" />} title="Top 15 Princípios Ativos por Valor Total" subtitle="Ranking por valor (R$) — complementa o ranking por quantidade" full>
                        <TopMedicamentosValorChart data={metrics.topMedicamentosValor} />
                      </Section>
                      <Section icon={<Building2 className="h-4 w-4" />} title="Demandas por Fornecedor do Medicamento" subtitle="Empresa que produz/comercializa o medicamento pleiteado" full>
                        <FornecedorChart data={metrics.fornecedorDistribution} />
                      </Section>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Section icon={<BarChart2 className="h-4 w-4" />} title="Por Grupo Temático" subtitle="Top 10 categorias de demandas judiciais">
                          <AreaTematicaChart data={metrics.areaTematicaDistribution} />
                        </Section>
                        <Section icon={<Scale className="h-4 w-4" />} title="Por Objeto da Ação" subtitle="Tipo de insumo ou medicamento pleiteado judicialmente">
                          <ObjetoAcaoChart data={metrics.objetoAcaoDistribution} />
                        </Section>
                      </div>
                    </div>
                  )}

                  {/* A.3.1) Rankings comparados entre exercícios */}
                  {activeTab === "ranking-anual" && (
                    <Section
                      icon={<CalendarRange className="h-4 w-4" />}
                      title="Ranking por Ano — Comparação entre Exercícios"
                      subtitle="Os principais rankings do painel abertos ano a ano, para identificar tendências que o acumulado do período esconde"
                      full
                    >
                      {rankingLoading ? (
                        <div className="flex justify-center py-12">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : !rankingAnual || rankingAnual.rankings.length === 0 ? (
                        <p className="py-8 text-center text-sm text-muted-foreground">
                          Sem dados para os rankings no recorte selecionado.
                        </p>
                      ) : (
                        <div className="space-y-4">
                          {/* Uma dimensão por vez: sete tabelas com N colunas de
                              ano na mesma tela seriam ilegíveis. */}
                          <div className="flex flex-wrap gap-1.5">
                            {rankingAnual.rankings.map((r) => (
                              <button
                                key={r.dimensao}
                                onClick={() => setDimensaoRanking(r.dimensao)}
                                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                                  dimensaoRanking === r.dimensao
                                    ? "bg-primary text-primary-foreground"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                }`}
                              >
                                {r.rotulo}
                              </button>
                            ))}
                          </div>
                          {(() => {
                            const atual =
                              rankingAnual.rankings.find((r) => r.dimensao === dimensaoRanking) ??
                              rankingAnual.rankings[0];
                            return <RankingAnualChart ranking={atual} anos={rankingAnual.anos} />;
                          })()}
                        </div>
                      )}
                    </Section>
                  )}

                  {/* A.4) Riscos */}
                  {activeTab === "tramitacao" && (
                    <div className="space-y-6">
                      <Section icon={<ListChecks className="h-4 w-4" />} title="Gargalos por Status (funil do fluxo de execução)" subtitle="Volume parado em cada etapa do processo" full>
                        <StatusChart data={metrics.statusDistribution} />
                      </Section>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Section icon={<AlertTriangle className="h-4 w-4" />} title="Perfil de Risco" subtitle="Distribuição por nível de prioridade">
                          <PrioridadeChart data={metrics.prioridadeDistribution} />
                        </Section>
                        <Section icon={<Activity className="h-4 w-4" />} title="Indicadores de Risco" subtitle="Passivo ativo por categoria de prioridade">
                          <div className="space-y-4 mt-2">
                            {(() => {
                              const total = metrics.totalDemandas || 1;
                              return [
                                { label: "Crítica", color: "#dc2626", value: metrics.prioridadeDistribution.find((p) => p.prioridade === "Crítica")?.count || 0 },
                                { label: "Alta",    color: "#ea580c", value: metrics.prioridadeDistribution.find((p) => p.prioridade === "Alta")?.count || 0 },
                                { label: "Normal",  color: "#2563eb", value: metrics.prioridadeDistribution.find((p) => p.prioridade === "Normal" || p.prioridade === "Média")?.count || 0 },
                                { label: "Baixa",   color: "#16a34a", value: metrics.prioridadeDistribution.find((p) => p.prioridade === "Baixa")?.count || 0 },
                              ].map((item) => (
                                <RiskBadge key={item.label} label={item.label} value={item.value} max={total} color={item.color} />
                              ));
                            })()}
                            <div className="pt-3 border-t border-border space-y-1">
                              <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">Passivo ativo total</span>
                                <span className="font-bold">{metrics.demandasAtivas.toLocaleString("pt-BR")}</span>
                              </div>
                              <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">Criticidade (Alta + Crítica)</span>
                                <span className="font-bold text-destructive">{metrics.demandasCriticas.toLocaleString("pt-BR")}</span>
                              </div>
                            </div>
                          </div>
                        </Section>
                      </div>
                    </div>
                  )}

                  {/* A.5) Operacional */}
                  {activeTab === "servidores" && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <Section icon={<BarChart2 className="h-4 w-4" />} title="Top 10 Responsáveis" subtitle="Servidores com maior volume de processos sob responsabilidade">
                        <TopResponsaveisChart data={metrics.topResponsaveis} />
                      </Section>
                      {metrics.totalValorEstimado > 0 && (
                        <Section icon={<FileText className="h-4 w-4" />} title="Valor Estimado dos Processos" subtitle="Referência para dimensionamento orçamentário das aquisições">
                          <div className="flex items-center justify-center h-32">
                            <div className="text-center">
                              <p className="text-4xl font-bold text-primary tabular-nums">
                                R$&nbsp;{(metrics.totalValorEstimado / 1_000_000).toFixed(1)}M
                              </p>
                              <p className="text-xs text-muted-foreground mt-2">
                                Valor total estimado com base nos {metrics.totalDemandas.toLocaleString("pt-BR")} processos
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Média de R$&nbsp;{(metrics.totalValorEstimado / Math.max(metrics.totalDemandas, 1)).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} por processo
                              </p>
                            </div>
                          </div>
                        </Section>
                      )}
                    </div>
                  )}

                  {/* A.6) Autores */}
                  {activeTab === "autores" && (
                    <Section icon={<Users className="h-4 w-4" />} title="Evolução de Autores por Mês" subtitle="Autores únicos, novos e reincidentes" full>
                      {autoresLoading ? (
                        <div className="flex justify-center py-12">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : (
                        <AutoresTimelineChart data={autoresData ?? []} />
                      )}
                    </Section>
                  )}
                </div>
              )}
        </>
      )}
    </div>
  );
}
