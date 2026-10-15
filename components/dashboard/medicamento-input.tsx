"use client";

import * as React from "react";
import { Pill, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PrincipioAtivoOption } from "@/hooks/usePrincipiosAtivos";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Campo "Medicamento" do Dashboard (B3): texto livre, com sugestões por
// substância canônica e a contagem de demandas. Aplica ao escolher uma
// sugestão, ao teclar Enter ou 450 ms depois da última tecla — a mesma
// semântica do filtro da lista (radical da substância, lib/substancia.ts).
// ─────────────────────────────────────────────────────────────────────────────

const PAUSA = 450;
const MAX_SUGESTOES = 12;

function norm(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function MedicamentoInput({
  valor,
  onAplicar,
  sugestoes,
  carregando,
  className,
}: {
  valor: string;
  onAplicar: (v: string) => void;
  sugestoes: PrincipioAtivoOption[];
  carregando?: boolean;
  className?: string;
}) {
  const [texto, setTexto] = React.useState(valor);
  const [aberto, setAberto] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const raiz = React.useRef<HTMLDivElement>(null);
  const id = React.useId();

  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  React.useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  const aplicar = (v: string) => {
    if (timer.current) clearTimeout(timer.current);
    onAplicar(v.trim());
  };

  const visiveis = React.useMemo(() => {
    const q = norm(texto.trim());
    const lista = q
      ? sugestoes.filter((s) => norm(s.value).includes(q) || norm(s.radical).includes(q) || q.includes(norm(s.radical)))
      : sugestoes;
    return lista.slice(0, MAX_SUGESTOES);
  }, [sugestoes, texto]);

  return (
    <div className={cn("relative flex flex-col gap-1.5", className)} ref={raiz}>
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        Medicamento
      </Label>
      <div className="relative">
        <Pill className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          value={texto}
          placeholder="Ex.: eltrombopag"
          autoComplete="off"
          role="combobox"
          aria-expanded={aberto}
          aria-controls={`${id}-lista`}
          className="pl-7 pr-7"
          onFocus={() => setAberto(true)}
          onChange={(e) => {
            const v = e.target.value;
            setTexto(v);
            setAberto(true);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => onAplicar(v.trim()), PAUSA);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              aplicar(texto);
              setAberto(false);
            }
            if (e.key === "Escape") setAberto(false);
          }}
        />
        {texto && (
          <button
            type="button"
            aria-label="Limpar medicamento"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            onClick={() => {
              setTexto("");
              aplicar("");
            }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {aberto && (visiveis.length > 0 || carregando) && (
        <div
          id={`${id}-lista`}
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-lg"
        >
          {carregando && <p className="px-3 py-1.5 text-xs text-muted-foreground">Carregando sugestões…</p>}
          {visiveis.map((s) => (
            <button
              key={s.radical}
              type="button"
              role="option"
              aria-selected={norm(s.value) === norm(valor)}
              className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              onClick={() => {
                setTexto(s.value);
                aplicar(s.value);
                setAberto(false);
              }}
            >
              <span className="truncate">{s.value}</span>
              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{s.count.toLocaleString("pt-BR")}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
