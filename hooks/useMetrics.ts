"use client";

import { useQuery } from "@tanstack/react-query";
import { MetricsData } from "@/lib/metrics";

interface UseMetricsOptions {
  startDate?: Date;
  endDate?: Date;
  status?: string;
  prioridade?: string;
  organizacaoId?: string;
}

export function useMetrics(options: UseMetricsOptions = {}) {
  const query = useQuery<MetricsData>({
    queryKey: ["metrics", options],
    queryFn: async () => {
      const params = new URLSearchParams();

      if (options.startDate) {
        params.append("startDate", options.startDate.toISOString());
      }
      if (options.endDate) {
        params.append("endDate", options.endDate.toISOString());
      }
      if (options.status) {
        params.append("status", options.status);
      }
      if (options.prioridade) {
        params.append("prioridade", options.prioridade);
      }
      if (options.organizacaoId) {
        params.append("organizacaoId", options.organizacaoId);
      }

      const response = await fetch(`/api/demandas/metrics?${params.toString()}`);

      if (!response.ok) {
        throw new Error("Erro ao carregar métricas");
      }

      return response.json();
    },
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

  return query;
}
