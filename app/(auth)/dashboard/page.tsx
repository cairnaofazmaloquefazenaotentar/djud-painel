"use client";

import { useState } from "react";
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
import { useMetrics } from "@/hooks/useMetrics";
import { Button } from "@/components/ui/button";
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
  ShieldAlert,
} from "lucide-react";

// ─── Seção com título padronizado ───────────────────────────────────────────
function Section({
  icon,
  title,
  subtitle,
  children,
  full,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  full?: boolean;
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

// ─── Indicador de risco (barra colorida) ────────────────────────────────────
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

// ─── Componente principal ────────────────────────────────────────────────────
export default function DashboardPage() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPrioridade, setFilterPrioridade] = useState("");

  const hasActiveFilters = !!(startDate || endDate || filterStatus || filterPrioridade);

  const metricsFilters = {
    startDate:   startDate   ? new Date(startDate)   : undefined,
    endDate:     endDate     ? new Date(endDate)      : undefined,
    status:      filterStatus     || undefined,
    prioridade:  filterPrioridade || undefined,
  };

  const { data: metrics, isLoading, error } = useMetrics(metricsFilters);

  const handleReset = () => {
    setStartDate("");
    setEndDate("");
    setFilterStatus("");
    setFilterPrioridade("");
  };

  if (error) {
    return (
      <div className="space-y-8">
        <PageHeader
          title="Painel de Inteligência DJUD"
          description="Dimensionamento, tendência e gestão de riscos das demandas judiciais de medicamentos"
        />
        <div className="rounded-lg border border-destructive bg-destructive/10 p-6">
          <div className="flex items-center gap-2 text-destructive mb-1">
            <AlertTriangle className="h-4 w-4" />
            <span className="font-medium text-sm">Erro ao carregar métricas</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Não foi possível consultar o banco de dados. Verifique a conexão e recarregue a página.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Painel de Inteligência DJUD"
        description="Dimensionamento, tendência e gestão de riscos das demandas judiciais de medicamentos — Ministério da Saúde"
      />

      {/* ── Filtros ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 items-end bg-card border border-border rounded-lg p-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Data início</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-3 py-1.5 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Data fim</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-3 py-1.5 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Status</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-1.5 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Todos</option>
            <option value="Em Análise COAJUD">Em Análise COAJUD</option>
            <option value="Entrega Pendente">Entrega Pendente</option>
            <option value="Cessar Atos">Cessar Atos</option>
            <option value="Concluída">Concluída</option>
            <option value="Cancelada">Cancelada</option>
            <option value="Suspensa">Suspensa</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Prioridade</label>
          <select
            value={filterPrioridade}
            onChange={(e) => setFilterPrioridade(e.target.value)}
            className="px-3 py-1.5 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Todas</option>
            <option value="Crítica">Crítica</option>
            <option value="Alta">Alta</option>
            <option value="Normal">Normal</option>
            <option value="Baixa">Baixa</option>
          </select>
        </div>
        {hasActiveFilters && (
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Limpar filtros
          </Button>
        )}
      </div>

      {/* ── Loading ──────────────────────────────────────────────────────────── */}
      {isLoading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* ── Conteúdo ─────────────────────────────────────────────────────────── */}
      {!isLoading && metrics && (
        <>
          {/* ═══ BLOCO 1: Indicadores principais ══════════════════════════════ */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Indicadores Gerais
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <MetricCard
                label="Total de Processos"
                value={metrics.totalDemandas.toLocaleString("pt-BR")}
                icon={<FileText className="h-5 w-5" />}
              />
              <MetricCard
                label="Passivo Ativo"
                value={metrics.demandasAtivas.toLocaleString("pt-BR")}
                icon={<Activity className="h-5 w-5" />}
                description="Processos não concluídos"
              />
              <MetricCard
                label="Demandas Críticas"
                value={metrics.demandasCriticas.toLocaleString("pt-BR")}
                icon={<AlertTriangle className="h-5 w-5" />}
                description="Prioridade Alta ou Crítica"
              />
              <MetricCard
                label="Taxa de Resolução"
                value={`${metrics.taxaResolucao.toFixed(1)}%`}
                icon={<TrendingUp className="h-5 w-5" />}
                description="Processos finalizados"
              />
            </div>
          </div>

          {/* ═══ BLOCO 2: Tendência de Judicialização ═════════════════════════ */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Tendência de Judicialização
            </p>
            <Section
              icon={<TrendingUp className="h-4 w-4" />}
              title="Série Histórica de Demandas"
              subtitle="Evolução mensal dos processos registrados — base para análise de tendência e previsibilidade da demanda"
              full
            >
              <TimelineChart data={metrics.demandasTimeline} />
            </Section>
          </div>

          {/* ═══ BLOCO 3: Dimensionamento da Demanda ══════════════════════════ */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Dimensionamento da Demanda
            </p>
            <div className="space-y-6">
              {/* Top Medicamentos — full width, mais importante */}
              <Section
                icon={<Pill className="h-4 w-4" />}
                title="Top 15 Princípios Ativos Mais Demandados"
                subtitle="Ranking dos medicamentos por volume de processos judiciais — subsidia o cálculo do quantitativo para Atas de Registro de Preços (ARP)"
                full
              >
                <TopMedicamentosChart data={metrics.topMedicamentosDistribution} />
              </Section>

              {/* Grupo Temático + Objeto da Ação */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Section
                  icon={<BarChart2 className="h-4 w-4" />}
                  title="Por Grupo Temático"
                  subtitle="Top 10 categorias de demandas judiciais"
                >
                  <AreaTematicaChart data={metrics.areaTematicaDistribution} />
                </Section>
                <Section
                  icon={<Scale className="h-4 w-4" />}
                  title="Por Objeto da Ação"
                  subtitle="Tipo de insumo ou medicamento pleiteado judicialmente"
                >
                  <ObjetoAcaoChart data={metrics.objetoAcaoDistribution} />
                </Section>
              </div>
            </div>
          </div>

          {/* ═══ BLOCO 4: Gestão de Riscos Processuais ════════════════════════ */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Gestão de Riscos Processuais
            </p>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Gargalos por Status */}
              <Section
                icon={<ShieldAlert className="h-4 w-4" />}
                title="Gargalos por Status"
                subtitle="Identificação de etapas com maior volume de processos parados"
              >
                <StatusChart data={metrics.statusDistribution} />
              </Section>

              {/* Perfil de Risco por Prioridade */}
              <Section
                icon={<AlertTriangle className="h-4 w-4" />}
                title="Perfil de Risco"
                subtitle="Distribuição por nível de prioridade"
              >
                <PrioridadeChart data={metrics.prioridadeDistribution} />
              </Section>

              {/* Indicadores de risco numéricos */}
              <Section
                icon={<Activity className="h-4 w-4" />}
                title="Indicadores de Risco"
                subtitle="Passivo ativo por categoria de prioridade"
              >
                <div className="space-y-4 mt-2">
                  {(() => {
                    const total = metrics.totalDemandas || 1;
                    const riskItems = [
                      {
                        label: "Crítica",
                        value: metrics.prioridadeDistribution.find((p) => p.prioridade === "Crítica")?.count || 0,
                        color: "#dc2626",
                      },
                      {
                        label: "Alta",
                        value: metrics.prioridadeDistribution.find((p) => p.prioridade === "Alta")?.count || 0,
                        color: "#ea580c",
                      },
                      {
                        label: "Normal",
                        value: metrics.prioridadeDistribution.find((p) => p.prioridade === "Normal" || p.prioridade === "Média")?.count || 0,
                        color: "#2563eb",
                      },
                      {
                        label: "Baixa",
                        value: metrics.prioridadeDistribution.find((p) => p.prioridade === "Baixa")?.count || 0,
                        color: "#16a34a",
                      },
                    ];
                    return riskItems.map((item) => (
                      <RiskBadge
                        key={item.label}
                        label={item.label}
                        value={item.value}
                        max={total}
                        color={item.color}
                      />
                    ));
                  })()}
                  <div className="pt-3 border-t border-border">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Passivo ativo total</span>
                      <span className="font-bold text-foreground">{metrics.demandasAtivas.toLocaleString("pt-BR")}</span>
                    </div>
                    <div className="flex justify-between text-xs mt-1">
                      <span className="text-muted-foreground">Criticidade (Alta+Crítica)</span>
                      <span className="font-bold text-destructive">{metrics.demandasCriticas.toLocaleString("pt-BR")}</span>
                    </div>
                  </div>
                </div>
              </Section>
            </div>
          </div>

          {/* ═══ BLOCO 5: Análise Geográfica ══════════════════════════════════ */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Análise Geográfica
            </p>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Section
                icon={<MapPin className="h-4 w-4" />}
                title="Por Região do Brasil"
                subtitle="Volume de judicializações por macrorregião"
              >
                <RegiaoBrasilChart data={metrics.regiaoBrasilDistribution} />
              </Section>
              <Section
                icon={<Scale className="h-4 w-4" />}
                title="Por TRF Região"
                subtitle="Tribunal Regional Federal de origem do processo"
              >
                <TRFChart data={metrics.trfRegiaoDistribution} />
              </Section>
              <Section
                icon={<MapPin className="h-4 w-4" />}
                title="Top 15 UFs de Residência"
                subtitle="Unidade federativa do paciente autor da ação"
              >
                <UFChart data={metrics.ufResidenciaDistribution} />
              </Section>
            </div>
          </div>

          {/* ═══ BLOCO 6: Operacional ════════════════════════════════════════ */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Visão Operacional
            </p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Section
                icon={<BarChart2 className="h-4 w-4" />}
                title="Top 10 Responsáveis"
                subtitle="Servidores com maior volume de processos sob responsabilidade"
              >
                <TopResponsaveisChart data={metrics.topResponsaveis} />
              </Section>
              {metrics.totalValorEstimado > 0 && (
                <Section
                  icon={<FileText className="h-4 w-4" />}
                  title="Valor Estimado dos Processos"
                  subtitle="Referência para dimensionamento orçamentário das aquisições"
                >
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
          </div>
        </>
      )}
    </div>
  );
}
