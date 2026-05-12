export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";
import { hasPermission } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/demandas/[id]/restore
 * Restaura uma demanda que está na lixeira (soft delete).
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    if (!hasPermission(session.user as any, "demandas:write")) {
      return NextResponse.json({ error: "Sem permissão para restaurar demandas" }, { status: 403 });
    }

    const demanda = await db.demanda.findUnique({
      where: { id },
      select: { id: true, numero: true, titulo: true, deletedAt: true },
    });

    if (!demanda) {
      return NextResponse.json({ error: "Demanda não encontrada" }, { status: 404 });
    }

    if (!demanda.deletedAt) {
      return NextResponse.json({ error: "Demanda não está na lixeira" }, { status: 400 });
    }

    await db.demanda.update({
      where: { id },
      data: { deletedAt: null },
    });

    await createAuditLog({
      userId: session.user.id as string,
      action: "UPDATE",
      entity: "Demanda",
      entityId: id,
      changes: { deletedAt: { before: demanda.deletedAt, after: null } },
      metadata: { restored: true },
    });

    return NextResponse.json({ message: "Demanda restaurada com sucesso" });
  } catch (error) {
    return NextResponse.json({ error: "Erro ao restaurar demanda" }, { status: 500 });
  }
}
