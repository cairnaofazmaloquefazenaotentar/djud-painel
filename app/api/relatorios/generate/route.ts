export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { generateRelatórioHTML } from "@/lib/pdf-generator";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const generateRelatórioSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  status: z.string().optional(),
  prioridade: z.string().optional(),
  organizacaoId: z.string().optional(),
  areaTematica: z.string().optional(),
  trfRegiao: z.coerce.number().int().optional(),
  regiaoBrasil: z.string().optional(),
  format: z.enum(["html", "json"]).default("html"),
});

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

    const filters = {
      startDate: params.startDate ? new Date(params.startDate) : undefined,
      endDate: params.endDate ? new Date(params.endDate) : undefined,
      status: params.status,
      prioridade: params.prioridade,
      organizacaoId: params.organizacaoId,
    };

    if (params.format === "json") {
      // Retorna dados JSON para uso em gráficos no frontend
      const where: any = {};
      if (filters.startDate || filters.endDate) {
        where.criadoEm = {};
        if (filters.startDate) where.criadoEm.gte = filters.startDate;
        if (filters.endDate) where.criadoEm.lte = filters.endDate;
      }
      if (filters.status) where.status = filters.status;
      if (filters.prioridade) where.prioridade = filters.prioridade;
      if (filters.organizacaoId) where.organizacaoId = filters.organizacaoId;
      if (params.areaTematica) where.areaTematica = { contains: params.areaTematica, mode: "insensitive" };
      if (params.trfRegiao) where.trfRegiao = params.trfRegiao;
      if (params.regiaoBrasil) where.regiaoBrasil = params.regiaoBrasil;

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
          metadata: { format: "json", total, filters: params },
        },
      });

      return NextResponse.json({ total, data: demandas });
    }

    // Gera HTML do relatório
    const html = await generateRelatórioHTML(filters);

    // Audit log
    await db.auditLog.create({
      data: {
        action: "EXPORT",
        entity: "Relatorio",
        entityId: "html",
        userId: session.user.id,
        metadata: { format: "html", filters: params },
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
