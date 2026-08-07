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
    // 30s: revalidação é um 304 barato (ETag por versão do dado em
    // lib/data-version.ts), então import novo aparece quase de imediato.
    staleTime: 30 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
  });
}
