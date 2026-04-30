export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";
import { hasPermission } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { unlink } from "fs/promises";
import { join } from "path";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  try {
    const { id, attachmentId } = await params;
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    // Check permission
    const canDelete = hasPermission(session.user as any, "demandas:write");
    if (!canDelete) {
      return NextResponse.json(
        { error: "Sem permissão para deletar anexos" },
        { status: 403 }
      );
    }

    // Get attachment to verify ownership/access
    const attachment = await db.attachment.findUnique({
      where: { id: attachmentId },
      select: {
        id: true,
        demandaId: true,
        fileName: true,
        storagePath: true,
      },
    });

    if (!attachment) {
      return NextResponse.json(
        { error: "Anexo não encontrado" },
        { status: 404 }
      );
    }

    // Verify attachment belongs to the demanda
    if (attachment.demandaId !== id) {
      return NextResponse.json(
        { error: "Anexo não pertence a esta demanda" },
        { status: 400 }
      );
    }

    // Delete file from filesystem
    try {
      const filePath = join(process.cwd(), "public", attachment.storagePath.replace(/^\//, ""));
      await unlink(filePath);
    } catch (error) {
      // Log but don't fail if file doesn't exist
      console.error("Error deleting physical file:", error);
    }

    // Delete from database
    await db.attachment.delete({
      where: { id: attachmentId },
    });

    // Audit log
    await createAuditLog({
      userId: session.user.id as string,
      action: "DELETE",
      entity: "Attachment",
      entityId: attachmentId,
      changes: {
        fileName: attachment.fileName,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting attachment:", error);
    return NextResponse.json(
      { error: "Erro ao deletar anexo" },
      { status: 500 }
    );
  }
}
