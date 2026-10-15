import { db } from "@/lib/db";

// ─────────────────────────────────────────────────────────────────────────────
// Situação das coletas de dados abertos de um CATMAT — o que a pesquisa precisa
// saber para escolher a origem (API ou base carregada) e avisar quando a coleta
// venceu (P19: válida por 7 dias). Separado de coleta.ts para a pesquisa não
// importar o cliente HTTP.
// ─────────────────────────────────────────────────────────────────────────────

export type OrigemColeta = "COMPRASGOV" | "BPS" | "ARP_ITEM";

export const ORIGENS_COLETA: OrigemColeta[] = ["COMPRASGOV", "BPS", "ARP_ITEM"];

/** P19: depois disso a pesquisa oferece "Atualizar". */
export const VALIDADE_COLETA_DIAS = 7;

export interface SituacaoColeta {
  origem: OrigemColeta;
  /** Registros gravados para o CATMAT (coleta pelo painel ou carga do extrator). */
  registros: number;
  /** Fim da última coleta concluída (OK ou PARCIAL); null = nunca coletado. */
  coletadoEm: string | null;
  status: string | null;
  /** Coleta concluída há menos de VALIDADE_COLETA_DIAS. */
  valida: boolean;
  origemCarga: string | null;
}

export interface SituacaoColetas {
  /** As tabelas ainda não existem (create_dadosabertos_tables.py não rodou). */
  indisponivel: boolean;
  porOrigem: Record<OrigemColeta, SituacaoColeta>;
}

function vazia(origem: OrigemColeta): SituacaoColeta {
  return { origem, registros: 0, coletadoEm: null, status: null, valida: false, origemCarga: null };
}

export async function situacaoColetas(catmat: string): Promise<SituacaoColetas> {
  const porOrigem = Object.fromEntries(ORIGENS_COLETA.map((o) => [o, vazia(o)])) as Record<OrigemColeta, SituacaoColeta>;
  try {
    const [contagens, coletas] = await Promise.all([
      db.dadosAbertosPreco.groupBy({ by: ["origem"], where: { codigoCatmat: catmat }, _count: { _all: true } }),
      db.dadosAbertosColeta.findMany({
        where: { codigoCatmat: catmat, status: { in: ["OK", "PARCIAL"] } },
        orderBy: { concluidoEm: "desc" },
        take: 20,
      }),
    ]);
    for (const c of contagens) {
      if (c.origem in porOrigem) porOrigem[c.origem as OrigemColeta].registros = c._count._all;
    }
    const limite = Date.now() - VALIDADE_COLETA_DIAS * 86_400_000;
    for (const c of coletas) {
      const s = porOrigem[c.origem as OrigemColeta];
      if (!s || s.coletadoEm || !c.concluidoEm) continue;
      s.coletadoEm = c.concluidoEm.toISOString();
      s.status = c.status;
      s.valida = c.concluidoEm.getTime() >= limite;
      s.origemCarga = c.origemCarga;
    }
    return { indisponivel: false, porOrigem };
  } catch (error) {
    console.warn("[dados-abertos] situação indisponível:", (error as Error).message);
    return { indisponivel: true, porOrigem };
  }
}
