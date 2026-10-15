export const runtime = "nodejs";
export const maxDuration = 60;

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import {
  ESCOLHA_PADRAO_MAPA,
  classificarCodigo,
  normalizarEscolha,
  normalizarPeriodo,
  normalizarUnidade,
  pesquisarPrecos,
  validarPeriodo,
} from "@/lib/pesquisa-preco";
import { escolhaExplicita, relatorioAvulsoSchema } from "@/lib/relatorio-schemas";
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
// Mapa comparativo de preços no modelo da DLOG (XLSX) — pesquisa avulsa.
// Mesmo corpo do relatório HTML (app/api/relatorios/pesquisa-preco) mais a
// quantidade e a escolha de método/teto. A pesquisa é a mesma da tela, no modo
// `registrosCompletos`: a planilha lista toda a amostra que entrou no cálculo.
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

    const parsed = relatorioAvulsoSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
    }
    const b = parsed.data;
    if (!classificarCodigo(b.codigo)) {
      return NextResponse.json(
        { error: "Campo 'codigo' obrigatório: CATMAT (até 6 dígitos) ou registro ANVISA (13 dígitos)" },
        { status: 400 }
      );
    }
    if (!normalizarUnidade(b.unidade)) {
      return NextResponse.json({ error: "Campo 'unidade' (unidade de fornecimento) é obrigatório" }, { status: 400 });
    }

    const periodo = normalizarPeriodo(b.periodo);
    const erroPeriodo = validarPeriodo(periodo);
    if (erroPeriodo) return NextResponse.json({ error: erroPeriodo }, { status: 400 });
    const escolha = normalizarEscolha(b.escolha, ESCOLHA_PADRAO_MAPA);
    const geradoEm = new Date();
    const [resultado, bases] = await Promise.all([
      pesquisarPrecos({
        codigo: b.codigo,
        unidade: b.unidade,
        uf: b.uf,
        filtros: { fornecedor: b.fornecedor ?? null, fabricante: b.fabricante ?? null, cnpjComprador: b.cnpjComprador ?? null },
        exclusoes: b.exclusoes,
        orcamentos: b.orcamentos,
        escolha,
        periodo,
        corrigirIpca: b.corrigirIpca,
        duplicidadesRevertidas: b.duplicidadesRevertidas,
        registrosCompletos: true,
      }),
      contextoBases(periodo.dataReferencia),
    ]);
    if (!resultado) {
      return NextResponse.json(
        { error: "Código não encontrado no catálogo CATMAT nem nos registros ANVISA (CMED)" },
        { status: 404 }
      );
    }

    const item = montarMapaItem({
      numero: 1,
      codigo: b.codigo,
      descricao: resultado.item.descricao,
      unidade: resultado.unidade,
      quantidade: b.quantidade,
      resultado,
      justificativaEditada: b.escolha?.justificativa ?? null,
      escolhaExplicita: escolhaExplicita(b.escolha),
      consultadoEm: geradoEm,
    });
    const usuario = session.user.name || session.user.email || userId;
    const buffer = await gerarMapaDlog([item], {
      processo: b.processo,
      orgao: b.orgao,
      responsavel: b.responsavel,
      cargo: b.cargo,
      usuario,
      geradoEm,
      dataReferencia: new Date(`${resultado.periodo.dataReferencia}T12:00:00Z`),
      cmedVigencia: bases.cmedVigencia,
      cmedPublicacao: bases.cmedPublicacao,
      cmedLista: bases.cmedLista,
      fontesConsultadas: bases.fontesConsultadas,
      periodo: periodoParaMapa([resultado]),
      ipca: await ipcaParaMapa([resultado]),
      versaoDados: bases.versaoDados,
      hashConteudo: hashConteudo([item]),
      filtrosPorItem: new Map([[1, recorteDoItem(resultado)]]),
    });
    const sha256 = hashArquivo(buffer);
    const nomeArquivo = nomeArquivoMapa(b.processo, geradoEm);

    await db.auditLog.create({
      data: {
        action: "EXPORT",
        entity: "MapaComparativoPrecos",
        entityId: resultado.item.codigo,
        userId,
        metadata: {
          formato: "xlsx",
          sha256,
          nomeArquivo,
          codigo: resultado.item.codigo,
          unidade: resultado.unidade,
          uf: resultado.uf,
          filtros: resultado.filtros,
          quantidade: b.quantidade,
          processo: b.processo,
          orgao: b.orgao,
          escolha,
          periodo: resultado.periodo,
          ipca: resultado.ipca,
          duplicidadesRevertidas: b.duplicidadesRevertidas,
          escolhaExplicita: escolhaExplicita(b.escolha),
          justificativaEditada: item.justificativaEditada,
          precoFinal: resultado.recomendacao.precoFinal,
          valorTotal: item.valorTotal,
          descartes: resultado.descartes.map((d) => ({ fonte: d.fonte, id: d.id, preco: d.preco, motivo: d.motivo })),
        },
      },
    });
    await registrarRelatorio({
      tipo: "PESQUISA_PRECO",
      parametros: {
        formato: "xlsx",
        modelo: "DLOG",
        sha256,
        codigo: resultado.item.codigo,
        unidade: resultado.unidade,
        quantidade: b.quantidade,
        processo: b.processo,
        escolha,
      },
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
    console.error("[relatorios/pesquisa-preco/xlsx]", error);
    return NextResponse.json({ error: "Erro ao gerar o mapa comparativo" }, { status: 500 });
  }
}
