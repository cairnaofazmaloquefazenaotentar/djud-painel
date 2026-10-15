"use client";

import { useEffect, useRef, useState } from "react";
import { Bookmark, Loader2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useExcluirVisao, useSalvarVisao, useVisoes } from "@/hooks/useDemandas";

// ─────────────────────────────────────────────────────────────────────────────
// Visões salvas da lista de Demandas (P4): o filtro atual com um nome, por
// usuário (UserView). Aplicar uma visão = navegar para a querystring dela.
// ─────────────────────────────────────────────────────────────────────────────

export function VisoesMenu({
  querystring,
  onAplicar,
}: {
  /** Filtro atual, canônico (filtroParaQuery). */
  querystring: string;
  onAplicar: (querystring: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const raiz = useRef<HTMLDivElement>(null);
  const { data, isLoading } = useVisoes();
  const salvar = useSalvarVisao();
  const excluir = useExcluirVisao();

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  const visoes = data?.visoes ?? [];

  return (
    <div className="relative" ref={raiz}>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}>
        <Bookmark className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Visões</span>
      </Button>
      {aberto && (
        <div className="absolute right-0 top-full z-30 mt-1 w-72 space-y-2 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg">
          <p className="text-xs font-medium">Visões salvas</p>
          {isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}
          {!isLoading && visoes.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhuma visão salva ainda.</p>
          )}
          <div className="max-h-56 space-y-0.5 overflow-y-auto">
            {visoes.map((v) => (
              <div key={v.id} className="flex items-center gap-1 rounded px-1 hover:bg-muted">
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate py-1 text-left text-sm"
                  title={v.querystring || "sem filtros"}
                  onClick={() => {
                    onAplicar(v.querystring);
                    setAberto(false);
                  }}
                >
                  {v.name}
                </button>
                <button
                  type="button"
                  aria-label={`Excluir a visão ${v.name}`}
                  className="rounded p-1 text-muted-foreground hover:text-destructive"
                  onClick={() => excluir.mutate(v.id, { onError: (e) => toast.error(e.message) })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <form
            className="flex gap-1 border-t border-border pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              salvar.mutate(
                { nome: nome.trim(), querystring },
                {
                  onSuccess: () => {
                    toast.success(`Visão "${nome.trim()}" salva.`);
                    setNome("");
                  },
                  onError: (er) => toast.error(er.message),
                }
              );
            }}
          >
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome da visão atual"
              className="h-8 text-sm"
              maxLength={100}
            />
            <Button type="submit" size="sm" className="h-8 px-2" disabled={nome.trim().length < 2 || salvar.isPending}>
              {salvar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
