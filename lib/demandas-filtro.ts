import { FormaCumprimento, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  padraoLike,
  resolverFiltroCatmat,
  sqlTermos,
  whereTermos,
  type FiltroCatmat,
} from "@/lib/demandas-catmat";
import { grupoDeSubstancia, semAcento, type GrupoTermos } from "@/lib/substancia";
import {
  CAMPOS_DEMANDA,
  CAMPOS_MULTIVALOR,
  NAO_INFORMADO,
  SEPARADOR_MULTIVALOR,
  comboCanonico,
  digitos,
  interpretarBusca,
  normalizarNupSei,
  type CampoDemanda,
  type FiltroDemandas,
  type GrupoCatmat,
  type InterpretacaoBusca,
  type SelecaoCampo,
} from "@/lib/demandas-filtro-tipos";

// ─────────────────────────────────────────────────────────────────────────────
// Filtro único das demandas — lado do servidor (A1/B1 da avaliação da DLOG).
//
// `whereDemandas` (Prisma) e `sqlDemandas` (SQL bruto, com alias opcional para
// os JOINs com o SIAFI) têm a MESMA semântica e SEMPRE excluem a lixeira
// (`deletedAt IS NULL`). Todas as rotas que filtram Demanda passam por aqui:
// lista, exportação, Dashboard (ORM, SQL e SQL com alias `d`), ranking anual,
// aba Autores, relatórios. Mesmo filtro → mesmo total em todo lugar.
//
// `aplicarFiltro` resolve antes o que depende do banco: o código CATMAT ou
// registro (campo próprio ou digitado na busca), os radicais do medicamento e
// as grafias de cada Sub-status (a mesma combinação do Ponto de Controle
// aparece em ordens diferentes no Redmine).
// ─────────────────────────────────────────────────────────────────────────────

export interface BuscaAplicada {
  /** Como a busca foi lida: código, número ou texto. */
  interpretacao: InterpretacaoBusca;
  /** Código digitado na busca e reconhecido no catálogo (faixa "Interpretado como CATMAT…"). */
  codigo: FiltroCatmat | null;
}

export interface FiltroAplicado {
  filtro: FiltroDemandas;
  /** Seleções efetivas por campo (o Sub-status já expandido para as grafias do banco). */
  campos: Partial<Record<CampoDemanda, SelecaoCampo>>;
  /** Campo CATMAT / registro ANVISA, resolvido (descrição, substâncias ou motivo). */
  catmat: FiltroCatmat | null;
  busca: BuscaAplicada | null;
  /** Radicais do medicamento digitado (B3). */
  medicamento: GrupoTermos | null;
  /** Nada pode casar (o código do campo CATMAT não existe): devolver vazio com o motivo. */
  vazio: boolean;
  motivo: string | null;
}

// ── Campos: coluna e tipo ────────────────────────────────────────────────────

type TipoCampo = "escalar" | "multivalor" | "lista";

/** Coluna de cada campo: o Sub-status é o Ponto de Controle inteiro; a Apresentação, os CATMATs derivados. */
const COLUNA: Record<CampoDemanda, string> = {
  pontoControle: "pontoControle",
  subStatus: "pontoControle",
  status: "status",
  prioridade: "prioridade",
  areaTematica: "areaTematica",
  regiaoBrasil: "regiaoBrasil",
  trfRegiao: "trfRegiao",
  ufResidencia: "ufResidencia",
  objetoAcao: "objetoAcao",
  formaCumprimento: "formaCumprimento",
  origemDemanda: "origemDemanda",
  responsavelId: "responsavelId",
  apresentacao: "catmatsDerivados",
};

function tipoDoCampo(campo: CampoDemanda): TipoCampo {
  if (campo === "apresentacao") return "lista";
  return CAMPOS_MULTIVALOR.has(campo) ? "multivalor" : "escalar";
}

/** Medicamento digitado → grupo de radicais; texto curto vira um termo só. */
function grupoDoMedicamento(texto: string): GrupoTermos | null {
  const g = grupoDeSubstancia(texto);
  if (g) return g;
  const t = texto.trim().toUpperCase();
  return t.length >= 3 ? { rotulo: texto.trim(), termos: [t] } : null;
}

/**
 * Sub-status: cada combinação escolhida (chave canônica, sem ordem) vira as
 * grafias que existem no banco — "Arquivado | Cessar Atos" e "Cessar Atos |
 * Arquivado" são a mesma opção na tela.
 */
async function expandirSubStatus(sel: SelecaoCampo): Promise<SelecaoCampo> {
  const linhas = await db.$queryRaw<Array<{ v: string }>>`
    SELECT DISTINCT "pontoControle" AS v FROM "Demanda" WHERE "pontoControle" IS NOT NULL`;
  const grafias = new Map<string, string[]>();
  for (const { v } of linhas) {
    const k = comboCanonico(v);
    grafias.set(k, [...(grafias.get(k) ?? []), v]);
  }
  const expandir = (lista: string[]) =>
    Array.from(new Set(lista.flatMap((k) => (k === NAO_INFORMADO ? [k] : grafias.get(comboCanonico(k)) ?? [k]))));
  return { incluir: expandir(sel.incluir), excluir: expandir(sel.excluir) };
}

export async function aplicarFiltro(filtro: FiltroDemandas): Promise<FiltroAplicado> {
  const interpretacao = filtro.busca ? interpretarBusca(filtro.busca) : null;
  const [catmat, codigoBusca, subStatus] = await Promise.all([
    filtro.catmat ? resolverFiltroCatmat(filtro.catmat) : Promise.resolve(null),
    interpretacao?.tipo === "codigo" ? resolverFiltroCatmat(interpretacao.codigo) : Promise.resolve(null),
    filtro.campos.subStatus ? expandirSubStatus(filtro.campos.subStatus) : Promise.resolve(null),
  ]);
  const vazio = !!catmat && !catmat.encontrado;
  return {
    filtro,
    campos: { ...filtro.campos, ...(subStatus ? { subStatus } : {}) },
    catmat,
    busca: interpretacao
      ? { interpretacao, codigo: codigoBusca?.encontrado ? codigoBusca : null }
      : null,
    medicamento: filtro.medicamento ? grupoDoMedicamento(filtro.medicamento) : null,
    vazio,
    motivo: vazio ? catmat?.motivo ?? "Código não encontrado." : null,
  };
}

// ── Datas: "AAAA-MM-DD" inclusive nas duas pontas (meia-noite UTC) ───────────

const inicioDoDia = (d: string) => new Date(`${d}T00:00:00Z`);
const diaSeguinte = (d: string) => new Date(inicioDoDia(d).getTime() + 86_400_000);

// ── Seleção de um campo ──────────────────────────────────────────────────────

const ENUM_FORMA = new Set<string>(Object.values(FormaCumprimento));

/** Valores do campo no tipo da coluna (TRF é inteiro; forma de cumprimento, enum). */
function valoresDaColuna(campo: CampoDemanda, valores: string[]): Array<string | number> {
  if (campo === "trfRegiao") return valores.map(Number).filter((n) => Number.isInteger(n));
  if (campo === "formaCumprimento") return valores.filter((v) => ENUM_FORMA.has(v));
  return valores;
}

function separar(lista: string[]) {
  return { nulo: lista.includes(NAO_INFORMADO), valores: lista.filter((v) => v !== NAO_INFORMADO) };
}

const NADA: Prisma.DemandaWhereInput = { id: { in: [] } };
const w = (o: Record<string, unknown>) => o as Prisma.DemandaWhereInput;

/** Item de uma lista "A | B": igual, primeiro, último ou do meio. */
function whereItem(col: string, v: string): Prisma.DemandaWhereInput {
  const s = SEPARADOR_MULTIVALOR;
  return {
    OR: [
      w({ [col]: v }),
      w({ [col]: { startsWith: `${v}${s}` } }),
      w({ [col]: { endsWith: `${s}${v}` } }),
      w({ [col]: { contains: `${s}${v}${s}` } }),
    ],
  };
}

function whereCasa(campo: CampoDemanda, valores: string[]): Prisma.DemandaWhereInput {
  const col = COLUNA[campo];
  switch (tipoDoCampo(campo)) {
    case "multivalor":
      return { OR: valores.map((v) => whereItem(col, v)) };
    case "lista":
      return w({ [col]: { hasSome: valores } });
    default: {
      const vals = valoresDaColuna(campo, valores);
      return vals.length ? w({ [col]: { in: vals } }) : NADA;
    }
  }
}

/** "(não informado)": coluna nula; na Apresentação, lista vazia (não identificada). */
function whereNulo(campo: CampoDemanda): Prisma.DemandaWhereInput {
  return tipoDoCampo(campo) === "lista" ? w({ [COLUNA[campo]]: { isEmpty: true } }) : w({ [COLUNA[campo]]: null });
}

export function whereSelecao(campo: CampoDemanda, sel: SelecaoCampo): Prisma.DemandaWhereInput {
  const incl = separar(sel.incluir);
  const excl = separar(sel.excluir);
  const conds: Prisma.DemandaWhereInput[] = [];
  if (sel.incluir.length) {
    const ou: Prisma.DemandaWhereInput[] = [];
    if (incl.valores.length) ou.push(whereCasa(campo, incl.valores));
    if (incl.nulo) ou.push(whereNulo(campo));
    conds.push({ OR: ou });
  }
  // Excluir "A" não tira as linhas sem valor: NOT (NULL) não é verdadeiro no
  // SQL, então a coluna nula entra explicitamente (o "(não informado)" sai só
  // quando ele próprio é excluído). Lista (Apresentação) nunca é nula.
  if (excl.valores.length) {
    conds.push(
      tipoDoCampo(campo) === "lista"
        ? { NOT: whereCasa(campo, excl.valores) }
        : { OR: [{ NOT: whereCasa(campo, excl.valores) }, w({ [COLUNA[campo]]: null })] }
    );
  }
  if (excl.nulo) conds.push({ NOT: whereNulo(campo) });
  return { AND: conds };
}

// ── Código CATMAT / registro (A5): apresentação exata × não identificada ────

/**
 * Com o CATMAT do código: a apresentação EXATA (o enriquecimento achou aquele
 * CATMAT para a demanda — SISMAT pelo NUP ou concentração no texto) ou a MESMA
 * SUBSTÂNCIA COM APRESENTAÇÃO NÃO IDENTIFICADA. Demanda de outra apresentação
 * da mesma substância (410019 quando o filtro é 410020) fica de fora. A
 * unidade de fornecimento refina a exata (ou deixa passar quando a unidade
 * não foi apurada). Registro sem CATMAT: só a substância.
 */
function whereCodigo(c: FiltroCatmat, grupo: GrupoCatmat | null, unidade: string | null): Prisma.DemandaWhereInput {
  const termos = whereTermos(c.grupos);
  if (!c.catmat) return termos;
  const exata: Prisma.DemandaWhereInput = {
    AND: [
      { catmatsDerivados: { has: c.catmat } },
      ...(unidade ? [{ OR: [{ unidadesDerivadas: { has: unidade } }, { unidadesDerivadas: { isEmpty: true } }] }] : []),
    ],
  };
  const naoIdentificada: Prisma.DemandaWhereInput = { AND: [termos, { catmatsDerivados: { isEmpty: true } }] };
  if (grupo === "exata") return exata;
  if (grupo === "nao_identificada") return naoIdentificada;
  return { OR: [exata, naoIdentificada] };
}

// ── Busca e processo SEI ─────────────────────────────────────────────────────

function whereBusca(b: BuscaAplicada, unidade: string | null): Prisma.DemandaWhereInput | null {
  const termos = b.interpretacao.termos.map((t) => ({ buscaNorm: { contains: t } }));
  if (!termos.length) return null;
  const texto: Prisma.DemandaWhereInput = { AND: termos };
  // Código reconhecido: as demandas do medicamento E as que citam o número
  // (um nº DJUD de 6 dígitos não some por parecer um CATMAT).
  return b.codigo ? { OR: [whereCodigo(b.codigo, null, unidade), texto] } : texto;
}

/** NUP completo casa exato (formato canônico); trecho, pelo texto ou pelos dígitos. */
function whereNup(nup: string): Prisma.DemandaWhereInput {
  const ds = digitos(nup);
  const canonico = ds.length >= 15 ? normalizarNupSei(nup) : null;
  if (canonico) return { nupSei: canonico };
  const ou: Prisma.DemandaWhereInput[] = [{ nupSei: { contains: nup.trim() } }];
  if (ds.length >= 8) ou.push({ buscaNorm: { contains: ds } });
  return { OR: ou };
}

export function whereDemandas(a: FiltroAplicado): Prisma.DemandaWhereInput {
  const f = a.filtro;
  const conds: Prisma.DemandaWhereInput[] = [{ deletedAt: null }];
  if (a.vazio) conds.push(NADA);
  if (a.catmat?.encontrado) conds.push(whereCodigo(a.catmat, f.catmatGrupo, f.unidade));
  if (a.medicamento) conds.push(whereTermos([a.medicamento]));
  if (a.busca) {
    const b = whereBusca(a.busca, f.unidade);
    if (b) conds.push(b);
  }
  if (f.nupSei) conds.push(whereNup(f.nupSei));
  for (const c of CAMPOS_DEMANDA) {
    const sel = a.campos[c];
    if (sel) conds.push(whereSelecao(c, sel));
  }
  if (f.dataEntradaDe) conds.push({ dataEntradaDJUD: { gte: inicioDoDia(f.dataEntradaDe) } });
  if (f.dataEntradaAte) conds.push({ dataEntradaDJUD: { lt: diaSeguinte(f.dataEntradaAte) } });
  if (f.criadoDe) conds.push({ criadoEm: { gte: inicioDoDia(f.criadoDe) } });
  if (f.criadoAte) conds.push({ criadoEm: { lt: diaSeguinte(f.criadoAte) } });
  if (f.organizacaoId) conds.push({ organizacaoId: f.organizacaoId });
  if (f.ids.length) conds.push({ id: { in: f.ids } });
  return { AND: conds };
}

// ── O mesmo em SQL ───────────────────────────────────────────────────────────

function colunaSql(c: string, alias?: string): Prisma.Sql {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(c) || (alias && !/^[a-z]+$/.test(alias))) {
    throw new Error(`Identificador inválido no filtro: ${alias ?? ""}.${c}`);
  }
  return Prisma.raw(alias ? `${alias}."${c}"` : `"${c}"`);
}

const escLike = (x: string) => x.replace(/[\\%_]/g, (c) => `\\${c}`);

function sqlItem(col: Prisma.Sql, v: string): Prisma.Sql {
  const s = SEPARADOR_MULTIVALOR;
  return Prisma.sql`(${col} = ${v} OR ${col} LIKE ${`${escLike(v)}${escLike(s)}%`} OR ${col} LIKE ${`%${escLike(s)}${escLike(v)}`} OR ${col} LIKE ${`%${escLike(s)}${escLike(v)}${escLike(s)}%`})`;
}

const sqlTexto = (vals: string[]) => Prisma.sql`ARRAY[${Prisma.join(vals)}]::text[]`;

function sqlCasa(campo: CampoDemanda, valores: string[], alias?: string): Prisma.Sql {
  const col = colunaSql(COLUNA[campo], alias);
  switch (tipoDoCampo(campo)) {
    case "multivalor":
      return Prisma.sql`(${Prisma.join(valores.map((v) => sqlItem(col, v)), " OR ")})`;
    case "lista":
      return Prisma.sql`${col} && ${sqlTexto(valores)}`;
    default: {
      const vals = valoresDaColuna(campo, valores);
      if (!vals.length) return Prisma.sql`FALSE`;
      // Enum comparado como texto: o parâmetro chega como text, e "enum = text" não existe.
      const alvo = campo === "formaCumprimento" ? Prisma.sql`${col}::text` : col;
      return Prisma.sql`${alvo} IN (${Prisma.join(vals)})`;
    }
  }
}

function sqlNulo(campo: CampoDemanda, alias?: string): Prisma.Sql {
  const col = colunaSql(COLUNA[campo], alias);
  return tipoDoCampo(campo) === "lista" ? Prisma.sql`cardinality(${col}) = 0` : Prisma.sql`${col} IS NULL`;
}

export function sqlSelecao(campo: CampoDemanda, sel: SelecaoCampo, alias?: string): Prisma.Sql {
  const col = colunaSql(COLUNA[campo], alias);
  const incl = separar(sel.incluir);
  const excl = separar(sel.excluir);
  const conds: Prisma.Sql[] = [];
  if (sel.incluir.length) {
    const ou: Prisma.Sql[] = [];
    if (incl.valores.length) ou.push(sqlCasa(campo, incl.valores, alias));
    if (incl.nulo) ou.push(sqlNulo(campo, alias));
    conds.push(Prisma.sql`(${Prisma.join(ou, " OR ")})`);
  }
  if (excl.valores.length) {
    conds.push(
      tipoDoCampo(campo) === "lista"
        ? Prisma.sql`NOT (${sqlCasa(campo, excl.valores, alias)})`
        : Prisma.sql`(NOT ${sqlCasa(campo, excl.valores, alias)} OR ${col} IS NULL)`
    );
  }
  if (excl.nulo) conds.push(Prisma.sql`NOT (${sqlNulo(campo, alias)})`);
  return conds.length ? Prisma.sql`(${Prisma.join(conds, " AND ")})` : Prisma.sql`TRUE`;
}

function sqlCodigo(c: FiltroCatmat, grupo: GrupoCatmat | null, unidade: string | null, alias?: string): Prisma.Sql {
  const termos = sqlTermos(c.grupos, alias);
  if (!c.catmat) return termos;
  const derivados = colunaSql("catmatsDerivados", alias);
  const unidades = colunaSql("unidadesDerivadas", alias);
  const exata = unidade
    ? Prisma.sql`(${c.catmat} = ANY(${derivados}) AND (${unidade} = ANY(${unidades}) OR cardinality(${unidades}) = 0))`
    : Prisma.sql`${c.catmat} = ANY(${derivados})`;
  const naoIdentificada = Prisma.sql`(${termos} AND cardinality(${derivados}) = 0)`;
  if (grupo === "exata") return exata;
  if (grupo === "nao_identificada") return naoIdentificada;
  return Prisma.sql`(${exata} OR ${naoIdentificada})`;
}

function sqlBusca(b: BuscaAplicada, unidade: string | null, alias?: string): Prisma.Sql | null {
  const col = colunaSql("buscaNorm", alias);
  const termos = b.interpretacao.termos.map((t) => Prisma.sql`${col} LIKE ${padraoLike(t)}`);
  if (!termos.length) return null;
  const texto = Prisma.sql`(${Prisma.join(termos, " AND ")})`;
  return b.codigo ? Prisma.sql`(${sqlCodigo(b.codigo, null, unidade, alias)} OR ${texto})` : texto;
}

function sqlNup(nup: string, alias?: string): Prisma.Sql {
  const col = colunaSql("nupSei", alias);
  const ds = digitos(nup);
  const canonico = ds.length >= 15 ? normalizarNupSei(nup) : null;
  if (canonico) return Prisma.sql`${col} = ${canonico}`;
  const ou = [Prisma.sql`${col} LIKE ${padraoLike(nup.trim())}`];
  if (ds.length >= 8) ou.push(Prisma.sql`${colunaSql("buscaNorm", alias)} LIKE ${padraoLike(ds)}`);
  return Prisma.sql`(${Prisma.join(ou, " OR ")})`;
}

/**
 * Condições do filtro em SQL, unidas por AND (sem a palavra WHERE), sempre com
 * `deletedAt IS NULL`. `alias` para consultas com JOIN ("d").
 */
export function sqlDemandas(a: FiltroAplicado, alias?: string): Prisma.Sql {
  const f = a.filtro;
  const col = (c: string) => colunaSql(c, alias);
  const conds: Prisma.Sql[] = [Prisma.sql`${col("deletedAt")} IS NULL`];
  if (a.vazio) conds.push(Prisma.sql`FALSE`);
  if (a.catmat?.encontrado) conds.push(sqlCodigo(a.catmat, f.catmatGrupo, f.unidade, alias));
  if (a.medicamento) conds.push(sqlTermos([a.medicamento], alias));
  if (a.busca) {
    const b = sqlBusca(a.busca, f.unidade, alias);
    if (b) conds.push(b);
  }
  if (f.nupSei) conds.push(sqlNup(f.nupSei, alias));
  for (const c of CAMPOS_DEMANDA) {
    const sel = a.campos[c];
    if (sel) conds.push(sqlSelecao(c, sel, alias));
  }
  if (f.dataEntradaDe) conds.push(Prisma.sql`${col("dataEntradaDJUD")} >= ${inicioDoDia(f.dataEntradaDe)}`);
  if (f.dataEntradaAte) conds.push(Prisma.sql`${col("dataEntradaDJUD")} < ${diaSeguinte(f.dataEntradaAte)}`);
  if (f.criadoDe) conds.push(Prisma.sql`${col("criadoEm")} >= ${inicioDoDia(f.criadoDe)}`);
  if (f.criadoAte) conds.push(Prisma.sql`${col("criadoEm")} < ${diaSeguinte(f.criadoAte)}`);
  if (f.organizacaoId) conds.push(Prisma.sql`${col("organizacaoId")} = ${f.organizacaoId}`);
  if (f.ids.length) conds.push(Prisma.sql`${col("id")} IN (${Prisma.join(f.ids)})`);
  return Prisma.join(conds, " AND ");
}

/** `WHERE …` pronto, para as consultas que só precisam dele. */
export function sqlWhereDemandas(a: FiltroAplicado, alias?: string): Prisma.Sql {
  return Prisma.sql`WHERE ${sqlDemandas(a, alias)}`;
}

/** Os termos que a tela mostra na faixa do medicamento ("Eltrombopag → ELTROMBOPAG"). */
export function descreverMedicamento(g: GrupoTermos | null): string | null {
  return g ? g.termos.map((t) => semAcento(t)).join(" + ") : null;
}

/**
 * Contagem dos dois grupos do filtro por código (A5), no resto do mesmo filtro:
 * quantas demandas têm a apresentação exata e quantas são da mesma substância
 * sem apresentação identificada.
 */
export async function contarGruposCatmat(a: FiltroAplicado): Promise<{ exata: number; naoIdentificada: number } | null> {
  if (!a.catmat?.encontrado || !a.catmat.catmat) return null;
  const com = (grupo: GrupoCatmat) => ({ ...a, filtro: { ...a.filtro, catmatGrupo: grupo } });
  const [exata, naoIdentificada] = await Promise.all([
    db.demanda.count({ where: whereDemandas(com("exata")) }),
    db.demanda.count({ where: whereDemandas(com("nao_identificada")) }),
  ]);
  return { exata, naoIdentificada };
}
