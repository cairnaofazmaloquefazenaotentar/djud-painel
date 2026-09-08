"use client";

import { useQuery } from "@tanstack/react-query";
import type { SismatPeriodo } from "@/lib/sismat-metrics";
import type { SismatEstoqueData } from "@/lib/sismat-estoque-metrics";

export function useSismatEstoque(period: SismatPeriodo, materialNome?: string) {
  return useQuery<SismatEstoqueData>({
    queryKey: ["sismat-estoque", period, materialNome ?? ""],
    queryFn: async () => {
      const params = new URLSearchParams({ period });
      if (materialNome) params.set("materialNome", materialNome);
      const res = await fetch(`/api/sismat/estoque?${params}`);
      if (!res.ok) throw new Error("Erro ao carregar métricas de estoque SISMAT");
      return res.json();
    },
    staleTime: 30 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
  });
}
