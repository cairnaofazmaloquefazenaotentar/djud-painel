import { normalizarTexto } from "@/lib/texto-norm";
import { radicalPalavra } from "@/lib/substancia";

// ─────────────────────────────────────────────────────────────────────────────
// Filtro único das demandas (A1 da avaliação da DLOG) — módulo PURO: tipos,
// leitura e escrita da URL, rótulos e a interpretação da busca. A lista de
// Demandas, o Dashboard, o ranking anual, as exportações e os relatórios leem
// o mesmo FiltroDemandas; o WHERE (ORM e SQL) fica em lib/demandas-filtro.ts.
//
// Semântica (P1): dentro de um campo, OR entre os incluídos e NOT IN para os
// excluídos; entre campos, AND. "(não informado)" (`__null__`) é uma opção
// como as outras. Campos que o Redmine grava como lista ("Cessar Atos |
// Óbito") casam por ITEM, não pelo texto inteiro.
//
// URL: parâmetros repetidos — ?status=A&status=B&status_excluir=C. O formato
// antigo ?status=X continua valendo (é um "incluir" de um valor só), assim
// como os nomes antigos do Dashboard (startDate, endDate, principioAtivo).
// ─────────────────────────────────────────────────────────────────────────────

export const CAMPOS_DEMANDA = [
  "status",
  "prioridade",
  "areaTematica",
  "regiaoBrasil",
  "trfRegiao",
  "ufResidencia",
  "objetoAcao",
  "formaCumprimento",
  "pontoControle",
  "origemDemanda",
  "responsavelId",
] as const;

export type CampoDemanda = (typeof CAMPOS_DEMANDA)[number];

export const ROTULO_CAMPO: Record<CampoDemanda, string> = {
  status: "Status",
  prioridade: "Prioridade",
  areaTematica: "Grupo temático",
  regiaoBrasil: "Região",
  trfRegiao: "TRF",
  ufResidencia: "UF de residência",
  objetoAcao: "Objeto da ação",
  formaCumprimento: "Forma de cumprimento",
  pontoControle: "Ponto de controle",
  origemDemanda: "Origem (tipo no Redmine)",
  responsavelId: "Responsável",
};

/** Gravados pelo importador como "A | B": o filtro casa por item da lista. */
export const CAMPOS_MULTIVALOR: ReadonlySet<CampoDemanda> = new Set<CampoDemanda>(["pontoControle", "objetoAcao"]);
export const SEPARADOR_MULTIVALOR = " | ";

/** Valor especial da opção "(não informado)" (coluna nula). */
export const NAO_INFORMADO = "__null__";
export const ROTULO_NAO_INFORMADO = "(não informado)";

/** Status considerados encerrados (P3: confirmar com o usuário). */
export const STATUS_RESOLVIDOS = ["Fechada", "Concluída", "Encerrada", "Cancelada"];

const ROTULO_FORMA: Record<string, string> = {
  AQUISICAO_DJUD: "Aquisição DJUD",
  DEPOSITO_JUDICIAL: "Depósito judicial",
  ENTREGA_CEAF: "Entrega CEAF",
};

export type SelecaoCampo = { incluir: string[]; excluir: string[] };

export type FiltroDemandas = {
  /** Busca livre: texto, nº DJUD, nº CNJ, NUP SEI ou código CATMAT/registro (A4). */
  busca: string | null;
  /** CATMAT (até 6 dígitos) ou registro ANVISA (13) — lib/demandas-catmat.ts. */
  catmat: string | null;
  /** Medicamento digitado (B3): casa pelo radical da substância. */
  medicamento: string | null;
  campos: Partial<Record<CampoDemanda, SelecaoCampo>>;
  /** "AAAA-MM-DD", inclusive nas duas pontas. */
  dataEntradaDe: string | null;
  dataEntradaAte: string | null;
  criadoDe: string | null;
  criadoAte: string | null;
  organizacaoId: string | null;
  /** Escopo "seleção" da exportação: só estas demandas. */
  ids: string[];
};

export const FILTRO_VAZIO: FiltroDemandas = {
  busca: null,
  catmat: null,
  medicamento: null,
  campos: {},
  dataEntradaDe: null,
  dataEntradaAte: null,
  criadoDe: null,
  criadoAte: null,
  organizacaoId: null,
  ids: [],
};

/** O que `URLSearchParams` e `ReadonlyURLSearchParams` (next/navigation) têm em comum. */
export interface ParametrosLidos {
  get(nome: string): string | null;
  getAll(nome: string): string[];
}

const texto = (v: string | null | undefined, max = 200): string | null => {
  const s = String(v ?? "").trim().slice(0, max);
  return s || null;
};

/** "2026-03-10" ou ISO com hora ("2026-03-10T00:00:00.000Z") → "2026-03-10"; inválida → null. */
export function dataDoFiltro(v: string | null | undefined): string | null {
  const s = String(v ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s;
}

/** Valores únicos, aparados, sem vazio, no máximo `max`. */
function valores(lista: string[], max = 100): string[] {
  const vistos = new Set<string>();
  for (const v of lista) {
    const s = v.trim();
    if (s && s.length <= 300) vistos.add(s);
    if (vistos.size >= max) break;
  }
  return Array.from(vistos);
}

export function lerFiltroDemandas(sp: ParametrosLidos): FiltroDemandas {
  const campos: FiltroDemandas["campos"] = {};
  for (const c of CAMPOS_DEMANDA) {
    const incluir = valores(sp.getAll(c));
    const excluir = valores(sp.getAll(`${c}_excluir`)).filter((v) => !incluir.includes(v));
    if (incluir.length || excluir.length) campos[c] = { incluir, excluir };
  }
  return {
    busca: texto(sp.get("busca")),
    catmat: texto(sp.get("catmat"), 20),
    // Nome antigo do Dashboard: ?principioAtivo=
    medicamento: texto(sp.get("medicamento") ?? sp.get("principioAtivo")),
    campos,
    dataEntradaDe: dataDoFiltro(sp.get("dataEntradaDe")),
    dataEntradaAte: dataDoFiltro(sp.get("dataEntradaAte")),
    // Nomes antigos do Dashboard: ?startDate= e ?endDate= (ISO com hora).
    criadoDe: dataDoFiltro(sp.get("criadoDe") ?? sp.get("startDate")),
    criadoAte: dataDoFiltro(sp.get("criadoAte") ?? sp.get("endDate")),
    organizacaoId: texto(sp.get("organizacaoId"), 60),
    ids: valores(sp.getAll("ids"), 1000),
  };
}

/** Parâmetros canônicos do filtro (sem os nomes antigos). */
export function filtroParaQuery(f: FiltroDemandas, base?: URLSearchParams): URLSearchParams {
  const sp = base ?? new URLSearchParams();
  const pares: Array<[string, string | null]> = [
    ["busca", f.busca],
    ["catmat", f.catmat],
    ["medicamento", f.medicamento],
    ["dataEntradaDe", f.dataEntradaDe],
    ["dataEntradaAte", f.dataEntradaAte],
    ["criadoDe", f.criadoDe],
    ["criadoAte", f.criadoAte],
    ["organizacaoId", f.organizacaoId],
  ];
  for (const [k, v] of pares) if (v) sp.append(k, v);
  for (const c of CAMPOS_DEMANDA) {
    const s = f.campos[c];
    if (!s) continue;
    for (const v of s.incluir) sp.append(c, v);
    for (const v of s.excluir) sp.append(`${c}_excluir`, v);
  }
  for (const id of f.ids) sp.append("ids", id);
  return sp;
}

/** Nomes de parâmetro que o filtro ocupa — para limpar a URL antes de reescrever. */
export function parametrosDoFiltro(): string[] {
  return [
    "busca",
    "catmat",
    "medicamento",
    "principioAtivo",
    "dataEntradaDe",
    "dataEntradaAte",
    "criadoDe",
    "criadoAte",
    "startDate",
    "endDate",
    "organizacaoId",
    "ids",
    ...CAMPOS_DEMANDA.flatMap((c) => [c, `${c}_excluir`]),
  ];
}

export function quantidadeDeFiltros(f: FiltroDemandas): number {
  let n = 0;
  for (const v of [f.busca, f.catmat, f.medicamento, f.organizacaoId]) if (v) n += 1;
  if (f.dataEntradaDe || f.dataEntradaAte) n += 1;
  if (f.criadoDe || f.criadoAte) n += 1;
  for (const c of CAMPOS_DEMANDA) if (f.campos[c]) n += 1;
  if (f.ids.length) n += 1;
  return n;
}

export function filtroAtivo(f: FiltroDemandas): boolean {
  return quantidadeDeFiltros(f) > 0;
}

/** Mesmo filtro com a seleção de um campo trocada (vazia = remove o campo). */
export function comSelecao(f: FiltroDemandas, campo: CampoDemanda, s: SelecaoCampo): FiltroDemandas {
  const campos = { ...f.campos };
  if (s.incluir.length || s.excluir.length) campos[campo] = s;
  else delete campos[campo];
  return { ...f, campos };
}

/** Sem as datas de criação — p.ex. o "primeiro mês" de cada autor (aba Autores). */
export function semPeriodoDeCriacao(f: FiltroDemandas): FiltroDemandas {
  return { ...f, criadoDe: null, criadoAte: null };
}

export function rotuloValor(campo: CampoDemanda, valor: string): string {
  if (valor === NAO_INFORMADO) return ROTULO_NAO_INFORMADO;
  if (campo === "trfRegiao") return `TRF ${valor}ª Região`;
  if (campo === "formaCumprimento") return ROTULO_FORMA[valor] ?? valor;
  return valor;
}

const fmtData = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

function intervalo(de: string | null, ate: string | null): string | null {
  if (de && ate) return `${fmtData(de)} a ${fmtData(ate)}`;
  if (de) return `a partir de ${fmtData(de)}`;
  if (ate) return `até ${fmtData(ate)}`;
  return null;
}

/**
 * O filtro em texto, para o "recorte" impresso nas exportações e relatórios.
 * `rotular` permite trocar valores por nomes (p.ex. id do responsável → nome).
 */
export function descreverFiltro(
  f: FiltroDemandas,
  rotular: (campo: CampoDemanda, valor: string) => string = rotuloValor
): Array<[string, string]> {
  const linhas: Array<[string, string]> = [];
  if (f.busca) linhas.push(["Busca", f.busca]);
  if (f.catmat) linhas.push(["CATMAT / registro ANVISA", f.catmat]);
  if (f.medicamento) linhas.push(["Medicamento", f.medicamento]);
  for (const c of CAMPOS_DEMANDA) {
    const s = f.campos[c];
    if (!s) continue;
    const partes: string[] = [];
    if (s.incluir.length) partes.push(s.incluir.map((v) => rotular(c, v)).join(", "));
    if (s.excluir.length) partes.push(`exceto ${s.excluir.map((v) => rotular(c, v)).join(", ")}`);
    linhas.push([ROTULO_CAMPO[c], partes.join(" · ")]);
  }
  const entrada = intervalo(f.dataEntradaDe, f.dataEntradaAte);
  if (entrada) linhas.push(["Entrada no DJUD", entrada]);
  const criacao = intervalo(f.criadoDe, f.criadoAte);
  if (criacao) linhas.push(["Criação no Redmine", criacao]);
  if (f.ids.length) linhas.push(["Seleção", `${f.ids.length} demanda(s) marcada(s) na lista`]);
  return linhas;
}

// ── Atalhos de status (P3) ───────────────────────────────────────────────────

export interface AtalhoSelecao {
  id: string;
  rotulo: string;
  /** A seleção a partir dos valores que existem no banco. */
  aplicar(valores: string[]): SelecaoCampo;
}

export const ATALHOS_STATUS: AtalhoSelecao[] = [
  {
    id: "em-analise",
    rotulo: "Em análise (todos)",
    aplicar: (v) => ({ incluir: v.filter((x) => x.startsWith("Em Análise")), excluir: [] }),
  },
  {
    id: "encerrados",
    rotulo: "Encerrados",
    aplicar: (v) => ({ incluir: v.filter((x) => STATUS_RESOLVIDOS.includes(x)), excluir: [] }),
  },
  {
    // "Ativos" = todos menos os encerrados: excluir, e não incluir a lista
    // inteira — um status novo que chegar no Redmine continua contando.
    id: "ativos",
    rotulo: "Ativos",
    aplicar: (v) => ({ incluir: [], excluir: v.filter((x) => STATUS_RESOLVIDOS.includes(x)) }),
  },
];

// ── Busca (A4) ───────────────────────────────────────────────────────────────

export type InterpretacaoBusca =
  /** CATMAT (4 a 6 dígitos) ou registro ANVISA (13): o servidor tenta resolver. */
  | { tipo: "codigo"; codigo: string; termos: string[] }
  /** Nº CNJ, NUP SEI ou nº DJUD com pontuação: compara só os dígitos. */
  | { tipo: "numero"; digitos: string; termos: string[] }
  | { tipo: "texto"; termos: string[] };

export function digitos(s: string | null | undefined): string {
  return String(s ?? "").replace(/\D/g, "");
}

/**
 * Termos da busca sobre `buscaNorm`: normalizados como a coluna, e palavras de
 * 6 letras ou mais pelo radical — "eltrombopague" acha "Eltrombopag".
 */
export function termosDaBusca(busca: string): string[] {
  const vistos = new Set<string>();
  for (const t of normalizarTexto(busca).split(/[\s,]+/)) {
    if (!t || t === "-") continue;
    vistos.add(/^[a-z]+$/.test(t) ? radicalPalavra(t).toLowerCase() : t);
  }
  return Array.from(vistos).slice(0, 8);
}

export function interpretarBusca(bruta: string): InterpretacaoBusca {
  const busca = bruta.trim();
  if (/^\d{4,6}$/.test(busca) || /^\d{13}$/.test(busca)) {
    return { tipo: "codigo", codigo: busca, termos: [busca] };
  }
  // Só dígitos e separadores, com 8 dígitos ou mais: nº CNJ (20), NUP SEI (15
  // a 17), nº de processo com máscara. Compara os dígitos, que a buscaNorm
  // guarda à parte.
  const d = digitos(busca);
  if (/^[\d.\-/\s]+$/.test(busca) && d.length >= 8) {
    return { tipo: "numero", digitos: d, termos: [d] };
  }
  return { tipo: "texto", termos: termosDaBusca(busca) };
}

// ── Coluna buscaNorm e NUP SEI ───────────────────────────────────────────────

/**
 * Formato canônico do NUP SEI ("25000.123456/2021-11"), o mesmo que
 * lib/sismat-saidas-redmine-metrics.ts usa para cruzar com o SISMAT. Espelho
 * Python em scripts/import_redmine_base.py (normalizar_nup_sei).
 */
export function normalizarNupSei(bruto: string | null | undefined): string | null {
  const m = String(bruto ?? "").match(/(\d{5})[.\s]?(\d{5,6})\/?(\d{4})-?(\d{1,2})/);
  return m ? `${m[1]}.${m[2]}/${m[3]}-${m[4]}` : null;
}

export type CamposBuscaNorm = {
  numero?: string | null;
  numeroProcesso?: string | null;
  nupSei?: string | null;
  titulo?: string | null;
  principioAtivo?: string | null;
  medicamento?: string | null;
  descricao?: string | null;
};

/**
 * Texto que a busca procura (`Demanda.buscaNorm`, índice GIN pg_trgm): os
 * campos normalizados, mais os dígitos do nº do processo e do NUP — "nº CNJ
 * compara só os dígitos". Espelho Python em scripts/import_redmine_base.py
 * (montar_busca_norm); os dois conferidos pelos mesmos casos.
 */
export function montarBuscaNorm(d: CamposBuscaNorm): string {
  return [
    d.numero,
    d.numeroProcesso,
    digitos(d.numeroProcesso),
    d.nupSei,
    digitos(d.nupSei),
    d.titulo,
    d.principioAtivo,
    d.medicamento,
    d.descricao,
  ]
    .map((p) => normalizarTexto(p))
    .filter(Boolean)
    .join(" ");
}
