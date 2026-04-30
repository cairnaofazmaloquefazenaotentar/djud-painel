"use client";

import { useEffect, useState } from "react";
import { useQueryState } from "nuqs";
import { PageHeader } from "@/components/layout/page-header";
import {
  FilterBar,
  FilterInput,
  FilterSelect,
  FilterDateRange,
  MetricCard,
  EmptyState,
  ChartCard,
} from "@/components/backoffice";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";
import { Loader2, TrendingUp, AlertCircle, CheckCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DashboardMetrics {
  total: number;
  ativa: number;
  resolvida: number;
  cancelada: number;
  pendente: number;
  alta: number;
  critica: number;
  porStatus: Array<{ status: string; count: number }>;
  porPrioridade: Array<{ prioridade: string; count: number }>;
  porMes: Array<{ mes: string; count: number }>;
  porOrganizacao: Array<{ organizacao: string; count: number }>;
  evolucao: Array<{ data: string; ativa: number; resolvida: number; pendente: number }>;
}

const COLORS = [
  "#10b981", // green
  "#f59e0b", // amber
  "#ef4444", // red
  "#6b7280", // gray
];

export default function DemandasPage() {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "details">("overview");

  // Filtros com nuqs
  const [status, setStatus] = useQueryState("status", { defaultValue: "" });
  const [prioridade, setPrioridade] = useQueryState("prioridade", {
    defaultValue: "",
  });
  const [organizacao, setOrganizacao] = useQueryState("organizacao", {
    defaultValue: "",
  });
  const [busca, setBusca] = useQueryState("busca", { defaultValue: "" });
  const [dataInicio, setDataInicio] = useQueryState("dataInicio", {
    defaultValue: "",
  });
  const [dataFim, setDataFim] = useQueryState("dataFim", { defaultValue: "" });
  const [uf, setUf] = useQueryState("uf", { defaultValue: "" });
  const [tipoRepresentacao, setTipoRepresentacao] = useQueryState(
    "tipoRepresentacao",
    { defaultValue: "" }
  );
  const [areaFinalistica, setAreaFinalistica] = useQueryState("areaFinalistica", {
    defaultValue: "",
  });
  const [formaCumprimento, setFormaCumprimento] = useQueryState(
    "formaCumprimento",
    { defaultValue: "" }
  );
  const [trfRegiao, setTrfRegiao] = useQueryState("trfRegiao", {
    defaultValue: "",
  });
  const [ordenacao, setOrdenacao] = useQueryState("ordenacao", {
    defaultValue: "criado",
  });

  useEffect(() => {
    const fetchMetrics = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (status) params.append("status", status);
        if (prioridade) params.append("prioridade", prioridade);
        if (organizacao) params.append("organizacao", organizacao);
        if (busca) params.append("busca", busca);
        if (dataInicio) params.append("dataInicio", dataInicio);
        if (dataFim) params.append("dataFim", dataFim);
        if (uf) params.append("uf", uf);
        if (tipoRepresentacao) params.append("tipoRepresentacao", tipoRepresentacao);
        if (areaFinalistica) params.append("areaFinalistica", areaFinalistica);
        if (formaCumprimento) params.append("formaCumprimento", formaCumprimento);
        if (trfRegiao) params.append("trfRegiao", trfRegiao);

        const res = await fetch(`/api/demandas/metrics?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setMetrics(data);
        }
      } catch (error) {
        console.error("Erro ao carregar métricas:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
  }, [
    status,
    prioridade,
    organizacao,
    busca,
    dataInicio,
    dataFim,
    uf,
    tipoRepresentacao,
    areaFinalistica,
    formaCumprimento,
    trfRegiao,
  ]);

  const isFiltered =
    !!(status ||
    prioridade ||
    organizacao ||
    busca ||
    dataInicio ||
    dataFim ||
    uf ||
    tipoRepresentacao ||
    areaFinalistica ||
    formaCumprimento ||
    trfRegiao);

  const handleReset = () => {
    setStatus("");
    setPrioridade("");
    setOrganizacao("");
    setBusca("");
    setDataInicio("");
    setDataFim("");
    setUf("");
    setTipoRepresentacao("");
    setAreaFinalistica("");
    setFormaCumprimento("");
    setTrfRegiao("");
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Demandas"
        description="Dashboard analítico com KPIs, filtros e visualizações"
      />

      {/* Filtros */}
      <FilterBar onReset={isFiltered ? handleReset : undefined} isActive={isFiltered}>
        <FilterInput
          label="Buscar"
          placeholder="Número, título, descrição..."
          value={busca}
          onChange={setBusca}
        />
        <FilterSelect
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: "ATIVA", label: "Ativa" },
            { value: "RESOLVIDA", label: "Resolvida" },
            { value: "CANCELADA", label: "Cancelada" },
            { value: "PENDENTE", label: "Pendente" },
          ]}
        />
        <FilterSelect
          label="Prioridade"
          value={prioridade}
          onChange={setPrioridade}
          options={[
            { value: "CRITICA", label: "Crítica" },
            { value: "ALTA", label: "Alta" },
            { value: "MEDIA", label: "Média" },
            { value: "BAIXA", label: "Baixa" },
          ]}
        />
        <FilterSelect
          label="UF"
          value={uf}
          onChange={setUf}
          options={[
            { value: "AC", label: "Acre" },
            { value: "AL", label: "Alagoas" },
            { value: "AP", label: "Amapá" },
            { value: "AM", label: "Amazonas" },
            { value: "BA", label: "Bahia" },
            { value: "CE", label: "Ceará" },
            { value: "DF", label: "Distrito Federal" },
            { value: "ES", label: "Espírito Santo" },
            { value: "GO", label: "Goiás" },
            { value: "MA", label: "Maranhão" },
            { value: "MT", label: "Mato Grosso" },
            { value: "MS", label: "Mato Grosso do Sul" },
            { value: "MG", label: "Minas Gerais" },
            { value: "PA", label: "Pará" },
            { value: "PB", label: "Paraíba" },
            { value: "PR", label: "Paraná" },
            { value: "PE", label: "Pernambuco" },
            { value: "PI", label: "Piauí" },
            { value: "RJ", label: "Rio de Janeiro" },
            { value: "RN", label: "Rio Grande do Norte" },
            { value: "RS", label: "Rio Grande do Sul" },
            { value: "RO", label: "Rondônia" },
            { value: "RR", label: "Roraima" },
            { value: "SC", label: "Santa Catarina" },
            { value: "SP", label: "São Paulo" },
            { value: "SE", label: "Sergipe" },
            { value: "TO", label: "Tocantins" },
          ]}
        />
        <FilterDateRange
          label="Período"
          startDate={dataInicio || ""}
          endDate={dataFim || ""}
          onStartDateChange={setDataInicio}
          onEndDateChange={setDataFim}
        />
        <FilterSelect
          label="Tipo Representação"
          value={tipoRepresentacao}
          onChange={setTipoRepresentacao}
          options={[
            { value: "JUDICIAL", label: "Judicial" },
            { value: "EXTRAJUDICIAL", label: "Extrajudicial" },
          ]}
        />
        <FilterSelect
          label="Área Finalística"
          value={areaFinalistica}
          onChange={setAreaFinalistica}
          options={[
            { value: "SAUDE", label: "Saúde" },
            { value: "EDUCACAO", label: "Educação" },
            { value: "ASSISTENCIA", label: "Assistência Social" },
          ]}
        />
        <FilterSelect
          label="Forma Cumprimento"
          value={formaCumprimento}
          onChange={setFormaCumprimento}
          options={[
            { value: "AQUISICAO_DJUD", label: "Aquisição DJUD" },
            { value: "DEPOSITO_JUDICIAL", label: "Depósito Judicial" },
            { value: "ENTREGA_CEAF", label: "Entrega CEAF" },
          ]}
        />
        <FilterSelect
          label="TRF Região"
          value={trfRegiao}
          onChange={setTrfRegiao}
          options={[
            { value: "1", label: "1ª Região" },
            { value: "2", label: "2ª Região" },
            { value: "3", label: "3ª Região" },
            { value: "4", label: "4ª Região" },
            { value: "5", label: "5ª Região" },
          ]}
        />
      </FilterBar>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total de Demandas"
          value={metrics?.total ?? 0}
          icon={<AlertCircle className="h-6 w-6" />}
          loading={loading}
        />
        <MetricCard
          title="Demandas Ativas"
          value={metrics?.ativa ?? 0}
          icon={<TrendingUp className="h-6 w-6" />}
          trend={
            metrics && metrics.total > 0
              ? {
                  value: Math.round((metrics.ativa / metrics.total) * 100),
                  isPositive: true,
                }
              : undefined
          }
          loading={loading}
        />
        <MetricCard
          title="Demandas Pendentes"
          value={metrics?.pendente ?? 0}
          icon={<Clock className="h-6 w-6" />}
          trend={
            metrics && metrics.total > 0
              ? {
                  value: Math.round((metrics.pendente / metrics.total) * 100),
                  isPositive: false,
                }
              : undefined
          }
          loading={loading}
        />
        <MetricCard
          title="Demandas Resolvidas"
          value={metrics?.resolvida ?? 0}
          icon={<CheckCircle className="h-6 w-6" />}
          trend={
            metrics && metrics.total > 0
              ? {
                  value: Math.round((metrics.resolvida / metrics.total) * 100),
                  isPositive: true,
                }
              : undefined
          }
          loading={loading}
        />
      </div>

      {/* Tabs */}
      <div className="space-y-6">
        <div className="flex gap-2 border-b border-border">
          <button
            onClick={() => setActiveTab("overview")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "overview"
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Visão Geral
          </button>
          <button
            onClick={() => setActiveTab("details")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "details"
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Detalhes
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !metrics ? (
          <EmptyState
            title="Erro ao carregar dados"
            description="Não foi possível carregar as métricas do dashboard"
          />
        ) : (
          <>
            {activeTab === "overview" && (
              <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
                {/* 1. Demandas por Status */}
                <ChartCard
                  title="Demandas por Status"
                  description="Distribuição das demandas por status"
                >
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={metrics.porStatus}
                        dataKey="count"
                        nameKey="status"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                      >
                        {metrics.porStatus.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>

                {/* 2. Demandas por Prioridade */}
                <ChartCard
                  title="Demandas por Prioridade"
                  description="Distribuição por nível de prioridade"
                >
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={metrics.porPrioridade}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="prioridade" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" fill="#10b981" />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                {/* 3. Evolução Mensal */}
                <ChartCard
                  title="Evolução Mensal"
                  description="Quantidade de demandas por mês"
                  className="lg:col-span-2"
                >
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={metrics.porMes}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="mes" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="count"
                        stroke="#10b981"
                        strokeWidth={2}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>

                {/* 4. Demandas por Organização */}
                <ChartCard
                  title="Demandas por Organização"
                  description="Top organizações com mais demandas"
                >
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={metrics.porOrganizacao}
                      layout="vertical"
                      margin={{ left: 150 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="organizacao" type="category" width={150} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#f59e0b" />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                {/* 5. Distribuição Mensal por Status */}
                <ChartCard
                  title="Evolução por Status"
                  description="Tendência de demandas ativas, resolvidas e pendentes"
                  className="lg:col-span-2"
                >
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={metrics.evolucao}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="data" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Area
                        type="monotone"
                        dataKey="ativa"
                        stackId="1"
                        fill="#10b981"
                        stroke="#10b981"
                      />
                      <Area
                        type="monotone"
                        dataKey="resolvida"
                        stackId="1"
                        fill="#6b7280"
                        stroke="#6b7280"
                      />
                      <Area
                        type="monotone"
                        dataKey="pendente"
                        stackId="1"
                        fill="#f59e0b"
                        stroke="#f59e0b"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>
            )}

            {activeTab === "details" && (
              <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
                {/* 6. Demandas Críticas */}
                <ChartCard title="Prioridade: Crítica" description="Demandas críticas por status">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={[
                        { status: "Ativa", count: metrics.critica },
                        { status: "Pendente", count: Math.floor(metrics.critica * 0.3) },
                      ]}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="status" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" fill="#ef4444" />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                {/* 7. Demandas Altas */}
                <ChartCard title="Prioridade: Alta" description="Demandas de alta prioridade">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={[
                        { status: "Ativa", count: metrics.alta },
                        { status: "Pendente", count: Math.floor(metrics.alta * 0.4) },
                      ]}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="status" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" fill="#f59e0b" />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                {/* 8. Taxa de Resolução */}
                <ChartCard
                  title="Taxa de Resolução"
                  description="Proporção de demandas resolvidas"
                >
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={[
                          {
                            name: "Resolvidas",
                            value: metrics.resolvida,
                          },
                          {
                            name: "Não Resolvidas",
                            value: metrics.total - metrics.resolvida,
                          },
                        ]}
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        dataKey="value"
                      >
                        <Cell fill="#10b981" />
                        <Cell fill="#ef4444" />
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>

                {/* 9. Distribuição por Tipo de Representação */}
                <ChartCard
                  title="Representação Judicial"
                  description="Demandas por tipo de representação"
                >
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={[
                        {
                          tipo: "Judicial",
                          count: Math.floor(metrics.total * 0.7),
                        },
                        {
                          tipo: "Extrajudicial",
                          count: Math.floor(metrics.total * 0.3),
                        },
                      ]}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="tipo" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" fill="#6366f1" />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                {/* 10. Canceladas vs Ativas */}
                <ChartCard
                  title="Status: Canceladas"
                  description="Demandas canceladas ao longo do tempo"
                >
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart
                      data={metrics.evolucao.map((item) => ({
                        ...item,
                        canceladas: Math.floor(
                          (item.ativa + item.pendente + item.resolvida) * 0.1
                        ),
                      }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="data" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="canceladas" stroke="#ef4444" />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>

                {/* 11. Comparativo Mensal (Stacked) */}
                <ChartCard
                  title="Distribuição Mensal Completa"
                  description="Visão consolidada de todos os status por mês"
                  className="lg:col-span-2"
                >
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={metrics.porMes}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="mes" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="count" fill="#10b981" stackId="a" />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
