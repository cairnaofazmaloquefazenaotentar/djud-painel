"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ComboboxOption {
  value: string;
  /** rótulo opcional; se ausente, usa o próprio value */
  label?: string;
  /** contagem opcional exibida à direita (ex.: nº de demandas) */
  count?: number;
}

interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** texto da opção que limpa a seleção (topo da lista) */
  allLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  /** máx. de itens renderizados por vez (virtualização simples) */
  maxRender?: number;
}

/** remove acentos e baixa caixa para busca tolerante */
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function Combobox({
  value,
  onChange,
  options,
  placeholder = "Selecionar...",
  searchPlaceholder = "Buscar...",
  emptyText = "Nenhum resultado.",
  allLabel = "Todos",
  loading = false,
  disabled = false,
  className,
  maxRender = 80,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [highlight, setHighlight] = React.useState(0);

  const rootRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  // fecha ao clicar fora
  React.useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  // foca o input de busca ao abrir
  React.useEffect(() => {
    if (open) {
      setQuery("");
      setHighlight(0);
      // pequeno atraso para garantir que o input já está montado
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const filtered = React.useMemo(() => {
    const q = norm(query.trim());
    if (!q) return options;
    return options.filter((o) => norm(o.label ?? o.value).includes(q));
  }, [options, query]);

  const visible = filtered.slice(0, maxRender);
  const overflow = filtered.length - visible.length;

  const selected = options.find((o) => o.value === value);
  const selectedLabel = selected?.label ?? selected?.value;

  function commit(v: string) {
    onChange(v);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, visible.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = visible[highlight];
      if (opt) commit(opt.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  // mantém o item destacado visível na rolagem
  React.useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-idx="${highlight}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [highlight]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled || loading}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-8 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none transition-[color,box-shadow]",
          "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        <span className={cn("truncate", !selectedLabel && "text-muted-foreground")}>
          {loading ? "Carregando..." : selectedLabel || placeholder}
        </span>
        {value ? (
          <X
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
          />
        ) : (
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div
          className="absolute z-50 mt-1 w-full min-w-[16rem] rounded-md border border-input bg-popover text-popover-foreground shadow-md"
          onKeyDown={onKeyDown}
        >
          <div className="flex items-center gap-2 border-b px-2.5 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlight(0);
              }}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div ref={listRef} className="max-h-72 overflow-y-auto p-1">
            {/* opção "Todos" — limpa a seleção */}
            <button
              type="button"
              onMouseEnter={() => setHighlight(-1)}
              onClick={() => commit("")}
              className={cn(
                "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
                "hover:bg-accent hover:text-accent-foreground",
                !value && "font-medium",
              )}
            >
              <Check
                className={cn("h-3.5 w-3.5 shrink-0", value ? "opacity-0" : "opacity-100")}
              />
              {allLabel}
            </button>

            {visible.length === 0 && (
              <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                {emptyText}
              </div>
            )}

            {visible.map((o, i) => {
              const isSel = o.value === value;
              const isHi = i === highlight;
              return (
                <button
                  key={o.value}
                  type="button"
                  data-idx={i}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => commit(o.value)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
                    isHi && "bg-accent text-accent-foreground",
                    isSel && "font-medium",
                  )}
                >
                  <Check
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      isSel ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="flex-1 truncate">{o.label ?? o.value}</span>
                  {typeof o.count === "number" && (
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {o.count.toLocaleString("pt-BR")}
                    </span>
                  )}
                </button>
              );
            })}

            {overflow > 0 && (
              <div className="px-2 py-2 text-center text-xs text-muted-foreground">
                +{overflow.toLocaleString("pt-BR")} — refine a busca para ver mais
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
