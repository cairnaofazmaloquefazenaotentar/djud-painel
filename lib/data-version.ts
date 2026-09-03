import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────────────────────
// Cache condicional por VERSÃO DO DADO (não por relógio).
//
// O painel é alimentado por scripts de importação que rodam fora da aplicação
// (truncate-and-replace de SismatEntrada, SismatSaida, RedmineSeiAtributos,
// ComprasGovPreco, SismatPmvg). Sem um canal para avisar o front, headers do
// tipo `max-age=3600` deixam o dashboard servindo dado velho por até uma hora
// depois de cada import — e `public` ainda autoriza cache compartilhado a
// guardar resposta de rota autenticada.
//
// Aqui a validade da resposta é amarrada ao dado: cada tabela carrega
// `criadoEm @default(now())`, então todo import move o carimbo. A versão é o
// md5 de (nome, contagem, maior carimbo) de cada fonte que a rota consome.
//
// O ganho vem da ORDEM: a consulta de versão é um count + max por tabela e
// roda ANTES da agregação pesada. Se o ETag do cliente bate, a rota devolve
// 304 sem corpo e sem nunca tocar nas dezenas de milhares de linhas.
//
// `private, no-cache` não é "não guarde" — é "guarde, mas revalide sempre".
// Diferente de `no-store` (não guarde nada) e de `max-age` (não pergunte por
// N segundos). O browser mantém a cópia e manda If-None-Match a cada uso.
// ─────────────────────────────────────────────────────────────────────────────

interface Fonte {
  /** Tabela qualificada pelo schema Postgres (o projeto usa multiSchema). */
  tabela: Prisma.Sql;
  /**
   * Colunas de carimbo consideradas na versão. `Demanda` também é editada pela
   * UI, então `atualizadoEm` (@updatedAt) entra junto — sem ela, uma edição
   * não invalidaria o cache. Exclusão física é coberta pela contagem.
   */
  colunas: readonly string[];
}

const FONTES = {
  demanda: {
    tabela: Prisma.sql`public."Demanda"`,
    colunas: ["criadoEm", "atualizadoEm"],
  },
  sismatEntrada: {
    tabela: Prisma.sql`sismat."SismatEntrada"`,
    colunas: ["criadoEm"],
  },
  sismatSaida: {
    tabela: Prisma.sql`sismat."SismatSaida"`,
    colunas: ["criadoEm"],
  },
  redmineSei: {
    tabela: Prisma.sql`sismat."RedmineSeiAtributos"`,
    colunas: ["criadoEm"],
  },
  comprasGovPreco: {
    tabela: Prisma.sql`sismat."ComprasGovPreco"`,
    colunas: ["criadoEm"],
  },
  sismatPmvg: {
    tabela: Prisma.sql`sismat."SismatPmvg"`,
    colunas: ["criadoEm"],
  },
} as const satisfies Record<string, Fonte>;

export type FonteDados = keyof typeof FONTES;

/** Identificador SQL seguro. A lista é fechada aqui, mas a guarda torna a
 *  injeção estruturalmente impossível mesmo se alguém editar FONTES sem cuidado. */
function colunaSegura(nome: string): string {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(nome)) {
    throw new Error(`Nome de coluna inválido em FONTES: ${nome}`);
  }
  return `"${nome}"`;
}

/**
 * Versão agregada das fontes informadas — muda se, e somente se, alguma delas
 * ganhou, perdeu ou atualizou linhas.
 */
export async function getDataVersion(fontes: readonly FonteDados[]): Promise<string> {
  if (fontes.length === 0) return "sem-fontes";

  const selects = fontes.map((nome) => {
    const { tabela, colunas } = FONTES[nome];
    const maxes = colunas.map((c) => `max(${colunaSegura(c)})`).join(", ");
    // GREATEST ignora NULLs; só devolve NULL se todos forem NULL (tabela vazia).
    const carimbo = Prisma.raw(`COALESCE(GREATEST(${maxes})::text, '-')`);
    // ::text explícito — sem ele o Postgres não consegue inferir o tipo do
    // parâmetro ao lado de um literal desconhecido e devolve 42P18.
    return Prisma.sql`SELECT ${nome}::text || ':' || count(*)::text || ':' || ${carimbo} AS v FROM ${tabela}`;
  });

  const [row] = await db.$queryRaw<{ versao: string | null }[]>(
    Prisma.sql`SELECT md5(string_agg(v, '|' ORDER BY v)) AS versao FROM (${Prisma.join(
      selects,
      " UNION ALL "
    )}) t`
  );

  return row?.versao ?? "sem-versao";
}

const CACHE_CONTROL = "private, no-cache";

function cabecalhos(etag: string | null): Record<string, string> {
  return etag
    ? { ETag: etag, "Cache-Control": CACHE_CONTROL }
    : { "Cache-Control": CACHE_CONTROL };
}

/** Normaliza para comparar: remove o marcador fraco `W/` e as aspas. */
function normalizaTag(tag: string): string {
  return tag.trim().replace(/^W\//, "").replace(/^"|"$/g, "");
}

function clienteJaTem(header: string | null, etag: string): boolean {
  if (!header) return false;
  const alvo = normalizaTag(etag);
  return header.split(",").some((t) => normalizaTag(t) === alvo);
}

/**
 * Resposta JSON com revalidação condicional.
 *
 * `produzir` só é chamada quando a versão mudou — é onde mora a agregação cara,
 * e ela é pulada inteira nos 304.
 *
 * Se o cálculo da versão falhar (tabela ausente, drift de schema), a rota segue
 * respondendo normalmente, apenas sem ETag: degradar para "sempre fresco" é
 * preferível a derrubar o dashboard.
 */
export async function jsonComVersao<T>(
  request: Request,
  fontes: readonly FonteDados[],
  produzir: () => Promise<T>
): Promise<NextResponse> {
  let etag: string | null = null;
  try {
    etag = `W/"${await getDataVersion(fontes)}"`;
  } catch (error) {
    console.error("[data-version] falha ao calcular a versão; seguindo sem ETag:", error);
  }

  if (etag && clienteJaTem(request.headers.get("if-none-match"), etag)) {
    return new NextResponse(null, { status: 304, headers: cabecalhos(etag) });
  }

  const data = await produzir();
  return NextResponse.json(data, { headers: cabecalhos(etag) });
}
