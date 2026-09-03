"use client";

import { useQuery } from "@tanstack/react-query";
import { apiPath } from "@/lib/url";
import type { PrecosOverviewData, PrecosSerieData } from "@/lib/precos-metrics";

/**
 * Visão geral da base de preços praticados (ComprasGov): combos do combobox,
 * cards de resumo e ranking de maior variação. Cache longo (1h): base
 * histórica de referência, muda apenas em novas importações.
 */
export function usePrecosOverview() {
  return useQuery<PrecosOverviewData>({
    queryKey: ["precos-overview"],
    queryFn: async () => {
      const res = await fetch(apiPath("/api/precos/overview"));
      if (!res.ok) {
        throw new Error("Erro ao carregar a visão geral de preços");
      }
      return res.json();
    },
    // 30s: revalidação é um 304 barato (ETag por versão do dado em
    // lib/data-version.ts), então import novo aparece quase de imediato.
    staleTime: 30 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
  });
}

/**
 * Todas as compras de UM combo (medicamento × unidade). Cada combo é cacheado
 * separadamente pela queryKey; agrupamento e outliers são resolvidos no cliente.
 */
export function usePrecosSerie(material: string, unidade: string) {
  return useQuery<PrecosSerieData>({
    queryKey: ["precos-serie", material, unidade],
    queryFn: async () => {
      const params = new URLSearchParams({ material, unidade });
      const res = await fetch(apiPath(`/api/precos/serie?${params.toString()}`));
      if (!res.ok) {
        throw new Error("Erro ao carregar a série de preços do medicamento");
      }
      return res.json();
    },
    enabled: !!material && !!unidade,
    // 30s: revalidação é um 304 barato (ETag por versão do dado em
    // lib/data-version.ts), então import novo aparece quase de imediato.
    staleTime: 30 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
  });
}
