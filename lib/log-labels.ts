/**
 * Mapeamento de chaves técnicas → labels legíveis em pt-BR
 * Usado na página de Logs de Auditoria para formatar o diff de mudanças.
 */

export const ENTITY_LABELS: Record<string, string> = {
  Demanda: "Demanda",
  User: "Usuário",
  Organization: "Organização",
  Attachment: "Anexo",
};

export const FIELD_LABELS: Record<string, string> = {
  // Demanda — campos básicos
  numero: "Número",
  titulo: "Título",
  descricao: "Descrição",
  status: "Status",
  prioridade: "Prioridade",
  projeto: "Projeto",
  ano: "Ano",
  origemDemanda: "Origem",
  tags: "Tags",

  // Demanda — responsabilidades
  organizacaoId: "Organização",
  responsavelId: "Responsável",

  // Demanda — datas
  dataInicio: "Data Início",
  dataVencimento: "Data Vencimento",
  criadoEm: "Criado em",
  atualizadoEm: "Atualizado em",
  deletedAt: "Excluído em",

  // Demanda — dados judiciais
  numeroProcesso: "Nº Processo",
  areaTematica: "Grupo Temático",
  regiaoBrasil: "Região Brasil",
  objetoAcao: "Objeto da Ação",
  principioAtivo: "Princípio Ativo",
  dataEntradaDJUD: "Entrada DJUD",
  trfRegiao: "TRF Região",
  pontoControle: "Ponto de Controle",
  numeroExterno: "ID Externo (Redmine)",

  // User
  name: "Nome",
  email: "E-mail",
  role: "Função",
  organizationId: "Organização",
  image: "Foto",

  // Organization
  cnpj: "CNPJ",
  telefone: "Telefone",
  endereco: "Endereço",

  // Attachment
  fileName: "Arquivo",
  fileSize: "Tamanho",
  mimeType: "Tipo",
  storagePath: "Caminho",
};

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrador",
  MANAGER: "Gestor",
  OPERATOR: "Operador",
};

/** Formata um valor de change de forma legível */
export function formatChangeValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";

  // Datas
  if (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T/.test(value)
  ) {
    return new Date(value).toLocaleString("pt-BR");
  }

  // Roles
  if (key === "role" && typeof value === "string") {
    return ROLE_LABELS[value] ?? value;
  }

  // TRF Região
  if (key === "trfRegiao" && typeof value === "number") {
    return `${value}ª Região`;
  }

  // Arrays
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(", ") : "—";
  }

  return String(value);
}

/**
 * Renderiza o diff de um log como array de linhas legíveis.
 * Suporta formatos: { before, after } | { field: value } | valor direto
 */
export function parseChanges(
  changes: Record<string, unknown>
): Array<{ field: string; label: string; before?: string; after?: string; value?: string }> {
  if (!changes || typeof changes !== "object") return [];

  return Object.entries(changes)
    .filter(([key]) => key !== "id" && key !== "criadoEm")
    .map(([key, val]) => {
      const label = FIELD_LABELS[key] ?? key;

      // Formato { before, after }
      if (
        val &&
        typeof val === "object" &&
        !Array.isArray(val) &&
        ("before" in (val as object) || "after" in (val as object))
      ) {
        const v = val as { before?: unknown; after?: unknown };
        return {
          field: key,
          label,
          before: formatChangeValue(key, v.before),
          after: formatChangeValue(key, v.after),
        };
      }

      // Valor simples
      return {
        field: key,
        label,
        value: formatChangeValue(key, val),
      };
    });
}
