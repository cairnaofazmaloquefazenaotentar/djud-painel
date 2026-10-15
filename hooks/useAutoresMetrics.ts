"use client";

import { useQuery } from "@tanstack/react-query";
import { paramsDeMetrics } from "@/hooks/useMetrics";
import type { FiltroDemandas } from "@/lib/demandas-filtro-tipos";
import { apiPath } from "@/lib/url";

export interface AutoresMesData {
  mes: Date;
  autoresUnicos: number;
  autoresNovos: number;
  autoresReincidentes: number;
}

/** Série de autores com o MESMO filtro do painel (B2: antes só as datas valiam). */
export function useAutoresMetrics(filtro: FiltroDemandas, enabled = true) {
  const chave = paramsDeMetrics(filtro).toString();
  return useQuery<AutoresMesData[]>({
    queryKey: ["autores-metrics", chave],
    queryFn: async ({ signal }) => {
      const res = await fetch(apiPath(`/api/demandas/autores/metrics?${chave}`), { signal });
      if (!res.ok) throw new Error("Erro ao carregar métricas de autores");

      const raw = await res.json();
      // Deserializar datas que vêm como string do JSON
      return raw.map((r: AutoresMesData & { mes: string }) => ({ ...r, mes: new Date(r.mes) }));
    },
    enabled,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}
