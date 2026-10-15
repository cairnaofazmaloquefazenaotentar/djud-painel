export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { listarCompetencias } from "@/lib/cmed";
import { NextResponse } from "next/server";

export interface FontesData {
  redmine:        string | null; // ISO string ou null
  sismatEntradas: string | null;
  sismatSaidas:   string | null;
  fns:            string | null;
  // Pesquisa de Preços — tabela CMED e última coleta de cada origem de dados abertos
  cmed:           string | null;
  comprasGov:     string | null;
  bpsApi:         string | null;
  atas:           string | null;
  extrator:       string | null;
}

/** Última coleta concluída por origem (OK ou PARCIAL); sem as tabelas, tudo null. */
async function ultimasColetas(): Promise<Pick<FontesData, "comprasGov" | "bpsApi" | "atas" | "extrator">> {
  try {
    const grupos = await db.dadosAbertosColeta.groupBy({
      by: ["origem", "origemCarga"],
      where: { status: { in: ["OK", "PARCIAL"] } },
      _max: { concluidoEm: true },
    });
    const max = (filtro: (g: (typeof grupos)[number]) => boolean) => {
      const datas = grupos.filter(filtro).map((g) => g._max.concluidoEm).filter((d): d is Date => !!d);
      return datas.length ? new Date(Math.max(...datas.map((d) => d.getTime()))).toISOString() : null;
    };
    return {
      comprasGov: max((g) => g.origem === "COMPRASGOV"),
      bpsApi: max((g) => g.origem === "BPS"),
      atas: max((g) => g.origem === "ARP_ITEM"),
      extrator: max((g) => g.origemCarga === "EXTRATOR"),
    };
  } catch {
    return { comprasGov: null, bpsApi: null, atas: null, extrator: null };
  }
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
    const [redmine, sismatRow, cmed, coletas] = await Promise.all([
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
      db.precoCmed.aggregate({ _max: { vigencia: true } }),
      ultimasColetas(),
    ]);
    // Com as listas mensais carregadas, a data é o mês da última lista (o teto
    // usa a última publicada até a data de referência); senão, a vigência da
    // tabela CMED única.
    const ultimaLista = (await listarCompetencias())[0]?.competencia ?? null;

    const row = sismatRow[0];

    const data: FontesData = {
      redmine:        redmine._max.atualizadoEm?.toISOString() ?? null,
      sismatEntradas: row?.sismatEntradas?.toISOString()        ?? null,
      sismatSaidas:   row?.sismatSaidas?.toISOString()          ?? null,
      fns:            row?.fns?.toISOString()                   ?? null,
      cmed:           ultimaLista ? `${ultimaLista}-01T00:00:00.000Z` : cmed._max.vigencia?.toISOString() ?? null,
      ...coletas,
    };

    return NextResponse.json(data);
  } catch (error) {
    console.error("[fontes] Erro:", error);
    const message = error instanceof Error ? error.message : "Erro ao obter datas das fontes";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
