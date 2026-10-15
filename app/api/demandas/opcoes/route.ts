export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonComVersao } from "@/lib/data-version";
import {
  CAMPOS_DEMANDA,
  CAMPOS_MULTIVALOR,
  NAO_INFORMADO,
  SEPARADOR_MULTIVALOR,
  comboCanonico,
  rotuloValor,
  type CampoDemanda,
} from "@/lib/demandas-filtro-tipos";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/demandas/opcoes — valores de cada campo do filtro com a contagem de
// demandas (fora da lixeira), em vez das listas fixas que a tela tinha (P2).
// Campos gravados como lista ("Cessar Atos | Óbito") contam por item: é assim
// que o filtro casa. A coluna nula vira a opção "(não informado)".
// ─────────────────────────────────────────────────────────────────────────────

export interface OpcaoFiltro {
  valor: string;
  rotulo: string;
  contagem: number;
  /** Sub-status: os itens do Ponto de Controle da combinação (a tela filtra pelo Status escolhido). */
  itens?: string[];
}

export type OpcoesDemandas = Record<CampoDemanda, OpcaoFiltro[]>;

/**
 * Sub-status: as combinações do Ponto de Controle sem a ordem dos itens. O
 * rótulo é a grafia mais frequente; a contagem soma as grafias.
 */
async function opcoesSubStatus(): Promise<OpcaoFiltro[]> {
  const linhas = await db.$queryRaw<Array<{ valor: string | null; n: bigint }>>`
    SELECT "pontoControle" AS valor, COUNT(*) AS n
    FROM "Demanda" WHERE "deletedAt" IS NULL
    GROUP BY "pontoControle"`;
  const combos = new Map<string, { contagem: number; grafias: Array<[string, number]> }>();
  let nulos = 0;
  for (const l of linhas) {
    const n = Number(l.n);
    if (l.valor === null) {
      nulos += n;
      continue;
    }
    const k = comboCanonico(l.valor);
    const c = combos.get(k) ?? { contagem: 0, grafias: [] };
    c.contagem += n;
    c.grafias.push([l.valor, n]);
    combos.set(k, c);
  }
  const opcoes: OpcaoFiltro[] = Array.from(combos.entries())
    .map(([valor, c]) => ({
      valor,
      rotulo: c.grafias.sort((a, b) => b[1] - a[1])[0][0],
      contagem: c.contagem,
      itens: valor.split(SEPARADOR_MULTIVALOR),
    }))
    .sort((a, b) => b.contagem - a.contagem || a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  if (nulos) opcoes.push({ valor: NAO_INFORMADO, rotulo: rotuloValor("subStatus", NAO_INFORMADO), contagem: nulos, itens: [] });
  return opcoes;
}

/** Apresentação: os CATMATs derivados pelo enriquecimento (A5), com a descrição do catálogo. */
async function opcoesApresentacao(): Promise<OpcaoFiltro[]> {
  const [linhas, [vazias]] = await Promise.all([
    db.$queryRaw<Array<{ valor: string; descricao: string | null; n: bigint }>>`
      SELECT t.c AS valor, MAX(ci."descricaoItem") AS descricao, COUNT(*) AS n
      FROM (SELECT unnest("catmatsDerivados") AS c FROM "Demanda" WHERE "deletedAt" IS NULL) t
      LEFT JOIN "CatmatItem" ci ON ci."codigoItem" = t.c
      GROUP BY t.c`,
    db.$queryRaw<Array<{ n: bigint }>>`
      SELECT COUNT(*) AS n FROM "Demanda" WHERE "deletedAt" IS NULL AND cardinality("catmatsDerivados") = 0`,
  ]);
  const opcoes: OpcaoFiltro[] = linhas
    .map((l) => ({
      valor: l.valor,
      rotulo: `${l.valor} — ${(l.descricao ?? "CATMAT fora do catálogo local").slice(0, 80)}`,
      contagem: Number(l.n),
    }))
    .sort((a, b) => b.contagem - a.contagem);
  if (Number(vazias.n)) {
    opcoes.push({ valor: NAO_INFORMADO, rotulo: rotuloValor("apresentacao", NAO_INFORMADO), contagem: Number(vazias.n) });
  }
  return opcoes;
}

async function opcoesDoCampo(campo: CampoDemanda): Promise<OpcaoFiltro[]> {
  if (campo === "subStatus") return opcoesSubStatus();
  if (campo === "apresentacao") return opcoesApresentacao();
  const col = Prisma.raw(`"${campo}"`);
  const linhas = CAMPOS_MULTIVALOR.has(campo)
    ? await db.$queryRaw<Array<{ valor: string | null; n: bigint }>>`
        SELECT item AS valor, COUNT(*) AS n
        FROM (
          SELECT unnest(string_to_array(${col}, ${SEPARADOR_MULTIVALOR})) AS item
          FROM "Demanda" WHERE "deletedAt" IS NULL AND ${col} IS NOT NULL
        ) t
        GROUP BY item
        UNION ALL
        SELECT NULL, COUNT(*) FROM "Demanda" WHERE "deletedAt" IS NULL AND ${col} IS NULL`
    : await db.$queryRaw<Array<{ valor: string | null; n: bigint }>>`
        SELECT ${col}::text AS valor, COUNT(*) AS n
        FROM "Demanda" WHERE "deletedAt" IS NULL
        GROUP BY ${col}`;

  const nomes = new Map<string, string>();
  if (campo === "responsavelId") {
    const ids = linhas.map((l) => l.valor).filter((v): v is string => !!v);
    const usuarios = ids.length
      ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } })
      : [];
    for (const u of usuarios) nomes.set(u.id, u.name || u.email || u.id);
  }

  return linhas
    .filter((l) => Number(l.n) > 0)
    .map((l) => {
      const valor = l.valor ?? NAO_INFORMADO;
      return {
        valor,
        rotulo: nomes.get(valor) ?? rotuloValor(campo, valor),
        contagem: Number(l.n),
      };
    })
    .sort((a, b) =>
      // "(não informado)" sempre no fim; TRF em ordem numérica; o resto por volume.
      a.valor === NAO_INFORMADO
        ? 1
        : b.valor === NAO_INFORMADO
          ? -1
          : campo === "trfRegiao"
            ? Number(a.valor) - Number(b.valor)
            : b.contagem - a.contagem || a.rotulo.localeCompare(b.rotulo, "pt-BR")
    );
}

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    return jsonComVersao(request, ["demanda"], async () => {
      const listas = await Promise.all(CAMPOS_DEMANDA.map(opcoesDoCampo));
      return Object.fromEntries(CAMPOS_DEMANDA.map((c, i) => [c, listas[i]])) as OpcoesDemandas;
    });
  } catch (error) {
    console.error("[demandas/opcoes]", error);
    return NextResponse.json({ error: "Erro ao carregar as opções dos filtros" }, { status: 500 });
  }
}
