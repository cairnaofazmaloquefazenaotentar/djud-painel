export const runtime = "nodejs";
export const maxDuration = 60;

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { escolhaGravada, listarCesta, parametrosDoItem } from "@/lib/cesta";
import { relatorioCestaSchema } from "@/lib/cesta-schemas";
import { ESCOLHA_PADRAO_MAPA, hojeBrasilia, normalizarEscolha } from "@/lib/pesquisa-preco";
import { processarItens } from "@/lib/pesquisa-preco-processar";
import { escolhaExplicita } from "@/lib/relatorio-schemas";
import { montarMapaItem } from "@/lib/mapa-dlog/dados";
import { gerarMapaDlog } from "@/lib/mapa-dlog/gerar";
import {
  contextoBases,
  hashArquivo,
  hashConteudo,
  ipcaParaMapa,
  nomeArquivoMapa,
  periodoParaMapa,
  recorteDoItem,
} from "@/lib/mapa-dlog/meta";
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
    // Na cesta, a data de referência é a da emissão (D1); período, IPCA e
    // curadoria são os gravados em cada item.
    const dataReferencia = hojeBrasilia(geradoEm);
    const escolhaDo = (id: string, c: (typeof cesta.itens)[number]) =>
      normalizarEscolha(escolhas[id] ?? escolhaGravada(c), ESCOLHA_PADRAO_MAPA);
    const [apurados, bases] = await Promise.all([
      processarItens(cesta.itens, (c) => ({
        ...parametrosDoItem(c, dataReferencia, escolhaDo(c.id, c)),
        registrosCompletos: true,
      })),
      contextoBases(dataReferencia),
    ]);

    const itens = apurados.map(({ item: c, resultado }, i) =>
      montarMapaItem({
        numero: i + 1,
        codigo: c.codigo,
        descricao: c.descricao,
        unidade: c.unidade,
        quantidade: c.quantidade,
        resultado,
        justificativaEditada: escolhas[c.id]?.justificativa ?? c.justificativa ?? null,
        escolhaExplicita: escolhaExplicita(escolhas[c.id]) || !!(c.metodoPreco && c.regraTeto),
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
      dataReferencia: new Date(`${dataReferencia}T12:00:00Z`),
      cmedVigencia: bases.cmedVigencia,
      cmedPublicacao: bases.cmedPublicacao,
      cmedLista: bases.cmedLista,
      fontesConsultadas: bases.fontesConsultadas,
      periodo: periodoParaMapa(apurados.map((a) => a.resultado)),
      ipca: await ipcaParaMapa(apurados.map((a) => a.resultado)),
      versaoDados: bases.versaoDados,
      hashConteudo: hashConteudo(itens),
      filtrosPorItem: new Map(apurados.map(({ resultado }, i) => [i + 1, recorteDoItem(resultado)])),
    });
    const sha256 = hashArquivo(buffer);
    const nomeArquivo = nomeArquivoMapa(processo, geradoEm);
    const valorGlobal = itens.reduce((s, i) => s + (i.valorTotal ?? 0), 0);

    // Mantém a cesta em dia com os preços que acabaram de sair no mapa e grava
    // no item a escolha e a justificativa feitas na modal (E2).
    for (const { item: c, resultado } of apurados) {
      const rec = resultado?.recomendacao;
      const e = escolhas[c.id];
      await db.cestaItem.updateMany({
        where: { id: c.id, userId },
        data: {
          ...(rec
            ? { precoReferencia: rec.precoReferencia, limitePmvg: rec.limitePmvg, precoFinal: rec.precoFinal, calculadoEm: geradoEm }
            : {}),
          ...(e?.metodo ? { metodoPreco: e.metodo } : {}),
          ...(e?.regraTeto ? { regraTeto: e.regraTeto } : {}),
          ...(e?.aliquota ? { aliquotaTeto: e.aliquota } : {}),
          ...(e && e.justificativa !== undefined ? { justificativa: e.justificativa?.trim() || null } : {}),
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
            escolhaExplicita: escolhaExplicita(escolhas[c.id]) || !!(c.metodoPreco && c.regraTeto),
            justificativaEditada: itens[i].justificativaEditada,
            periodo: resultado?.periodo ?? null,
            ipca: resultado ? { ligado: resultado.ipca.ligado, mesBase: resultado.ipca.mesBase } : null,
            duplicidadesRevertidas: c.duplicidadesRevertidas,
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
