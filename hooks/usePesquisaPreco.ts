"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type {
  ItemPesquisa,
  ResultadoPesquisa,
  Sugestoes,
  UnidadeOpcao,
} from "@/lib/pesquisa-preco";

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

/**
 * Sugestões de material (CATMAT e registros ANVISA) para os filtros de código
 * e descrição. Só dispara com 2+ caracteres; mantém o resultado anterior na
 * tela enquanto a próxima consulta carrega (evita "piscar" a lista).
 */
export function useSugestoesMaterial(q: string) {
  const termo = q.trim();
  return useQuery<Sugestoes>({
    queryKey: ["precos-catmat-sugestoes", termo],
    queryFn: async () => {
      const params = new URLSearchParams({ q: termo });
      const res = await fetch(`/api/precos/catmat?${params.toString()}`);
      if (!res.ok) await lerErro(res, "Erro ao buscar sugestões");
      return res.json();
    },
    enabled: termo.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export interface ItemComUnidades {
  item: ItemPesquisa;
  unidades: UnidadeOpcao[];
}

/**
 * Detalhe do código escolhido e as unidades de fornecimento disponíveis nas
 * fontes (opções do filtro obrigatório de unidade).
 */
export function useItemPesquisa(codigo: string | null) {
  return useQuery<ItemComUnidades>({
    queryKey: ["precos-catmat-item", codigo],
    queryFn: async () => {
      const res = await fetch(`/api/precos/catmat/${encodeURIComponent(codigo as string)}`);
      if (!res.ok) await lerErro(res, "Erro ao carregar o item");
      return res.json();
    },
    enabled: !!codigo,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export interface ParametrosBusca {
  codigo: string;
  unidade: string;
  uf: string | null;
}

/** Pesquisa consolidada — dispara apenas quando os parâmetros são submetidos. */
export function usePesquisaPrecos(params: ParametrosBusca | null) {
  return useQuery<ResultadoPesquisa>({
    queryKey: ["precos-buscar", params?.codigo, params?.unidade, params?.uf],
    queryFn: async () => {
      if (!params) throw new Error("Parâmetros de pesquisa ausentes");
      const sp = new URLSearchParams({ codigo: params.codigo, unidade: params.unidade });
      if (params.uf) sp.set("uf", params.uf);
      const res = await fetch(`/api/precos/buscar?${sp.toString()}`);
      if (!res.ok) await lerErro(res, "Erro na pesquisa de preços");
      return res.json();
    },
    enabled: !!params,
    staleTime: 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: false,
  });
}
