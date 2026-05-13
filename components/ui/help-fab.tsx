"use client";

import Link from "next/link";
import { HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Botão flutuante (FAB) de ajuda — fixo no canto inferior direito.
 * Presente em todas as páginas autenticadas via layout.tsx.
 */
export function HelpFab() {
  return (
    <TooltipProvider delayDuration={400}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href="/help"
            className="fixed bottom-6 right-6 z-50 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            aria-label="Central de Ajuda"
          >
            <HelpCircle className="h-5 w-5" />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="left">
          Central de Ajuda
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
