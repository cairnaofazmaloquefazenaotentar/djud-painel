import { z } from "zod";

export const createDemandaSchema = z.object({
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
});

export const updateDemandaSchema = createDemandaSchema.partial();

export const listDemandaSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(10),
  status: z.string().optional(),
  prioridade: z.string().optional(),
  organizacaoId: z.string().optional(),
  busca: z.string().optional(),
  ordenarPor: z.enum(["criado", "atualizado", "vencimento", "prioridade"]).default("criado"),
  ordem: z.enum(["asc", "desc"]).default("desc"),
});

export type CreateDemandaInput = z.infer<typeof createDemandaSchema>;
export type UpdateDemandaInput = z.infer<typeof updateDemandaSchema>;
export type ListDemandaParams = z.infer<typeof listDemandaSchema>;

export const filterMetricsSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  status: z.string().optional(),
  prioridade: z.string().optional(),
  organizacaoId: z.string().optional(),
});

export type FilterMetricsInput = z.infer<typeof filterMetricsSchema>;
