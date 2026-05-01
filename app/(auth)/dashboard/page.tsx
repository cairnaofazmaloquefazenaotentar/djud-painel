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
import { useMetrics } from "@/hooks/useMetrics";
import { Button } from "@/components/ui/button";
import { FileText, TrendingUp, Loader2, RotateCcw } from "lucide-react";

export default function DashboardPage() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPrioridade, setFilterPrioridade] = useState("");

  const hasActiveFilters = !!(startDate || endDate || filterStatus || filterPrioridade);

  const metricsFilters = {
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate ? new Date(endDate) : undefined,
    status: filterStatus || undefined,
    prioridade: filterPrioridade || undefined,
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
        <PageHeader title="Dashboard" description="Análise e métricas das demandas judiciais" />
        <div className="rounded-lg border border-destructive bg-destructive/10 p-6">
          <p className="text-sm text-destructive">
            Erro ao carregar métricas. Tente recarregar a página.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description="Análise de demandas judiciais"
      />

      {/* Filtros */}
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
            <option value="Em Análise">Em Análise</option>
            <option value="Em Análise COAJUD">Em Análise COAJUD</option>
            <option value="Concluída">Concluída</option>
            <option value="Cancelada">Cancelada</option>
            <option value="Suspensa">Suspensa</option>
            <option value="Entrega Pendente">Entrega Pendente</option>
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
            <option value="Alta">Alta</option>
            <option value="Media">Média</option>
            <option value="Baixa">Baixa</option>
            <option value="Critica">Crítica</option>
          </select>
        </div>
        {hasActiveFilters && (
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Limpar filtros
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : metrics ? (
        <>
          {/* Cards de métricas principais */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <MetricCard
              label="Total de Demandas"
              value={metrics.totalDemandas.toLocaleString("pt-BR")}
            />
            <MetricCard
              label="Valor Total Estimado"
              value={
                metrics.totalValorEstimado > 0
                  ? `R$ ${(metrics.totalValorEstimado / 1_000_000).toFixed(1)}M`
                  : "R$ 0"
              }
              icon={<FileText className="h-5 w-5" />}
            />
            <MetricCard
              label="Taxa de Resolução"
              value={`${metrics.taxaResolucao.toFixed(1)}%`}
              icon={<TrendingUp className="h-5 w-5" />}
            />
          </div>

          {/* Linha 1: Status + Prioridade */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-lg border border-border bg-card p-6">
              <h3 className="text-base font-semibold mb-4">Por Status</h3>
              <StatusChart data={metrics.statusDistribution} />
            </div>
            <div className="rounded-lg border border-border bg-card p-6">
              <h3 className="text-base font-semibold mb-4">Por Prioridade</h3>
              <PrioridadeChart data={metrics.prioridadeDistribution} />
            </div>
          </div>

          {/* Linha 2: Grupo Temático — full width */}
          <div className="rounded-lg border border-border bg-card p-6">
            <h3 className="text-base font-semibold mb-1">Por Grupo Temático</h3>
            <p className="text-xs text-muted-foreground mb-4">Top 10 categorias por volume de demandas</p>
            <AreaTematicaChart data={metrics.areaTematicaDistribution} />
          </div>

          {/* Linha 3: Região Brasil + TRF */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-lg border border-border bg-card p-6">
              <h3 className="text-base font-semibold mb-4">Por Região do Brasil</h3>
              <RegiaoBrasilChart data={metrics.regiaoBrasilDistribution} />
            </div>
            <div className="rounded-lg border border-border bg-card p-6">
              <h3 className="text-base font-semibold mb-4">Por TRF Região</h3>
              <TRFChart data={metrics.trfRegiaoDistribution} />
            </div>
          </div>

          {/* Linha 4: Timeline — full width */}
          <div className="rounded-lg border border-border bg-card p-6">
            <h3 className="text-base font-semibold mb-4">Evolução Temporal</h3>
            <TimelineChart data={metrics.demandasTimeline} />
          </div>

          {/* Linha 5: UF + Top Responsáveis */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-lg border border-border bg-card p-6">
              <h3 className="text-base font-semibold mb-4">Top 15 UFs de Residência</h3>
              <UFChart data={metrics.ufResidenciaDistribution} />
            </div>
            <div className="rounded-lg border border-border bg-card p-6">
              <h3 className="text-base font-semibold mb-4">Top 10 Responsáveis</h3>
              <TopResponsaveisChart data={metrics.topResponsaveis} />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
