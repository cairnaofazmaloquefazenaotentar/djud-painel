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
  // Fornecedor/laboratório — vazio até a base trazer a coluna (ver scripts/import-excel-demandas.ts)
  fornecedorDistribution:       Array<{ fornecedor: string | null; count: number }>;

  // ── Tendência de judicialização ──────────────────────────────────────────────
  demandasTimeline: Array<{ date: Date; count: number }>;

  // ── Decomposição da série por Tribunal (TRF) — item 1.1 ──────────────────────
  // Formato longo (mês × tribunal): a pivotagem para empilhamento é feita no componente
  tribunalTimeline: Array<{ mes: Date; trf: number | null; count: number }>;

  // ── Séries de valores em R$ — itens 2 e 3.1 ──────────────────────────────────
  // Observação: valorEstimado só existe em demandas de Cumprimento de Ordem Judicial,
  // e essas linhas não têm trfRegiao preenchido — por isso valorTribunalTimeline
  // ficará vazio até que o tribunal seja preenchido nessas demandas na base.
  valorTimeline: Array<{ mes: Date; valor: number }>;
  valorTribunalTimeline: Array<{ mes: Date; trf: number | null; valor: number }>;
  topMedicamentosValor: Array<{ medicamento: string | null; valor: number }>;

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
  principioAtivo?: string;
  organizacaoId?:  string;
}

// Status considerados "resolvidos"
const STATUS_RESOLVIDOS   = ["Fechada", "Concluída", "Encerrada", "Cancelada"];
// Prioridades de risco elevado
const PRIORIDADES_RISCO   = ["Alta", "Crítica"];

// Ordem canônica do fluxo de execução do DJUD — usada para ordenar o funil de gargalos (item 4).
// Etapa 1 (entrada) no topo → última etapa embaixo. Status fora do mapa vão para o fim.
const FLUXO_DJUD: Record<string, number> = {
  "Cadastro Demanda Judicial": 1,
  "Recebido": 2,
  "Em Análise COAJUD": 3,
  "Solicitado Parecer COMFAD": 4,
  "Analisado pela COMFAD": 5,
  "Pendente": 6,
  "Tramitado": 7,
  "Solicitado Cumprimento": 8,
  "Concluída": 9,
  // Trilha de Cumprimento
  "Solicitada Autorização": 10,
  "Deposito Cancelado": 11,
  "Retorno Divergência": 12,
  "Depósito Efetivado": 13,
};
const ordemFluxo = (status: string) => FLUXO_DJUD[status] ?? 999;

export async function getMetricsData(filters: MetricsFilterInput): Promise<MetricsData> {
  // WHERE clause Prisma ORM
  const where: Prisma.DemandaWhereInput = {};

  if (filters.startDate || filters.endDate) {
    where.criadoEm = {};
    if (filters.startDate) (where.criadoEm as any).gte = filters.startDate;
    if (filters.endDate)   (where.criadoEm as any).lte = filters.endDate;
  }
  if (filters.status)        where.status        = filters.status;
  if (filters.prioridade)    where.prioridade    = filters.prioridade;
  if (filters.principioAtivo)
    where.principioAtivo = { contains: filters.principioAtivo, mode: "insensitive" };
  if (filters.organizacaoId) where.organizacaoId = filters.organizacaoId;

  // WHERE clause para raw SQL
  const sqlConditions: Prisma.Sql[] = [];
  if (filters.startDate)     sqlConditions.push(Prisma.sql`"criadoEm" >= ${filters.startDate}`);
  if (filters.endDate)       sqlConditions.push(Prisma.sql`"criadoEm" <= ${filters.endDate}`);
  if (filters.status)        sqlConditions.push(Prisma.sql`status = ${filters.status}`);
  if (filters.prioridade)    sqlConditions.push(Prisma.sql`prioridade = ${filters.prioridade}`);
  if (filters.principioAtivo) sqlConditions.push(Prisma.sql`"principioAtivo" ILIKE ${`%${filters.principioAtivo}%`}`);
  if (filters.organizacaoId) sqlConditions.push(Prisma.sql`"organizacaoId" = ${filters.organizacaoId}`);

  const whereRaw = sqlConditions.length > 0
    ? Prisma.sql`WHERE ${Prisma.join(sqlConditions, " AND ")}`
    : Prisma.sql``;

  // WHERE específicos para as novas séries.
  // TRF válido = 1..6 (TRF1 a TRF6); valores fora disso são erros de digitação na base.
  const condTrfValido = Prisma.sql`"trfRegiao" BETWEEN 1 AND 6`;
  const condComValor  = Prisma.sql`"valorEstimado" IS NOT NULL`;
  const whereTribunal       = Prisma.sql`WHERE ${Prisma.join([...sqlConditions, condTrfValido], " AND ")}`;
  const whereValor          = Prisma.sql`WHERE ${Prisma.join([...sqlConditions, condComValor], " AND ")}`;
  const whereValorTribunal  = Prisma.sql`WHERE ${Prisma.join([...sqlConditions, condComValor, condTrfValido], " AND ")}`;
  const whereFornecedor     = Prisma.sql`WHERE ${Prisma.join([...sqlConditions, Prisma.sql`"fornecedor" IS NOT NULL`], " AND ")}`;

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
    tribunalTimelineRaw,
    valorTimelineRaw,
    valorTribunalTimelineRaw,
    topMedicamentosValorRaw,
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
      where: {
        ...where,
        // Mantém o filtro de busca (contains) quando ativo; caso contrário apenas exclui nulos
        principioAtivo: filters.principioAtivo
          ? { contains: filters.principioAtivo, mode: "insensitive" }
          : { not: null },
      },
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

    // ── NOVO (item 1.1): Série mensal decomposta por Tribunal (TRF 1..6) ───────
    db.$queryRaw<Array<{ mes: Date; trf: number | null; count: bigint }>>`
      SELECT DATE_TRUNC('month', "criadoEm") AS mes, "trfRegiao" AS trf, COUNT(*) AS count
      FROM "Demanda"
      ${whereTribunal}
      GROUP BY DATE_TRUNC('month', "criadoEm"), "trfRegiao"
      ORDER BY mes ASC
    `,

    // ── NOVO (item 2): Série mensal de VALOR total (R$) ───────────────────────
    db.$queryRaw<Array<{ mes: Date; valor: number }>>`
      SELECT DATE_TRUNC('month', "criadoEm") AS mes, SUM("valorEstimado")::float8 AS valor
      FROM "Demanda"
      ${whereValor}
      GROUP BY DATE_TRUNC('month', "criadoEm")
      ORDER BY mes ASC
    `,

    // ── NOVO (item 2): Série mensal de VALOR decomposta por Tribunal ──────────
    // Ficará vazio enquanto as demandas com valor não tiverem trfRegiao na base.
    db.$queryRaw<Array<{ mes: Date; trf: number | null; valor: number }>>`
      SELECT DATE_TRUNC('month', "criadoEm") AS mes, "trfRegiao" AS trf, SUM("valorEstimado")::float8 AS valor
      FROM "Demanda"
      ${whereValorTribunal}
      GROUP BY DATE_TRUNC('month', "criadoEm"), "trfRegiao"
      ORDER BY mes ASC
    `,

    // ── NOVO (item 3.1): Top 15 Princípios Ativos por VALOR total (R$) ────────
    db.$queryRaw<Array<{ medicamento: string | null; valor: number }>>`
      SELECT "principioAtivo" AS medicamento, SUM("valorEstimado")::float8 AS valor
      FROM "Demanda"
      ${whereValor}
      AND "principioAtivo" IS NOT NULL
      GROUP BY "principioAtivo"
      ORDER BY valor DESC
      LIMIT 15
    `,
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

  // Fornecedor — consulta resiliente em SQL bruto: a coluna "fornecedor" pode ainda não existir na base.
  // Mantida FORA do Promise.all e dentro de try/catch para que sua ausência não derrube as demais métricas.
  let fornecedorDistribution: Array<{ fornecedor: string | null; count: number }> = [];
  try {
    const fornecedorRows = await db.$queryRaw<Array<{ fornecedor: string | null; count: bigint }>>`
      SELECT "fornecedor", COUNT(*) AS count
      FROM "Demanda"
      ${whereFornecedor}
      GROUP BY "fornecedor"
      ORDER BY count DESC
      LIMIT 15
    `;
    fornecedorDistribution = fornecedorRows.map((r) => ({
      fornecedor: r.fornecedor,
      count:      Number(r.count),
    }));
  } catch {
    // Coluna "fornecedor" ainda não existe (ou base não populada) — segue como lista vazia.
  }

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
    fornecedorDistribution,

    // Tendência
    demandasTimeline: timelineRaw.map((r) => ({
      date:  r.month,
      count: Number(r.count),
    })),

    // Decomposição por tribunal (item 1.1)
    tribunalTimeline: tribunalTimelineRaw.map((r) => ({
      mes:   r.mes,
      trf:   r.trf,
      count: Number(r.count),
    })),

    // Séries de valores (itens 2 e 3.1)
    valorTimeline: valorTimelineRaw.map((r) => ({
      mes:   r.mes,
      valor: Number(r.valor) || 0,
    })),
    valorTribunalTimeline: valorTribunalTimelineRaw.map((r) => ({
      mes:   r.mes,
      trf:   r.trf,
      valor: Number(r.valor) || 0,
    })),
    topMedicamentosValor: topMedicamentosValorRaw.map((r) => ({
      medicamento: r.medicamento,
      valor:       Number(r.valor) || 0,
    })),

    // Gestão de riscos — ordenado pelo FLUXO de execução do DJUD (funil, item 4)
    statusDistribution: statusCounts
      .map((item) => ({
        status: item.status || "Sem status",
        count:  item._count.id,
      }))
      .sort((a, b) => ordemFluxo(a.status) - ordemFluxo(b.status)),
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
