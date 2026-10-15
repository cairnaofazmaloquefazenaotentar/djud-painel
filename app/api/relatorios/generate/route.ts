export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { generateRelatórioHTML } from "@/lib/pdf-generator";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { aplicarFiltro, whereDemandas } from "@/lib/demandas-filtro";
import { descreverFiltro, lerFiltroDemandas } from "@/lib/demandas-filtro-tipos";

const generateRelatórioSchema = z.object({
  format: z.enum(["html", "json"]).default("html"),
});

/**
 * Corpo → filtro único: aceita os parâmetros da lista de Demandas (valores
 * únicos ou listas) e os nomes antigos desta rota (startDate, endDate…).
 */
function filtroDoCorpo(body: Record<string, unknown>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(body ?? {})) {
    if (k === "format" || v === null || v === undefined) continue;
    for (const item of Array.isArray(v) ? v : [v]) sp.append(k, String(item));
  }
  return lerFiltroDemandas(sp);
}

/**
 * POST /api/relatorios/generate
 * Gera um relatório de demandas com base em filtros
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const params = generateRelatórioSchema.parse(body);

    const filtro = filtroDoCorpo(body);
    const aplicado = await aplicarFiltro(filtro);
    const where = whereDemandas(aplicado);
    const filtrosDescritos = Object.fromEntries(descreverFiltro(filtro));

    if (params.format === "json") {
      // Retorna dados JSON para uso em gráficos no frontend
      const [total, demandas] = await Promise.all([
        db.demanda.count({ where }),
        db.demanda.findMany({
          where,
          take: 1000,
          orderBy: { criadoEm: "desc" },
          select: {
            id: true,
            numero: true,
            titulo: true,
            status: true,
            prioridade: true,
            areaTematica: true,
            trfRegiao: true,
            regiaoBrasil: true,
            numeroProcesso: true,
            dataEntradaDJUD: true,
            criadoEm: true,
            responsavel: { select: { name: true } },
            organizacao: { select: { name: true } },
          },
        }),
      ]);

      // Audit log
      await db.auditLog.create({
        data: {
          action: "EXPORT",
          entity: "Relatorio",
          entityId: "json",
          userId: session.user.id,
          metadata: { format: "json", total, filtros: filtrosDescritos },
        },
      });

      return NextResponse.json({ total, data: demandas });
    }

    // Gera HTML do relatório
    const html = await generateRelatórioHTML(where);

    // Audit log
    await db.auditLog.create({
      data: {
        action: "EXPORT",
        entity: "Relatorio",
        entityId: "html",
        userId: session.user.id,
        metadata: { format: "html", filtros: filtrosDescritos },
      },
    });

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="relatorio_${new Date().toISOString().slice(0, 10)}.html"`,
      },
    });
  } catch (error) {
    console.error("Error generating relatorio:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Parâmetros inválidos", details: error.errors },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : "Erro ao gerar relatório";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/relatorios/generate
 * Lista os relatórios gerados recentemente (audit log)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const logs = await db.auditLog.findMany({
      where: { action: "EXPORT", entity: "Relatorio" },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        createdAt: true,
        metadata: true,
        user: { select: { name: true, email: true } },
      },
    });

    return NextResponse.json({ data: logs });
  } catch (error) {
    return NextResponse.json({ error: "Erro ao listar relatórios" }, { status: 500 });
  }
}
