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
import { useMetrics } from "@/hooks/useMetrics";
import { useDashboardFilters } from "@/hooks/useDashboardFilters";
import { Button } from "@/components/ui/button";
import { DollarSign, TrendingUp, Loader2 } from "lucide-react";

export default function DashboardPage() {
  const { filters, setDateRange, resetFilters, updateFilters } = useDashboardFilters();
  const [dateRange, setLocalDateRange] = useState({});

  const metricsFilters = {
    startDate: filters.startDate ? new Date(filters.startDate) : undefined,
    endDate: filters.endDate ? new Date(filters.endDate) : undefined,
    status: filters.status,
    prioridade: filters.prioridade,
  };

  const { data: metrics, isLoading, error } = useMetrics(metricsFilters);
  const hasActiveFilters = Object.values(filters).some((v) => v);

  if (error) {
    return (
      <div className="space-y-8">
        <PageHeader title="Dashboard" description="Análise e métricas" />
        <div className="rounded-lg border border-destructive bg-destructive/10 p-6">
          <p className="text-sm text-destructive">Erro ao carregar</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Dashboard" description="Análise de demandas judiciais" />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : metrics ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricCard label="Total de Demandas" value={metrics.totalDemandas} />
            <MetricCard
              label="Valor Total Estimado"
              value={`R$ ${(metrics.totalValorEstimado / 1000).toFixed(1)}k`}
              icon={<DollarSign className="h-5 w-5" />}
            />
            <MetricCard
              label="Taxa de Resolução"
              value={`${metrics.taxaResolucao.toFixed(1)}%`}
              icon={<TrendingUp className="h-5 w-5" />}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-lg border border-border bg-card p-6">
              <h3 className="text-lg font-semibold mb-4">Por Status</h3>
              <StatusChart data={metrics.statusDistribution} />
            </div>
            <div className="rounded-lg border border-border bg-card p-6">
              <h3 className="text-lg font-semibold mb-4">Por Prioridade</h3>
              <PrioridadeChart data={metrics.prioridadeDistribution} />
            </div>
            <div className="rounded-lg border border-border bg-card p-6 lg:col-span-2">
              <h3 className="text-lg font-semibold mb-4">Evolução</h3>
              <TimelineChart data={metrics.demandasTimeline} />
            </div>
            <div className="rounded-lg border border-border bg-card p-6">
              <h3 className="text-lg font-semibold mb-4">Por TRF</h3>
              <TRFChart data={metrics.trfRegiaoDistribution} />
            </div>
            <div className="rounded-lg border border-border bg-card p-6">
              <h3 className="text-lg font-semibold mb-4">Top 10 UFs</h3>
              <UFChart data={metrics.ufResidenciaDistribution} />
            </div>
            <div className="rounded-lg border border-border bg-card p-6 lg:col-span-2">
              <h3 className="text-lg font-semibold mb-4">Top Responsáveis</h3>
              <TopResponsaveisChart data={metrics.topResponsaveis} />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
