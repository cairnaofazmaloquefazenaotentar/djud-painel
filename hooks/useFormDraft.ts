"use client";

import { useEffect, useRef, useCallback } from "react";

const DRAFT_PREFIX = "djud_draft_";
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

interface DraftData<T> {
  data: T;
  savedAt: number;
}

/**
 * Auto-save de rascunho em localStorage para formulários.
 *
 * @param key       - Chave única (ex: "demanda-new", "demanda-abc123")
 * @param getValue  - Função que retorna os valores atuais do formulário
 * @param onRestore - Callback chamado com os dados do rascunho ao montar
 * @param enabled   - Desabilitar auto-save (ex: em modo read-only)
 */
export function useFormDraft<T extends Record<string, unknown>>(
  key: string,
  getValue: () => T,
  onRestore: (data: T) => void,
  enabled = true
) {
  const storageKey = `${DRAFT_PREFIX}${key}`;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasRestoredRef = useRef(false);

  // Restaurar rascunho ao montar (apenas uma vez)
  useEffect(() => {
    if (!enabled || hasRestoredRef.current) return;
    hasRestoredRef.current = true;

    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;

      const draft: DraftData<T> = JSON.parse(raw);
      if (Date.now() - draft.savedAt > DRAFT_TTL_MS) {
        localStorage.removeItem(storageKey);
        return;
      }

      onRestore(draft.data);
    } catch {
      // ignorar erros de parse
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, storageKey]);

  // Auto-save a cada 30s
  useEffect(() => {
    if (!enabled) return;

    timerRef.current = setInterval(() => {
      try {
        const data = getValue();
        const draft: DraftData<T> = { data, savedAt: Date.now() };
        localStorage.setItem(storageKey, JSON.stringify(draft));
      } catch {
        // ignorar erros de serialização
      }
    }, 30_000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, storageKey]);

  /** Salvar rascunho imediatamente */
  const saveDraft = useCallback(() => {
    if (!enabled) return;
    try {
      const data = getValue();
      const draft: DraftData<T> = { data, savedAt: Date.now() };
      localStorage.setItem(storageKey, JSON.stringify(draft));
    } catch { /* ignorar */ }
  }, [enabled, storageKey, getValue]);

  /** Limpar rascunho (chamar após submit bem-sucedido) */
  const clearDraft = useCallback(() => {
    localStorage.removeItem(storageKey);
  }, [storageKey]);

  /** Verificar se existe rascunho salvo */
  const hasDraft = useCallback((): boolean => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return false;
      const draft: DraftData<T> = JSON.parse(raw);
      return Date.now() - draft.savedAt <= DRAFT_TTL_MS;
    } catch {
      return false;
    }
  }, [storageKey]);

  return { saveDraft, clearDraft, hasDraft };
}
