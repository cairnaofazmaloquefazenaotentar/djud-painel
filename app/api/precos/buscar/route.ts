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
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function limparOutliers(valores: number[]): number[] {
  if (valores.length < 4) return valores;
  const sorted = [...valores].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  return sorted.filter((v) => v >= lo && v <= hi);
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
      return NextResponse.json(
        { error: "Parâmetro 'q' deve ter ao menos 3 caracteres" },
        { status: 400 }
      );
    }

    const uf = sp.get("uf")?.toUpperCase() || undefined;
    const anoMin = sp.get("anoMin") ? parseInt(sp.get("anoMin")!) : undefined;
    const anoMax = sp.get("anoMax") ? parseInt(sp.get("anoMax")!) : undefined;

    const termo = normalizar(q);

    const dateMin = anoMin ? new Date(`${anoMin}-01-01`) : undefined;
    const dateMax = anoMax ? new Date(`${anoMax}-12-31`) : undefined;

    const SAMPLE = 500;

    // ── Parallel queries ─────────────────────────────────────────────────────
    const [cmedRows, bpsRows, siasgRows, pncpRows] = await Promise.all([
      db.precoCmed.findMany({
        where: { substanciaNorm: { contains: termo } },
        orderBy: { substancia: "asc" },
        take: 50,
      }),

      db.precoBps.findMany({
        where: {
          nomeNorm: { contains: termo },
          ...(uf ? { uf } : {}),
          ...(dateMin || dateMax
            ? { data: { ...(dateMin ? { gte: dateMin } : {}), ...(dateMax ? { lte: dateMax } : {}) } }
            : {}),
        },
        orderBy: { data: "desc" },
        take: SAMPLE,
        select: {
          id: true,
          descricao: true,
          preco: true,
          unidade: true,
          data: true,
          uf: true,
          modalidade: true,
          instituicao: true,
          anoBase: true,
        },
      }),

      db.precoSiasg.findMany({
        where: {
          nomeNorm: { contains: termo },
          acaoJudicial: true,
          ...(uf ? { uf } : {}),
          ...(dateMin || dateMax
            ? { data: { ...(dateMin ? { gte: dateMin } : {}), ...(dateMax ? { lte: dateMax } : {}) } }
            : {}),
        },
        orderBy: { data: "desc" },
        take: SAMPLE,
        select: {
          id: true,
          descricao: true,
          preco: true,
          unidade: true,
          data: true,
          uf: true,
          modalidade: true,
          orgao: true,
          ano: true,
          acaoJudicial: true,
        },
      }),

      db.precoPncp.findMany({
        where: {
          descricaoNorm: { contains: termo },
          ...(uf ? { uf } : {}),
          ...(dateMin || dateMax
            ? { data: { ...(dateMin ? { gte: dateMin } : {}), ...(dateMax ? { lte: dateMax } : {}) } }
            : {}),
        },
        orderBy: { data: "desc" },
        take: SAMPLE,
        select: {
          id: true,
          descricaoResumida: true,
          valorUnitResultado: true,
          unidade: true,
          data: true,
          uf: true,
          modalidade: true,
          orgao: true,
          fornecedor: true,
        },
      }),
    ]);

    // ── Counts (separate fast queries) ────────────────────────────────────────
    const [totalBps, totalSiasg, totalPncp] = await Promise.all([
      db.precoBps.count({ where: { nomeNorm: { contains: termo }, ...(uf ? { uf } : {}) } }),
      db.precoSiasg.count({ where: { nomeNorm: { contains: termo }, acaoJudicial: true, ...(uf ? { uf } : {}) } }),
      db.precoPncp.count({ where: { descricaoNorm: { contains: termo }, ...(uf ? { uf } : {}) } }),
    ]);

    // ── Stats per source ──────────────────────────────────────────────────────
    const bpsPrecos = bpsRows.map((r) => r.preco).filter((v) => v > 0);
    const bpsLimpo = limparOutliers(bpsPrecos);
    const bpsMediana = mediana(bpsLimpo);

    const siasgPrecos = siasgRows.map((r) => r.preco).filter((v) => v > 0);
    const siasgLimpo = limparOutliers(siasgPrecos);
    const siasgMediana = mediana(siasgLimpo);

    const pncpPrecos = pncpRows.map((r) => r.valorUnitResultado).filter((v) => v > 0);
    const pncpLimpo = limparOutliers(pncpPrecos);
    const pncpMediana = mediana(pncpLimpo);

    // ── Consolidated recommendation (IN 65/2021) ──────────────────────────────
    const fontesDisponiveis: string[] = [];
    const precosMercado: number[] = [];
    if (bpsMediana !== null) { fontesDisponiveis.push("BPS"); precosMercado.push(bpsMediana); }
    if (siasgMediana !== null) { fontesDisponiveis.push("SIASG"); precosMercado.push(siasgMediana); }
    if (pncpMediana !== null) { fontesDisponiveis.push("PNCP"); precosMercado.push(pncpMediana); }

    const precoReferencia = mediana(precosMercado);

    // PMVG ceiling: sem impostos (federal purchases)
    const pmvgRef = cmedRows.length > 0 ? cmedRows[0].pmvgSemImpostos : null;
    const capAplica = cmedRows.length > 0 && cmedRows[0].cap;

    const observacoes: string[] = [];
    if (pmvgRef !== null && precoReferencia !== null && precoReferencia > pmvgRef) {
      observacoes.push(`Preço de referência (R$ ${precoReferencia.toFixed(4)}) supera PMVG sem impostos (R$ ${pmvgRef.toFixed(4)}). Usar PMVG como teto.`);
    }
    if (capAplica) {
      observacoes.push("Produto sujeito a desconto CAP de 21,53% sobre o PF.");
    }
    if (fontesDisponiveis.length < 3) {
      observacoes.push(`Apenas ${fontesDisponiveis.length} fonte(s) disponível(is) para este item. Recomenda-se busca adicional.`);
    }
    if (bpsRows.length === 0 && siasgRows.length === 0 && pncpRows.length === 0) {
      observacoes.push("Nenhum registro encontrado nas bases de mercado. Verifique o termo de busca.");
    }

    return NextResponse.json({
      query: q,
      termoNormalizado: termo,
      resultados: {
        cmed: {
          total: cmedRows.length,
          registros: cmedRows.slice(0, 10),
          pmvgMin: cmedRows.length > 0 ? Math.min(...cmedRows.map((r) => r.pmvgSemImpostos)) : null,
          pmvgMax: cmedRows.length > 0 ? Math.max(...cmedRows.map((r) => r.pmvgSemImpostos)) : null,
        },
        bps: {
          total: totalBps,
          amostra: bpsRows.length,
          precoMin: bpsLimpo.length ? Math.min(...bpsLimpo) : null,
          precoMax: bpsLimpo.length ? Math.max(...bpsLimpo) : null,
          precoMediana: bpsMediana,
          registros: bpsRows.slice(0, 10),
        },
        siasg: {
          total: totalSiasg,
          amostra: siasgRows.length,
          precoMin: siasgLimpo.length ? Math.min(...siasgLimpo) : null,
          precoMax: siasgLimpo.length ? Math.max(...siasgLimpo) : null,
          precoMediana: siasgMediana,
          registros: siasgRows.slice(0, 10),
        },
        pncp: {
          total: totalPncp,
          amostra: pncpRows.length,
          precoMin: pncpLimpo.length ? Math.min(...pncpLimpo) : null,
          precoMax: pncpLimpo.length ? Math.max(...pncpLimpo) : null,
          precoMediana: pncpMediana,
          registros: pncpRows.slice(0, 10),
        },
      },
      recomendacao: {
        precoReferencia,
        limitePmvg: pmvgRef,
        precoFinal: pmvgRef !== null && precoReferencia !== null && precoReferencia > pmvgRef
          ? pmvgRef
          : precoReferencia,
        metodologia: "Mediana das medianas por fonte (IN SEGES/ME nº 65/2021)",
        fontes: fontesDisponiveis,
        observacoes,
      },
    });
  } catch (error) {
    console.error("[precos/buscar] Erro:", error);
    return NextResponse.json({ error: "Erro ao realizar pesquisa" }, { status: 500 });
  }
}
