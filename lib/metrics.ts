import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type { FiltroCatmat } from "@/lib/demandas-catmat";
import type { GrupoTermos } from "@/lib/substancia";
import { aplicarFiltro, sqlDemandas, whereDemandas, whereSelecao } from "@/lib/demandas-filtro";
import { STATUS_RESOLVIDOS, type FiltroDemandas } from "@/lib/demandas-filtro-tipos";

export interface MetricsData {
  // ── Indicadores principais ──────────────────────────────────────────────────
  totalDemandas:       number;
  demandasAtivas:      number;   // passivo de processos ativos (não resolvidos)
  demandasCriticas:    number;   // prioridade Alta + Crítica
  taxaResolucao:       number;
  totalValorEstimado:  number;
  demandasComValor:    number;   // processos com ao menos um pagamento SIAFI registrado

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
  // Valores financeiros vêm de sismat.SiafiPagamento (Valor OB) cruzado pelo nº do processo.
  // A série temporal usa Dt Pagto SIAFI como eixo de tempo.
  // valorTribunalTimeline usa trfRegiao da Demanda cruzado com o pagamento SIAFI.
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

  // ── Indicadores de Valor SIAFI — distribuições geográficas e operacionais ────
  // Calculadas pelo mesmo JOIN sismat."SiafiPagamento" × Demanda das séries de valor.
  valorPorRegiao: Array<{ regiao: string | null; valor: number }>;
  valorPorUF:     Array<{ uf: string | null; valor: number }>;    // top 15
  valorPorTrf:    Array<{ trf: number | null; valor: number }>;
  valorPorStatus: Array<{ status: string | null; valor: number }>;

  // ── Operacional ─────────────────────────────────────────────────────────────
  topResponsaveis:              Array<{ id: string; name: string | null; count: number }>;
  formaCumprimentoDistribution: Array<{ forma: string | null; count: number }>;
  areaFinalisticaDistribution:  Array<{ area: string | null; count: number }>;
  // ── Filtro por CATMAT / registro ANVISA ──────────────────────────────────────
  // A Demanda não guarda o código: ele é traduzido para substância(s) em
  // lib/demandas-catmat.ts. `null` quando não houve filtro por código; quando
  // houve e o código não resolveu, `encontrado` é false e as métricas vêm
  // zeradas — a tela mostra o motivo em vez de gráficos vazios sem explicação.
  filtroCatmat: FiltroCatmat | null;
  /** Radicais do medicamento digitado (B3), para a tela dizer o que filtrou. */
  medicamento: GrupoTermos | null;

  // ── Resumo do recorte (B3) ──────────────────────────────────────────────────
  demandasEncerradas: number;
  /** Demandas com "Cessar Atos" no Ponto de Controle (não é status: diagnóstico 3.1). */
  demandasCessarAtos: number;
  primeiraEntrada: Date | null;
  ultimaEntrada: Date | null;
}

export interface MetricsFilterInput {
  /** O filtro único das demandas (lib/demandas-filtro-tipos.ts) — o mesmo da lista. */
  filtro: FiltroDemandas;
  eixoDataValor?: "pagamento" | "processo";
}
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


/** Painel zerado — usado quando o código pesquisado não existe no catálogo. */
function metricsVazio(filtroCatmat: FiltroCatmat | null): MetricsData {
  return {
    totalDemandas: 0,
    demandasAtivas: 0,
    demandasCriticas: 0,
    taxaResolucao: 0,
    totalValorEstimado: 0,
    demandasComValor: 0,
    topMedicamentosDistribution: [],
    areaTematicaDistribution: [],
    objetoAcaoDistribution: [],
    fornecedorDistribution: [],
    demandasTimeline: [],
    tribunalTimeline: [],
    valorTimeline: [],
    valorTribunalTimeline: [],
    topMedicamentosValor: [],
    statusDistribution: [],
    prioridadeDistribution: [],
    regiaoBrasilDistribution: [],
    trfRegiaoDistribution: [],
    ufResidenciaDistribution: [],
    topResponsaveis: [],
    formaCumprimentoDistribution: [],
    areaFinalisticaDistribution: [],
    valorPorRegiao: [],
    valorPorUF: [],
    valorPorTrf: [],
    valorPorStatus: [],
    filtroCatmat,
    medicamento: null,
    demandasEncerradas: 0,
    demandasCessarAtos: 0,
    primeiraEntrada: null,
    ultimaEntrada: null,
  };
}

export async function getMetricsData(filters: MetricsFilterInput): Promise<MetricsData> {
  // Filtro único (lib/demandas-filtro.ts): o mesmo WHERE da lista de Demandas,
  // nas três formas — ORM, SQL e SQL com alias "d" para o JOIN com o SIAFI.
  // Antes, o CATMAT não chegava às consultas de valor e a lixeira entrava nas
  // contagens (diagnóstico 3.4).
  const aplicado = await aplicarFiltro(filters.filtro);
  if (aplicado.vazio) return metricsVazio(aplicado.catmat);

  const where = whereDemandas(aplicado);
  const e = (extra: Prisma.DemandaWhereInput): Prisma.DemandaWhereInput => ({ AND: [where, extra] });
  const cond = sqlDemandas(aplicado);
  const whereRaw = Prisma.sql`WHERE ${cond}`;

  // WHERE específicos para as novas séries.
  // TRF válido = 1..6 (TRF1 a TRF6); valores fora disso são erros de digitação na base.
  const whereTribunal = Prisma.sql`WHERE ${cond} AND "trfRegiao" BETWEEN 1 AND 6`;
  const whereFornecedor = Prisma.sql`WHERE ${cond} AND "fornecedor" IS NOT NULL`;

  // Condições com alias "d." para queries com JOIN sismat."SiafiPagamento"
  const condD = sqlDemandas(aplicado, "d");

  // JOIN SIAFI — cruza pelo nº do processo (dígitos puros)
  const SIAFI_JOIN = Prisma.sql`
    JOIN sismat."SiafiPagamento" p
      ON p."numeroProcesso" = regexp_replace(COALESCE(d."numeroProcesso", ''), '\\D', '', 'g')
  `;
  const whereSiafiBase = Prisma.sql`WHERE ${condD}`;
  const whereSiafiTribunal = Prisma.sql`WHERE ${condD} AND d."trfRegiao" BETWEEN 1 AND 6`;

  // ── Todas as queries em paralelo — ZERO findMany ────────────────────────────
  const [
    totalCount,
    resolvedCount,
    ativasCount,
    criticasCount,
    totalValueRows,
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
    demandasComValorRows,
    valorPorRegiaoRaw,
    valorPorUFRaw,
    valorPorTrfRaw,
    valorPorStatusRaw,
  ] = await Promise.all([
    // Total de processos
    db.demanda.count({ where }),

    // Resolvidos
    db.demanda.count({ where: e({ status: { in: STATUS_RESOLVIDOS } }) }),

    // Passivo ativo (não resolvidos) — o mesmo critério do atalho "Ativos" do filtro.
    db.demanda.count({ where: e(whereSelecao("status", { incluir: [], excluir: STATUS_RESOLVIDOS })) }),

    // Demandas críticas (risco elevado)
    db.demanda.count({ where: e({ prioridade: { in: PRIORIDADES_RISCO } }) }),

    // Valor pago total — via SIAFI (soma dos Valores OB por processo)
    db.$queryRaw<Array<{ valor: number }>>`
      SELECT COALESCE(SUM(p."valorOB"), 0)::float8 AS valor
      FROM "Demanda" d
      ${SIAFI_JOIN}
      ${whereSiafiBase}
    `,

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
      where: e({ ufResidencia: { not: null } }),
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 15,
    }),

    // Forma de cumprimento
    db.demanda.groupBy({ by: ["formaCumprimento"], where, _count: { id: true } }),

    // Grupo Temático — top 10
    db.demanda.groupBy({
      by: ["areaTematica"],
      where: e({ areaTematica: { not: null } }),
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    }),

    // Área Finálistica MS
    db.demanda.groupBy({ by: ["areaFinalisticaMs"], where, _count: { id: true } }),

    // Região do Brasil
    db.demanda.groupBy({
      by: ["regiaoBrasil"],
      where: e({ regiaoBrasil: { not: null } }),
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    }),

    // Top 10 responsáveis
    db.demanda.groupBy({
      by: ["responsavelId"],
      where: e({ responsavelId: { not: null } }),
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    }),

    // ── NOVO: Top 15 Princípios Ativos / Medicamentos ─────────────────────────
    // Pilar de dimensionamento: quais medicamentos e em qual volume
    db.demanda.groupBy({
      by: ["principioAtivo"],
      where: e({ principioAtivo: { not: null } }),
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 15,
    }),

    // ── NOVO: Objeto da Ação (tipo de medicamento) ────────────────────────────
    db.demanda.groupBy({
      by: ["objetoAcao"],
      where: e({ objetoAcao: { not: null } }),
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

    // ── NOVO (item 2): Série mensal de VALOR pago (Dt Pagto SIAFI) ─────────────
    (() => {
      if (filters.eixoDataValor === "processo") {
        return db.$queryRaw<Array<{ mes: Date; valor: number }>>`
          SELECT DATE_TRUNC('month', d."criadoEm") AS mes, SUM(p."valorOB")::float8 AS valor
          FROM "Demanda" d
          ${SIAFI_JOIN}
          ${whereSiafiBase}
          GROUP BY DATE_TRUNC('month', d."criadoEm")
          ORDER BY mes ASC
        `;
      }
      return db.$queryRaw<Array<{ mes: Date; valor: number }>>`
        SELECT DATE_TRUNC('month', p."dtPagtoSiafi") AS mes, SUM(p."valorOB")::float8 AS valor
        FROM "Demanda" d
        ${SIAFI_JOIN}
        ${whereSiafiBase}
          AND p."dtPagtoSiafi" IS NOT NULL
        GROUP BY DATE_TRUNC('month', p."dtPagtoSiafi")
        ORDER BY mes ASC
      `;
    })(),

    // ── NOVO (item 2): Série mensal de VALOR pago decomposta por Tribunal ────────
    (() => {
      if (filters.eixoDataValor === "processo") {
        return db.$queryRaw<Array<{ mes: Date; trf: number | null; valor: number }>>`
          SELECT DATE_TRUNC('month', d."criadoEm") AS mes, d."trfRegiao" AS trf, SUM(p."valorOB")::float8 AS valor
          FROM "Demanda" d
          ${SIAFI_JOIN}
          ${whereSiafiTribunal}
          GROUP BY DATE_TRUNC('month', d."criadoEm"), d."trfRegiao"
          ORDER BY mes ASC
        `;
      }
      return db.$queryRaw<Array<{ mes: Date; trf: number | null; valor: number }>>`
        SELECT DATE_TRUNC('month', p."dtPagtoSiafi") AS mes, d."trfRegiao" AS trf, SUM(p."valorOB")::float8 AS valor
        FROM "Demanda" d
        ${SIAFI_JOIN}
        ${whereSiafiTribunal}
          AND p."dtPagtoSiafi" IS NOT NULL
        GROUP BY DATE_TRUNC('month', p."dtPagtoSiafi"), d."trfRegiao"
        ORDER BY mes ASC
      `;
    })(),

    // ── NOVO (item 3.1): Top 15 Princípios Ativos por VALOR pago (SIAFI) ────────
    db.$queryRaw<Array<{ medicamento: string | null; valor: number }>>`
      SELECT d."principioAtivo" AS medicamento, SUM(p."valorOB")::float8 AS valor
      FROM "Demanda" d
      ${SIAFI_JOIN}
      ${whereSiafiBase}
        AND d."principioAtivo" IS NOT NULL
      GROUP BY d."principioAtivo"
      ORDER BY valor DESC
      LIMIT 15
    `,

    // ── Processos com ao menos um pagamento SIAFI registrado (cobertura) ────────
    db.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT d.id)::bigint AS count
      FROM "Demanda" d
      ${SIAFI_JOIN}
      ${whereSiafiBase}
    `,

    // ── Valor pago por região do Brasil ────────────────────────────────────────
    db.$queryRaw<Array<{ regiao: string | null; valor: number }>>`
      SELECT d."regiaoBrasil" AS regiao, SUM(p."valorOB")::float8 AS valor
      FROM "Demanda" d
      ${SIAFI_JOIN}
      ${whereSiafiBase}
        AND d."regiaoBrasil" IS NOT NULL
      GROUP BY d."regiaoBrasil"
      ORDER BY valor DESC
    `,

    // ── Valor pago por UF de residência (top 15) ────────────────────────────────
    db.$queryRaw<Array<{ uf: string | null; valor: number }>>`
      SELECT d."ufResidencia" AS uf, SUM(p."valorOB")::float8 AS valor
      FROM "Demanda" d
      ${SIAFI_JOIN}
      ${whereSiafiBase}
        AND d."ufResidencia" IS NOT NULL
      GROUP BY d."ufResidencia"
      ORDER BY valor DESC
      LIMIT 15
    `,

    // ── Valor pago por TRF Região ────────────────────────────────────────────────
    db.$queryRaw<Array<{ trf: number | null; valor: number }>>`
      SELECT d."trfRegiao" AS trf, SUM(p."valorOB")::float8 AS valor
      FROM "Demanda" d
      ${SIAFI_JOIN}
      ${whereSiafiBase}
        AND d."trfRegiao" BETWEEN 1 AND 6
      GROUP BY d."trfRegiao"
      ORDER BY valor DESC
    `,

    // ── Valor pago por status do processo ────────────────────────────────────────
    db.$queryRaw<Array<{ status: string | null; valor: number }>>`
      SELECT d.status, SUM(p."valorOB")::float8 AS valor
      FROM "Demanda" d
      ${SIAFI_JOIN}
      ${whereSiafiBase}
      GROUP BY d.status
      ORDER BY valor DESC
    `,
  ]);

  // Resumo do recorte (B3): primeira e última entrada e Cessar Atos — este é
  // item do Ponto de Controle, não status (diagnóstico 3.1).
  const [datasEntrada, cessarAtosCount] = await Promise.all([
    db.demanda.aggregate({ where, _min: { dataEntradaDJUD: true }, _max: { dataEntradaDJUD: true } }),
    db.demanda.count({ where: e(whereSelecao("pontoControle", { incluir: ["Cessar Atos"], excluir: [] })) }),
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
  const totalValorEstimado = (totalValueRows[0]?.valor as number | null | undefined) ?? 0;
  const demandasComValor   = Number(demandasComValorRows[0]?.count ?? 0);
  const taxaResolucao      = totalDemandas > 0 ? (resolvedCount / totalDemandas) * 100 : 0;

  return {
    // Indicadores principais
    totalDemandas,
    demandasAtivas:     ativasCount,
    demandasCriticas:   criticasCount,
    taxaResolucao:      Math.round(taxaResolucao * 100) / 100,
    totalValorEstimado,
    demandasComValor,

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

    // Distribuições de valor SIAFI
    valorPorRegiao: valorPorRegiaoRaw.map((r) => ({ regiao: r.regiao, valor: Number(r.valor) || 0 })),
    valorPorUF:     valorPorUFRaw.map((r)     => ({ uf: r.uf,         valor: Number(r.valor) || 0 })),
    valorPorTrf:    valorPorTrfRaw.map((r)    => ({ trf: r.trf,       valor: Number(r.valor) || 0 })),
    valorPorStatus: valorPorStatusRaw.map((r) => ({ status: r.status, valor: Number(r.valor) || 0 })),

    filtroCatmat: aplicado.catmat,
    medicamento: aplicado.medicamento,
    demandasEncerradas: resolvedCount,
    demandasCessarAtos: cessarAtosCount,
    primeiraEntrada: datasEntrada._min.dataEntradaDJUD,
    ultimaEntrada: datasEntrada._max.dataEntradaDJUD,
  };
}
