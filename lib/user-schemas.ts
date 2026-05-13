import { z } from "zod";
import "@/lib/zod-pt";

export const createUserSchema = z.object({
  email: z.string().email("Email inválido"),
  name: z.string().min(2, "Nome deve ter no mínimo 2 caracteres"),
  role: z.enum(["ADMIN", "MANAGER", "OPERATOR"]).default("OPERATOR"),
  organizacaoId: z.string().optional(),
});

export const updateUserSchema = createUserSchema.partial().extend({
  role: z.enum(["ADMIN", "MANAGER", "OPERATOR"]).optional(),
});

export const listUsersSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(10),
  busca: z.string().optional(),
  role: z.enum(["ADMIN", "MANAGER", "OPERATOR"]).optional(),
  organizacaoId: z.string().optional(),
  ordenarPor: z.enum(["criado", "nome", "email"]).default("criado"),
  ordem: z.enum(["asc", "desc"]).default("desc"),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ListUsersParams = z.infer<typeof listUsersSchema>;
