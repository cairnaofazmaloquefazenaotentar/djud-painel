"use client";

import { useQuery } from "@tanstack/react-query";
import type { FontesData } from "@/app/api/fontes/route";
import { apiPath } from "@/lib/url";

export function useFontes() {
  return useQuery<FontesData>({
    queryKey: ["fontes"],
    queryFn: async () => {
      const res = await fetch(apiPath("/api/fontes"));
      if (!res.ok) throw new Error("Erro ao carregar fontes");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,  // 5 minutos
    gcTime:    15 * 60 * 1000, // 15 minutos
  });
}

/** Formata uma data ISO como "DD/MM/AAAA" ou "—" se nula. */
export function fmtDataFonte(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  // Data de calendário gravada à meia-noite UTC (vigência da CMED, datas do
  // SISMAT): no fuso de Brasília ela cairia no dia anterior.
  const calendario = iso.endsWith("T00:00:00.000Z");
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(calendario ? { timeZone: "UTC" } : {}),
  });
}
