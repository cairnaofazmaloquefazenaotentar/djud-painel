import { db } from "@/lib/db";
import type { IndicesIpca } from "@/lib/ipca";

// ─────────────────────────────────────────────────────────────────────────────
// Leitura da tabela IndiceIpca (carregada por scripts/import_ipca.py). Guarda
// por 10 minutos no processo: a tabela muda uma vez por mês. Sem a tabela, a
// pesquisa segue sem correção e avisa.
// ─────────────────────────────────────────────────────────────────────────────

export interface TabelaIpca {
  indices: IndicesIpca;
  /** Variação mensal (%) por mês, para a aba de índices do mapa. */
  variacoes: Map<string, number | null>;
  disponivel: boolean;
}

let cache: { em: number; tabela: TabelaIpca } | null = null;
const VALIDADE_MS = 10 * 60 * 1000;

export async function carregarIpca(): Promise<TabelaIpca> {
  if (cache && Date.now() - cache.em < VALIDADE_MS) return cache.tabela;
  try {
    const linhas = await db.indiceIpca.findMany({ orderBy: { competencia: "asc" } });
    const indices: IndicesIpca = new Map();
    const variacoes = new Map<string, number | null>();
    for (const l of linhas) {
      const mes = l.competencia.toISOString().slice(0, 7);
      indices.set(mes, l.numeroIndice);
      variacoes.set(mes, l.variacaoMensal);
    }
    const tabela = { indices, variacoes, disponivel: indices.size > 0 };
    cache = { em: Date.now(), tabela };
    return tabela;
  } catch (error) {
    console.warn("[ipca] tabela indisponível:", (error as Error).message);
    return { indices: new Map(), variacoes: new Map(), disponivel: false };
  }
}
