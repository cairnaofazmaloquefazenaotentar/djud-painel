"use client";

import { useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

/**
 * Exibe aviso de confirmação quando o usuário tenta sair da página
 * com dados não salvos.
 *
 * @param isDirty - true quando o formulário tem alterações não salvas
 * @param message - mensagem personalizada (opcional)
 */
export function useBeforeUnload(
  isDirty: boolean,
  message = "Você tem alterações não salvas. Deseja realmente sair?"
) {
  // Aviso no fechamento/reload da aba
  useEffect(() => {
    if (!isDirty) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = message;
      return message;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty, message]);

  /**
   * Navegação segura — confirma antes de navegar se houver dados não salvos.
   * Usar no lugar de router.push() nas páginas com formulário.
   */
  const safeNavigate = useCallback(
    (href: string, push: (href: string) => void) => {
      if (!isDirty) {
        push(href);
        return;
      }
      if (window.confirm(message)) {
        push(href);
      }
    },
    [isDirty, message]
  );

  return { safeNavigate };
}
