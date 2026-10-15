export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { jsonComVersao } from "@/lib/data-version";
import { aplicarFiltro, sqlDemandas } from "@/lib/demandas-filtro";
import { lerFiltroDemandas, semPeriodoDeCriacao } from "@/lib/demandas-filtro-tipos";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/demandas/autores/metrics
 *
 * Retorna por mês:
 *  - autoresUnicos:      total de autores distintos com demanda no mês
 *  - autoresNovos:       autores cuja PRIMEIRA demanda ocorreu neste mês
 *  - autoresReincidentes: autores que já tinham demanda em meses anteriores
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    // O mesmo filtro único do painel (medicamento, CATMAT, status…): antes a
    // aba Autores só respeitava as datas (B2).
    const filtro = lerFiltroDemandas(request.nextUrl.searchParams);
    const [aplicado, semDatas] = await Promise.all([
      aplicarFiltro(filtro),
      aplicarFiltro(semPeriodoDeCriacao(filtro)),
    ]);
    const where = Prisma.sql`WHERE autor IS NOT NULL AND ${sqlDemandas(aplicado)}`;
    // O "primeiro mês" de cada autor é apurado no recorte SEM as datas: quem já
    // tinha demanda antes do período continua reincidente dentro dele.
    const whereNovos = Prisma.sql`WHERE autor IS NOT NULL AND ${sqlDemandas(semDatas)}`;

    // ── 1. Autores únicos por mês ────────────────────────────────────────────
    const unicosRaw = await db.$queryRaw<Array<{ mes: Date; autores_unicos: bigint }>>`
      SELECT DATE_TRUNC('month', "criadoEm") AS mes,
             COUNT(DISTINCT autor)           AS autores_unicos
      FROM "Demanda"
      ${where}
      GROUP BY mes
      ORDER BY mes ASC
    `;

    // ── 2. Autores novos por mês (primeira demanda no mês) ───────────────────
    // Usa o recorte sem o filtro de período para calcular corretamente qual
    // foi o primeiro mês de cada autor — independente das datas escolhidas.
    const novosRaw = await db.$queryRaw<Array<{ mes: Date; autores_novos: bigint }>>`
      WITH primeiro_mes AS (
        SELECT autor,
               DATE_TRUNC('month', MIN("criadoEm")) AS mes
        FROM "Demanda"
        ${whereNovos}
        GROUP BY autor
      )
      SELECT mes, COUNT(*) AS autores_novos
      FROM primeiro_mes
      GROUP BY mes
      ORDER BY mes ASC
    `;

    // ── Montar mapa e cruzar as duas séries ─────────────────────────────────
    const novosMap = new Map(novosRaw.map((r) => [r.mes.toISOString(), Number(r.autores_novos)]));

    const data = unicosRaw.map((r) => {
      const mesKey       = r.mes.toISOString();
      const unicos       = Number(r.autores_unicos);
      const novos        = novosMap.get(mesKey) ?? 0;
      const reincidentes = Math.max(0, unicos - novos);
      return { mes: r.mes, autoresUnicos: unicos, autoresNovos: novos, autoresReincidentes: reincidentes };
    });

    return jsonComVersao(request, ["demanda"], async () => data);
  } catch (error) {
    console.error("[autores/metrics] Erro:", error);
    const message = error instanceof Error ? error.message : "Erro ao obter métricas de autores";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
