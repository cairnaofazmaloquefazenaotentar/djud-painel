import { z } from "zod";
import "@/lib/zod-pt";
import { ALIQUOTAS_TETO, METODOS, REGRAS_TETO } from "@/lib/pesquisa-preco-metodo";

// ─────────────────────────────────────────────────────────────────────────────
// Pedidos de emissão dos relatórios de Pesquisa de Preços (HTML e mapa XLSX no
// modelo da DLOG). O relatório de um item e o da cesta aceitam a mesma escolha
// de método e teto por item (P11/P12) e a justificativa editada.
// ─────────────────────────────────────────────────────────────────────────────

/** Quantidade máxima por item — a mesma da cesta (QUANTIDADE_MAX). */
const QUANTIDADE_MAX = 1_000_000;

/** Justificativa editada pelo responsável; o painel gera uma quando ausente. */
export const JUSTIFICATIVA_MAX = 4000;

export const escolhaItemSchema = z.object({
  metodo: z.enum(METODOS as [string, ...string[]]).optional(),
  regraTeto: z.enum(REGRAS_TETO as [string, ...string[]]).optional(),
  aliquota: z.enum(ALIQUOTAS_TETO as [string, ...string[]]).optional(),
  justificativa: z.string().trim().max(JUSTIFICATIVA_MAX).nullable().optional(),
});

export type EscolhaItemInput = z.infer<typeof escolhaItemSchema>;

/** Período do art. 5º; a ampliação sem justificativa é recusada pela rota (validarPeriodo). */
export const periodoSchema = z.object({
  dataReferencia: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  mesesMercado: z.union([z.literal(12), z.literal(24), z.literal(36), z.null()]).optional(),
  justificativaAmpliacao: z.string().trim().max(1000).nullable().optional(),
});

const textoOpcional = (max: number) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v ?? "").trim().slice(0, max));

/** Corpo do relatório de um item (pesquisa da tela), em HTML ou XLSX. */
export const relatorioAvulsoSchema = z.object({
  codigo: z.string().trim().min(1, "Informe o código do material"),
  unidade: z.string().trim().min(1, "Informe a unidade de fornecimento"),
  uf: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => {
      const s = (v ?? "").trim().toUpperCase();
      return s === "" || s === "TODOS" ? null : s;
    })
    .refine((v) => v === null || /^[A-Z]{2}$/.test(v), { message: "UF inválida" }),
  fornecedor: z.string().nullable().optional(),
  fabricante: z.string().nullable().optional(),
  cnpjComprador: z.string().nullable().optional(),
  // Normalizados em pesquisarPrecos (normalizarExclusoes/normalizarOrcamentos).
  exclusoes: z.array(z.unknown()).max(500).optional().default([]),
  orcamentos: z.array(z.unknown()).max(50).optional().default([]),
  orgao: textoOpcional(200),
  responsavel: textoOpcional(200),
  cargo: textoOpcional(200),
  processo: textoOpcional(200),
  especificacao: textoOpcional(500),
  quantidade: z.coerce.number().int().min(1).max(QUANTIDADE_MAX).optional().default(1),
  escolha: escolhaItemSchema.optional(),
  /** Período do art. 5º (D1) e IPCA (D2) da pesquisa da tela. */
  periodo: periodoSchema.optional(),
  corrigirIpca: z.boolean().optional().default(true),
  /** Prováveis duplicatas mantidas no conjunto único (P18). */
  duplicidadesRevertidas: z.array(z.string().max(200)).max(500).optional().default([]),
});

export type RelatorioAvulsoInput = z.infer<typeof relatorioAvulsoSchema>;

/** A escolha foi feita pelo responsável (e não herdada do padrão)? */
export function escolhaExplicita(e: EscolhaItemInput | undefined | null): boolean {
  return !!e?.metodo && !!e?.regraTeto;
}
