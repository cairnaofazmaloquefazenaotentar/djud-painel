export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s,\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mediana(valores: number[]): number | null {
  if (!valores.length) return null;
  const sorted = [...valores].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    if (!hasPermission(session as any, "precos:pesquisar")) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const sp = request.nextUrl.searchParams;
    const q = sp.get("q")?.trim();
    if (!q || q.length < 3) {
      return NextResponse.json({ error: "Parâmetro 'q' obrigatório (mín. 3 chars)" }, { status: 400 });
    }

    const uf = sp.get("uf")?.toUpperCase() || undefined;
    const granularidade = sp.get("granularidade") === "anual" ? "anual" : "mensal";
    const termo = normalizar(q);

    // Fetch up to 2000 records per source with date, for trend calculation
    const [bpsRows, siasgRows, pncpRows] = await Promise.all([
      db.precoBps.findMany({
        where: { nomeNorm: { contains: termo }, ...(uf ? { uf } : {}) },
        orderBy: { data: "asc" },
        take: 2000,
        select: { data: true, preco: true },
      }),
      db.precoSiasg.findMany({
        where: { nomeNorm: { contains: termo }, acaoJudicial: true, ...(uf ? { uf } : {}) },
        orderBy: { data: "asc" },
        take: 2000,
        select: { data: true, preco: true },
      }),
      db.precoPncp.findMany({
        where: { descricaoNorm: { contains: termo }, ...(uf ? { uf } : {}) },
        orderBy: { data: "asc" },
        take: 2000,
        select: { data: true, valorUnitResultado: true },
      }),
    ]);

    // Group prices by period
    const chave = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      return granularidade === "anual" ? `${y}` : `${y}-${m}`;
    };

    type Bucket = Record<string, number[]>;

    const bpsBucket: Bucket = {};
    const siasgBucket: Bucket = {};
    const pncpBucket: Bucket = {};

    for (const r of bpsRows) {
      if (r.preco > 0) {
        const k = chave(r.data);
        (bpsBucket[k] ||= []).push(r.preco);
      }
    }
    for (const r of siasgRows) {
      if (r.preco > 0) {
        const k = chave(r.data);
        (siasgBucket[k] ||= []).push(r.preco);
      }
    }
    for (const r of pncpRows) {
      if (r.valorUnitResultado > 0) {
        const k = chave(r.data);
        (pncpBucket[k] ||= []).push(r.valorUnitResultado);
      }
    }

    // Merge all periods
    const allPeriods = new Set([
      ...Object.keys(bpsBucket),
      ...Object.keys(siasgBucket),
      ...Object.keys(pncpBucket),
    ]);

    const serie = Array.from(allPeriods)
      .sort()
      .map((periodo) => ({
        periodo,
        bps: mediana(bpsBucket[periodo] || []),
        siasg: mediana(siasgBucket[periodo] || []),
        pncp: mediana(pncpBucket[periodo] || []),
        contagemBps: (bpsBucket[periodo] || []).length,
        contagemSiasg: (siasgBucket[periodo] || []).length,
        contagemPncp: (pncpBucket[periodo] || []).length,
      }));

    return NextResponse.json({
      query: q,
      termoNormalizado: termo,
      granularidade,
      serie,
    });
  } catch (error) {
    console.error("[precos/historico]", error);
    return NextResponse.json({ error: "Erro ao calcular histórico" }, { status: 500 });
  }
}
