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
  regiaoBrasilDistribution: Array<{ regiao: string | null; count: number }>;
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

// Status considerados "resolvidos" (inclui Redmine + legado)
const STATUS_RESOLVIDOS = ["Fechada", "Concluída", "Encerrada", "Cancelada"];

export async function getMetricsData(filters: MetricsFilterInput): Promise<MetricsData> {
  // WHERE clause para queries Prisma ORM
  const where: Prisma.DemandaWhereInput = {};

  if (filters.startDate || filters.endDate) {
    where.criadoEm = {};
    if (filters.startDate) (where.criadoEm as any).gte = filters.startDate;
    if (filters.endDate)   (where.criadoEm as any).lte = filters.endDate;
  }
  if (filters.status)        where.status        = filters.status;
  if (filters.prioridade)    where.prioridade    = filters.prioridade;
  if (filters.organizacaoId) where.organizacaoId = filters.organizacaoId;

  // WHERE clause para raw SQL (timeline agrupada por mês no banco — evita carregar 51k registros)
  const sqlConditions: Prisma.Sql[] = [];
  if (filters.startDate)     sqlConditions.push(Prisma.sql`"criadoEm" >= ${filters.startDate}`);
  if (filters.endDate)       sqlConditions.push(Prisma.sql`"criadoEm" <= ${filters.endDate}`);
  if (filters.status)        sqlConditions.push(Prisma.sql`status = ${filters.status}`);
  if (filters.prioridade)    sqlConditions.push(Prisma.sql`prioridade = ${filters.prioridade}`);
  if (filters.organizacaoId) sqlConditions.push(Prisma.sql`"organizacaoId" = ${filters.organizacaoId}`);

  const whereRaw = sqlConditions.length > 0
    ? Prisma.sql`WHERE ${Prisma.join(sqlConditions, " AND ")}`
    : Prisma.sql``;

  // ── Executar todas as queries em paralelo ──────────────────────────────────
  // NENHUM findMany com todos os 51k registros — apenas COUNT/AGGREGATE/GROUPBY
  const [
    totalCount,
    resolvedCount,
    totalValueAgg,
    timelineRaw,
    statusCounts,
    prioridadeCounts,
    trfCounts,
    ufCounts,
    formaCumprimentoCounts,
    areaTematicaCounts,
    areaFinalisticaCounts,
    regiaoBrasilCounts,
    responsaveisCounts,
  ] = await Promise.all([
    // Contagem total
    db.demanda.count({ where }),

    // Contagem de resolvidas (Fechada | Concluída | Encerrada | Cancelada)
    db.demanda.count({ where: { ...where, status: { in: STATUS_RESOLVIDOS } } }),

    // Soma de valor estimado
    db.demanda.aggregate({ where, _sum: { valorEstimado: true } }),

    // Timeline mensal via raw SQL (DATE_TRUNC no banco — sem trazer registros)
    db.$queryRaw<Array<{ month: Date; count: bigint }>>`
      SELECT DATE_TRUNC('month', "criadoEm") AS month, COUNT(*) AS count
      FROM "Demanda"
      ${whereRaw}
      GROUP BY DATE_TRUNC('month', "criadoEm")
      ORDER BY month ASC
    `,

    // Distribuição por status
    db.demanda.groupBy({
      by: ["status"], where,
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    }),

    // Distribuição por prioridade
    db.demanda.groupBy({ by: ["prioridade"], where, _count: { id: true } }),

    // Distribuição por TRF Região
    db.demanda.groupBy({
      by: ["trfRegiao"], where,
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    }),

    // Top 15 UFs de residência
    db.demanda.groupBy({
      by: ["ufResidencia"],
      where: { ...where, ufResidencia: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 15,
    }),

    // Forma de cumprimento
    db.demanda.groupBy({ by: ["formaCumprimento"], where, _count: { id: true } }),

    // Top 10 Grupos Temáticos (campo Sprint 8 — Redmine Excel)
    db.demanda.groupBy({
      by: ["areaTematica"],
      where: { ...where, areaTematica: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    }),

    // Área Finálistica MS (campo legado)
    db.demanda.groupBy({ by: ["areaFinalisticaMs"], where, _count: { id: true } }),

    // Região do Brasil (Sprint 8)
    db.demanda.groupBy({
      by: ["regiaoBrasil"],
      where: { ...where, regiaoBrasil: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    }),

    // Top 10 responsáveis
    db.demanda.groupBy({
      by: ["responsavelId"],
      where: { ...where, responsavelId: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    }),
  ]);

  // Buscar nomes dos top responsáveis
  const topResponsaveisIds = responsaveisCounts
    .map((r) => r.responsavelId)
    .filter(Boolean) as string[];

  const responsaveisDetails = await db.user.findMany({
    where: { id: { in: topResponsaveisIds } },
    select: { id: true, name: true },
  });

  const responsaveisMap = new Map(responsaveisDetails.map((r) => [r.id, r.name]));

  // Calcular métricas derivadas
  const totalDemandas     = totalCount;
  const totalValorEstimado = totalValueAgg._sum.valorEstimado?.toNumber() ?? 0;
  const taxaResolucao      = totalDemandas > 0
    ? (resolvedCount / totalDemandas) * 100
    : 0;

  return {
    statusDistribution: statusCounts.map((item) => ({
      status: item.status || "Sem status",
      count:  item._count.id,
    })),
    prioridadeDistribution: prioridadeCounts.map((item) => ({
      prioridade: item.prioridade || "Média",
      count:      item._count.id,
    })),
    trfRegiaoDistribution: trfCounts.map((item) => ({
      trf:   item.trfRegiao,
      count: item._count.id,
    })),
    ufResidenciaDistribution: ufCounts.map((item) => ({
      uf:    item.ufResidencia,
      count: item._count.id,
    })),
    formaCumprimentoDistribution: formaCumprimentoCounts.map((item) => ({
      forma: item.formaCumprimento,
      count: item._count.id,
    })),
    areaTematicaDistribution: areaTematicaCounts.map((item) => ({
      area:  item.areaTematica,
      count: item._count.id,
    })),
    areaFinalisticaDistribution: areaFinalisticaCounts.map((item) => ({
      area:  item.areaFinalisticaMs,
      count: item._count.id,
    })),
    regiaoBrasilDistribution: regiaoBrasilCounts.map((item) => ({
      regiao: item.regiaoBrasil,
      count:  item._count.id,
    })),
    demandasTimeline: timelineRaw.map((r) => ({
      date:  r.month,
      count: Number(r.count),
    })),
    topResponsaveis: responsaveisCounts.map((item) => ({
      id:    item.responsavelId || "unknown",
      name:  item.responsavelId ? (responsaveisMap.get(item.responsavelId) ?? null) : null,
      count: item._count.id,
    })),
    totalValorEstimado,
    taxaResolucao: Math.round(taxaResolucao * 100) / 100,
    totalDemandas,
  };
}
