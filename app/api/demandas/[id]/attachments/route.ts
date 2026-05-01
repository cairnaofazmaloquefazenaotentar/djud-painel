export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";
import { hasPermission } from "@/lib/permissions";
import { getStorageAdapter } from "@/lib/storage";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

// Allowed MIME types and extensions
const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "application/msword"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    // Verify demanda exists
    const demanda = await db.demanda.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!demanda) {
      return NextResponse.json(
        { error: "Demanda não encontrada" },
        { status: 404 }
      );
    }

    // Get attachments
    const attachments = await db.attachment.findMany({
      where: { demandaId: id },
      select: {
        id: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        uploadedAt: true,
        uploadedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { uploadedAt: "desc" },
    });

    return NextResponse.json({ data: attachments });
  } catch (error) {
    return NextResponse.json(
      { error: "Erro ao obter anexos" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    // Check permission
    const canUpload = hasPermission(session.user as any, "demandas:write");
    if (!canUpload) {
      return NextResponse.json(
        { error: "Sem permissão para adicionar anexos" },
        { status: 403 }
      );
    }

    // Verify demanda exists
    const demanda = await db.demanda.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!demanda) {
      return NextResponse.json(
        { error: "Demanda não encontrada" },
        { status: 404 }
      );
    }

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "Arquivo não fornecido" },
        { status: 400 }
      );
    }

    // Validate file
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Tipo de arquivo não permitido" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Arquivo excede o tamanho máximo (10MB)" },
        { status: 400 }
      );
    }

    // Upload file using storage adapter
    const fileExtension = file.name.split(".").pop() || "";
    const uniqueFileName = `${randomUUID()}.${fileExtension}`;
    const storagePath = `demandas/${id}/${uniqueFileName}`;

    const buffer = await file.arrayBuffer();
    const storage = getStorageAdapter();

    let uploadResult;
    try {
      uploadResult = await storage.upload(Buffer.from(buffer), storagePath, file.type);
    } catch (error) {
      console.error("Storage upload error:", error);
      return NextResponse.json(
        { error: "Erro ao fazer upload do arquivo no storage" },
        { status: 500 }
      );
    }

    // Save to database
    const attachment = await db.attachment.create({
      data: {
        demandaId: id,
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
        storagePath: uploadResult.path, // Use path from storage adapter
        uploadedById: session.user.id as string,
      },
      select: {
        id: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        uploadedAt: true,
        uploadedBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Audit log
    await createAuditLog({
      userId: session.user.id as string,
      action: "CREATE",
      entity: "Attachment",
      entityId: attachment.id,
      changes: {
        fileName: file.name,
        fileSize: file.size,
      },
    });

    return NextResponse.json(attachment, { status: 201 });
  } catch (error) {
    console.error("Error uploading attachment:", error);
    return NextResponse.json(
      { error: "Erro ao fazer upload do arquivo" },
      { status: 500 }
    );
  }
}
