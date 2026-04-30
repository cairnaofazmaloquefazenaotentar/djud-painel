import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

export interface MetricsData {
  statusDistribution: Array<{ status: string; count: number }>;
  prioridadeDistribution: Array<{ prioridade: string; count: number }>;
  trfRegiaoDistribution: Array<{ trf: number | null; count: number }>;
  ufResidenciaDistribution: Array<{ uf: string | null; count: number }>;
  formaCumprimentoDistribution: Array<{ forma: string | null; count: number }>;
  areaTematicaDistribution: Array<{ area: string | null; count: number }>;
  areaFinalisticaDistribution: Array<{ area: string | null; count: number }>;
  demandasTimeline: Array<{ date: Date; count: number }>;
  topResponsaveis: Array<{ id: string; name: string | null; count: number }>;
  totalValorEstimado: number;
  taxaResolucao: number;
  totalDemandas: number;
}

export interface MetricsFilterInput {
  startDate?: Date;
  endDate?: Date;
  status?: string;
  prioridade?: string;
  organizacaoId?: string;
}

export async function getMetricsData(filters: MetricsFilterInput): Promise<MetricsData> {
  // Build where clause based on filters
  const where: Prisma.DemandaWhereInput = {};

  if (filters.startDate || filters.endDate) {
    where.criadoEm = {};
    if (filters.startDate) {
      (where.criadoEm as any).gte = filters.startDate;
    }
    if (filters.endDate) {
      (where.criadoEm as any).lte = filters.endDate;
    }
  }

  if (filters.status) where.status = filters.status;
  if (filters.prioridade) where.prioridade = filters.prioridade;
  if (filters.organizacaoId) where.organizacaoId = filters.organizacaoId;

  // Execute all queries in parallel
  const [
    demandas,
    statusCounts,
    prioridadeCounts,
    trfCounts,
    ufCounts,
    formaCumprimentoCounts,
    areaTematicaCounts,
    areaFinalisticaCounts,
    responsaveisCounts,
  ] = await Promise.all([
    // Get all demandas for timeline
    db.demanda.findMany({
      where,
      select: { criadoEm: true, valorEstimado: true, status: true },
    }),
    // Status distribution
    db.demanda.groupBy({
      by: ["status"],
      where,
      _count: { id: true },
    }),
    // Prioridade distribution
    db.demanda.groupBy({
      by: ["prioridade"],
      where,
      _count: { id: true },
    }),
    // TRF Região distribution
    db.demanda.groupBy({
      by: ["trfRegiao"],
      where,
      _count: { id: true },
    }),
    // UF Residência distribution
    db.demanda.groupBy({
      by: ["ufResidencia"],
      where,
      _count: { id: true },
    }),
    // Forma de Cumprimento distribution
    db.demanda.groupBy({
      by: ["formaCumprimento"],
      where,
      _count: { id: true },
    }),
    // Área Temática distribution
    db.demanda.groupBy({
      by: ["areaTematicaConsultor"],
      where,
      _count: { id: true },
    }),
    // Área Finálistica distribution
    db.demanda.groupBy({
      by: ["areaFinalisticaMs"],
      where,
      _count: { id: true },
    }),
    // Top responsáveis
    db.demanda.groupBy({
      by: ["responsavelId"],
      where: { ...where, responsavelId: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    }),
  ]);

  // Get responsável details for top 10
  const topResponsaveisIds = responsaveisCounts
    .map((r) => r.responsavelId)
    .filter((id) => id !== null) as string[];

  const responsaveisDetails = await db.user.findMany({
    where: { id: { in: topResponsaveisIds } },
    select: { id: true, name: true },
  });

  const responsaveisMap = new Map(responsaveisDetails.map((r) => [r.id, r.name]));

  // Calculate timeline - aggregate by date
  const timelineMap = new Map<string, number>();
  demandas.forEach((d) => {
    const dateStr = d.criadoEm.toISOString().split("T")[0];
    timelineMap.set(dateStr, (timelineMap.get(dateStr) || 0) + 1);
  });

  const demandasTimeline = Array.from(timelineMap.entries())
    .map(([date, count]) => ({
      date: new Date(date),
      count,
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  // Calculate metrics
  const totalValorEstimado = demandas.reduce((sum, d) => {
    return sum + (d.valorEstimado?.toNumber() || 0);
  }, 0);

  const fechadas = demandas.filter((d) => d.status === "Fechada").length;
  const taxaResolucao = demandas.length > 0 ? (fechadas / demandas.length) * 100 : 0;

  return {
    statusDistribution: statusCounts.map((item) => ({
      status: item.status || "Sem status",
      count: item._count.id,
    })),
    prioridadeDistribution: prioridadeCounts.map((item) => ({
      prioridade: item.prioridade || "Média",
      count: item._count.id,
    })),
    trfRegiaoDistribution: trfCounts.map((item) => ({
      trf: item.trfRegiao,
      count: item._count.id,
    })),
    ufResidenciaDistribution: ufCounts.map((item) => ({
      uf: item.ufResidencia,
      count: item._count.id,
    })),
    formaCumprimentoDistribution: formaCumprimentoCounts.map((item) => ({
      forma: item.formaCumprimento,
      count: item._count.id,
    })),
    areaTematicaDistribution: areaTematicaCounts.map((item) => ({
      area: item.areaTematicaConsultor,
      count: item._count.id,
    })),
    areaFinalisticaDistribution: areaFinalisticaCounts.map((item) => ({
      area: item.areaFinalisticaMs,
      count: item._count.id,
    })),
    demandasTimeline,
    topResponsaveis: responsaveisCounts.map((item) => ({
      id: item.responsavelId || "unknown",
      name: item.responsavelId ? responsaveisMap.get(item.responsavelId) || null : null,
      count: item._count.id,
    })),
    totalValorEstimado,
    taxaResolucao: Math.round(taxaResolucao * 100) / 100,
    totalDemandas: demandas.length,
  };
}
