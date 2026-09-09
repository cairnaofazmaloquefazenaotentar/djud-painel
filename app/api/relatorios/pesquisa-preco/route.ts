export const runtime = "nodejs";
export const maxDuration = 60;

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import {
  classificarCodigo,
  normalizarUnidade,
  pesquisarPrecos,
  type ResultadoPesquisa,
} from "@/lib/pesquisa-preco";
import {
  blocoAssinaturas,
  conteudoAnalise,
  conteudoBps,
  conteudoCmed,
  conteudoEspecificacao,
  conteudoMetodo,
  conteudoObservacoes,
  conteudoPncp,
  conteudoReferencias,
  conteudoSiasg,
  esc,
  especificacaoDoItem,
  fmtBRL,
  fmtDateLong,
  linhaCodigo,
  paginaHTML,
  pmvgFoiAplicado,
  secao,
  slug,
  validadeEm,
  type MetaRelatorio,
} from "@/lib/relatorio-pesquisa-preco";
import { NextRequest, NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────────────────────
// Relatório de Pesquisa de Preços (IN SEGES/ME nº 65/2021) — um item, HTML
// imprimível. Reutiliza a mesma pesquisa da tela (lib/pesquisa-preco.ts) e os
// blocos de HTML de lib/relatorio-pesquisa-preco.ts (compartilhados com o
// relatório da cesta, em app/api/relatorios/cesta).
// ─────────────────────────────────────────────────────────────────────────────

function gerarHTML(resultado: ResultadoPesquisa, especificacaoInformada: string, meta: MetaRelatorio): string {
  const { item, unidade, recomendacao } = resultado;
  const validade = validadeEm(meta.geradoEm);
  const pmvgAplicado = pmvgFoiAplicado(resultado);
  const capAplica = resultado.resultados.cmed.registros.some((r) => r.cap);

  const conclusao = `
    <div style="border:2px solid #1a3a5c;padding:12px;margin-bottom:16px;border-radius:4px;background:#eef2f7;">
      <p style="font-size:13px;font-weight:bold;color:#1a3a5c;margin-bottom:6px;">PREÇO UNITÁRIO ESTIMADO:</p>
      <p style="font-size:22px;font-weight:bold;color:#1a3a5c;">${fmtBRL(recomendacao.precoFinal)}<span style="font-size:12px;font-weight:normal;color:#555;margin-left:8px;">por ${esc(unidade)}</span></p>
      ${pmvgAplicado ? `<p style="font-size:10px;color:#c0392b;margin-top:4px;">* Teto PMVG aplicado — preço de mercado estava acima do limite regulatório ANVISA/CMED</p>` : ""}
      ${capAplica ? `<p style="font-size:10px;color:#c0392b;margin-top:2px;">* Produto sujeito a desconto CAP de 21,53% sobre o PF nas aquisições não judiciais</p>` : ""}
    </div>
    ${conteudoObservacoes(resultado)}
    <p style="font-size:11px;margin-bottom:6px;"><strong>Validade desta pesquisa:</strong> 90 (noventa) dias, conforme art. 5º, §4º da IN SEGES/ME nº 65/2021 — até <strong>${fmtDateLong(validade)}</strong>.</p>
    <p style="font-size:11px;margin-bottom:16px;"><strong>Bases consultadas:</strong> CMED/ANVISA (tabela vigente, preço por unidade de fornecimento), BPS 2020–2025, SIASG/Comprasnet (compras judiciais 2002–2021) e PNCP (materiais 2024–2025).</p>
    ${blocoAssinaturas(meta)}`;

  const corpo = [
    secao(
      1,
      "Identificação do Objeto",
      `<p style="font-size:11px;">O presente relatório tem por objeto a pesquisa de preços para aquisição de <strong>${esc(item.descricao)}</strong> (${linhaCodigo(resultado)}), na unidade de fornecimento <strong>${esc(unidade)}</strong>, conforme demanda constante no processo identificado acima.</p>`
    ),
    secao(
      2,
      "Especificação Técnica do Item",
      conteudoEspecificacao(resultado, especificacaoDoItem(resultado, especificacaoInformada))
    ),
    secao(3, "Método de Pesquisa de Preços", conteudoMetodo()),
    secao(4, "Resultado por Fonte — CMED/ANVISA (Preço-Teto Regulatório por Unidade)", conteudoCmed(resultado)),
    secao(5, "Resultado por Fonte — BPS (Banco de Preços em Saúde)", conteudoBps(resultado)),
    secao(6, "Resultado por Fonte — SIASG/Comprasnet (Compras com Ação Judicial)", conteudoSiasg(resultado)),
    secao(7, "Resultado por Fonte — PNCP (Portal Nacional de Contratações Públicas)", conteudoPncp(resultado)),
    secao(8, "Análise Estatística e Apuração do Preço de Referência", conteudoAnalise(resultado)),
    secao(9, "Conclusão, Recomendação, Validade e Responsável", conclusao),
    secao(10, "Referências Normativas", conteudoReferencias()),
  ].join("\n");

  return paginaHTML({
    tituloDocumento: `Relatório de Pesquisa de Preços — ${item.descricao.substring(0, 120)}`,
    subtitulo: "RELATÓRIO DE PESQUISA DE PREÇOS",
    meta,
    corpo,
  });
}

// ── Route Handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    if (!hasPermission(session as any, "relatorios:gerar")) {
      return NextResponse.json({ error: "Sem permissão para gerar relatórios" }, { status: 403 });
    }

    const body = await request.json();
    const {
      codigo,
      unidade,
      uf,
      orgao = "",
      responsavel = "",
      cargo = "",
      processo = "",
      especificacao = "",
    } = body ?? {};

    if (!classificarCodigo(String(codigo ?? ""))) {
      return NextResponse.json(
        { error: "Campo 'codigo' obrigatório: CATMAT (até 6 dígitos) ou registro ANVISA (13 dígitos)" },
        { status: 400 }
      );
    }
    if (!unidade || !normalizarUnidade(String(unidade))) {
      return NextResponse.json({ error: "Campo 'unidade' (unidade de fornecimento) é obrigatório" }, { status: 400 });
    }
    const ufNorm = uf ? String(uf).trim().toUpperCase() : null;
    if (ufNorm && !/^[A-Z]{2}$/.test(ufNorm)) {
      return NextResponse.json({ error: "UF inválida" }, { status: 400 });
    }

    const resultado = await pesquisarPrecos({
      codigo: String(codigo),
      unidade: String(unidade),
      uf: ufNorm,
    });
    if (!resultado) {
      return NextResponse.json(
        { error: "Código não encontrado no catálogo CATMAT nem nos registros ANVISA (CMED)" },
        { status: 404 }
      );
    }

    const html = gerarHTML(resultado, String(especificacao ?? ""), {
      orgao: String(orgao ?? ""),
      responsavel: String(responsavel ?? ""),
      cargo: String(cargo ?? ""),
      processo: String(processo ?? ""),
      geradoEm: new Date(),
    });

    await db.auditLog.create({
      data: {
        action: "EXPORT",
        entity: "RelatorioPesquisaPreco",
        entityId: resultado.item.codigo,
        userId: session.user.id as string,
        metadata: {
          codigo: resultado.item.codigo,
          tipo: resultado.item.tipo,
          catmat: resultado.item.catmat,
          descricao: resultado.item.descricao,
          unidade: resultado.unidade,
          uf: resultado.uf,
          orgao,
          processo,
          precoFinal: resultado.recomendacao.precoFinal,
          fontes: resultado.recomendacao.fontes,
        },
      },
    });

    const nomeArquivo = `pesquisa_preco_${resultado.item.codigo}_${slug(resultado.unidade)}_${new Date().toISOString().slice(0, 10)}.html`;
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="${nomeArquivo}"`,
      },
    });
  } catch (error) {
    console.error("[relatorios/pesquisa-preco]", error);
    return NextResponse.json({ error: "Erro ao gerar relatório" }, { status: 500 });
  }
}
