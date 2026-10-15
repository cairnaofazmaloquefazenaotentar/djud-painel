"use client";

import { Fragment, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSugestoesFiltro } from "@/hooks/usePesquisaPreco";
import { formatarCnpj, type CampoFiltro, type SugestaoFiltro } from "@/lib/pesquisa-preco-filtros";

// ─────────────────────────────────────────────────────────────────────────────
// Campo de "Mais filtros" com autocomplete (pedido da DLOG): ao focar, lista os
// valores mais frequentes do item e da unidade escolhidos; ao digitar, os que
// contêm o trecho. Cada sugestão mostra quantos registros a trazem e em quais
// bases — escolher uma garante que o filtro encontra esses registros.
//
// O valor continua livre: o filtro casa por trecho, então digitar "EMS" sem
// escolher a sugestão segue valendo. No CNPJ, dígitos vão direto para o campo
// (com a máscara); letras pesquisam pelo nome do comprador e só a sugestão
// escolhida preenche o CNPJ.
// ─────────────────────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

const TEM_LETRA = /[A-Za-zÀ-ÿ]/;

/** Fabricante: laboratório da CMED (recorta o teto) ou marca/fabricante das compras. */
const grupoFabricante = (s: SugestaoFiltro) => (s.fontes.includes("CMED") ? "cmed" : "compras");

interface Props {
  id: string;
  campo: CampoFiltro;
  value: string;
  onChange: (v: string) => void;
  /** Item e unidade escolhidos — sem eles não há o que sugerir. */
  codigo: string | null;
  unidade: string | null;
  uf: string | null;
  placeholder?: string;
  invalido?: boolean;
}

export function CampoFiltroSugestoes({ id, campo, value, onChange, codigo, unidade, uf, placeholder, invalido }: Props) {
  const ehCnpj = campo === "cnpjComprador";
  const [aberto, setAberto] = useState(false);
  const [destaque, setDestaque] = useState(0);
  /** CNPJ: texto com letras = busca pelo nome do comprador (não vai para o filtro). */
  const [buscaNome, setBuscaNome] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  const texto = buscaNome ?? value;
  const q = useDebounce(texto, 300);
  const pronto = !!codigo && !!unidade;
  const { data, isFetching, error } = useSugestoesFiltro({ campo, codigo, unidade, uf, q, ativo: aberto });
  const valores: SugestaoFiltro[] = data?.valores ?? [];

  const fechar = () => {
    setAberto(false);
    setBuscaNome(null);
  };

  // Fecha ao clicar fora.
  useEffect(() => {
    if (!aberto) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setAberto(false);
        setBuscaNome(null);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [aberto]);

  useEffect(() => {
    const el = listaRef.current?.querySelector<HTMLElement>(`[data-idx="${destaque}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [destaque]);

  function escolher(s: SugestaoFiltro) {
    onChange(s.valor);
    fechar();
  }

  function digitar(bruto: string) {
    setAberto(true);
    setDestaque(0);
    if (ehCnpj && TEM_LETRA.test(bruto)) {
      setBuscaNome(bruto);
      return;
    }
    setBuscaNome(null);
    onChange(ehCnpj ? formatarCnpj(bruto) : bruto);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      if (aberto) e.preventDefault();
      fechar();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!aberto) setAberto(true);
      else setDestaque((h) => Math.min(h + 1, Math.max(valores.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setDestaque((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && aberto && valores[destaque]) {
      e.preventDefault();
      escolher(valores[destaque]);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <input
        id={id}
        type="text"
        autoComplete="off"
        role="combobox"
        aria-expanded={aberto}
        aria-controls={`${id}-sugestoes`}
        aria-autocomplete="list"
        aria-invalid={invalido || undefined}
        inputMode={ehCnpj && buscaNome == null ? "numeric" : "text"}
        placeholder={placeholder}
        value={texto}
        onFocus={() => setAberto(true)}
        onBlur={fechar}
        onChange={(e) => digitar(e.target.value)}
        onKeyDown={onKeyDown}
        className={cn(
          "h-9 w-full rounded-md border border-input bg-transparent px-3 pr-8 text-sm shadow-xs outline-none transition-[color,box-shadow]",
          "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
          invalido ? "border-destructive" : undefined
        )}
      />
      {aberto && isFetching ? (
        <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
      ) : value || buscaNome ? (
        <button
          type="button"
          aria-label="Limpar"
          onClick={() => {
            onChange("");
            setBuscaNome(null);
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}

      {aberto && (
        <div
          id={`${id}-sugestoes`}
          role="listbox"
          // Clicar na lista (opção ou barra de rolagem) não tira o foco do campo.
          onMouseDown={(e) => e.preventDefault()}
          className="absolute z-50 mt-1 w-full min-w-[18rem] rounded-md border border-input bg-popover text-popover-foreground shadow-md"
        >
          <div ref={listaRef} className="max-h-72 overflow-y-auto p-1">
            {!pronto ? (
              <p className="px-2 py-3 text-xs text-muted-foreground">
                Escolha o material e a unidade de fornecimento para ver as sugestões.
              </p>
            ) : error ? (
              <p className="px-2 py-3 text-xs text-destructive">{(error as Error).message}</p>
            ) : valores.length === 0 ? (
              <p className="px-2 py-3 text-xs text-muted-foreground">
                {isFetching || !data ? "Buscando…" : data.motivo ?? "Nenhuma sugestão."}
              </p>
            ) : (
              <>
                {!(campo === "fabricante" && valores[0]?.fontes.includes("CMED")) && (
                  <p className="px-2 pb-1 pt-0.5 text-[11px] text-muted-foreground">
                    {q.trim() ? "Contêm o trecho digitado" : "Mais frequentes"} · registros deste item e unidade
                  </p>
                )}
                {valores.map((s, idx) => (
                  <Fragment key={`${s.valor}-${idx}`}>
                    {campo === "fabricante" &&
                      grupoFabricante(s) !== (idx > 0 ? grupoFabricante(valores[idx - 1]) : null) && (
                      <p className="px-2 pb-1 pt-1.5 text-[11px] font-medium text-muted-foreground">
                        {grupoFabricante(s) === "cmed"
                          ? "Laboratório na CMED — recorta também o teto PMVG"
                          : "Marca / fabricante nas compras"}
                      </p>
                    )}
                    <button
                      type="button"
                      role="option"
                      aria-selected={idx === destaque}
                      data-idx={idx}
                      onMouseEnter={() => setDestaque(idx)}
                      onClick={() => escolher(s)}
                      className={cn(
                        "w-full rounded-sm px-2 py-1.5 text-left",
                        idx === destaque ? "bg-accent text-accent-foreground" : undefined
                      )}
                    >
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={cn("truncate text-sm font-medium", ehCnpj ? "font-mono" : undefined)}>{s.valor}</span>
                        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                          {s.total.toLocaleString("pt-BR")} reg.
                        </span>
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {[s.detalhe, s.fontes.join(", ")].filter(Boolean).join(" · ")}
                      </span>
                    </button>
                  </Fragment>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
