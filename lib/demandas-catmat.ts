import { Prisma } from "@prisma/client";
import { resolverItem, type ItemPesquisa } from "@/lib/pesquisa-preco";
import {
  TAMANHO_MINIMO_RADICAL,
  grupoDeSubstancia,
  substanciaPrincipal,
  variantesTermo,
  type GrupoTermos,
} from "@/lib/substancia";

// ─────────────────────────────────────────────────────────────────────────────
// Filtro por CATMAT / registro ANVISA na aba Demandas.
//
// `Demanda` não guarda CATMAT: o medicamento chega do Redmine como texto livre
// em `principioAtivo` ("Nusinersen", "Ribociclibe", "Elexacaftor / Ivacaftor /
// Tezacaftor") e, em ~14 mil demandas, só no título ou na descrição. O catálogo,
// por sua vez, escreve "NUSINERSENA" e "SUCCINATO DE RIBOCICLIBE". Este módulo
// faz a ponte entre as duas grafias:
//
//   código → resolverItem() (a mesma resolução da Pesquisa de Preços)
//          → substância do CatmatItem + substâncias dos registros CMED do código
//          → radicais tolerantes a variação de grafia
//          → WHERE sobre principioAtivo / titulo / descricao
//
// As regras de tolerância de grafia (sal, sufixo, radical) ficam em
// lib/substancia.ts, módulo puro também usado pela busca e pelo Dashboard.
//
// Semântica: OR entre grupos, AND dentro do grupo. O registro CMED
// "CANABIDIOL;TETRAIDROCANABINOL" exige as duas substâncias — o código
// identifica aquele produto, não qualquer demanda de canabidiol. Já o
// CatmatItem "ELEXACAFTOR" e o registro "IVACAFTOR;TEZACAFTOR;ELEXACAFTOR" do
// mesmo CATMAT viram dois grupos, então a tripla e o isolado aparecem juntos.
// ─────────────────────────────────────────────────────────────────────────────

export {
  grupoDeSubstancia,
  limparSubstancia,
  radicalSubstancia,
  semAcento,
  substanciaPrincipal,
  type GrupoTermos,
} from "@/lib/substancia";

export interface FiltroCatmat {
  /** Código como o usuário digitou (aparado). */
  codigo: string;
  encontrado: boolean;
  /** Por que não dá para filtrar, quando `encontrado` é false. */
  motivo: string | null;
  tipo: "CATMAT" | "REGISTRO" | null;
  catmat: string | null;
  registro: string | null;
  descricao: string | null;
  /** OR entre grupos; AND dentro de cada um. Vazio quando não encontrado. */
  grupos: GrupoTermos[];
}

function gruposDoItem(item: ItemPesquisa): GrupoTermos[] {
  const fontes = [substanciaPrincipal(item.descricao)];
  for (const r of item.registros) if (r.substancia) fontes.push(r.substancia);

  const grupos: GrupoTermos[] = [];
  const vistos = new Set<string>();
  const adicionar = (g: GrupoTermos | null) => {
    if (!g) return;
    const chave = [...g.termos].sort().join("|");
    if (vistos.has(chave)) return;
    vistos.add(chave);
    grupos.push(g);
  };
  for (const f of fontes) adicionar(grupoDeSubstancia(f));

  // Marca comercial só na busca por registro: um registro é UM produto e a
  // descrição da demanda às vezes só cita a marca. Pelo CATMAT seriam dezenas
  // de marcas (e genéricos com nomes soltos) — ruído demais.
  if (item.tipo === "REGISTRO") {
    for (const r of item.registros) {
      const marca = (r.produto ?? "").replace(/\s+/g, " ").trim().toUpperCase();
      if (marca.length >= TAMANHO_MINIMO_RADICAL) adicionar({ rotulo: `${marca} (marca)`, termos: [marca] });
    }
  }
  return grupos;
}

/** Resolve o código no catálogo e monta os termos; nunca lança por código inválido. */
export async function resolverFiltroCatmat(codigoBruto: string): Promise<FiltroCatmat> {
  const codigo = codigoBruto.trim();
  const vazio: FiltroCatmat = {
    codigo,
    encontrado: false,
    motivo: null,
    tipo: null,
    catmat: null,
    registro: null,
    descricao: null,
    grupos: [],
  };

  const item = await resolverItem(codigo);
  if (!item) {
    return {
      ...vazio,
      motivo: "Código não encontrado no catálogo CATMAT nem nos registros ANVISA (CMED).",
    };
  }

  const identificado = {
    ...vazio,
    tipo: item.tipo,
    catmat: item.catmat,
    registro: item.registro,
    descricao: item.descricao,
  };
  const grupos = gruposDoItem(item);
  if (!grupos.length) {
    return { ...identificado, motivo: "O catálogo não traz uma substância reconhecível para este código." };
  }
  return { ...identificado, encontrado: true, grupos };
}

/** Campos onde o Redmine (e a A5, em `medicamento`) cita o medicamento. */
const CAMPOS_MEDICAMENTO = ["principioAtivo", "medicamento", "titulo", "descricao"] as const;

/**
 * WHERE do Prisma para grupos de termos: OR entre grupos, AND dentro do grupo;
 * cada radical, com e sem acento, em qualquer dos campos do medicamento.
 * Grupos vazios dariam OR: [] (nada) — só chamar com termos.
 */
export function whereTermos(grupos: GrupoTermos[]): Prisma.DemandaWhereInput {
  const contem = (v: string): Prisma.DemandaWhereInput[] =>
    CAMPOS_MEDICAMENTO.map((c) => ({ [c]: { contains: v, mode: "insensitive" } }) as Prisma.DemandaWhereInput);
  return {
    OR: grupos.map((g) => ({
      AND: g.termos.map((t) => ({ OR: variantesTermo(t).flatMap(contem) })),
    })),
  };
}

/** LIKE com os curingas do valor escapados (o Prisma faz o mesmo no `contains`). */
export function padraoLike(v: string): string {
  return `%${v.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * O mesmo filtro em SQL bruto, para as séries que não passam pelo ORM. As duas
 * versões precisam casar exatamente: números diferentes entre a lista e o
 * painel para o mesmo filtro seriam impossíveis de explicar. `alias` para as
 * consultas com JOIN (p.ex. `d` no cruzamento com o SIAFI). Os termos entram
 * como parâmetros (`${}`), nunca interpolados no texto do SQL.
 */
export function sqlTermos(grupos: GrupoTermos[], alias?: string): Prisma.Sql {
  const col = (c: string) => Prisma.raw(alias ? `${alias}."${c}"` : `"${c}"`);
  const contem = (v: string): Prisma.Sql[] =>
    CAMPOS_MEDICAMENTO.map((c) => Prisma.sql`${col(c)} ILIKE ${padraoLike(v)}`);
  const termo = (t: string) => Prisma.sql`(${Prisma.join(variantesTermo(t).flatMap(contem), " OR ")})`;
  const grupo = (g: GrupoTermos) => Prisma.sql`(${Prisma.join(g.termos.map(termo), " AND ")})`;
  return Prisma.sql`(${Prisma.join(grupos.map(grupo), " OR ")})`;
}

/** WHERE do Prisma do filtro por código. Só chamar quando `filtro.encontrado`. */
export function whereDemandaPorCatmat(filtro: FiltroCatmat): Prisma.DemandaWhereInput {
  return whereTermos(filtro.grupos);
}

/** O filtro por código em SQL (lib/metrics.ts). Só chamar quando `filtro.encontrado`. */
export function sqlDemandaPorCatmat(filtro: FiltroCatmat, alias?: string): Prisma.Sql {
  return sqlTermos(filtro.grupos, alias);
}
