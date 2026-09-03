"use client";

import { useQuery } from "@tanstack/react-query";
import type { SismatSaidasIndicadores } from "@/lib/sismat-saidas-indicadores";

export function useSismatSaidasIndicadores() {
  return useQuery<SismatSaidasIndicadores>({
    queryKey: ["sismat-saidas-indicadores"],
    queryFn: async () => {
      const res = await fetch("/api/sismat/saidas/indicadores");
      if (!res.ok) throw new Error("Erro ao carregar indicadores de saídas SISMAT");
      return res.json();
    },
    staleTime: 30 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
  });
}
