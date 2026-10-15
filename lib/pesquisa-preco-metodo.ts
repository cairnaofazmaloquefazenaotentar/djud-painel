import type { CmedResultado, Consolidado, RegistroCmedPreco } from "@/lib/pesquisa-preco";

// ─────────────────────────────────────────────────────────────────────────────
// Método do preço adotado e regra do teto CMED (P11 e P12 da avaliação da DLOG).
//
// Módulo puro: a tela usa estas funções para mostrar o efeito de cada escolha
// sem ir ao servidor, e o servidor (pesquisarPrecos) usa as MESMAS para montar
// a recomendação que vai para o HTML e para o mapa XLSX. Nada aqui recalcula
// estatística: tudo parte do consolidado que a pesquisa já apurou (média,
// mediana e menor valor por fonte e do conjunto único de registros).
//
// Método (art. 6º da IN SEGES/ME nº 65/2021):
//   • mediana das medianas por fonte — padrão do painel; cada base pesa igual;
//   • critério da DLOG — o menor valor entre a média e a mediana do conjunto
//     único de registros (cada compra pesa igual);
//   • média, mediana ou menor valor do conjunto único.
//
// Teto (Lei nº 10.742/2003; Res. CMED): o PMVG por unidade de fornecimento
// (PMVG da embalagem ÷ Qt_Embal). Duas regras:
//   • menor PMVG sem impostos entre os registros do item — padrão do painel;
//   • PMVG da alíquota escolhida (padrão 17%) do medicamento de referência —
//     o critério da DLOG, que resulta no MAIOR teto da lista. Referência = tipo
//     de produto "Novo" ou "Biológico" na CMED; havendo mais de um, o de maior
//     PMVG; não havendo nenhum, o maior PMVG entre todos os registros.
// ─────────────────────────────────────────────────────────────────────────────

export type MetodoPreco =
  | "mediana_medianas"
  | "criterio_dlog"
  | "media_registros"
  | "mediana_registros"
  | "menor_registros";

export type RegraTeto = "menor_pmvg_sem_impostos" | "pmvg_referencia";

/**
 * Alíquotas de ICMS que `PrecoCmed` guarda. A lista mensal completa (todas as
 * alíquotas, por competência) entra com a seção 7 do prompt CMED mensal.
 */
export type AliquotaTeto = "0" | "12" | "17" | "18";

export const ALIQUOTAS_TETO: AliquotaTeto[] = ["0", "12", "17", "18"];

/**
 * `type` e não `interface`: vai inteiro para o `metadata` (Json) do AuditLog e
 * para `RelatorioGerado.parametros` — ver a nota em lib/pesquisa-preco-filtros.ts.
 */
export type EscolhaPreco = {
  metodo: MetodoPreco;
  regraTeto: RegraTeto;
  /** Alíquota do PMVG na regra do medicamento de referência. */
  aliquota: AliquotaTeto;
};

/** Padrão do painel (tela e relatório HTML sem escolha explícita). */
export const ESCOLHA_PADRAO: EscolhaPreco = {
  metodo: "mediana_medianas",
  regraTeto: "menor_pmvg_sem_impostos",
  aliquota: "17",
};

/**
 * Padrão pré-selecionado na emissão do mapa no modelo da DLOG (P11 e P12): o
 * método do painel e o teto da DLOG. A mesma escolha vale para o HTML emitido
 * pela mesma modal, para os dois documentos trazerem o mesmo preço.
 */
export const ESCOLHA_PADRAO_MAPA: EscolhaPreco = {
  metodo: "mediana_medianas",
  regraTeto: "pmvg_referencia",
  aliquota: "17",
};

export const METODOS: MetodoPreco[] = [
  "mediana_medianas",
  "criterio_dlog",
  "media_registros",
  "mediana_registros",
  "menor_registros",
];

export const REGRAS_TETO: RegraTeto[] = ["menor_pmvg_sem_impostos", "pmvg_referencia"];

export const ROTULO_METODO: Record<MetodoPreco, { curto: string; longo: string }> = {
  mediana_medianas: {
    curto: "Mediana das medianas",
    longo: "Mediana das medianas por fonte (cada fonte pesa igual)",
  },
  criterio_dlog: {
    curto: "Menor entre média e mediana",
    longo: "Menor valor entre a média e a mediana do conjunto único de registros (critério DLOG)",
  },
  media_registros: { curto: "Média", longo: "Média do conjunto único de registros" },
  mediana_registros: { curto: "Mediana", longo: "Mediana do conjunto único de registros" },
  menor_registros: { curto: "Menor valor", longo: "Menor valor do conjunto único de registros" },
};

export function rotuloRegraTeto(regra: RegraTeto, aliquota: AliquotaTeto): string {
  return regra === "menor_pmvg_sem_impostos"
    ? "Menor PMVG sem impostos por unidade (padrão do painel)"
    : `PMVG ${aliquota}% do medicamento de referência por unidade (critério DLOG)`;
}

/** Versão curta, para tabelas e para a justificativa. */
export function rotuloRegraTetoCurto(regra: RegraTeto, aliquota: AliquotaTeto): string {
  return regra === "menor_pmvg_sem_impostos"
    ? "menor PMVG sem impostos"
    : `PMVG ${aliquota}% do medicamento de referência`;
}

function valorEnum<T extends string>(v: unknown, opcoes: readonly T[], padrao: T): T {
  return typeof v === "string" && (opcoes as readonly string[]).includes(v) ? (v as T) : padrao;
}

/** Aceita o que vier da tela ou do banco; o que faltar ou for inválido vira o padrão. */
export function normalizarEscolha(bruto: unknown, padrao: EscolhaPreco = ESCOLHA_PADRAO): EscolhaPreco {
  const b = (bruto && typeof bruto === "object" ? bruto : {}) as Partial<Record<keyof EscolhaPreco, unknown>>;
  return {
    metodo: valorEnum(b.metodo, METODOS, padrao.metodo),
    regraTeto: valorEnum(b.regraTeto, REGRAS_TETO, padrao.regraTeto),
    aliquota: valorEnum(b.aliquota, ALIQUOTAS_TETO, padrao.aliquota),
  };
}

// ── Preço pelo método ────────────────────────────────────────────────────────

/** Preço do método escolhido, antes do teto; null quando não há preço apurado. */
export function precoPeloMetodo(c: Consolidado, metodo: MetodoPreco): number | null {
  switch (metodo) {
    case "mediana_medianas":
      return c.porFonte.mediana;
    case "media_registros":
      return c.porRegistro.media;
    case "mediana_registros":
      return c.porRegistro.mediana;
    case "menor_registros":
      return c.porRegistro.menor;
    case "criterio_dlog": {
      const { media, mediana } = c.porRegistro;
      if (media === null) return mediana;
      if (mediana === null) return media;
      return Math.min(media, mediana);
    }
  }
}

/** No critério DLOG, qual dos dois valores ficou (para a justificativa e o mapa). */
export function componenteCriterioDlog(c: Consolidado): "media" | "mediana" | null {
  const { media, mediana } = c.porRegistro;
  if (media === null && mediana === null) return null;
  if (media === null) return "mediana";
  if (mediana === null) return "media";
  return mediana <= media ? "mediana" : "media";
}

// ── Teto CMED ────────────────────────────────────────────────────────────────

export interface TetoCmed {
  regra: RegraTeto;
  /** null = PMVG sem impostos. */
  aliquota: AliquotaTeto | null;
  valorUnitario: number;
  valorEmbalagem: number;
  qtEmbalagem: number;
  /** id da linha em PrecoCmed. */
  registroId: string;
  registro: string;
  produto: string;
  laboratorio: string | null;
  apresentacao: string;
  tipoProduto: string | null;
  /** Por que este registro forma o teto — vai para a justificativa. */
  criterio: string;
}

/** Tipos de produto da CMED tratados como medicamento de referência. */
const TIPOS_REFERENCIA = new Set(["novo", "biologico"]);

function semAcento(s: string | null | undefined): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

export function ehReferencia(r: Pick<RegistroCmedPreco, "tipoProduto">): boolean {
  return TIPOS_REFERENCIA.has(semAcento(r.tipoProduto));
}

/** PMVG da embalagem na alíquota pedida. */
export function pmvgNaAliquota(r: RegistroCmedPreco, aliquota: AliquotaTeto): number | null {
  const v =
    aliquota === "0" ? r.pmvg0 : aliquota === "12" ? r.pmvg12 : aliquota === "17" ? r.pmvg17 : r.pmvg18;
  return v != null && v > 0 ? v : null;
}

function montarTeto(
  r: RegistroCmedPreco,
  regra: RegraTeto,
  aliquota: AliquotaTeto | null,
  embalagem: number,
  criterio: string
): TetoCmed {
  const qt = r.qtEmbalagem as number;
  return {
    regra,
    aliquota,
    valorUnitario: embalagem / qt,
    valorEmbalagem: embalagem,
    qtEmbalagem: qt,
    registroId: r.id,
    registro: r.registro,
    produto: r.produto,
    laboratorio: r.laboratorio,
    apresentacao: r.apresentacao,
    tipoProduto: r.tipoProduto,
    criterio,
  };
}

/** Registros CMED que podem formar teto: considerados e com Qt_Embal. */
function candidatosTeto(cmed: CmedResultado): RegistroCmedPreco[] {
  return cmed.registros.filter((r) => r.excluidoPor === null && r.qtEmbalagem != null && r.qtEmbalagem > 0);
}

export function tetoMenorSemImpostos(cmed: CmedResultado): TetoCmed | null {
  let melhor: RegistroCmedPreco | null = null;
  for (const r of candidatosTeto(cmed)) {
    if (r.pmvgUnitario == null || r.pmvgUnitario <= 0) continue;
    if (!melhor || r.pmvgUnitario < (melhor.pmvgUnitario as number)) melhor = r;
  }
  if (!melhor) return null;
  return montarTeto(
    melhor,
    "menor_pmvg_sem_impostos",
    null,
    melhor.pmvgEmbalagem,
    "menor PMVG sem impostos por unidade entre os registros do item"
  );
}

export function tetoReferencia(cmed: CmedResultado, aliquota: AliquotaTeto): TetoCmed | null {
  const comPreco = candidatosTeto(cmed).filter((r) => pmvgNaAliquota(r, aliquota) !== null);
  if (!comPreco.length) return null;
  const referencias = comPreco.filter(ehReferencia);
  const conjunto = referencias.length ? referencias : comPreco;
  const unit = (r: RegistroCmedPreco) => (pmvgNaAliquota(r, aliquota) as number) / (r.qtEmbalagem as number);
  const melhor = conjunto.reduce((a, b) => (unit(b) > unit(a) ? b : a));
  const criterio = referencias.length
    ? `medicamento de referência (tipo de produto "${melhor.tipoProduto}")` +
      (referencias.length > 1 ? `, o de maior PMVG entre ${referencias.length} registros de referência` : "")
    : `sem medicamento de referência (novo ou biológico) entre os registros; adotado o maior PMVG ${aliquota}%`;
  return montarTeto(melhor, "pmvg_referencia", aliquota, pmvgNaAliquota(melhor, aliquota) as number, criterio);
}

export interface TetosCmed {
  menorSemImpostos: TetoCmed | null;
  referencia: TetoCmed | null;
}

export function calcularTetos(cmed: CmedResultado, aliquota: AliquotaTeto): TetosCmed {
  return { menorSemImpostos: tetoMenorSemImpostos(cmed), referencia: tetoReferencia(cmed, aliquota) };
}

// ── Preço adotado ────────────────────────────────────────────────────────────

export interface PrecoAdotado {
  escolha: EscolhaPreco;
  /** Preço pelo método escolhido, antes do teto. */
  precoMetodo: number | null;
  /** Teto da regra escolhida; null quando não há PMVG para o item. */
  teto: TetoCmed | null;
  /** Os dois tetos, para exibição lado a lado (P12). */
  tetos: TetosCmed;
  /** O preço do método superou o teto e o teto prevaleceu. */
  tetoAplicado: boolean;
  /** Sem preço de mercado: o teto virou o preço. */
  semPrecoUsaTeto: boolean;
  precoFinal: number | null;
}

export function adotarPreco(c: Consolidado, cmed: CmedResultado, escolha: EscolhaPreco): PrecoAdotado {
  const precoMetodo = precoPeloMetodo(c, escolha.metodo);
  const tetos = calcularTetos(cmed, escolha.aliquota);
  const teto = escolha.regraTeto === "pmvg_referencia" ? tetos.referencia : tetos.menorSemImpostos;
  const tetoAplicado = teto !== null && precoMetodo !== null && precoMetodo > teto.valorUnitario;
  const semPrecoUsaTeto = precoMetodo === null && teto !== null;
  const precoFinal =
    precoMetodo === null ? (teto?.valorUnitario ?? null) : tetoAplicado ? (teto as TetoCmed).valorUnitario : precoMetodo;
  return { escolha, precoMetodo, teto, tetos, tetoAplicado, semPrecoUsaTeto, precoFinal };
}

/** Nome do método para a coluna "Método Estatístico" / "Método Escolhido" do mapa. */
export function descricaoMetodoAdotado(a: PrecoAdotado, c: Consolidado): string {
  if (a.precoMetodo === null) return a.teto ? "Teto CMED (sem preço de mercado)" : "Sem preço apurado";
  let base = ROTULO_METODO[a.escolha.metodo].curto;
  if (a.escolha.metodo === "criterio_dlog") {
    const comp = componenteCriterioDlog(c);
    if (comp) base = `${comp === "media" ? "Média" : "Mediana"} (menor entre média e mediana)`;
  }
  return a.tetoAplicado ? `Teto CMED — ${base.toLowerCase()} acima do teto` : base;
}

/**
 * Campos de preço da recomendação para uma escolha. O servidor monta a
 * recomendação com esta função e a tela usa a mesma para mostrar o efeito de
 * outra escolha sem refazer a pesquisa — o número da prévia é o que sai no
 * documento.
 */
export function camposDoPreco(c: Consolidado, cmed: CmedResultado, escolha: EscolhaPreco) {
  const adotado = adotarPreco(c, cmed, escolha);
  return {
    escolha,
    precoReferencia: adotado.precoMetodo,
    limitePmvg: adotado.teto?.valorUnitario ?? null,
    teto: adotado.teto,
    tetos: adotado.tetos,
    tetoAplicado: adotado.tetoAplicado,
    precoFinal: adotado.precoFinal,
    descricaoMetodo: descricaoMetodoAdotado(adotado, c),
  };
}

/** O mesmo resultado com outra escolha de método/teto (prévia na tela). */
export function resultadoComEscolha<
  R extends { consolidado: Consolidado; resultados: { cmed: CmedResultado }; recomendacao: object },
>(r: R, escolha: EscolhaPreco): R {
  return { ...r, recomendacao: { ...r.recomendacao, ...camposDoPreco(r.consolidado, r.resultados.cmed, escolha) } };
}
