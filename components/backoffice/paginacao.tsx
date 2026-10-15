"use client";

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Paginação de lista paginada no SERVIDOR: "Página X de Y" com o total real,
// primeira/anterior/próxima/última e, opcionalmente, itens por página. Fica
// acima da tabela, antes do cabeçalho dos registros.
// ─────────────────────────────────────────────────────────────────────────────

interface PaginacaoProps {
  pagina: number;
  totalPaginas: number;
  totalRegistros?: number;
  onPagina: (p: number) => void;
  tamanho?: number;
  tamanhos?: number[];
  onTamanho?: (n: number) => void;
  carregando?: boolean;
  className?: string;
}

export function Paginacao({
  pagina,
  totalPaginas,
  totalRegistros,
  onPagina,
  tamanho,
  tamanhos = [20, 50, 100],
  onTamanho,
  carregando = false,
  className,
}: PaginacaoProps) {
  const ultima = Math.max(1, totalPaginas);
  const botoes = [
    { rotulo: "Primeira página", icone: ChevronsLeft, alvo: 1, desabilitado: pagina <= 1 },
    { rotulo: "Página anterior", icone: ChevronLeft, alvo: pagina - 1, desabilitado: pagina <= 1 },
    { rotulo: "Próxima página", icone: ChevronRight, alvo: pagina + 1, desabilitado: pagina >= ultima },
    { rotulo: "Última página", icone: ChevronsRight, alvo: ultima, desabilitado: pagina >= ultima },
  ];
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3 px-1", className)}>
      {onTamanho && tamanho ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Itens por página:</span>
          <div className="flex gap-1">
            {tamanhos.map((n) => (
              <Button
                key={n}
                variant={tamanho === n ? "default" : "outline"}
                size="sm"
                className="h-7 px-2.5 text-xs"
                aria-pressed={tamanho === n}
                onClick={() => onTamanho(n)}
              >
                {n}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-3">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          Página <span className="font-semibold text-foreground">{pagina.toLocaleString("pt-BR")}</span> de{" "}
          <span className="font-semibold text-foreground">{ultima.toLocaleString("pt-BR")}</span>
          {totalRegistros !== undefined && (
            <span> · {totalRegistros.toLocaleString("pt-BR")} registro(s)</span>
          )}
        </p>
        <div className="flex gap-1">
          {botoes.map(({ rotulo, icone: Icone, alvo, desabilitado }) => (
            <Button
              key={rotulo}
              variant="outline"
              size="sm"
              aria-label={rotulo}
              title={rotulo}
              disabled={desabilitado || carregando}
              onClick={() => onPagina(Math.min(ultima, Math.max(1, alvo)))}
              className="h-7 w-7 p-0 transition-all hover:border-primary/40 hover:text-primary disabled:opacity-30"
            >
              <Icone className="h-3.5 w-3.5" />
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
