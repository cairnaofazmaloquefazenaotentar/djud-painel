"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FiltroCatmat } from "@/lib/demandas-catmat";
import type { BuscaAplicada } from "@/lib/demandas-filtro";
import type { GrupoTermos } from "@/lib/substancia";
import type { OpcoesDemandas } from "@/app/api/demandas/opcoes/route";
import { apiPath } from "@/lib/url";

// ─────────────────────────────────────────────────────────────────────────────
// Lista de Demandas (A1/A4): a requisição anterior é cancelada quando o filtro
// muda (o `signal` do TanStack Query) e a tabela mantém os dados antigos até
// a resposta nova chegar — sem piscar vazia a cada tecla.
// ─────────────────────────────────────────────────────────────────────────────

export interface DemandaLista {
  id: string;
  numero: string;
  titulo: string;
  descricao: string;
  status?: string | null;
  prioridade?: string | null;
  numeroProcesso?: string | null;
  nupSei?: string | null;
  apresentacoes?: Array<{ catmat: string; descricao: string | null; origem: string; unidades?: string[] }> | null;
  catmatsDerivados?: string[];
  areaTematica?: string | null;
  trfRegiao?: number | null;
  regiaoBrasil?: string | null;
  ufResidencia?: string | null;
  objetoAcao?: string | null;
  pontoControle?: string | null;
  principioAtivo?: string | null;
  medicamento?: string | null;
  medicamentoOrigem?: string | null;
  dataEntradaDJUD?: string | null;
  organizacao?: { id: string; name: string } | null;
  responsavel?: { id: string; name: string } | null;
  criadoEm: string;
  attachmentCount?: number;
}

export interface RespostaDemandas {
  data: DemandaLista[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  filtroCatmat: FiltroCatmat | null;
  busca: BuscaAplicada | null;
  medicamento: GrupoTermos | null;
  /** Com código CATMAT: demandas da apresentação exata e da mesma substância sem apresentação identificada. */
  gruposCatmat: { exata: number; naoIdentificada: number } | null;
}

async function lerErro(res: Response, padrao: string): Promise<never> {
  const d = await res.json().catch(() => ({}));
  throw new Error(d?.error || padrao);
}

/** `qs` = filtro + página + tamanho (a mesma querystring da URL da tela). */
export function useDemandasLista(qs: string) {
  return useQuery<RespostaDemandas>({
    queryKey: ["demandas", qs],
    queryFn: async ({ signal }) => {
      const res = await fetch(apiPath(`/api/demandas?${qs}`), { signal });
      if (!res.ok) await lerErro(res, `Erro ${res.status} ao consultar as demandas`);
      return res.json();
    },
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });
}

export function useOpcoesDemandas() {
  return useQuery<OpcoesDemandas>({
    queryKey: ["demandas-opcoes"],
    queryFn: async () => {
      const res = await fetch(apiPath("/api/demandas/opcoes"));
      if (!res.ok) await lerErro(res, "Erro ao carregar as opções dos filtros");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

export interface VisaoSalva {
  id: string;
  name: string;
  querystring: string;
  updatedAt: string;
}

export function useVisoes() {
  return useQuery<{ visoes: VisaoSalva[] }>({
    queryKey: ["demandas-visoes"],
    queryFn: async () => {
      const res = await fetch(apiPath("/api/demandas/visoes"));
      if (!res.ok) await lerErro(res, "Erro ao carregar as visões salvas");
      return res.json();
    },
    staleTime: 60 * 1000,
  });
}

export function useSalvarVisao() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, { nome: string; querystring: string }>({
    mutationFn: async (dados) => {
      const res = await fetch(apiPath("/api/demandas/visoes"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dados),
      });
      if (!res.ok) await lerErro(res, "Erro ao salvar a visão");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["demandas-visoes"] }),
  });
}

export function useExcluirVisao() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, string>({
    mutationFn: async (id) => {
      const res = await fetch(apiPath(`/api/demandas/visoes?id=${encodeURIComponent(id)}`), { method: "DELETE" });
      if (!res.ok) await lerErro(res, "Erro ao excluir a visão");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["demandas-visoes"] }),
  });
}
