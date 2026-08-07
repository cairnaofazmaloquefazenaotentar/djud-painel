"use client";

import { useQuery } from "@tanstack/react-query";

export interface PrincipioAtivoOption {
  value: string;
  count: number;
}

/**
 * Carrega a lista de princípios ativos disponíveis (com contagem de demandas),
 * já limpa e ordenada por frequência. Usada para popular o combobox de filtro.
 * A lista muda pouco, então fica em cache por bastante tempo.
 */
export function usePrincipiosAtivos() {
  return useQuery<PrincipioAtivoOption[]>({
    queryKey: ["principios-ativos"],
    queryFn: async () => {
      const res = await fetch("/api/demandas/principios-ativos");
      if (!res.ok) throw new Error("Erro ao carregar princípios ativos");
      const data = await res.json();
      return data.items as PrincipioAtivoOption[];
    },
    // 30s: revalidação é um 304 barato (ETag por versão do dado em
    // lib/data-version.ts), então import novo aparece quase de imediato.
    staleTime: 30 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
  });
}
