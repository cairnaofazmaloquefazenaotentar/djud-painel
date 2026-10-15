import { z } from "zod";
import "@/lib/zod-pt";
import {
  MAX_EXCLUSOES,
  MAX_ORCAMENTOS,
  MOTIVO_MAX,
  MOTIVO_MIN,
} from "@/lib/pesquisa-preco-curadoria";
import { escolhaItemSchema } from "@/lib/relatorio-schemas";
import { ALIQUOTAS_TETO, METODOS, REGRAS_TETO } from "@/lib/pesquisa-preco-metodo";

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

/**
 * Registro desconsiderado com justificativa (art. 6º, §§ 1º e 2º da IN
 * 65/2021). A justificativa é obrigatória: sem ela o descarte não é decisão
 * fundamentada, é só um número a menos na conta.
 */
export const exclusaoRegistroSchema = z.object({
  fonte: z.enum([
    "comprasgov",
    "bps",
    "siasg",
    "pncp",
    "arp",
    "similar",
    "midia",
    "orcamentos",
    "notaFiscal",
    "cmed",
  ]),
  id: z.string().trim().min(1, "Registro inválido"),
  motivo: z
    .string()
    .trim()
    .min(MOTIVO_MIN, `Descreva a justificativa do descarte (mín. ${MOTIVO_MIN} caracteres)`)
    .max(MOTIVO_MAX),
});

/** Preço informado pelo responsável: cotação (IV), mídia (III), nota fiscal (V) ou contratação similar (II). */
export const orcamentoSchema = z.object({
  tipo: z.enum(["IV", "III", "V", "II"]).default("IV"),
  url: z
    .string()
    .trim()
    .max(500)
    .refine((v) => /^https?:\/\//i.test(v), { message: "Endereço deve começar com http:// ou https://" })
    .nullable()
    .optional()
    .default(null),
  acessadoEm: z.coerce.date().nullable().optional().default(null),
  chaveNfe: z.string().trim().max(60).nullable().optional().default(null),
  justificativaForaPeriodo: z.string().trim().max(MOTIVO_MAX).nullable().optional().default(null),
  fornecedor: z.string().trim().min(2, "Informe a empresa que apresentou a proposta").max(200),
  cnpj: z.string().trim().max(20).nullable().optional().default(null),
  marca: z.string().trim().max(120).nullable().optional().default(null),
  fabricante: z.string().trim().max(200).nullable().optional().default(null),
  valorUnitario: z.coerce
    .number()
    .positive("Informe o valor por unidade de fornecimento")
    .max(100_000_000),
  dataOrcamento: z.coerce.date({ message: "Informe a data da proposta" }),
  validade: z.coerce.date().nullable().optional().default(null),
  documento: z.string().trim().max(120).nullable().optional().default(null),
  observacao: z.string().trim().max(300).nullable().optional().default(null),
  considerarNoCalculo: z.boolean().default(true),
});

/**
 * Escolhas do responsável que ficam no item e são reaplicadas na emissão:
 * método e teto (P11/P12), justificativa editada, período do art. 5º (D1),
 * IPCA (D2) e prováveis duplicatas mantidas (P18).
 */
const configuracaoItemSchema = {
  metodoPreco: z.enum(METODOS as [string, ...string[]]).nullable().optional(),
  regraTeto: z.enum(REGRAS_TETO as [string, ...string[]]).nullable().optional(),
  aliquotaTeto: z.enum(ALIQUOTAS_TETO as [string, ...string[]]).nullable().optional(),
  justificativa: z.string().trim().max(4000).nullable().optional(),
  /** 12 (padrão), 24 ou 36 meses; 0 = todo o período. */
  periodoMeses: z.union([z.literal(0), z.literal(12), z.literal(24), z.literal(36)]).nullable().optional(),
  justificativaPeriodo: z.string().trim().max(1000).nullable().optional(),
  corrigirIpca: z.boolean().optional(),
  duplicidadesRevertidas: z.array(z.string().max(200)).max(500).optional(),
};

const periodoComJustificativa = (d: { periodoMeses?: number | null; justificativaPeriodo?: string | null }) =>
  d.periodoMeses == null || d.periodoMeses === 12 || (d.justificativaPeriodo ?? "").trim().length >= 20;
const MSG_PERIODO = "Ampliar o período além de 12 meses exige justificativa (mínimo de 20 caracteres)";

export const adicionarItemCestaSchema = z.object({
  codigo: z.string().trim().min(1, "Código do material é obrigatório"),
  unidade: z.string().trim().min(1, "Unidade de fornecimento é obrigatória"),
  uf: ufSchema,
  quantidade: z.coerce.number().int().min(1).max(QUANTIDADE_MAX).default(1),
  observacao: z.string().trim().max(500).nullable().optional(),
  // Curadoria já feita na tela de pesquisa viaja com o item: quem
  // desconsiderou valores e juntou orçamentos antes de mandar para a cesta não
  // precisa refazer o trabalho na hora do relatório consolidado.
  exclusoes: z.array(exclusaoRegistroSchema).max(MAX_EXCLUSOES).optional(),
  orcamentos: z.array(orcamentoSchema).max(MAX_ORCAMENTOS).optional(),
  ...configuracaoItemSchema,
}).refine(periodoComJustificativa, { message: MSG_PERIODO });

/**
 * PATCH do item da cesta. `exclusoes` e `orcamentos` são substituição total,
 * não incremento: a tela de curadoria edita as duas listas inteiras e envia o
 * estado final — diferenciar criação, alteração e remoção de cada linha só
 * acrescentaria pontos de divergência entre tela e banco.
 */
export const atualizarItemCestaSchema = z
  .object({
    quantidade: z.coerce.number().int().min(1).max(QUANTIDADE_MAX).optional(),
    observacao: z.string().trim().max(500).nullable().optional(),
    exclusoes: z.array(exclusaoRegistroSchema).max(MAX_EXCLUSOES).optional(),
    orcamentos: z.array(orcamentoSchema).max(MAX_ORCAMENTOS).optional(),
    ...configuracaoItemSchema,
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: "Informe ao menos um campo do item a alterar",
  })
  .refine(periodoComJustificativa, { message: MSG_PERIODO });

export const relatorioCestaSchema = z.object({
  responsavel: z.string().trim().max(200).default(""),
  cargo: z.string().trim().max(200).default(""),
  orgao: z.string().trim().max(200).default(""),
  processo: z.string().trim().max(200).default(""),
  /** Esvaziar a cesta depois de gerar o relatório (opção da tela). */
  limparCesta: z.boolean().default(false),
  /**
   * Método, teto e justificativa por item (id do CestaItem → escolha), feitos
   * na modal de emissão. O HTML e o mapa XLSX emitidos pela mesma modal usam
   * a mesma escolha, para os dois documentos trazerem o mesmo preço.
   */
  escolhas: z.record(z.string(), escolhaItemSchema).optional().default({}),
});

export type AdicionarItemCestaInput = z.infer<typeof adicionarItemCestaSchema>;
export type AtualizarItemCestaInput = z.infer<typeof atualizarItemCestaSchema>;
export type RelatorioCestaInput = z.infer<typeof relatorioCestaSchema>;
export type OrcamentoInput = z.infer<typeof orcamentoSchema>;
