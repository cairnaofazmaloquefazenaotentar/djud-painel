import { Prisma } from "@prisma/client";
import { resolverItem, type ItemPesquisa } from "@/lib/pesquisa-preco";

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
// Tolerância, nesta ordem: sai o sal ou veículo na frente ("SUCCINATO DE",
// "ÓLEO DE"), sai o sufixo que não identifica a molécula ("SÓDICA",
// "MONOIDRATADO"), fica a palavra mais longa sem a vogal final — NUSINERSENA
// vira NUSINERSEN e casa tanto "Nusinersen" quanto "Nusinersena" — e cada
// radical é procurado com e sem acento, porque o Redmine não é consistente.
//
// Semântica: OR entre grupos, AND dentro do grupo. O registro CMED
// "CANABIDIOL;TETRAIDROCANABINOL" exige as duas substâncias — o código
// identifica aquele produto, não qualquer demanda de canabidiol. Já o
// CatmatItem "ELEXACAFTOR" e o registro "IVACAFTOR;TEZACAFTOR;ELEXACAFTOR" do
// mesmo CATMAT viram dois grupos, então a tripla e o isolado aparecem juntos.
// ─────────────────────────────────────────────────────────────────────────────

/** Radical mais curto que isto vira ruído em `contains` ("ALFA", "ÁCIDO"). */
const TAMANHO_MINIMO = 5;

/** Sal ou veículo na frente do nome: "SUCCINATO DE RIBOCICLIBE" → "RIBOCICLIBE". */
const PREFIXO_SAL = /^(?:(?:[A-ZÀ-Ü]+(?:ATO|ETO|IDRATO|ILATO)|ÓLEO|OLEO|EXTRATO|SAL)\s+DE\s+)+/iu;

/** Sufixos que não identificam a molécula: "ENOXAPARINA SÓDICA" → "ENOXAPARINA". */
const SUFIXO_SAL =
  /\s+(?:SÓDIC[OA]|SODIC[OA]|DISSÓDIC[OA]|DISSODIC[OA]|TRISSÓDIC[OA]|TRISSODIC[OA]|POTÁSSIC[OA]|POTASSIC[OA]|CÁLCIC[OA]|CALCIC[OA]|MAGNÉSIC[OA]|MAGNESIC[OA]|MONOIDRATAD[OA]|DIIDRATAD[OA]|ANIDR[OA]|RECOMBINANTE|HUMAN[OA])$/iu;

export function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Nome da substância sem parênteses, sal e sufixo — como o usuário a reconhece. */
export function limparSubstancia(bruta: string): string {
  let s = bruta.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(PREFIXO_SAL, "");
  for (let anterior = ""; anterior !== s; ) {
    anterior = s;
    s = s.replace(SUFIXO_SAL, "");
  }
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Palavra mais longa da substância, sem a vogal final: o radical que sobrevive
 * às grafias. "ÁCIDO ZOLEDRÔNICO" → ZOLEDRÔNIC; "TRASTUZUMABE" → TRASTUZUMAB.
 */
export function radicalSubstancia(limpa: string): string | null {
  const palavras = limpa.toUpperCase().match(/[A-ZÀ-Ü0-9]+/gu) ?? [];
  if (!palavras.length) return null;
  let p = palavras.reduce((a, b) => (b.length > a.length ? b : a));
  if (p.length >= 6 && /[AEO]$/u.test(p)) p = p.slice(0, -1);
  return p.length >= TAMANHO_MINIMO ? p : null;
}

export interface GrupoTermos {
  /** Substância(s) como o catálogo escreve — para mostrar ao usuário. */
  rotulo: string;
  /** Radicais que precisam ocorrer TODOS na demanda (AND). */
  termos: string[];
}

/** Uma string de substância (pode ser associação "A;B" ou "A + B") → um grupo. */
export function grupoDeSubstancia(bruta: string): GrupoTermos | null {
  const partes = bruta.split(/[;+/]/).map(limparSubstancia).filter(Boolean);
  const termos: string[] = [];
  for (const parte of partes) {
    const r = radicalSubstancia(parte);
    if (r && !termos.includes(r)) termos.push(r);
  }
  return termos.length ? { rotulo: partes.join(" + "), termos } : null;
}

/**
 * Substância principal de uma descrição CATMAT ("NOME, ATRIBUTO: VALOR, …").
 * Quando o nome é genérico ("EXTRATO MEDICINAL"), o atributo PRINCÍPIO ATIVO
 * é que traz a molécula. O fallback " — " é a descrição montada a partir do
 * registro ANVISA quando o código não está no catálogo.
 */
export function substanciaPrincipal(descricao: string): string {
  const pa = descricao.match(/PRINC[IÍ]PIO ATIVO:\s*([^,]+)/iu);
  if (pa) return pa[1].trim();
  return descricao.split(",")[0].split(" — ")[0].trim();
}

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
      if (marca.length >= TAMANHO_MINIMO) adicionar({ rotulo: `${marca} (marca)`, termos: [marca] });
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

/**
 * WHERE do Prisma para `db.demanda`: cada radical, com e sem acento, em
 * qualquer dos três campos onde o Redmine costuma citar o medicamento.
 * Só chamar quando `filtro.encontrado` — grupos vazios dariam OR: [] (nada).
 */
export function whereDemandaPorCatmat(filtro: FiltroCatmat): Prisma.DemandaWhereInput {
  const contem = (v: string): Prisma.DemandaWhereInput[] => [
    { principioAtivo: { contains: v, mode: "insensitive" } },
    { titulo: { contains: v, mode: "insensitive" } },
    { descricao: { contains: v, mode: "insensitive" } },
  ];

  return {
    OR: filtro.grupos.map((g) => ({
      AND: g.termos.map((t) => ({ OR: variantesTermo(t).flatMap(contem) })),
    })),
  };
}

/** Com e sem acento — o Redmine não é consistente na grafia. */
function variantesTermo(termo: string): string[] {
  return Array.from(new Set([termo, semAcento(termo)]));
}

/**
 * O mesmo filtro em SQL bruto, para as séries do dashboard que não passam pelo
 * ORM (lib/metrics.ts usa $queryRaw nas agregações por mês e por ano). As duas
 * versões precisam casar exatamente: números diferentes entre a lista de
 * demandas e o painel para o mesmo código seriam impossíveis de explicar.
 *
 * Os termos entram como parâmetros (`${}`), nunca interpolados no texto do SQL.
 * Só chamar quando `filtro.encontrado`.
 */
export function sqlDemandaPorCatmat(filtro: FiltroCatmat): Prisma.Sql {
  const contem = (v: string): Prisma.Sql[] => {
    const alvo = `%${v}%`;
    return [
      Prisma.sql`"principioAtivo" ILIKE ${alvo}`,
      Prisma.sql`"titulo" ILIKE ${alvo}`,
      Prisma.sql`"descricao" ILIKE ${alvo}`,
    ];
  };
  const termo = (t: string) =>
    Prisma.sql`(${Prisma.join(variantesTermo(t).flatMap(contem), " OR ")})`;
  const grupo = (g: GrupoTermos) => Prisma.sql`(${Prisma.join(g.termos.map(termo), " AND ")})`;
  return Prisma.sql`(${Prisma.join(filtro.grupos.map(grupo), " OR ")})`;
}
