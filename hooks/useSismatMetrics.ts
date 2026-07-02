"use client";

import { useQuery } from "@tanstack/react-query";
import type { SismatMetricsData, SismatDimensao, SismatPeriodo } from "@/lib/sismat-metrics";

/**
 * Carrega as métricas de gasto SISMAT para uma (dimensão × período).
 * Cache longo (1h): a base é de referência e muda pouco. Cada combinação
 * de dimensão/período é cacheada separadamente pela queryKey.
 */
export function useSismatMetrics(dimension: SismatDimensao, period: SismatPeriodo) {
  return useQuery<SismatMetricsData>({
    queryKey: ["sismat-metrics", dimension, period],
    queryFn: async () => {
      const params = new URLSearchParams({ dimension, period });
      const res = await fetch(`/api/sismat/metrics?${params.toString()}`);
      if (!res.ok) {
        throw new Error("Erro ao carregar métricas SISMAT");
      }
      return res.json();
    },
    staleTime: 60 * 60 * 1000, // 1 hora
    gcTime: 2 * 60 * 60 * 1000,
  });
}
