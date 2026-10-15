"use client";

import { useQuery } from "@tanstack/react-query";
import { paramsDeMetrics } from "@/hooks/useMetrics";
import type { FiltroDemandas } from "@/lib/demandas-filtro-tipos";
import type { RankingAnualData } from "@/lib/metrics-ranking-anual";
import { apiPath } from "@/lib/url";

/**
 * Rankings do painel abertos em série anual. Consulta separada de useMetrics
 * porque são sete agregações a mais: só dispara quando a tela liga o modo de
 * comparação (`enabled`).
 */
export function useRankingAnual(filtro: FiltroDemandas, enabled = true) {
  const chave = paramsDeMetrics(filtro).toString();
  return useQuery<RankingAnualData>({
    queryKey: ["metrics-ranking-anual", chave],
    queryFn: async ({ signal }) => {
      const res = await fetch(apiPath(`/api/demandas/metrics/ranking-anual?${chave}`), { signal });
      if (!res.ok) throw new Error("Erro ao carregar o ranking anual");
      return res.json();
    },
    enabled,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}
