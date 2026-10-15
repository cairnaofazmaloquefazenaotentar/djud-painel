import { FormaCumprimento, Prisma } from "@prisma/client";
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
  interpretarBusca,
  type CampoDemanda,
  type FiltroDemandas,
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
// registro (campo próprio ou digitado na busca) e os radicais do medicamento.
// ─────────────────────────────────────────────────────────────────────────────

export interface BuscaAplicada {
  /** Como a busca foi lida: código, número ou texto. */
  interpretacao: InterpretacaoBusca;
  /** Código digitado na busca e reconhecido no catálogo (faixa "Interpretado como CATMAT…"). */
  codigo: FiltroCatmat | null;
}

export interface FiltroAplicado {
  filtro: FiltroDemandas;
  /** Campo CATMAT / registro ANVISA, resolvido (descrição, substâncias ou motivo). */
  catmat: FiltroCatmat | null;
  busca: BuscaAplicada | null;
  /** Radicais do medicamento digitado (B3). */
  medicamento: GrupoTermos | null;
  /** Nada pode casar (o código do campo CATMAT não existe): devolver vazio com o motivo. */
  vazio: boolean;
  motivo: string | null;
}

/** Medicamento digitado → grupo de radicais; texto curto vira um termo só. */
function grupoDoMedicamento(texto: string): GrupoTermos | null {
  const g = grupoDeSubstancia(texto);
  if (g) return g;
  const t = texto.trim().toUpperCase();
  return t.length >= 3 ? { rotulo: texto.trim(), termos: [t] } : null;
}

export async function aplicarFiltro(filtro: FiltroDemandas): Promise<FiltroAplicado> {
  const interpretacao = filtro.busca ? interpretarBusca(filtro.busca) : null;
  const [catmat, codigoBusca] = await Promise.all([
    filtro.catmat ? resolverFiltroCatmat(filtro.catmat) : Promise.resolve(null),
    interpretacao?.tipo === "codigo" ? resolverFiltroCatmat(interpretacao.codigo) : Promise.resolve(null),
  ]);
  const vazio = !!catmat && !catmat.encontrado;
  return {
    filtro,
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

/** Item de uma lista "A | B": igual, primeiro, último ou do meio. */
function whereItem(campo: CampoDemanda, v: string): Prisma.DemandaWhereInput {
  const s = SEPARADOR_MULTIVALOR;
  return {
    OR: [
      { [campo]: v },
      { [campo]: { startsWith: `${v}${s}` } },
      { [campo]: { endsWith: `${s}${v}` } },
      { [campo]: { contains: `${s}${v}${s}` } },
    ],
  } as Prisma.DemandaWhereInput;
}

function whereCasa(campo: CampoDemanda, valores: string[]): Prisma.DemandaWhereInput {
  if (CAMPOS_MULTIVALOR.has(campo)) return { OR: valores.map((v) => whereItem(campo, v)) };
  const col = valoresDaColuna(campo, valores);
  return col.length ? ({ [campo]: { in: col } } as Prisma.DemandaWhereInput) : NADA;
}

export function whereSelecao(campo: CampoDemanda, sel: SelecaoCampo): Prisma.DemandaWhereInput {
  const incl = separar(sel.incluir);
  const excl = separar(sel.excluir);
  const conds: Prisma.DemandaWhereInput[] = [];
  if (sel.incluir.length) {
    const ou: Prisma.DemandaWhereInput[] = [];
    if (incl.valores.length) ou.push(whereCasa(campo, incl.valores));
    if (incl.nulo) ou.push({ [campo]: null } as Prisma.DemandaWhereInput);
    conds.push({ OR: ou });
  }
  // Excluir "A" não tira as linhas sem valor: NOT (NULL) não é verdadeiro no
  // SQL, então a coluna nula entra explicitamente (o "(não informado)" sai só
  // quando ele próprio é excluído).
  if (excl.valores.length) {
    conds.push({ OR: [{ NOT: whereCasa(campo, excl.valores) }, { [campo]: null } as Prisma.DemandaWhereInput] });
  }
  if (excl.nulo) conds.push({ [campo]: { not: null } } as Prisma.DemandaWhereInput);
  return { AND: conds };
}

// ── Busca ────────────────────────────────────────────────────────────────────

function whereBusca(b: BuscaAplicada): Prisma.DemandaWhereInput | null {
  const termos = b.interpretacao.termos.map((t) => ({ buscaNorm: { contains: t } }));
  if (!termos.length) return null;
  const texto: Prisma.DemandaWhereInput = { AND: termos };
  // Código reconhecido: as demandas do medicamento E as que citam o número
  // (um nº DJUD de 6 dígitos não some por parecer um CATMAT).
  return b.codigo ? { OR: [whereTermos(b.codigo.grupos), texto] } : texto;
}

export function whereDemandas(a: FiltroAplicado): Prisma.DemandaWhereInput {
  const f = a.filtro;
  const conds: Prisma.DemandaWhereInput[] = [{ deletedAt: null }];
  if (a.vazio) conds.push(NADA);
  if (a.catmat?.encontrado) conds.push(whereTermos(a.catmat.grupos));
  if (a.medicamento) conds.push(whereTermos([a.medicamento]));
  if (a.busca) {
    const b = whereBusca(a.busca);
    if (b) conds.push(b);
  }
  for (const c of CAMPOS_DEMANDA) {
    const sel = f.campos[c];
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

function sqlItem(col: Prisma.Sql, v: string): Prisma.Sql {
  const s = SEPARADOR_MULTIVALOR;
  const esc = (x: string) => x.replace(/[\\%_]/g, (c) => `\\${c}`);
  return Prisma.sql`(${col} = ${v} OR ${col} LIKE ${`${esc(v)}${esc(s)}%`} OR ${col} LIKE ${`%${esc(s)}${esc(v)}`} OR ${col} LIKE ${`%${esc(s)}${esc(v)}${esc(s)}%`})`;
}

function sqlCasa(campo: CampoDemanda, valores: string[], alias?: string): Prisma.Sql {
  const col = colunaSql(campo, alias);
  if (CAMPOS_MULTIVALOR.has(campo)) return Prisma.sql`(${Prisma.join(valores.map((v) => sqlItem(col, v)), " OR ")})`;
  const vals = valoresDaColuna(campo, valores);
  if (!vals.length) return Prisma.sql`FALSE`;
  // Enum comparado como texto: o parâmetro chega como text, e "enum = text" não existe.
  const alvo = campo === "formaCumprimento" ? Prisma.sql`${col}::text` : col;
  return Prisma.sql`${alvo} IN (${Prisma.join(vals)})`;
}

export function sqlSelecao(campo: CampoDemanda, sel: SelecaoCampo, alias?: string): Prisma.Sql {
  const col = colunaSql(campo, alias);
  const incl = separar(sel.incluir);
  const excl = separar(sel.excluir);
  const conds: Prisma.Sql[] = [];
  if (sel.incluir.length) {
    const ou: Prisma.Sql[] = [];
    if (incl.valores.length) ou.push(sqlCasa(campo, incl.valores, alias));
    if (incl.nulo) ou.push(Prisma.sql`${col} IS NULL`);
    conds.push(Prisma.sql`(${Prisma.join(ou, " OR ")})`);
  }
  if (excl.valores.length) conds.push(Prisma.sql`(NOT ${sqlCasa(campo, excl.valores, alias)} OR ${col} IS NULL)`);
  if (excl.nulo) conds.push(Prisma.sql`${col} IS NOT NULL`);
  return conds.length ? Prisma.sql`(${Prisma.join(conds, " AND ")})` : Prisma.sql`TRUE`;
}

function sqlBusca(b: BuscaAplicada, alias?: string): Prisma.Sql | null {
  const col = colunaSql("buscaNorm", alias);
  const termos = b.interpretacao.termos.map((t) => Prisma.sql`${col} LIKE ${padraoLike(t)}`);
  if (!termos.length) return null;
  const texto = Prisma.sql`(${Prisma.join(termos, " AND ")})`;
  return b.codigo ? Prisma.sql`(${sqlTermos(b.codigo.grupos, alias)} OR ${texto})` : texto;
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
  if (a.catmat?.encontrado) conds.push(sqlTermos(a.catmat.grupos, alias));
  if (a.medicamento) conds.push(sqlTermos([a.medicamento], alias));
  if (a.busca) {
    const b = sqlBusca(a.busca, alias);
    if (b) conds.push(b);
  }
  for (const c of CAMPOS_DEMANDA) {
    const sel = f.campos[c];
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
