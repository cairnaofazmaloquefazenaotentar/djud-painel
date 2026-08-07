export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { getPrecosOverview } from "@/lib/precos-metrics";
import { jsonComVersao } from "@/lib/data-version";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    return jsonComVersao(request, ["comprasGovPreco"], () => getPrecosOverview());
  } catch (error) {
    console.error("[precos/overview] Erro:", error);
    const message = error instanceof Error ? error.message : "Erro ao obter visão geral de preços";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
