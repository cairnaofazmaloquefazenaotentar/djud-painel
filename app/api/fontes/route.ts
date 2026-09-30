export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export interface FontesData {
  redmine:        string | null; // ISO string ou null
  sismatEntradas: string | null;
  sismatSaidas:   string | null;
  fns:            string | null;
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    // Prisma aggregate() não funciona bem com modelos em schemas não-padrão
    // (multiSchema preview). Usamos raw SQL para as tabelas do schema sismat,
    // exatamente como fazemos em lib/metrics.ts e lib/sismat-*-metrics.ts.
    const [redmine, sismatRow] = await Promise.all([
      // Demanda está no schema public — aggregate() funciona normalmente.
      db.demanda.aggregate({ _max: { atualizadoEm: true } }),

      // Tabelas no schema sismat — uma única query raw agrupa os três MAX.
      db.$queryRaw<Array<{
        sismatEntradas: Date | null;
        sismatSaidas:   Date | null;
        fns:            Date | null;
      }>>`
        SELECT
          (SELECT MAX("dtArmazenamento") FROM sismat."SismatEntrada")  AS "sismatEntradas",
          (SELECT MAX("dtBaixa")         FROM sismat."SismatSaida")    AS "sismatSaidas",
          (SELECT MAX("dtPagtoSiafi")    FROM sismat."SiafiPagamento") AS fns
      `,
    ]);

    const row = sismatRow[0];

    const data: FontesData = {
      redmine:        redmine._max.atualizadoEm?.toISOString() ?? null,
      sismatEntradas: row?.sismatEntradas?.toISOString()        ?? null,
      sismatSaidas:   row?.sismatSaidas?.toISOString()          ?? null,
      fns:            row?.fns?.toISOString()                   ?? null,
    };

    return NextResponse.json(data);
  } catch (error) {
    console.error("[fontes] Erro:", error);
    const message = error instanceof Error ? error.message : "Erro ao obter datas das fontes";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
