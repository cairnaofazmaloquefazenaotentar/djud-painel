export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { getPrecosSerie } from "@/lib/precos-metrics";
import { jsonComVersao } from "@/lib/data-version";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const sp = request.nextUrl.searchParams;
    const material = (sp.get("material") ?? "").trim();
    const unidade = (sp.get("unidade") ?? "").trim();

    if (!material || !unidade) {
      return NextResponse.json(
        { error: "Parâmetros obrigatórios: material e unidade" },
        { status: 400 }
      );
    }

    return jsonComVersao(request, ["comprasGovPreco"], () =>
      getPrecosSerie(material, unidade)
    );
  } catch (error) {
    console.error("[precos/serie] Erro:", error);
    const message = error instanceof Error ? error.message : "Erro ao obter série de preços";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
