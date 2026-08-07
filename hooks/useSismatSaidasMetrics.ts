"use client";

import { useQuery } from "@tanstack/react-query";
import type {
  SismatSaidasMetricsData,
  SismatSaidasDimensao,
} from "@/lib/sismat-saidas-metrics";
import type { SismatPeriodo } from "@/lib/sismat-metrics";

export function useSismatSaidasMetrics(
  dimension: SismatSaidasDimensao,
  period: SismatPeriodo
) {
  return useQuery<SismatSaidasMetricsData>({
    queryKey: ["sismat-saidas-metrics", dimension, period],
    queryFn: async () => {
      const params = new URLSearchParams({ dimension, period });
      const res = await fetch(`/api/sismat/saidas/metrics?${params.toString()}`);
      if (!res.ok) throw new Error("Erro ao carregar métricas de saídas SISMAT");
      return res.json();
    },
    staleTime: 60 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
  });
}
