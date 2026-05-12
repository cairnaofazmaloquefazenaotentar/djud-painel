"use client";

import { useEffect } from "react";

export interface Shortcut {
  key: string;          // ex: "k", "n", "Escape"
  ctrl?: boolean;
  meta?: boolean;       // Cmd no Mac
  shift?: boolean;
  description: string;
  action: () => void;
}

/**
 * Registra atalhos de teclado globais.
 * Ignora quando o foco está em inputs/textareas para não interferir na digitação.
 */
export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Não interceptar quando usuário está digitando (exceto ESC)
      const target = e.target as HTMLElement;
      const isEditing =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      for (const shortcut of shortcuts) {
        const ctrlMatch = shortcut.ctrl ? e.ctrlKey || e.metaKey : !e.ctrlKey && !e.metaKey;
        const metaMatch = shortcut.meta ? e.metaKey || e.ctrlKey : true;
        const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey;
        const keyMatch = e.key === shortcut.key || e.key.toLowerCase() === shortcut.key.toLowerCase();

        if (!keyMatch) continue;
        if (!shiftMatch) continue;

        // Ctrl/Meta shortcuts funcionam mesmo em inputs
        if (shortcut.ctrl || shortcut.meta) {
          if (!ctrlMatch && !metaMatch) continue;
          e.preventDefault();
          shortcut.action();
          return;
        }

        // ESC funciona em qualquer lugar
        if (shortcut.key === "Escape") {
          e.preventDefault();
          shortcut.action();
          return;
        }

        // Atalhos simples só fora de inputs
        if (!isEditing) {
          e.preventDefault();
          shortcut.action();
          return;
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shortcuts]);
}
