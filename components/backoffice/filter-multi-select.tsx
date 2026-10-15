"use client";

import * as React from "react";
import { Ban, Check, ChevronsUpDown, Search, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { AtalhoSelecao, SelecaoCampo } from "@/lib/demandas-filtro-tipos";

// ─────────────────────────────────────────────────────────────────────────────
// Seleção múltipla com exclusão (A1 da avaliação da DLOG). Cada opção tem três
// estados — neutro, incluir, excluir — e o clique avança entre eles. Busca,
// "Selecionar todos" (os visíveis), contagem por valor, atalhos (p.ex. os
// grupos de status) e um resumo no botão. Só tokens do design system.
// ─────────────────────────────────────────────────────────────────────────────

export interface OpcaoMultiSelect {
  valor: string;
  rotulo: string;
  contagem?: number;
}

interface FilterMultiSelectProps {
  label: string;
  opcoes: OpcaoMultiSelect[];
  valor: SelecaoCampo | undefined;
  onChange: (s: SelecaoCampo) => void;
  carregando?: boolean;
  atalhos?: AtalhoSelecao[];
  placeholder?: string;
  className?: string;
}

const VAZIO: SelecaoCampo = { incluir: [], excluir: [] };

function norm(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

type Estado = "neutro" | "incluir" | "excluir";

export function FilterMultiSelect({
  label,
  opcoes,
  valor,
  onChange,
  carregando = false,
  atalhos = [],
  placeholder = "Todos",
  className,
}: FilterMultiSelectProps) {
  const sel = valor ?? VAZIO;
  const [aberto, setAberto] = React.useState(false);
  const [busca, setBusca] = React.useState("");
  const raiz = React.useRef<HTMLDivElement>(null);
  const id = React.useId();

  React.useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  const rotuloDe = React.useMemo(() => new Map(opcoes.map((o) => [o.valor, o.rotulo])), [opcoes]);
  const visiveis = React.useMemo(() => {
    const q = norm(busca.trim());
    return q ? opcoes.filter((o) => norm(o.rotulo).includes(q)) : opcoes;
  }, [busca, opcoes]);

  const estado = (v: string): Estado =>
    sel.incluir.includes(v) ? "incluir" : sel.excluir.includes(v) ? "excluir" : "neutro";

  const definir = (v: string, novo: Estado) => {
    const incluir = sel.incluir.filter((x) => x !== v);
    const excluir = sel.excluir.filter((x) => x !== v);
    if (novo === "incluir") incluir.push(v);
    if (novo === "excluir") excluir.push(v);
    onChange({ incluir, excluir });
  };

  // neutro → incluir → excluir → neutro
  const avancar = (v: string) => {
    const e = estado(v);
    definir(v, e === "neutro" ? "incluir" : e === "incluir" ? "excluir" : "neutro");
  };

  const selecionarVisiveis = () => {
    const vs = visiveis.map((o) => o.valor);
    onChange({
      incluir: Array.from(new Set([...sel.incluir, ...vs])),
      excluir: sel.excluir.filter((x) => !vs.includes(x)),
    });
  };

  const total = sel.incluir.length + sel.excluir.length;
  const nome = (v: string) => rotuloDe.get(v) ?? v;
  const resumo =
    total === 0
      ? placeholder
      : [
          sel.incluir.length === 1 ? nome(sel.incluir[0]) : sel.incluir.length > 1 ? `${sel.incluir.length} incluídos` : null,
          sel.excluir.length === 1
            ? `exceto ${nome(sel.excluir[0])}`
            : sel.excluir.length > 1
              ? `${sel.excluir.length} excluídos`
              : null,
        ]
          .filter(Boolean)
          .join(" · ");

  return (
    <div className={cn("space-y-1.5", className)} ref={raiz}>
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      <div className="relative">
        <button
          id={id}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={aberto}
          onClick={() => setAberto((v) => !v)}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm shadow-xs transition-colors",
            "hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            total > 0 ? "text-foreground" : "text-muted-foreground"
          )}
        >
          <span className="min-w-0 truncate">{resumo}</span>
          <span className="flex shrink-0 items-center gap-1">
            {total > 0 && (
              <span
                role="button"
                tabIndex={0}
                aria-label={`Limpar ${label}`}
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(VAZIO);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onChange(VAZIO);
                  }
                }}
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-60" />
          </span>
        </button>

        {aberto && (
          <div className="absolute left-0 right-0 top-full z-30 mt-1 min-w-64 rounded-md border border-border bg-popover text-popover-foreground shadow-lg">
            <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                autoFocus
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar…"
                aria-label={`Buscar em ${label}`}
                className="h-7 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>

            {atalhos.length > 0 && (
              <div className="flex flex-wrap gap-1 border-b border-border px-2 py-1.5">
                {atalhos.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    onClick={() => onChange(a.aplicar(opcoes.map((o) => o.valor)))}
                  >
                    {a.rotulo}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-1 text-[11px] text-muted-foreground">
              <button type="button" className="hover:text-foreground" onClick={selecionarVisiveis}>
                Selecionar todos{busca ? " os visíveis" : ""}
              </button>
              <span>clique: incluir · de novo: excluir</span>
              <button type="button" className="hover:text-foreground" onClick={() => onChange(VAZIO)} disabled={total === 0}>
                Limpar
              </button>
            </div>

            <div role="listbox" aria-multiselectable="true" aria-label={label} className="max-h-64 overflow-y-auto py-1">
              {carregando && <p className="px-3 py-2 text-xs text-muted-foreground">Carregando opções…</p>}
              {!carregando && visiveis.length === 0 && (
                <p className="px-3 py-2 text-xs text-muted-foreground">Nenhuma opção.</p>
              )}
              {visiveis.map((o) => {
                const e = estado(o.valor);
                return (
                  <button
                    key={o.valor}
                    type="button"
                    role="option"
                    aria-selected={e !== "neutro"}
                    title={e === "neutro" ? "Incluir" : e === "incluir" ? "Clique para excluir" : "Clique para voltar ao neutro"}
                    onClick={() => avancar(o.valor)}
                    className={cn(
                      "flex w-full items-center gap-2 px-2 py-1 text-left text-sm hover:bg-accent hover:text-accent-foreground",
                      e === "excluir" && "text-destructive"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                        e === "incluir" && "border-primary bg-primary text-primary-foreground",
                        e === "excluir" && "border-destructive bg-destructive/10 text-destructive",
                        e === "neutro" && "border-input"
                      )}
                      aria-hidden
                    >
                      {e === "incluir" && <Check className="h-3 w-3" />}
                      {e === "excluir" && <Ban className="h-3 w-3" />}
                    </span>
                    <span className={cn("min-w-0 flex-1 truncate", e === "excluir" && "line-through")}>{o.rotulo}</span>
                    {o.contagem !== undefined && (
                      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        {o.contagem.toLocaleString("pt-BR")}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
