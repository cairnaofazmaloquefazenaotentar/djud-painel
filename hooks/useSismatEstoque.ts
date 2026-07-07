"use client";

import { useQuery } from "@tanstack/react-query";
import type { SismatPeriodo } from "@/lib/sismat-metrics";
import type { SismatEstoqueData } from "@/lib/sismat-estoque-metrics";

/**
 * Carrega o cruzamento Entradas × Saídas (fluxo por período + saldo por material).
 */
export function useSismatEstoque(period: SismatPeriodo) {
  return useQuery<SismatEstoqueData>({
    queryKey: ["sismat-estoque", period],
    queryFn: async () => {
      const res = await fetch(`/api/sismat/estoque?period=${period}`);
      if (!res.ok) {
        throw new Error("Erro ao carregar métricas de estoque SISMAT");
      }
      return res.json();
    },
    staleTime: 60 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
  });
}
