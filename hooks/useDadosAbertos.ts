"use client";

import { useCallback, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiPath } from "@/lib/url";

// ─────────────────────────────────────────────────────────────────────────────
// Coleta das APIs de dados abertos conduzida pela TELA (P24): uma página por
// chamada, 700 ms entre chamadas, espera o `aguardarMs` de um 429 e só uma
// coleta por vez. A função do servidor nunca dorme esperando a cota — e numa
// coleta de dezenas de páginas não caberia no tempo de uma função serverless.
// Ordem: Compras.gov.br → BPS → atas (os itens de ata herdam a unidade de
// fornecimento da compra do Compras.gov.br com a mesma chave).
// ─────────────────────────────────────────────────────────────────────────────

export type OrigemColetaTela = "COMPRASGOV" | "BPS" | "ARP_ITEM";

export const NOME_ORIGEM: Record<OrigemColetaTela, string> = {
  COMPRASGOV: "Compras.gov.br",
  BPS: "BPS (Ministério da Saúde)",
  ARP_ITEM: "Atas de registro de preços",
};

export interface SituacaoOrigem {
  origem: OrigemColetaTela;
  registros: number;
  coletadoEm: string | null;
  status: string | null;
  valida: boolean;
  origemCarga: string | null;
}

export interface SituacaoDadosAbertos {
  catmat: string | null;
  indisponivel: boolean;
  porOrigem: Record<OrigemColetaTela, SituacaoOrigem> | null;
  vinculosPendentes: string[];
}

const ESPACAMENTO_MS = 700;
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useSituacaoDadosAbertos(codigo: string | null) {
  return useQuery<SituacaoDadosAbertos>({
    queryKey: ["dados-abertos-situacao", codigo],
    queryFn: async () => {
      const res = await fetch(apiPath(`/api/precos/dados-abertos/situacao?codigo=${encodeURIComponent(codigo as string)}`));
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Erro ao consultar os dados abertos");
      return d;
    },
    enabled: !!codigo,
    staleTime: 30 * 1000,
  });
}

export interface EstadoColeta {
  executando: boolean;
  mensagem: string | null;
  erro: string | null;
}

async function postar<T>(caminho: string, corpo: unknown): Promise<T> {
  const res = await fetch(apiPath(caminho), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const d = await res.json().catch(() => ({}));
  if (res.status === 429) {
    const seg = Number(res.headers.get("Retry-After") ?? 10);
    return { aguardarMs: (Number.isFinite(seg) ? seg : 10) * 1000 } as T;
  }
  if (!res.ok) throw new Error(d.error || `Erro HTTP ${res.status}`);
  return d as T;
}

interface RespostaColeta {
  coletaId: string | null;
  proximaPagina: number | null;
  totalPaginas: number | null;
  esperados: number | null;
  baixados: number;
  status: string;
  aguardarMs?: number;
  erro?: string;
}

interface RespostaVinculo {
  encontrados?: number;
  naoEncontrados?: number;
  pendentes?: string[];
  aguardarMs?: number;
  erros?: Array<{ idCompra: string; erro: string }>;
}

/** Coleta e vínculo PNCP de um CATMAT, com progresso e cancelamento. */
export function useColetaDadosAbertos() {
  const queryClient = useQueryClient();
  const [estado, setEstado] = useState<EstadoColeta>({ executando: false, mensagem: null, erro: null });
  const cancelado = useRef(false);

  const atualizarTela = useCallback(
    async (codigo: string) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dados-abertos-situacao", codigo] }),
        queryClient.invalidateQueries({ queryKey: ["precos-catmat-item", codigo] }),
        queryClient.invalidateQueries({ queryKey: ["precos-buscar"] }),
      ]);
    },
    [queryClient]
  );

  const coletar = useCallback(
    async (codigo: string, origens: OrigemColetaTela[] = ["COMPRASGOV", "BPS", "ARP_ITEM"]) => {
      cancelado.current = false;
      setEstado({ executando: true, mensagem: "Iniciando a coleta…", erro: null });
      const falhas: string[] = [];
      try {
        for (const origem of origens) {
          let pagina: number | null = 1;
          let coletaId: string | null = null;
          while (pagina !== null) {
            if (cancelado.current) throw new Error("Coleta interrompida pelo usuário. O que já foi baixado ficou gravado.");
            const r: RespostaColeta = await postar<RespostaColeta>("/api/precos/dados-abertos/coletar", { codigo, origem, pagina, coletaId });
            if (r.aguardarMs) {
              setEstado((e) => ({ ...e, mensagem: `${NOME_ORIGEM[origem]}: limite de consultas da API atingido — aguardando ${Math.ceil((r.aguardarMs as number) / 1000)} s…` }));
              await esperar(r.aguardarMs);
              continue;
            }
            coletaId = r.coletaId;
            if (r.erro) {
              falhas.push(`${NOME_ORIGEM[origem]}: ${r.erro}`);
              break;
            }
            setEstado((e) => ({
              ...e,
              mensagem: `${NOME_ORIGEM[origem]}: página ${pagina}${r.totalPaginas ? ` de ${r.totalPaginas}` : ""} · ${r.baixados}${r.esperados !== null ? ` de ${r.esperados}` : ""} registro(s)`,
            }));
            pagina = r.proximaPagina;
            await esperar(ESPACAMENTO_MS);
          }
        }
        setEstado({ executando: false, mensagem: "Coleta concluída.", erro: falhas.length ? falhas.join(" · ") : null });
      } catch (e) {
        setEstado({ executando: false, mensagem: null, erro: e instanceof Error ? e.message : "Erro na coleta" });
      } finally {
        await atualizarTela(codigo);
      }
    },
    [atualizarTela]
  );

  const vincularPncp = useCallback(
    async (codigo: string, idsCompra: string[]) => {
      cancelado.current = false;
      setEstado({ executando: true, mensagem: `Vinculando ${idsCompra.length} compra(s) ao PNCP…`, erro: null });
      let fila = [...idsCompra];
      let encontrados = 0;
      let semPncp = 0;
      const erros: string[] = [];
      try {
        while (fila.length) {
          if (cancelado.current) throw new Error("Vínculo interrompido pelo usuário. O que já foi consultado ficou gravado.");
          const lote = fila.slice(0, 20);
          const r: RespostaVinculo = await postar<RespostaVinculo>("/api/precos/dados-abertos/vincular-pncp", { idsCompra: lote });
          encontrados += r.encontrados ?? 0;
          semPncp += r.naoEncontrados ?? 0;
          for (const e of r.erros ?? []) erros.push(`${e.idCompra}: ${e.erro}`);
          fila = [...(r.pendentes ?? []), ...fila.slice(lote.length)];
          setEstado((e) => ({ ...e, mensagem: `PNCP: ${encontrados} vinculada(s), ${semPncp} sem registro no PNCP, ${fila.length} restante(s)` }));
          if (r.aguardarMs) {
            setEstado((e) => ({ ...e, mensagem: `${e.mensagem} — aguardando ${Math.ceil((r.aguardarMs as number) / 1000)} s (limite da API)…` }));
            await esperar(r.aguardarMs);
          } else {
            await esperar(ESPACAMENTO_MS);
          }
        }
        setEstado({
          executando: false,
          mensagem: `Vínculo concluído: ${encontrados} compra(s) com registro no PNCP, ${semPncp} sem registro.`,
          erro: erros.length ? `${erros.length} compra(s) com erro: ${erros.slice(0, 3).join(" · ")}` : null,
        });
      } catch (e) {
        setEstado({ executando: false, mensagem: null, erro: e instanceof Error ? e.message : "Erro no vínculo com o PNCP" });
      } finally {
        await atualizarTela(codigo);
      }
    },
    [atualizarTela]
  );

  const cancelar = useCallback(() => {
    cancelado.current = true;
  }, []);

  return { estado, coletar, vincularPncp, cancelar };
}
