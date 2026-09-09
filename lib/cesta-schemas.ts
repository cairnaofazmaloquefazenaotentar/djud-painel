import { z } from "zod";
import "@/lib/zod-pt";

// ─────────────────────────────────────────────────────────────────────────────
// Cesta de itens da Pesquisa de Preços — validação das rotas /api/precos/cesta
// e /api/relatorios/cesta.
// ─────────────────────────────────────────────────────────────────────────────

/** Teto de itens por cesta — o relatório refaz uma pesquisa completa por item. */
export const MAX_ITENS_CESTA = 30;

export const QUANTIDADE_MAX = 1_000_000;

/** "", "todos" e ausência viram null (= todas as UFs), como no filtro da tela. */
const ufSchema = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => {
    const s = (v ?? "").trim().toUpperCase();
    return s === "" || s === "TODOS" ? null : s;
  })
  .refine((v) => v === null || /^[A-Z]{2}$/.test(v), { message: "UF inválida" });

export const adicionarItemCestaSchema = z.object({
  codigo: z.string().trim().min(1, "Código do material é obrigatório"),
  unidade: z.string().trim().min(1, "Unidade de fornecimento é obrigatória"),
  uf: ufSchema,
  quantidade: z.coerce.number().int().min(1).max(QUANTIDADE_MAX).default(1),
  observacao: z.string().trim().max(500).nullable().optional(),
});

export const atualizarItemCestaSchema = z
  .object({
    quantidade: z.coerce.number().int().min(1).max(QUANTIDADE_MAX).optional(),
    observacao: z.string().trim().max(500).nullable().optional(),
  })
  .refine((d) => d.quantidade !== undefined || d.observacao !== undefined, {
    message: "Informe quantidade ou observação",
  });

export const relatorioCestaSchema = z.object({
  responsavel: z.string().trim().max(200).default(""),
  cargo: z.string().trim().max(200).default(""),
  orgao: z.string().trim().max(200).default(""),
  processo: z.string().trim().max(200).default(""),
  /** Esvaziar a cesta depois de gerar o relatório (opção da tela). */
  limparCesta: z.boolean().default(false),
});

export type AdicionarItemCestaInput = z.infer<typeof adicionarItemCestaSchema>;
export type AtualizarItemCestaInput = z.infer<typeof atualizarItemCestaSchema>;
export type RelatorioCestaInput = z.infer<typeof relatorioCestaSchema>;
