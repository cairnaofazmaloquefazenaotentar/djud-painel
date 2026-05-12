"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { Keyboard, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Provider global de atalhos de teclado.
 * Montar no layout autenticado para disponibilizar em todas as páginas.
 *
 * Atalhos implementados:
 * - Ctrl+K  → Foca a busca na página de Demandas
 * - Ctrl+N  → Navega para criar nova demanda
 * - ?       → Abre/fecha o painel de atalhos
 * - Escape  → Fecha o painel de atalhos
 */
export function KeyboardShortcutsProvider({
  children,
}: {
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [showPanel, setShowPanel] = useState(false);

  const focusSearch = useCallback(() => {
    const input =
      document.querySelector<HTMLInputElement>('input[placeholder*="usca"]') ||
      document.querySelector<HTMLInputElement>('input[type="search"]') ||
      document.querySelector<HTMLInputElement>('input[name="busca"]');
    if (input) {
      input.focus();
      input.select();
    } else {
      router.push("/demandas");
    }
  }, [router]);

  useKeyboardShortcuts([
    {
      key: "k",
      ctrl: true,
      description: "Focar busca",
      action: focusSearch,
    },
    {
      key: "n",
      ctrl: true,
      description: "Nova demanda",
      action: () => router.push("/demandas/new"),
    },
    {
      key: "?",
      shift: true,
      description: "Mostrar atalhos",
      action: () => setShowPanel((v) => !v),
    },
    {
      key: "Escape",
      description: "Fechar painel",
      action: () => setShowPanel(false),
    },
  ]);

  return (
    <>
      {children}

      <AnimatePresence>
        {showPanel && (
          <>
            {/* Overlay */}
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm"
              onClick={() => setShowPanel(false)}
            />

            {/* Panel */}
            <motion.div
              key="panel"
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              transition={{ duration: 0.15 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm bg-card border border-border rounded-xl shadow-2xl p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Keyboard className="h-4 w-4 text-primary" />
                  <h2 className="font-semibold text-sm">Atalhos de Teclado</h2>
                </div>
                <button
                  onClick={() => setShowPanel(false)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Fechar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-2">
                {SHORTCUTS_HELP.map((s) => (
                  <div
                    key={s.keys.join("+")}
                    className="flex items-center justify-between py-1.5"
                  >
                    <span className="text-sm text-muted-foreground">
                      {s.description}
                    </span>
                    <div className="flex items-center gap-1">
                      {s.keys.map((k) => (
                        <kbd
                          key={k}
                          className="px-1.5 py-0.5 text-xs font-mono bg-muted border border-border rounded text-foreground"
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <p className="mt-4 text-xs text-muted-foreground/60 text-center">
                Pressione <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Esc</kbd> para fechar
              </p>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

const SHORTCUTS_HELP = [
  { keys: ["Ctrl", "K"], description: "Focar campo de busca" },
  { keys: ["Ctrl", "N"], description: "Nova demanda" },
  { keys: ["?"], description: "Mostrar/ocultar atalhos" },
  { keys: ["Esc"], description: "Fechar modal / painel" },
];
