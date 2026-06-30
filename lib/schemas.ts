import { z } from "zod";
// Aplica mensagens de erro em português para todos os schemas
import "@/lib/zod-pt";

// Objeto base sem refine — permite .partial() para updateDemandaSchema
const demandaBaseObject = z.object({
  numero: z.string().min(1, "Número é obrigatório"),
  titulo: z.string().min(3, "Título deve ter no mínimo 3 caracteres"),
  descricao: z.string().min(10, "Descrição deve ter no mínimo 10 caracteres"),
  status: z.string().optional(),
  prioridade: z.string().optional(),
  organizacaoId: z.string().optional(),
  responsavelId: z.string().optional(),
  dataInicio: z.coerce.date().optional(),
  dataVencimento: z.coerce.date().optional(),
  tags: z.array(z.string()).default([]),
  metadados: z.record(z.any()).optional(),
  projeto: z.string().optional(),
  ano: z.coerce.number().int().optional(),
  origemDemanda: z.string().optional(),
  // Campos Sprint 8 — dados judiciais Redmine
  numeroProcesso: z.string().optional(),
  areaTematica: z.string().optional(),
  regiaoBrasil: z.string().optional(),
  objetoAcao: z.string().optional(),
  principioAtivo: z.string().optional(),
  dataEntradaDJUD: z.coerce.date().optional(),
  trfRegiao: z.coerce.number().int().optional(),
  pontoControle: z.string().optional(),
});

// createDemandaSchema — com refine de datas coerentes (H5)
export const createDemandaSchema = demandaBaseObject
  .refine(
    (data) =>
      !data.dataInicio ||
      !data.dataVencimento ||
      data.dataVencimento >= data.dataInicio,
    {
      message: "Data de vencimento deve ser igual ou posterior à data de início",
      path: ["dataVencimento"],
    }
  )
  .refine(
    (data) => !data.dataEntradaDJUD || data.dataEntradaDJUD <= new Date(),
    {
      message: "Data de entrada no DJUD não pode ser no futuro",
      path: ["dataEntradaDJUD"],
    }
  );

// updateDemandaSchema — a partir do objeto base (sem refine) para permitir .partial()
export const updateDemandaSchema = demandaBaseObject.partial();

export const listDemandaSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  // Max 10000 para suportar exportação CSV completa (ex.: pageSize=5000)
  pageSize: z.coerce.number().int().positive().max(10000).default(10),
  status: z.string().optional(),
  prioridade: z.string().optional(),
  organizacaoId: z.string().optional(),
  busca: z.string().optional(),
  ordenarPor: z.enum(["criado", "atualizado", "vencimento", "prioridade"]).default("criado"),
  ordem: z.enum(["asc", "desc"]).default("desc"),
  // Sprint 8 — filtros campos judiciais Redmine
  areaTematica: z.string().optional(),
  trfRegiao: z.coerce.number().int().optional(),
  regiaoBrasil: z.string().optional(),
});

export type CreateDemandaInput = z.infer<typeof createDemandaSchema>;
export type UpdateDemandaInput = z.infer<typeof updateDemandaSchema>;
export type ListDemandaParams = z.infer<typeof listDemandaSchema>;

export const filterMetricsSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  status: z.string().optional(),
  prioridade: z.string().optional(),
  principioAtivo: z.string().optional(),
  organizacaoId: z.string().optional(),
});

export type FilterMetricsInput = z.infer<typeof filterMetricsSchema>;
