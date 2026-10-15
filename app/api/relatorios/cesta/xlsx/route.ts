export const runtime = "nodejs";
export const maxDuration = 60;

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { listarCesta } from "@/lib/cesta";
import { relatorioCestaSchema } from "@/lib/cesta-schemas";
import { ESCOLHA_PADRAO_MAPA, normalizarEscolha } from "@/lib/pesquisa-preco";
import { processarItens } from "@/lib/pesquisa-preco-processar";
import { escolhaExplicita } from "@/lib/relatorio-schemas";
import { montarMapaItem } from "@/lib/mapa-dlog/dados";
import { gerarMapaDlog } from "@/lib/mapa-dlog/gerar";
import { contextoBases, hashArquivo, hashConteudo, nomeArquivoMapa, recorteDoItem } from "@/lib/mapa-dlog/meta";
import { registrarRelatorio } from "@/lib/relatorio-registro";
import { NextRequest, NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────────────────────
// Mapa comparativo de preços no modelo da DLOG (XLSX) — cesta inteira, um item
// por aba. Mesmo corpo do relatório HTML da cesta: a escolha de método/teto e a
// justificativa de cada item vêm da mesma modal, então os dois documentos
// trazem o mesmo preço.
//
// Diferente do HTML, este arquivo NÃO esvazia a cesta: quem emite os dois
// documentos pela mesma modal ainda precisa dos itens para o segundo.
// ─────────────────────────────────────────────────────────────────────────────

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    if (!hasPermission(session as any, "relatorios:gerar")) {
      return NextResponse.json({ error: "Sem permissão para gerar relatórios" }, { status: 403 });
    }
    const userId = session.user.id as string;

    const parsed = relatorioCestaSchema.safeParse((await request.json().catch(() => null)) ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
    }
    const { responsavel, cargo, orgao, processo, escolhas } = parsed.data;

    const cesta = await listarCesta(userId);
    if (cesta.itens.length === 0) {
      return NextResponse.json(
        { error: "A cesta está vazia. Adicione itens antes de gerar o mapa." },
        { status: 400 }
      );
    }

    const geradoEm = new Date();
    const [apurados, bases] = await Promise.all([
      processarItens(cesta.itens, (c) => ({
        codigo: c.codigo,
        unidade: c.unidade,
        uf: c.uf,
        exclusoes: c.exclusoes,
        orcamentos: c.orcamentos,
        escolha: normalizarEscolha(escolhas[c.id], ESCOLHA_PADRAO_MAPA),
        registrosCompletos: true,
      })),
      contextoBases(),
    ]);

    const itens = apurados.map(({ item: c, resultado }, i) =>
      montarMapaItem({
        numero: i + 1,
        codigo: c.codigo,
        descricao: c.descricao,
        unidade: c.unidade,
        quantidade: c.quantidade,
        resultado,
        justificativaEditada: escolhas[c.id]?.justificativa ?? null,
        escolhaExplicita: escolhaExplicita(escolhas[c.id]),
        consultadoEm: geradoEm,
      })
    );
    const usuario = session.user.name || session.user.email || userId;
    const buffer = await gerarMapaDlog(itens, {
      processo,
      orgao,
      responsavel,
      cargo,
      usuario,
      geradoEm,
      dataReferencia: geradoEm,
      cmedVigencia: bases.cmedVigencia,
      cmedPublicacao: bases.cmedPublicacao,
      fontesConsultadas: bases.fontesConsultadas,
      periodo: "Sem recorte de período: amostra dos registros mais recentes de cada base (até 500 por fonte).",
      ipca: { ligado: false, mesBase: null, convencao: "", indices: [] },
      versaoDados: bases.versaoDados,
      hashConteudo: hashConteudo(itens),
      filtrosPorItem: new Map(apurados.map(({ resultado }, i) => [i + 1, recorteDoItem(resultado)])),
    });
    const sha256 = hashArquivo(buffer);
    const nomeArquivo = nomeArquivoMapa(processo, geradoEm);
    const valorGlobal = itens.reduce((s, i) => s + (i.valorTotal ?? 0), 0);

    // Mantém a cesta em dia com os preços que acabaram de sair no mapa.
    for (const { item: c, resultado } of apurados) {
      const rec = resultado?.recomendacao;
      if (!rec) continue;
      await db.cestaItem.updateMany({
        where: { id: c.id, userId },
        data: {
          precoReferencia: rec.precoReferencia,
          limitePmvg: rec.limitePmvg,
          precoFinal: rec.precoFinal,
          calculadoEm: geradoEm,
        },
      });
    }

    await db.auditLog.create({
      data: {
        action: "EXPORT",
        entity: "MapaComparativoPrecosCesta",
        entityId: null,
        userId,
        metadata: {
          formato: "xlsx",
          sha256,
          nomeArquivo,
          itens: itens.length,
          valorGlobal,
          naoLocalizados: itens.filter((i) => !i.localizado).length,
          orgao,
          processo,
          codigos: apurados.map(({ item: c, resultado }, i) => ({
            codigo: c.codigo,
            unidade: c.unidade,
            uf: c.uf,
            quantidade: c.quantidade,
            escolha: resultado?.recomendacao.escolha ?? null,
            escolhaExplicita: escolhaExplicita(escolhas[c.id]),
            justificativaEditada: itens[i].justificativaEditada,
            precoFinal: resultado?.recomendacao.precoFinal ?? null,
            descartes: (resultado?.descartes ?? []).map((d) => ({ fonte: d.fonte, id: d.id, preco: d.preco, motivo: d.motivo })),
          })),
        },
      },
    });
    await registrarRelatorio({
      tipo: "PESQUISA_PRECO",
      parametros: { formato: "xlsx", modelo: "DLOG", cesta: true, sha256, itens: itens.length, valorGlobal, processo },
      nomeArquivo,
      tamanhoBytes: buffer.length,
      geradoPorId: userId,
    });

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": XLSX,
        "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
        "X-Arquivo-Sha256": sha256,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[relatorios/cesta/xlsx]", error);
    return NextResponse.json({ error: "Erro ao gerar o mapa comparativo da cesta" }, { status: 500 });
  }
}
