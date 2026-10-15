"use client";

import { useQuery } from "@tanstack/react-query";
import { MetricsData } from "@/lib/metrics";
import { filtroParaQuery, type FiltroDemandas } from "@/lib/demandas-filtro-tipos";
import { apiPath } from "@/lib/url";

/**
 * Query string comum ao painel, à lista e às exportações: o filtro único
 * (lib/demandas-filtro-tipos.ts) — mesma leitura, mesmo recorte.
 */
export function paramsDeMetrics(filtro: FiltroDemandas): URLSearchParams {
  return filtroParaQuery(filtro);
}

export function useMetrics(filtro: FiltroDemandas, eixoDataValor?: "pagamento" | "processo") {
  const qs = paramsDeMetrics(filtro);
  if (eixoDataValor) qs.set("eixoDataValor", eixoDataValor);
  const chave = qs.toString();

  return useQuery<MetricsData>({
    queryKey: ["metrics", chave],
    queryFn: async ({ signal }) => {
      const response = await fetch(apiPath(`/api/demandas/metrics?${chave}`), { signal });
      if (!response.ok) {
        const d = await response.json().catch(() => ({}));
        throw new Error(d?.error || "Erro ao carregar métricas");
      }
      return response.json();
    },
    // Sem keepPreviousData de propósito: número do filtro anterior na tela,
    // mesmo por um instante, seria lido como resultado do filtro novo.
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}
