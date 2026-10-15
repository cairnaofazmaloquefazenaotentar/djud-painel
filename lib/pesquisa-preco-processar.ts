import { pesquisarPrecos, type ParametrosPesquisa, type ResultadoPesquisa } from "@/lib/pesquisa-preco";

// ─────────────────────────────────────────────────────────────────────────────
// Pesquisa de vários itens com concorrência limitada — a apuração que o
// relatório da cesta faz na emissão, em HTML ou no mapa XLSX da DLOG.
//
// Cada item refaz `pesquisarPrecos` na data de emissão (o preço que instrui o
// processo é o do dia do documento, não o snapshot guardado na cesta). Uma
// falha num item não derruba os outros: ele sai com `resultado: null` e o
// relatório o declara como não localizado.
// ─────────────────────────────────────────────────────────────────────────────

export const CONCORRENCIA_PESQUISA = 4;

export interface ItemProcessado<T> {
  item: T;
  resultado: ResultadoPesquisa | null;
}

export async function processarItens<T>(
  itens: T[],
  parametros: (item: T) => ParametrosPesquisa,
  concorrencia = CONCORRENCIA_PESQUISA
): Promise<Array<ItemProcessado<T>>> {
  const saida: Array<ItemProcessado<T>> = new Array(itens.length);
  let cursor = 0;

  async function worker() {
    for (;;) {
      const i = cursor;
      cursor += 1;
      if (i >= itens.length) return;
      let resultado: ResultadoPesquisa | null = null;
      try {
        resultado = await pesquisarPrecos(parametros(itens[i]));
      } catch (error) {
        console.error("[pesquisa-preco] falha ao pesquisar item", i + 1, error);
      }
      saida[i] = { item: itens[i], resultado };
    }
  }

  await Promise.all(Array.from({ length: Math.min(concorrencia, itens.length) }, () => worker()));
  return saida;
}
