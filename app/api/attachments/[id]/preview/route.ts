import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import crypto from "crypto";

export const runtime = "nodejs";

/**
 * GET /api/attachments/[id]/preview
 * Serve arquivo para preview com headers de cache apropriados
 * Validação: user pode acessar demanda?
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    // Autenticação
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Buscar attachment
    const attachment = await db.attachment.findUnique({
      where: { id },
      include: {
        demanda: {
          select: {
            organizacaoId: true,
            criadoPorId: true,
          },
        },
        uploadedBy: {
          select: { id: true, name: true },
        },
      },
    });

    if (!attachment) {
      return NextResponse.json(
        { error: "Attachment not found" },
        { status: 404 }
      );
    }

    // Validação de permissão: user pode acessar demanda?
    // Admin sempre pode, outros só se tiverem acesso à demanda
    const user = session.user as { id: string; role?: string };
    const isAdmin = user.role === "ADMIN";

    if (!isAdmin) {
      // Verificar se user tem acesso à demanda
      // TODO: Implementar lógica de permissão (MANAGER/OPERATOR access)
      // Por enquanto, só o responsável ou admin pode acessar
      if (attachment.demanda.criadoPorId !== user.id &&
          user.role !== "MANAGER") {
        return NextResponse.json(
          { error: "Forbidden" },
          { status: 403 }
        );
      }
    }

    // Buscar arquivo do filesystem (MVP com local storage)
    let fileBuffer: Buffer;
    try {
      const filePath = join(process.cwd(), "public", attachment.storagePath);
      fileBuffer = await readFile(filePath);
    } catch (err) {
      console.error("Error reading file:", err);
      return NextResponse.json(
        { error: "File not found on disk" },
        { status: 404 }
      );
    }

    // Calcular ETag
    const etag = crypto
      .createHash("md5")
      .update(fileBuffer)
      .digest("hex");

    // Verificar If-None-Match (cache validation)
    const clientEtag = request.headers.get("if-none-match");
    if (clientEtag === etag) {
      return new NextResponse(null, { status: 304 });
    }

    // Servir arquivo com headers apropriados
    const headers = new Headers();

    // Headers de MIME type e download
    headers.set("Content-Type", attachment.mimeType);
    headers.set(
      "Content-Disposition",
      `inline; filename="${attachment.fileName}"`
    );

    // ETag para cache validation
    headers.set("ETag", etag);

    // Last-Modified
    headers.set(
      "Last-Modified",
      new Date(attachment.uploadedAt).toUTCString()
    );

    // Headers de cache (1 hora para PDFs, mais para imagens)
    const isBinary = attachment.mimeType.startsWith("image/");
    headers.set(
      "Cache-Control",
      isBinary ? "public, max-age=86400" : "public, max-age=3600"
    );

    // CORS headers (se necessário para preview em iframe)
    headers.set("Access-Control-Allow-Origin", "*");

    return new NextResponse(fileBuffer as any, { headers });
  } catch (error) {
    console.error("Error in preview endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
