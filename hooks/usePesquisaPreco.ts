"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type {
  ItemPesquisa,
  ResultadoPesquisa,
  Sugestoes,
  UnidadeOpcao,
} from "@/lib/pesquisa-preco";
import type { CampoFiltro, RespostaSugestoesFiltro } from "@/lib/pesquisa-preco-filtros";
import { apiPath } from "@/lib/url";

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
      const res = await fetch(apiPath(`/api/precos/catmat?${params.toString()}`));
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
      const res = await fetch(apiPath(`/api/precos/catmat/${encodeURIComponent(codigo as string)}`));
      if (!res.ok) await lerErro(res, "Erro ao carregar o item");
      return res.json();
    },
    enabled: !!codigo,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * Parâmetros submetidos ao clicar em "Buscar". Os três primeiros são os
 * filtros obrigatórios; UF e os campos de "Mais filtros" são recortes
 * opcionais — `null` quando não preenchidos.
 */
export interface ParametrosBusca {
  codigo: string;
  unidade: string;
  uf: string | null;
  fornecedor: string | null;
  fabricante: string | null;
  cnpjComprador: string | null;
  /** Período do art. 5º (D1): data de referência, meses (null = todo o período) e justificativa. */
  periodo: {
    dataReferencia: string;
    mesesMercado: 12 | 24 | 36 | null;
    justificativaAmpliacao: string | null;
    /** Intervalo de datas: início das bases (prevalece sobre os meses). */
    inicio?: string | null;
  };
  /** Atualização pelo IPCA dos incisos I e II (D2). */
  corrigirIpca: boolean;
  /**
   * Lista CMED consultada ("AAAA-MM"); null = a última publicada até a data
   * de referência, a que o relatório usa sempre.
   */
  competenciaCmed?: string | null;
  /** Alíquota de ICMS do PMVG do teto (filtro de "Mais filtros"; padrão 17%). */
  aliquotaIcms?: string;
}

/** Pesquisa consolidada — dispara apenas quando os parâmetros são submetidos. */
export function usePesquisaPrecos(params: ParametrosBusca | null) {
  return useQuery<ResultadoPesquisa>({
    queryKey: [
      "precos-buscar",
      params?.codigo,
      params?.unidade,
      params?.uf,
      params?.fornecedor,
      params?.fabricante,
      params?.cnpjComprador,
      params?.periodo.dataReferencia,
      params?.periodo.mesesMercado,
      params?.periodo.justificativaAmpliacao,
      params?.periodo.inicio,
      params?.corrigirIpca,
      params?.competenciaCmed ?? null,
      params?.aliquotaIcms ?? null,
    ],
    queryFn: async () => {
      if (!params) throw new Error("Parâmetros de pesquisa ausentes");
      const sp = new URLSearchParams({ codigo: params.codigo, unidade: params.unidade });
      if (params.uf) sp.set("uf", params.uf);
      if (params.fornecedor) sp.set("fornecedor", params.fornecedor);
      if (params.fabricante) sp.set("fabricante", params.fabricante);
      if (params.cnpjComprador) sp.set("cnpjComprador", params.cnpjComprador);
      sp.set("dataReferencia", params.periodo.dataReferencia);
      sp.set("meses", params.periodo.mesesMercado === null ? "todos" : String(params.periodo.mesesMercado));
      if (params.periodo.inicio) sp.set("inicio", params.periodo.inicio);
      if (params.periodo.justificativaAmpliacao) sp.set("justificativaPeriodo", params.periodo.justificativaAmpliacao);
      if (!params.corrigirIpca) sp.set("ipca", "0");
      if (params.competenciaCmed) sp.set("competencia", params.competenciaCmed);
      if (params.aliquotaIcms) sp.set("aliquota", params.aliquotaIcms);
      const res = await fetch(apiPath(`/api/precos/buscar?${sp.toString()}`));
      if (!res.ok) await lerErro(res, "Erro na pesquisa de preços");
      return res.json();
    },
    enabled: !!params,
    staleTime: 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: false,
  });
}

/**
 * Sugestões de "Mais filtros" (fornecedor, fabricante, CNPJ do comprador) para
 * o item e a unidade escolhidos. Com o campo vazio traz os mais frequentes.
 */
export function useSugestoesFiltro(p: {
  campo: CampoFiltro;
  codigo: string | null;
  unidade: string | null;
  uf: string | null;
  q: string;
  ativo: boolean;
}) {
  const termo = p.q.trim();
  return useQuery<RespostaSugestoesFiltro>({
    queryKey: ["precos-filtro-sugestoes", p.campo, p.codigo, p.unidade, p.uf, termo],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({
        campo: p.campo,
        codigo: p.codigo as string,
        unidade: p.unidade as string,
        q: termo,
      });
      if (p.uf) params.set("uf", p.uf);
      const res = await fetch(apiPath(`/api/precos/filtros/sugestoes?${params.toString()}`), { signal });
      if (!res.ok) await lerErro(res, "Erro ao buscar sugestões");
      return res.json();
    },
    enabled: p.ativo && !!p.codigo && !!p.unidade,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export interface CompetenciasCmed {
  competencias: Array<{
    competencia: string;
    rotulo: string;
    registros: number;
    capPercentual: number | null;
    /** Alíquotas com preço publicado na lista — as opções do filtro de alíquota. */
    aliquotas: string[];
  }>;
  /** A última publicada até hoje — a que os relatórios usam. */
  vigente: string | null;
}

/** Listas mensais da CMED carregadas, para o seletor "Lista CMED" da pesquisa. */
export function useCompetenciasCmed() {
  return useQuery<CompetenciasCmed>({
    queryKey: ["precos-cmed-competencias"],
    queryFn: async () => {
      const res = await fetch(apiPath("/api/precos/cmed/competencias"));
      if (!res.ok) await lerErro(res, "Erro ao listar as listas CMED");
      return res.json();
    },
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });
}
