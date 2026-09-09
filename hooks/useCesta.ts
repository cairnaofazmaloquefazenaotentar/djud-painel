"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CestaItemDTO, CestaResumo } from "@/lib/cesta";

// ─────────────────────────────────────────────────────────────────────────────
// Cesta da Pesquisa de Preços — a fonte da verdade é o banco (por usuário), não
// o estado local: por isso toda mutação invalida a query e a cesta reaparece
// intacta depois de um logout/login ou em outra máquina.
// ─────────────────────────────────────────────────────────────────────────────

export const CESTA_KEY = ["precos-cesta"] as const;

async function lerErro(res: Response, padrao: string): Promise<never> {
  let mensagem = padrao;
  try {
    const data = await res.json();
    if (data?.error) mensagem = String(data.error);
  } catch {
    /* corpo não é JSON */
  }
  throw new Error(mensagem);
}

export function useCesta(enabled = true) {
  return useQuery<CestaResumo>({
    queryKey: CESTA_KEY,
    queryFn: async () => {
      const res = await fetch("/api/precos/cesta");
      if (!res.ok) await lerErro(res, "Erro ao carregar a cesta");
      return res.json();
    },
    enabled,
    staleTime: 30 * 1000,
  });
}

export interface AdicionarItemArgs {
  codigo: string;
  unidade: string;
  uf: string | null;
  quantidade?: number;
  observacao?: string | null;
}

export function useAdicionarItemCesta() {
  const qc = useQueryClient();
  return useMutation<{ item: CestaItemDTO; duplicado: boolean }, Error, AdicionarItemArgs>({
    mutationFn: async (args) => {
      const res = await fetch("/api/precos/cesta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      if (!res.ok) await lerErro(res, "Erro ao adicionar o item à cesta");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CESTA_KEY });
    },
  });
}

export function useAtualizarItemCesta() {
  const qc = useQueryClient();
  return useMutation<
    { item: CestaItemDTO },
    Error,
    { id: string; quantidade?: number; observacao?: string | null }
  >({
    mutationFn: async ({ id, ...dados }) => {
      const res = await fetch(`/api/precos/cesta/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dados),
      });
      if (!res.ok) await lerErro(res, "Erro ao atualizar o item");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CESTA_KEY });
    },
  });
}

export function useRemoverItemCesta() {
  const qc = useQueryClient();
  return useMutation<{ removido: string }, Error, string>({
    mutationFn: async (id) => {
      const res = await fetch(`/api/precos/cesta/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) await lerErro(res, "Erro ao remover o item");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CESTA_KEY });
    },
  });
}

export function useEsvaziarCesta() {
  const qc = useQueryClient();
  return useMutation<CestaResumo, Error, void>({
    mutationFn: async () => {
      const res = await fetch("/api/precos/cesta", { method: "DELETE" });
      if (!res.ok) await lerErro(res, "Erro ao esvaziar a cesta");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CESTA_KEY });
    },
  });
}
