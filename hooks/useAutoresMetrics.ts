"use client";

import { useQuery } from "@tanstack/react-query";

export interface AutoresMesData {
  mes: Date;
  autoresUnicos: number;
  autoresNovos: number;
  autoresReincidentes: number;
}

interface UseAutoresMetricsOptions {
  startDate?: Date;
  endDate?: Date;
}

export function useAutoresMetrics(options: UseAutoresMetricsOptions = {}) {
  const queryKey = [
    "autores-metrics",
    {
      startDate: options.startDate?.toISOString(),
      endDate: options.endDate?.toISOString(),
    },
  ];

  return useQuery<AutoresMesData[]>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (options.startDate) params.append("startDate", options.startDate.toISOString());
      if (options.endDate)   params.append("endDate",   options.endDate.toISOString());

      const res = await fetch(`/api/demandas/autores/metrics?${params.toString()}`);
      if (!res.ok) throw new Error("Erro ao carregar métricas de autores");

      const raw = await res.json();
      // Deserializar datas que vêm como string do JSON
      return raw.map((r: any) => ({ ...r, mes: new Date(r.mes) }));
    },
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}
