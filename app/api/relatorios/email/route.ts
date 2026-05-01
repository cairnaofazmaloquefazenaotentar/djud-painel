import { auth } from "@/lib/auth";
import { sendDemandaReport, sendRelatórioReport } from "@/lib/email-reports";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const sendEmailSchema = z.object({
  email: z.string().email("Email inválido"),
  demandaId: z.string().optional(),
  filters: z
    .object({
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
      status: z.string().optional(),
      prioridade: z.string().optional(),
      organizacaoId: z.string().optional(),
    })
    .optional(),
});

/**
 * POST /api/relatorios/email
 * Envia relatório de demanda ou múltiplas demandas por email
 */
export async function POST(request: NextRequest) {
  try {
    // Autenticação
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Validar payload
    const body = await request.json();
    const { email, demandaId, filters } = sendEmailSchema.parse(body);

    // Se demandaId fornecido, enviar relatório de demanda
    if (demandaId) {
      const demanda = await db.demanda.findUnique({
        where: { id: demandaId },
        select: { numero: true },
      });

      if (!demanda) {
        return NextResponse.json(
          { error: "Demanda not found" },
          { status: 404 }
        );
      }

      const result = await sendDemandaReport(email, demandaId, demanda.numero);

      if (!result.success) {
        return NextResponse.json(
          { error: result.error },
          { status: 500 }
        );
      }

      // Log de auditoria
      await db.auditLog.create({
        data: {
          action: "EMAIL_REPORT_SENT",
          entity: "Demanda",
          entityId: demandaId,
          userId: session.user.id,
          metadata: {
            recipient: email,
            type: "demanda",
          },
        },
      });

      return NextResponse.json({
        success: true,
        message: "Email enviado com sucesso",
        messageId: result.messageId,
      });
    }

    // Senão, enviar relatório em lote
    const convertedFilters = filters
      ? {
          startDate: filters.startDate ? new Date(filters.startDate) : undefined,
          endDate: filters.endDate ? new Date(filters.endDate) : undefined,
          status: filters.status,
          prioridade: filters.prioridade,
          organizacaoId: filters.organizacaoId,
        }
      : undefined;

    const result = await sendRelatórioReport(email, convertedFilters);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      );
    }

    // Log de auditoria
    await db.auditLog.create({
      data: {
        action: "EMAIL_REPORT_SENT",
        entity: "Relatorio",
        entityId: "batch",
        userId: session.user.id,
        metadata: {
          recipient: email,
          type: "relatorio",
          filters,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: "Email enviado com sucesso",
      messageId: result.messageId,
    });
  } catch (error) {
    console.error("Error sending report email:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Dados inválidos", details: error.errors },
        { status: 400 }
      );
    }

    const message =
      error instanceof Error ? error.message : "Erro ao enviar email";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
