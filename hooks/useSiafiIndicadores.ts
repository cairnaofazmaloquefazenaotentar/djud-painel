"use client";

import { useQuery } from "@tanstack/react-query";
import type {
  SiafiIndicadoresOverview,
  SiafiIndicadoresTabela,
  SiafiIndicadoresFiltros,
} from "@/lib/siafi-indicadores-metrics";

/**
 * Agregados globais do cruzamento Demanda × SiafiPagamento:
 * KPIs, rankings CRM/OAB, distribuições e opções de filtro.
 */
export function useSiafiIndicadoresOverview() {
  return useQuery<SiafiIndicadoresOverview>({
    queryKey: ["siafi-indicadores-overview"],
    queryFn: async () => {
      const res = await fetch("/api/siafi/indicadores");
      if (!res.ok) {
        throw new Error("Erro ao carregar os indicadores de valor SIAFI");
      }
      return res.json();
    },
    staleTime: 30 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
  });
}

/**
 * KPIs filtrados + primeiras 500 linhas da tabela, conforme os filtros ativos.
 */
export function useSiafiIndicadoresTabela(filtros: SiafiIndicadoresFiltros) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filtros)) {
    if (v) params.set(k, v);
  }
  const qs = params.toString();

  return useQuery<SiafiIndicadoresTabela>({
    queryKey: ["siafi-indicadores-tabela", qs],
    queryFn: async () => {
      const res = await fetch(`/api/siafi/indicadores/tabela${qs ? `?${qs}` : ""}`);
      if (!res.ok) {
        throw new Error("Erro ao filtrar os indicadores de valor SIAFI");
      }
      return res.json();
    },
    placeholderData: (prev) => prev,
    staleTime: 30 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
