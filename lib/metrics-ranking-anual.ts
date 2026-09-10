import { db } from "@/lib/db";
import {
  resolverFiltroCatmat,
  sqlDemandaPorCatmat,
  type FiltroCatmat,
} from "@/lib/demandas-catmat";
import type { MetricsFilterInput } from "@/lib/metrics";
import { Prisma } from "@prisma/client";

// ─────────────────────────────────────────────────────────────────────────────
// Rankings em série anual — a mesma pergunta do painel ("quais os maiores?"),
// respondida ano a ano em vez de uma vez só para o período inteiro.
//
// Um Top 15 acumulado esconde movimento: um medicamento que explodiu no último
// ano e outro que caiu pela metade aparecem lado a lado, com totais parecidos.
// Aqui o corte do Top N continua sendo pelo TOTAL do período (senão a lista
// mudaria de composição a cada coluna e a comparação perderia sentido), mas
// cada linha traz a distribuição por ano e a variação entre o primeiro e o
// último ano com dados.
//
// Vive fora de lib/metrics.ts e tem rota própria porque são sete agregações
// adicionais: só são calculadas quando o usuário liga o modo de comparação.
//
// O ano é o de `criadoEm`, o mesmo eixo das séries mensais do painel — usar
// `dataEntradaDJUD` aqui e `criadoEm` lá daria dois "2025" diferentes.
// ─────────────────────────────────────────────────────────────────────────────

/** Quantas categorias entram em cada ranking. */
const TOP_N = 15;

export type DimensaoRanking =
  | "medicamento"
  | "medicamentoValor"
  | "areaTematica"
  | "objetoAcao"
  | "uf"
  | "trf"
  | "fornecedor";

/** Coluna da Demanda que dá a categoria de cada dimensão. */
const COLUNA: Record<DimensaoRanking, string> = {
  medicamento: "principioAtivo",
  medicamentoValor: "principioAtivo",
  areaTematica: "areaTematica",
  objetoAcao: "objetoAcao",
  uf: "ufResidencia",
  trf: "trfRegiao",
  fornecedor: "fornecedor",
};

export const ROTULO_DIMENSAO: Record<DimensaoRanking, string> = {
  medicamento: "Princípios ativos (nº de processos)",
  medicamentoValor: "Princípios ativos (valor em R$)",
  areaTematica: "Grupos temáticos",
  objetoAcao: "Objetos da ação",
  uf: "UFs de residência",
  trf: "Tribunais (TRF)",
  fornecedor: "Fornecedores do medicamento",
};

/** Dimensões medidas em R$; as demais contam processos. */
const EM_REAIS: DimensaoRanking[] = ["medicamentoValor"];

export function unidadeDaDimensao(d: DimensaoRanking): "processos" | "reais" {
  return EM_REAIS.includes(d) ? "reais" : "processos";
}

export interface LinhaRanking {
  categoria: string;
  /** Soma no período inteiro — define a ordem e o corte do Top N. */
  total: number;
  /** ano → valor (contagem ou R$). Anos sem ocorrência ficam ausentes. */
  porAno: Record<number, number>;
  /** Variação % entre o primeiro e o último ano com dados; null se só há um. */
  variacao: number | null;
}

export interface RankingAnual {
  dimensao: DimensaoRanking;
  rotulo: string;
  unidade: "processos" | "reais";
  linhas: LinhaRanking[];
}

export interface RankingAnualData {
  /** Anos presentes no recorte, em ordem crescente — eixo dos gráficos. */
  anos: number[];
  rankings: RankingAnual[];
  filtroCatmat: FiltroCatmat | null;
}

interface LinhaBruta {
  categoria: string | null;
  ano: number | null;
  total: number | null;
}

/** Condições comuns a todas as agregações, na mesma ordem de lib/metrics.ts. */
function condicoes(filters: MetricsFilterInput, filtroCatmat: FiltroCatmat | null): Prisma.Sql[] {
  const cond: Prisma.Sql[] = [];
  if (filtroCatmat) cond.push(sqlDemandaPorCatmat(filtroCatmat));
  if (filters.startDate) cond.push(Prisma.sql`"criadoEm" >= ${filters.startDate}`);
  if (filters.endDate) cond.push(Prisma.sql`"criadoEm" <= ${filters.endDate}`);
  if (filters.status) cond.push(Prisma.sql`status = ${filters.status}`);
  if (filters.prioridade) cond.push(Prisma.sql`prioridade = ${filters.prioridade}`);
  if (filters.principioAtivo) {
    cond.push(Prisma.sql`"principioAtivo" ILIKE ${`%${filters.principioAtivo}%`}`);
  }
  if (filters.organizacaoId) cond.push(Prisma.sql`"organizacaoId" = ${filters.organizacaoId}`);
  return cond;
}

function montarRanking(dimensao: DimensaoRanking, linhas: LinhaBruta[]): RankingAnual {
  const porCategoria = new Map<string, { total: number; porAno: Record<number, number> }>();

  for (const l of linhas) {
    const categoria = (l.categoria ?? "").trim();
    const valor = Number(l.total) || 0;
    if (!categoria || l.ano == null || valor === 0) continue;
    const atual = porCategoria.get(categoria) ?? { total: 0, porAno: {} };
    atual.total += valor;
    atual.porAno[l.ano] = (atual.porAno[l.ano] ?? 0) + valor;
    porCategoria.set(categoria, atual);
  }

  const linhasRanking: LinhaRanking[] = Array.from(porCategoria.entries())
    .map(([categoria, d]) => {
      const anos = Object.keys(d.porAno).map(Number).sort((a, b) => a - b);
      const primeiro = d.porAno[anos[0]];
      const ultimo = d.porAno[anos[anos.length - 1]];
      return {
        categoria,
        total: d.total,
        porAno: d.porAno,
        // Sem base positiva não há variação percentual a declarar — melhor
        // null do que um "+∞%" que ninguém sabe interpretar no relatório.
        variacao: anos.length > 1 && primeiro > 0 ? ((ultimo - primeiro) / primeiro) * 100 : null,
      };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, TOP_N);

  return {
    dimensao,
    rotulo: ROTULO_DIMENSAO[dimensao],
    unidade: unidadeDaDimensao(dimensao),
    linhas: linhasRanking,
  };
}

export async function getRankingAnual(filters: MetricsFilterInput): Promise<RankingAnualData> {
  const codigo = filters.catmat?.trim() ?? "";
  const filtroCatmat = codigo ? await resolverFiltroCatmat(codigo) : null;
  if (filtroCatmat && !filtroCatmat.encontrado) {
    return { anos: [], rankings: [], filtroCatmat };
  }

  const base = condicoes(filters, filtroCatmat);

  const consultar = async (dimensao: DimensaoRanking): Promise<LinhaBruta[]> => {
    const coluna = COLUNA[dimensao];
    // Nome de coluna vem do mapa COLUNA (literais deste arquivo), nunca do
    // usuário; os valores de filtro seguem parametrizados em `base`.
    const col = Prisma.raw(`"${coluna}"`);
    const emReais = unidadeDaDimensao(dimensao) === "reais";

    const cond = [...base, Prisma.sql`${col} IS NOT NULL`];
    if (emReais) cond.push(Prisma.sql`"valorEstimado" IS NOT NULL`);

    const rows = await db.$queryRaw<LinhaBruta[]>`
      SELECT ${col}::text AS categoria,
             EXTRACT(YEAR FROM "criadoEm")::int AS ano,
             ${emReais ? Prisma.sql`SUM("valorEstimado")::float8` : Prisma.sql`COUNT(*)::float8`} AS total
        FROM "Demanda"
       WHERE ${Prisma.join(cond, " AND ")}
       GROUP BY 1, 2
    `;
    return rows;
  };

  const dimensoes = Object.keys(COLUNA) as DimensaoRanking[];
  const resultados = await Promise.all(dimensoes.map(consultar));

  const anos = new Set<number>();
  for (const linhas of resultados) {
    for (const l of linhas) if (l.ano != null) anos.add(l.ano);
  }

  return {
    anos: Array.from(anos).sort((a, b) => a - b),
    rankings: dimensoes.map((d, i) => montarRanking(d, resultados[i])),
    filtroCatmat,
  };
}
