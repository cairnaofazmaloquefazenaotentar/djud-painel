export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { getPrecosOverview } from "@/lib/precos-metrics";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const data = await getPrecosOverview();

    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=3600" }, // 1h: base histórica de referência muda pouco
    });
  } catch (error) {
    console.error("[precos/overview] Erro:", error);
    const message = error instanceof Error ? error.message : "Erro ao obter visão geral de preços";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
