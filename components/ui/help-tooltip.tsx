"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface HelpTooltipProps {
  content: React.ReactNode;
  className?: string;
  iconClassName?: string;
  side?: "top" | "right" | "bottom" | "left";
}

/**
 * Ícone `?` com tooltip de ajuda inline.
 * Usar ao lado de labels de campos de formulário para explicar o campo.
 *
 * @example
 * <Label>Princípio Ativo <HelpTooltip content="Nome genérico do medicamento conforme a RENAME." /></Label>
 */
export function HelpTooltip({
  content,
  className,
  iconClassName,
  side = "top",
}: HelpTooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={200}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex items-center justify-center rounded-full w-4 h-4 text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              className
            )}
            aria-label="Ajuda"
          >
            <HelpCircle className={cn("w-3.5 h-3.5", iconClassName)} />
          </button>
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={6}
            className="z-50 max-w-[280px] rounded-lg bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md border border-border animate-in fade-in-0 zoom-in-95"
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-popover" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
