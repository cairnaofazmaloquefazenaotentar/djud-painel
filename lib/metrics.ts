import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

export interface MetricsData {
  // ── Indicadores principais ──────────────────────────────────────────────────
  totalDemandas:       number;
  demandasAtivas:      number;   // passivo de processos ativos (não resolvidos)
  demandasCriticas:    number;   // prioridade Alta + Crítica
  taxaResolucao:       number;
  totalValorEstimado:  number;

  // ── Dimensionamento da demanda ───────────────────────────────────────────────
  topMedicamentosDistribution:  Array<{ medicamento: string | null; count: number }>;
  areaTematicaDistribution:     Array<{ area: string | null; count: number }>;
  objetoAcaoDistribution:       Array<{ objeto: string | null; count: number }>;

  // ── Tendência de judicialização ──────────────────────────────────────────────
  demandasTimeline: Array<{ date: Date; count: number }>;

  // ── Gestão de riscos ─────────────────────────────────────────────────────────
  statusDistribution:      Array<{ status: string; count: number }>;
  prioridadeDistribution:  Array<{ prioridade: string; count: number }>;

  // ── Análise geográfica ───────────────────────────────────────────────────────
  regiaoBrasilDistribution:  Array<{ regiao: string | null; count: number }>;
  trfRegiaoDistribution:     Array<{ trf: number | null; count: number }>;
  ufResidenciaDistribution:  Array<{ uf: string | null; count: number }>;

  // ── Operacional ─────────────────────────────────────────────────────────────
  topResponsaveis:              Array<{ id: string; name: string | null; count: number }>;
  formaCumprimentoDistribution: Array<{ forma: string | null; count: number }>;
  areaFinalisticaDistribution:  Array<{ area: string | null; count: number }>;
}

export interface MetricsFilterInput {
  startDate?:      Date;
  endDate?:        Date;
  status?:         string;
  prioridade?:     string;
  organizacaoId?:  string;
}

// Status considerados "resolvidos"
const STATUS_RESOLVIDOS   = ["Fechada", "Concluída", "Encerrada", "Cancelada"];
// Prioridades de risco elevado
const PRIORIDADES_RISCO   = ["Alta", "Crítica"];

export async function getMetricsData(filters: MetricsFilterInput): Promise<MetricsData> {
  // WHERE clause Prisma ORM
  const where: Prisma.DemandaWhereInput = {};

  if (filters.startDate || filters.endDate) {
    where.criadoEm = {};
    if (filters.startDate) (where.criadoEm as Prisma.DateTimeFilter).gte = filters.startDate;
    if (filters.endDate)   (where.criadoEm as Prisma.DateTimeFilter).lte = filters.endDate;
  }
  if (filters.status)        where.status        = filters.status;
  if (filters.prioridade)    where.prioridade    = filters.prioridade;
  if (filters.organizacaoId) where.organizacaoId = filters.organizacaoId;

  // WHERE clause para raw SQL
  const sqlConditions: Prisma.Sql[] = [];
  if (filters.startDate)     sqlConditions.push(Prisma.sql`"criadoEm" >= ${filters.startDate}`);
  if (filters.endDate)       sqlConditions.push(Prisma.sql`"criadoEm" <= ${filters.endDate}`);
  if (filters.status)        sqlConditions.push(Prisma.sql`status = ${filters.status}`);
  if (filters.prioridade)    sqlConditions.push(Prisma.sql`prioridade = ${filters.prioridade}`);
  if (filters.organizacaoId) sqlConditions.push(Prisma.sql`"organizacaoId" = ${filters.organizacaoId}`);

  const whereRaw = sqlConditions.length > 0
    ? Prisma.sql`WHERE ${Prisma.join(sqlConditions, " AND ")}`
    : Prisma.sql``;

  // ── Todas as queries em paralelo — ZERO findMany ────────────────────────────
  const [
    totalCount,
    resolvedCount,
    ativasCount,
    criticasCount,
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
    topMedicamentosCounts,
    objetoAcaoCounts,
  ] = await Promise.all([
    // Total de processos
    db.demanda.count({ where }),

    // Resolvidos
    db.demanda.count({ where: { ...where, status: { in: STATUS_RESOLVIDOS } } }),

    // Passivo ativo (não resolvidos)
    db.demanda.count({ where: { ...where, status: { notIn: STATUS_RESOLVIDOS } } }),

    // Demandas críticas (risco elevado)
    db.demanda.count({ where: { ...where, prioridade: { in: PRIORIDADES_RISCO } } }),

    // Valor estimado total
    db.demanda.aggregate({ where, _sum: { valorEstimado: true } }),

    // Série histórica mensal — raw SQL (DATE_TRUNC)
    db.$queryRaw<Array<{ month: Date; count: bigint }>>`
      SELECT DATE_TRUNC('month', "criadoEm") AS month, COUNT(*) AS count
      FROM "Demanda"
      ${whereRaw}
      GROUP BY DATE_TRUNC('month', "criadoEm")
      ORDER BY month ASC
    `,

    // Distribuição por status (gargalos processuais)
    db.demanda.groupBy({
      by: ["status"], where,
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    }),

    // Distribuição por prioridade (perfil de risco)
    db.demanda.groupBy({ by: ["prioridade"], where, _count: { id: true } }),

    // TRF Região
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

    // Grupo Temático — top 10
    db.demanda.groupBy({
      by: ["areaTematica"],
      where: { ...where, areaTematica: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    }),

    // Área Finálistica MS
    db.demanda.groupBy({ by: ["areaFinalisticaMs"], where, _count: { id: true } }),

    // Região do Brasil
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

    // ── NOVO: Top 15 Princípios Ativos / Medicamentos ─────────────────────────
    // Pilar de dimensionamento: quais medicamentos e em qual volume
    db.demanda.groupBy({
      by: ["principioAtivo"],
      where: { ...where, principioAtivo: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 15,
    }),

    // ── NOVO: Objeto da Ação (tipo de medicamento) ────────────────────────────
    db.demanda.groupBy({
      by: ["objetoAcao"],
      where: { ...where, objetoAcao: { not: null } },
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

  const totalDemandas      = totalCount;
  const totalValorEstimado = totalValueAgg._sum.valorEstimado?.toNumber() ?? 0;
  const taxaResolucao      = totalDemandas > 0 ? (resolvedCount / totalDemandas) * 100 : 0;

  return {
    // Indicadores principais
    totalDemandas,
    demandasAtivas:     ativasCount,
    demandasCriticas:   criticasCount,
    taxaResolucao:      Math.round(taxaResolucao * 100) / 100,
    totalValorEstimado,

    // Dimensionamento
    topMedicamentosDistribution: topMedicamentosCounts.map((item) => ({
      medicamento: item.principioAtivo,
      count:       item._count.id,
    })),
    areaTematicaDistribution: areaTematicaCounts.map((item) => ({
      area:  item.areaTematica,
      count: item._count.id,
    })),
    objetoAcaoDistribution: objetoAcaoCounts.map((item) => ({
      objeto: item.objetoAcao,
      count:  item._count.id,
    })),

    // Tendência
    demandasTimeline: timelineRaw.map((r) => ({
      date:  r.month,
      count: Number(r.count),
    })),

    // Gestão de riscos
    statusDistribution: statusCounts.map((item) => ({
      status: item.status || "Sem status",
      count:  item._count.id,
    })),
    prioridadeDistribution: prioridadeCounts.map((item) => ({
      prioridade: item.prioridade || "Normal",
      count:      item._count.id,
    })),

    // Geográfico
    regiaoBrasilDistribution: regiaoBrasilCounts.map((item) => ({
      regiao: item.regiaoBrasil,
      count:  item._count.id,
    })),
    trfRegiaoDistribution: trfCounts.map((item) => ({
      trf:   item.trfRegiao,
      count: item._count.id,
    })),
    ufResidenciaDistribution: ufCounts.map((item) => ({
      uf:    item.ufResidencia,
      count: item._count.id,
    })),

    // Operacional
    topResponsaveis: responsaveisCounts.map((item) => ({
      id:    item.responsavelId || "unknown",
      name:  item.responsavelId ? (responsaveisMap.get(item.responsavelId) ?? null) : null,
      count: item._count.id,
    })),
    formaCumprimentoDistribution: formaCumprimentoCounts.map((item) => ({
      forma: item.formaCumprimento,
      count: item._count.id,
    })),
    areaFinalisticaDistribution: areaFinalisticaCounts.map((item) => ({
      area:  item.areaFinalisticaMs,
      count: item._count.id,
    })),
  };
}
