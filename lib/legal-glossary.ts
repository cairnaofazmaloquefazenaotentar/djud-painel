/**
 * Glossário de termos jurídicos usados no contexto de demandas judiciais de saúde.
 * Cada entrada possui uma definição resumida para exibição em tooltip.
 */

export interface GlossaryTerm {
  term: string;
  definition: string;
  acronym?: string;
}

export const LEGAL_GLOSSARY: GlossaryTerm[] = [
  {
    term: "TRF",
    acronym: "TRF",
    definition:
      "Tribunal Regional Federal — instância federal de 2º grau responsável por julgar recursos de decisões da Justiça Federal. Organizado em regiões (1ª a 6ª) que cobrem diferentes estados.",
  },
  {
    term: "NUP/SEI",
    acronym: "NUP",
    definition:
      "Número Único de Protocolo no Sistema Eletrônico de Informações (SEI). Identifica um processo administrativo no Ministério da Saúde.",
  },
  {
    term: "DJUD",
    acronym: "DJUD",
    definition:
      "Departamento de Judicialização da Saúde — setor do Ministério da Saúde responsável pela gestão das demandas judiciais relacionadas ao fornecimento de medicamentos e insumos.",
  },
  {
    term: "Princípio Ativo",
    definition:
      "Substância responsável pelo efeito terapêutico do medicamento (nome genérico, conforme a RENAME — Relação Nacional de Medicamentos Essenciais).",
  },
  {
    term: "Ponto de Controle",
    definition:
      "Status jurídico-operacional da demanda, indicando a etapa atual do processo (ex: 'Entrega Pendente', 'Cessar Atos', 'Em Recurso').",
  },
  {
    term: "Grupo Temático",
    definition:
      "Categoria do objeto da ação judicial (ex: Medicamentos Oncológicos, Medicamentos Alto Impacto Financeiro, Atenção à Saúde).",
  },
  {
    term: "Objeto da Ação",
    definition:
      "Descrição do que está sendo pleiteado judicialmente (ex: Medicamento - Oncológico, Insumo - Bomba de Insulina).",
  },
  {
    term: "COAJUD",
    acronym: "COAJUD",
    definition:
      "Coordenação de Ações Judiciais — unidade do Ministério da Saúde responsável pela análise técnica e resposta às ações judiciais.",
  },
  {
    term: "CONJUR",
    acronym: "CONJUR",
    definition:
      "Consultoria Jurídica — área responsável pela defesa judicial do Ministério da Saúde.",
  },
  {
    term: "SCTIE",
    acronym: "SCTIE",
    definition:
      "Secretaria de Ciência, Tecnologia, Inovação e Insumos Estratégicos em Saúde — responsável pela Política Nacional de Medicamentos.",
  },
  {
    term: "Liminar",
    definition:
      "Decisão judicial provisória concedida antes do julgamento final (mérito) para garantir o direito do autor enquanto o processo tramita.",
  },
  {
    term: "Tutela Antecipada",
    definition:
      "Medida judicial que antecipa os efeitos da decisão final, usada para fornecimento urgente de medicamentos ou tratamentos.",
  },
  {
    term: "Forma de Cumprimento",
    definition:
      "Modalidade pela qual o Ministério da Saúde cumpre a ordem judicial: AQUISIÇÃO DJUD (compra direta), DEPÓSITO JUDICIAL (valor em dinheiro) ou ENTREGA CEAF (via farmácia do componente especializado).",
  },
  {
    term: "CEAF",
    acronym: "CEAF",
    definition:
      "Componente Especializado da Assistência Farmacêutica — programa do SUS que fornece medicamentos de alto custo para tratamento de doenças crônicas.",
  },
  {
    term: "RENAME",
    acronym: "RENAME",
    definition:
      "Relação Nacional de Medicamentos Essenciais — lista oficial dos medicamentos que devem ser disponibilizados pelo SUS.",
  },
];

/**
 * Busca um termo no glossário (case-insensitive).
 */
export function findTerm(term: string): GlossaryTerm | undefined {
  const lower = term.toLowerCase();
  return LEGAL_GLOSSARY.find(
    (t) =>
      t.term.toLowerCase() === lower ||
      (t.acronym && t.acronym.toLowerCase() === lower)
  );
}
