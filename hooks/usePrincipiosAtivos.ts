"use client";

import { useQuery } from "@tanstack/react-query";
import { apiPath } from "@/lib/url";

export interface PrincipioAtivoOption {
  /** Nome da substância como mais aparece nas demandas ("Eltrombopague"). */
  value: string;
  /** Demandas que citam a substância (uma demanda conta uma vez por substância). */
  count: number;
  /** Radical que o filtro de medicamento procura ("ELTROMBOPAG"). */
  radical: string;
}

/**
 * Sugestões do campo "Medicamento" (B3): substâncias canônicas — as grafias do
 * Redmine agrupadas pelo radical — com a contagem de demandas, ordenadas por
 * frequência. A lista muda pouco, então fica em cache por bastante tempo.
 */
export function usePrincipiosAtivos() {
  return useQuery<PrincipioAtivoOption[]>({
    queryKey: ["principios-ativos"],
    queryFn: async () => {
      const res = await fetch(apiPath("/api/demandas/principios-ativos"));
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
