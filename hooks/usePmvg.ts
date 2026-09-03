"use client";

import { useQuery } from "@tanstack/react-query";
import type { PmvgData } from "@/lib/pmvg-metrics";

/**
 * Base SISMAT × PMVG completa (compras pareadas + colunas de alíquota + meta).
 * Base pequena (~1,3 mil linhas): uma única consulta serve a sub-aba inteira;
 * filtros, matemática pago-vs-PMVG e estatísticas por alíquota rodam no cliente.
 * Cache longo (1h) — base histórica de referência, muda só em novas importações.
 */
export function usePmvgData() {
  return useQuery<PmvgData>({
    queryKey: ["pmvg-data"],
    queryFn: async () => {
      const res = await fetch("/api/pmvg");
      if (!res.ok) {
        throw new Error("Erro ao carregar a base SISMAT × PMVG");
      }
      return res.json();
    },
    // 30s: revalidação é um 304 barato (ETag por versão do dado em
    // lib/data-version.ts), então import novo aparece quase de imediato.
    staleTime: 30 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
  });
}
