export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonComVersao } from "@/lib/data-version";
import {
  CAMPOS_DEMANDA,
  CAMPOS_MULTIVALOR,
  NAO_INFORMADO,
  SEPARADOR_MULTIVALOR,
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
}

export type OpcoesDemandas = Record<CampoDemanda, OpcaoFiltro[]>;

async function opcoesDoCampo(campo: CampoDemanda): Promise<OpcaoFiltro[]> {
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
