"use client";

import { useQuery } from "@tanstack/react-query";

/**
 * Busca a lista de valores distintos da coluna `material` (nome específico)
 * para um dado princípio ativo (materialNome) em Saídas ou Entradas.
 * Só dispara a query quando materialNome estiver preenchido.
 */
export function useSismatSubMaterials(
  type: "saidas" | "entradas",
  materialNome: string
) {
  const endpoint =
    type === "saidas"
      ? "/api/sismat/saidas/sub-materials"
      : "/api/sismat/entradas/sub-materials";

  return useQuery<string[]>({
    queryKey: ["sismat-sub-materials", type, materialNome],
    queryFn: async () => {
      const params = new URLSearchParams({ materialNome });
      const res = await fetch(`${endpoint}?${params.toString()}`);
      if (!res.ok) throw new Error("Erro ao carregar sub-materiais");
      const json = await res.json();
      return json.materials as string[];
    },
    enabled: !!materialNome,
    staleTime: 5 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
  });
}
