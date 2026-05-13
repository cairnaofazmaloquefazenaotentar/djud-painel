import { z } from "zod";

/**
 * Mapa de erros Zod em português do Brasil.
 * Aplicado globalmente via `z.setErrorMap(zodPtErrorMap)`.
 *
 * Uso: importar e chamar uma vez em `app/layout.tsx` ou `lib/schemas.ts`:
 *   import "@/lib/zod-pt";
 */
const zodPtErrorMap: z.ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      if (issue.received === "undefined" || issue.received === "null") {
        return { message: "Campo obrigatório" };
      }
      if (issue.expected === "number") {
        return { message: "Deve ser um número válido" };
      }
      if (issue.expected === "string") {
        return { message: "Deve ser um texto" };
      }
      if (issue.expected === "date") {
        return { message: "Data inválida" };
      }
      return { message: "Valor inválido" };

    case z.ZodIssueCode.too_small:
      if (issue.type === "string") {
        if (issue.minimum === 1) return { message: "Campo obrigatório" };
        return {
          message: `Deve ter no mínimo ${issue.minimum} caractere${issue.minimum !== 1 ? "s" : ""}`,
        };
      }
      if (issue.type === "number") {
        return { message: `Deve ser maior ou igual a ${issue.minimum}` };
      }
      if (issue.type === "array") {
        return {
          message: `Deve ter no mínimo ${issue.minimum} item${issue.minimum !== 1 ? "s" : ""}`,
        };
      }
      return { message: `Valor muito pequeno (mínimo: ${issue.minimum})` };

    case z.ZodIssueCode.too_big:
      if (issue.type === "string") {
        return {
          message: `Deve ter no máximo ${issue.maximum} caractere${issue.maximum !== 1 ? "s" : ""}`,
        };
      }
      if (issue.type === "number") {
        return { message: `Deve ser menor ou igual a ${issue.maximum}` };
      }
      if (issue.type === "array") {
        return {
          message: `Deve ter no máximo ${issue.maximum} item${issue.maximum !== 1 ? "s" : ""}`,
        };
      }
      return { message: `Valor muito grande (máximo: ${issue.maximum})` };

    case z.ZodIssueCode.invalid_string:
      if (issue.validation === "email") {
        return { message: "E-mail inválido" };
      }
      if (issue.validation === "url") {
        return { message: "URL inválida" };
      }
      if (issue.validation === "uuid") {
        return { message: "ID inválido" };
      }
      if (issue.validation === "datetime") {
        return { message: "Data e hora inválidas" };
      }
      return { message: "Formato inválido" };

    case z.ZodIssueCode.invalid_enum_value:
      return {
        message: `Valor inválido. Opções: ${(issue.options as string[]).join(", ")}`,
      };

    case z.ZodIssueCode.not_finite:
      return { message: "Deve ser um número finito" };

    case z.ZodIssueCode.custom:
      return { message: issue.message ?? "Valor inválido" };

    default:
      return { message: ctx.defaultError };
  }
};

// Aplicar globalmente
z.setErrorMap(zodPtErrorMap);

export { zodPtErrorMap };
