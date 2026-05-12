"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { findTerm } from "@/lib/legal-glossary";
import { cn } from "@/lib/utils";

interface LegalTermProps {
  term: string;
  children?: React.ReactNode;
  className?: string;
}

/**
 * Exibe um termo jurídico sublinhado com tooltip de definição.
 * Usa o glossário em `lib/legal-glossary.ts`.
 *
 * @example
 * <LegalTerm term="TRF">3ª Região</LegalTerm>
 * <LegalTerm term="Princípio Ativo" />
 */
export function LegalTerm({ term, children, className }: LegalTermProps) {
  const entry = findTerm(term);

  if (!entry) {
    return <span className={className}>{children ?? term}</span>;
  }

  return (
    <TooltipPrimitive.Provider delayDuration={300}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          <span
            className={cn(
              "cursor-help underline decoration-dotted decoration-muted-foreground/50 underline-offset-2 hover:decoration-primary transition-colors",
              className
            )}
          >
            {children ?? term}
          </span>
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            sideOffset={6}
            className="z-50 max-w-[300px] rounded-lg bg-popover px-3 py-2.5 shadow-md border border-border"
          >
            <p className="text-xs font-semibold text-foreground mb-1">
              {entry.acronym ? `${entry.term} (${entry.acronym})` : entry.term}
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {entry.definition}
            </p>
            <TooltipPrimitive.Arrow className="fill-popover" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
