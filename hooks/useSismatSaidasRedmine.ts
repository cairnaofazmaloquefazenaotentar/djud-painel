"use client";

import { useQuery } from "@tanstack/react-query";
import type {
  SaidasRedmineOverview,
  SaidasRedmineTabela,
  SaidasRedmineFiltros,
} from "@/lib/sismat-saidas-redmine-metrics";

/**
 * Agregados globais do cruzamento Saídas SISMAT × Redmine (gráficos estáticos
 * + opções de filtro). Cache longo (1h): base de referência, muda pouco.
 */
export function useSaidasRedmineOverview() {
  return useQuery<SaidasRedmineOverview>({
    queryKey: ["sismat-saidas-redmine-overview"],
    queryFn: async () => {
      const res = await fetch("/api/sismat/saidas/redmine");
      if (!res.ok) {
        throw new Error("Erro ao carregar o cruzamento Saídas × Redmine");
      }
      return res.json();
    },
    staleTime: 60 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
  });
}

/**
 * KPIs filtrados + primeiras 500 linhas da tabela, conforme os filtros ativos.
 */
export function useSaidasRedmineTabela(filtros: SaidasRedmineFiltros) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filtros)) {
    if (v) params.set(k, v);
  }
  const qs = params.toString();

  return useQuery<SaidasRedmineTabela>({
    queryKey: ["sismat-saidas-redmine-tabela", qs],
    queryFn: async () => {
      const res = await fetch(`/api/sismat/saidas/redmine/tabela${qs ? `?${qs}` : ""}`);
      if (!res.ok) {
        throw new Error("Erro ao filtrar o cruzamento Saídas × Redmine");
      }
      return res.json();
    },
    // mantém os dados anteriores enquanto o novo filtro carrega (sem "piscar")
    placeholderData: (prev) => prev,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
