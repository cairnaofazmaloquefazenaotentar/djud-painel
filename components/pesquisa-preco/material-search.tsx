"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSugestoesMaterial } from "@/hooks/usePesquisaPreco";
import type { TipoCodigo } from "@/lib/pesquisa-preco";

// ─────────────────────────────────────────────────────────────────────────────
// Campo de busca incremental de material para a Pesquisa de Preços.
//
// O mesmo componente atende os dois primeiros filtros obrigatórios: em modo
// "codigo" exibe/pesquisa o CATMAT ou registro ANVISA; em modo "descricao"
// exibe/pesquisa a descrição CATMAT. Ambos apontam para a MESMA seleção —
// escolher em um preenche o outro. A lista mostra itens do catálogo (CATMAT)
// e registros ANVISA (CMED) em grupos separados.
// ─────────────────────────────────────────────────────────────────────────────

export interface MaterialSelecionado {
  tipo: TipoCodigo;
  /** CATMAT (até 6 dígitos) ou registro ANVISA (13 dígitos) — vai para a API. */
  codigo: string;
  descricao: string;
  /** Complemento exibido no resumo (classe/PDM ou produto/apresentação). */
  detalhe: string | null;
}

interface Props {
  modo: "codigo" | "descricao";
  selecionado: MaterialSelecionado | null;
  onSelecionar: (m: MaterialSelecionado | null) => void;
  disabled?: boolean;
  className?: string;
}

interface Opcao {
  chave: string;
  grupo: "CATMAT" | "REGISTRO";
  principal: string;
  secundario: string;
  material: MaterialSelecionado;
}

function useDebounce<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

const ROTULO_GRUPO: Record<Opcao["grupo"], string> = {
  CATMAT: "Catálogo CATMAT",
  REGISTRO: "Registros ANVISA (CMED)",
};

export function MaterialSearch({ modo, selecionado, onSelecionar, disabled, className }: Props) {
  const [texto, setTexto] = useState("");
  const [editando, setEditando] = useState(false);
  const [destaque, setDestaque] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  const q = useDebounce(texto, 300);
  const { data, isFetching, error } = useSugestoesMaterial(editando ? q : "");

  const opcoes = useMemo<Opcao[]>(() => {
    if (!data) return [];
    const itens: Opcao[] = data.itens.map((i) => ({
      chave: `c:${i.codigo}`,
      grupo: "CATMAT",
      principal: modo === "codigo" ? i.codigo : i.descricao,
      secundario: modo === "codigo" ? i.descricao : `CATMAT ${i.codigo} · ${i.nomeClasse}`,
      material: {
        tipo: "CATMAT",
        codigo: i.codigo,
        descricao: i.descricao,
        detalhe: `Classe ${i.codigoClasse} — ${i.nomeClasse} · PDM ${i.nomePdm}`,
      },
    }));
    const registros: Opcao[] = data.registros.map((r) => {
      const catmat = r.catmat ? `CATMAT ${r.catmat}` : "sem CATMAT";
      return {
        chave: `r:${r.registro}`,
        grupo: "REGISTRO",
        principal: modo === "codigo" ? r.registro : r.descricao,
        secundario:
          modo === "codigo"
            ? [r.produto, r.apresentacao, catmat].filter(Boolean).join(" · ")
            : [`Registro ${r.registro}`, r.produto, catmat].filter(Boolean).join(" · "),
        material: {
          tipo: "REGISTRO",
          codigo: r.registro,
          descricao: r.descricao,
          detalhe: [r.produto, r.apresentacao, r.fabricante].filter(Boolean).join(" · ") || null,
        },
      };
    });
    return [...itens, ...registros];
  }, [data, modo]);

  const aberto = editando && texto.trim().length >= 2;

  // fecha ao clicar fora
  useEffect(() => {
    if (!editando) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setEditando(false);
        setTexto("");
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [editando]);

  useEffect(() => setDestaque(0), [opcoes]);

  useEffect(() => {
    const el = listaRef.current?.querySelector<HTMLElement>(`[data-idx="${destaque}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [destaque]);

  function escolher(o: Opcao) {
    onSelecionar(o.material);
    setEditando(false);
    setTexto("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!aberto) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setDestaque((h) => Math.min(h + 1, Math.max(opcoes.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setDestaque((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = opcoes[destaque];
      if (o) escolher(o);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setEditando(false);
      setTexto("");
    }
  }

  const valorExibido = editando
    ? texto
    : selecionado
      ? modo === "codigo"
        ? selecionado.codigo
        : selecionado.descricao
      : "";

  const placeholder =
    modo === "codigo"
      ? "CATMAT (6 dígitos) ou Registro ANVISA (13 dígitos)"
      : "Digite parte da descrição CATMAT…";

  const linhas: { cabecalho: string | null; opcao: Opcao; idx: number }[] = [];
  let grupoAnterior: Opcao["grupo"] | null = null;
  opcoes.forEach((o, idx) => {
    linhas.push({ cabecalho: o.grupo !== grupoAnterior ? ROTULO_GRUPO[o.grupo] : null, opcao: o, idx });
    grupoAnterior = o.grupo;
  });

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={valorExibido}
          disabled={disabled}
          placeholder={placeholder}
          inputMode={modo === "codigo" ? "numeric" : "text"}
          title={!editando && selecionado ? valorExibido : undefined}
          onFocus={() => setEditando(true)}
          onChange={(e) => {
            setEditando(true);
            setTexto(e.target.value);
          }}
          onKeyDown={onKeyDown}
          className={cn(
            "h-9 w-full rounded-md border border-input bg-transparent pl-8 pr-8 text-sm shadow-xs outline-none transition-[color,box-shadow]",
            "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
            "disabled:cursor-not-allowed disabled:opacity-50",
            !editando && selecionado ? "font-medium" : undefined
          )}
        />
        {isFetching && editando ? (
          <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : selecionado && !disabled ? (
          <button
            type="button"
            aria-label="Limpar seleção"
            onClick={() => {
              onSelecionar(null);
              setTexto("");
              setEditando(false);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {aberto && (
        <div className="absolute z-50 mt-1 w-full min-w-[20rem] rounded-md border border-input bg-popover text-popover-foreground shadow-md">
          <div ref={listaRef} className="max-h-80 overflow-y-auto p-1">
            {error && (
              <div className="px-2 py-4 text-center text-sm text-destructive">
                {(error as Error).message}
              </div>
            )}
            {!error && opcoes.length === 0 && (
              <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                {isFetching ? "Buscando…" : "Nenhum material encontrado."}
              </div>
            )}
            {linhas.map(({ cabecalho, opcao, idx }) => (
              <div key={opcao.chave}>
                {cabecalho && (
                  <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {cabecalho}
                  </div>
                )}
                <button
                  type="button"
                  data-idx={idx}
                  onMouseEnter={() => setDestaque(idx)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => escolher(opcao)}
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 rounded-sm px-2 py-1.5 text-left",
                    idx === destaque ? "bg-accent text-accent-foreground" : undefined
                  )}
                >
                  <span className="w-full truncate text-sm font-medium">{opcao.principal}</span>
                  <span className="w-full truncate text-xs text-muted-foreground">{opcao.secundario}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
