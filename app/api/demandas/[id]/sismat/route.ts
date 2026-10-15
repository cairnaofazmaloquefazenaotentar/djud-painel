export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/demandas/[id]/sismat — entregas do SISMAT com o mesmo NUP SEI da
// demanda (A6, opcional). O NUP é o último token do destinatário da saída; o
// formato canônico é o mesmo de lib/sismat-saidas-redmine-metrics.ts. O nome
// do destinatário (paciente) não sai desta rota.
// ─────────────────────────────────────────────────────────────────────────────

const SEI_PAT = `([0-9]{5})\\.?([0-9]{5,6})/?([0-9]{4})-?([0-9]{1,2})`;

export interface EntregaSismat {
  material: string;
  catmat: string | null;
  quantidade: number | null;
  valorTotal: number | null;
  data: string | null;
  programa: string | null;
  fornecedor: string | null;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    const demanda = await db.demanda.findFirst({
      where: { id, deletedAt: null },
      select: { nupSei: true },
    });
    if (!demanda) return NextResponse.json({ error: "Demanda não encontrada" }, { status: 404 });
    if (!demanda.nupSei) return NextResponse.json({ nupSei: null, entregas: [] });

    const linhas = await db.$queryRaw<
      Array<{ material: string; codigo: string | null; qtd: number | null; valor: number | null; dt: Date | null; prog: string | null; forn: string | null }>
    >`
      SELECT s."material", s."materialCodigo" AS codigo, s."qtdEntregue" AS qtd,
             s."valorTotal"::float8 AS valor, s."dtBaixa" AS dt, s."progSaude" AS prog, s."fornecedor" AS forn
      FROM sismat."SismatSaida" s
      CROSS JOIN LATERAL (SELECT regexp_match(s."destinatario", ${SEI_PAT}) AS m) t
      WHERE t.m IS NOT NULL AND t.m[1] || '.' || t.m[2] || '/' || t.m[3] || '-' || t.m[4] = ${demanda.nupSei}
      ORDER BY s."dtBaixa" DESC NULLS LAST
      LIMIT 200`;
    const entregas: EntregaSismat[] = linhas.map((l) => ({
      material: l.material,
      catmat: l.codigo ? l.codigo.replace(/\D/g, "").replace(/^0+/, "") || null : null,
      quantidade: l.qtd,
      valorTotal: l.valor,
      data: l.dt ? l.dt.toISOString().slice(0, 10) : null,
      programa: l.prog,
      fornecedor: l.forn,
    }));
    return NextResponse.json({ nupSei: demanda.nupSei, entregas });
  } catch (error) {
    console.error("[demandas/[id]/sismat]", error);
    return NextResponse.json({ error: "Erro ao consultar as entregas do SISMAT" }, { status: 500 });
  }
}
