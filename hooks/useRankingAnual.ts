"use client";

import { useQuery } from "@tanstack/react-query";
import { paramsDeMetrics, type UseMetricsOptions } from "@/hooks/useMetrics";
import type { RankingAnualData } from "@/lib/metrics-ranking-anual";

/**
 * Rankings do painel abertos em série anual. Consulta separada de useMetrics
 * porque são sete agregações a mais: só dispara quando a tela liga o modo de
 * comparação (`enabled`).
 */
export function useRankingAnual(options: UseMetricsOptions = {}, enabled = true) {
  return useQuery<RankingAnualData>({
    queryKey: [
      "metrics-ranking-anual",
      {
        startDate: options.startDate?.toISOString(),
        endDate: options.endDate?.toISOString(),
        status: options.status,
        prioridade: options.prioridade,
        principioAtivo: options.principioAtivo,
        organizacaoId: options.organizacaoId,
        catmat: options.catmat,
      },
    ],
    queryFn: async () => {
      const params = paramsDeMetrics(options);
      const res = await fetch(`/api/demandas/metrics/ranking-anual?${params.toString()}`);
      if (!res.ok) throw new Error("Erro ao carregar o ranking anual");
      return res.json();
    },
    enabled,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}
