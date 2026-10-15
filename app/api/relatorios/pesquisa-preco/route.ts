export const runtime = "nodejs";
export const maxDuration = 60;

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import {
  ESCOLHA_PADRAO,
  classificarCodigo,
  normalizarEscolha,
  normalizarPeriodo,
  normalizarUnidade,
  pesquisarPrecos,
  validarPeriodo,
  rotuloRegraTeto,
  type ResultadoPesquisa,
} from "@/lib/pesquisa-preco";
import { escolhaExplicita, relatorioAvulsoSchema } from "@/lib/relatorio-schemas";
import { gerarJustificativa } from "@/lib/mapa-dlog/justificativa";
import { registrarRelatorio } from "@/lib/relatorio-registro";
import {
  blocoAssinaturas,
  conteudoAnalise,
  conteudoArp,
  conteudoBps,
  conteudoComprasGov,
  conteudoCmed,
  conteudoDescartes,
  conteudoEspecificacao,
  conteudoMetodo,
  conteudoObservacoes,
  conteudoAtualizacaoMonetaria,
  conteudoPeriodo,
  conteudoPrecosInformados,
  conteudoReferencias,
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

interface Emissao {
  especificacao: string;
  quantidade: number;
  /** Justificativa do preço adotado (editada pelo responsável ou gerada). */
  justificativa: string;
}

function gerarHTML(resultado: ResultadoPesquisa, emissao: Emissao, meta: MetaRelatorio): string {
  const { item, unidade, recomendacao } = resultado;
  const { escolha } = recomendacao;
  const valorTotal = recomendacao.precoFinal === null ? null : recomendacao.precoFinal * emissao.quantidade;
  const validade = validadeEm(meta.geradoEm);
  const pmvgAplicado = pmvgFoiAplicado(resultado);
  const capAplica = resultado.resultados.cmed.registros.some((r) => r.cap);

  const conclusao = `
    <div style="border:2px solid #1a3a5c;padding:12px;margin-bottom:16px;border-radius:4px;background:#eef2f7;">
      <p style="font-size:13px;font-weight:bold;color:#1a3a5c;margin-bottom:6px;">PREÇO UNITÁRIO ESTIMADO:</p>
      <p style="font-size:22px;font-weight:bold;color:#1a3a5c;">${fmtBRL(recomendacao.precoFinal)}<span style="font-size:12px;font-weight:normal;color:#555;margin-left:8px;">por ${esc(unidade)}</span></p>
      <p style="font-size:11px;color:#333;margin-top:4px;">Quantidade: <strong>${emissao.quantidade.toLocaleString("pt-BR")}</strong> · Valor total estimado: <strong>${valorTotal === null ? "—" : fmtBRL(valorTotal, 2)}</strong> · Método: ${esc(recomendacao.descricaoMetodo)}</p>
      ${pmvgAplicado ? `<p style="font-size:10px;color:#c0392b;margin-top:4px;">* Teto PMVG aplicado — preço de mercado estava acima do limite regulatório ANVISA/CMED</p>` : ""}
      ${capAplica ? `<p style="font-size:10px;color:#c0392b;margin-top:2px;">* Produto sujeito a desconto CAP de 21,53% sobre o PF nas aquisições não judiciais</p>` : ""}
    </div>
    <p style="font-size:11px;margin-bottom:10px;"><strong>Justificativa do preço adotado:</strong> ${esc(emissao.justificativa)}</p>
    ${conteudoObservacoes(resultado)}
    <p style="font-size:11px;margin-bottom:6px;"><strong>Validade desta pesquisa:</strong> 90 (noventa) dias, conforme art. 5º, §4º da IN SEGES/ME nº 65/2021 — até <strong>${fmtDateLong(validade)}</strong>.</p>
    <p style="font-size:11px;margin-bottom:16px;"><strong>Bases consultadas:</strong> CMED/ANVISA (tabela vigente, preço por unidade de fornecimento), Compras.gov.br (API de dados abertos do Painel de Preços, SIASG/Comprasnet judicial 2002–2021 e base PNCP de contratos 2024–2025, com o link da contratação no PNCP), BPS (${resultado.resultados.bps.origemDados === "API" ? "API de dados abertos do Ministério da Saúde" : "base histórica 2020–2025"}) e atas de registro de preços (API de dados abertos).</p>
    ${blocoAssinaturas(meta)}`;

  // A seção de orçamentos só existe quando há proposta juntada, então a
  // numeração é sequencial e não fixa — um número pulado num documento que
  // instrui processo administrativo dá margem a dúvida sobre folha faltante.
  let n = 0;
  const secoes: string[] = [
    secao(
      ++n,
      "Identificação do Objeto",
      `<p style="font-size:11px;">O presente relatório tem por objeto a pesquisa de preços para aquisição de <strong>${esc(item.descricao)}</strong> (${linhaCodigo(resultado)}), na unidade de fornecimento <strong>${esc(unidade)}</strong>, conforme demanda constante no processo identificado acima.</p>`
    ),
    secao(
      ++n,
      "Especificação Técnica do Item",
      conteudoEspecificacao(resultado, especificacaoDoItem(resultado, emissao.especificacao))
    ),
    secao(++n, "Método de Pesquisa de Preços", conteudoMetodo(escolha.metodo, rotuloRegraTeto(escolha.regraTeto, escolha.aliquota))),
    secao(
      ++n,
      "Período da Pesquisa e Atualização Monetária (art. 5º)",
      `${conteudoPeriodo(resultado)}<div style="margin-top:8px;"><strong style="font-size:11px;">Atualização monetária</strong></div>${conteudoAtualizacaoMonetaria(resultado)}`
    ),
    secao(++n, "Resultado por Fonte — CMED/ANVISA (Preço-Teto Regulatório por Unidade)", conteudoCmed(resultado)),
    secao(++n, "Resultado por Fonte — Compras.gov.br (API, SIASG judicial e base PNCP)", conteudoComprasGov(resultado)),
    secao(++n, "Resultado por Fonte — BPS (Banco de Preços em Saúde)", conteudoBps(resultado)),
    secao(++n, "Resultado por Fonte — Atas de Registro de Preços", conteudoArp(resultado)),
  ];
  if (resultado.orcamentos.length > 0) {
    secoes.push(
      secao(++n, "Resultado por Fonte — Preços Informados pelo Responsável (art. 5º, II a V)", conteudoPrecosInformados(resultado))
    );
  }
  secoes.push(
    secao(++n, "Média, Mediana e Menor Valor — por Fonte e Consolidados (art. 6º)", conteudoAnalise(resultado)),
    secao(++n, "Registros Desconsiderados e Respectivas Justificativas", conteudoDescartes(resultado)),
    secao(++n, "Conclusão, Recomendação, Validade e Responsável", conclusao),
    secao(++n, "Referências Normativas", conteudoReferencias())
  );
  const corpo = secoes.join("\n");

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

    const parsed = relatorioAvulsoSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
    }
    const {
      codigo,
      unidade,
      uf: ufNorm,
      fornecedor = null,
      fabricante = null,
      cnpjComprador = null,
      // Curadoria feita na tela anterior à emissão: registros desconsiderados
      // com justificativa e orçamentos diretos de fornecedor.
      exclusoes,
      orcamentos,
      orgao,
      responsavel,
      cargo,
      processo,
      especificacao,
      quantidade,
    } = parsed.data;
    // Sem escolha no pedido, vale o padrão do painel; a modal de emissão manda
    // a mesma escolha para o HTML e para o mapa XLSX.
    const escolha = normalizarEscolha(parsed.data.escolha, ESCOLHA_PADRAO);

    if (!classificarCodigo(String(codigo ?? ""))) {
      return NextResponse.json(
        { error: "Campo 'codigo' obrigatório: CATMAT (até 6 dígitos) ou registro ANVISA (13 dígitos)" },
        { status: 400 }
      );
    }
    if (!unidade || !normalizarUnidade(String(unidade))) {
      return NextResponse.json({ error: "Campo 'unidade' (unidade de fornecimento) é obrigatório" }, { status: 400 });
    }
    const periodo = normalizarPeriodo(parsed.data.periodo);
    const erroPeriodo = validarPeriodo(periodo);
    if (erroPeriodo) return NextResponse.json({ error: erroPeriodo }, { status: 400 });

    const resultado = await pesquisarPrecos({
      codigo: String(codigo),
      unidade: String(unidade),
      uf: ufNorm,
      filtros: { fornecedor, fabricante, cnpjComprador },
      exclusoes,
      orcamentos,
      escolha,
      periodo,
      corrigirIpca: parsed.data.corrigirIpca,
      duplicidadesRevertidas: parsed.data.duplicidadesRevertidas,
    });
    if (!resultado) {
      return NextResponse.json(
        { error: "Código não encontrado no catálogo CATMAT nem nos registros ANVISA (CMED)" },
        { status: 404 }
      );
    }

    const justificativaEditada = parsed.data.escolha?.justificativa?.trim() || null;
    const html = gerarHTML(
      resultado,
      {
        especificacao,
        quantidade,
        justificativa: justificativaEditada ?? gerarJustificativa(resultado),
      },
      { orgao, responsavel, cargo, processo, geradoEm: new Date() }
    );

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
          filtros: resultado.filtros,
          orgao,
          processo,
          quantidade,
          escolha,
          periodo: resultado.periodo,
          ipca: resultado.ipca,
          duplicidadesRevertidas: parsed.data.duplicidadesRevertidas,
          escolhaExplicita: escolhaExplicita(parsed.data.escolha),
          justificativaEditada: justificativaEditada !== null,
          precoFinal: resultado.recomendacao.precoFinal,
          precoReferencia: resultado.recomendacao.precoReferencia,
          mediaConsolidada: resultado.recomendacao.mediaConsolidada,
          menorConsolidado: resultado.recomendacao.menorConsolidado,
          fontes: resultado.recomendacao.fontes,
          // Rastreabilidade do descarte também fora do documento: o log de
          // auditoria guarda quem excluiu o quê e por quê.
          descartes: resultado.descartes.map((d) => ({
            fonte: d.fonte,
            id: d.id,
            preco: d.preco,
            motivo: d.motivo,
          })),
          orcamentos: resultado.orcamentos.map((o) => ({
            fornecedor: o.fornecedor,
            cnpj: o.cnpj,
            valorUnitario: o.valorUnitario,
            considerarNoCalculo: o.considerarNoCalculo,
          })),
        },
      },
    });

    const nomeArquivo = `pesquisa_preco_${resultado.item.codigo}_${slug(resultado.unidade)}_${new Date().toISOString().slice(0, 10)}.html`;
    await registrarRelatorio({
      tipo: "PESQUISA_PRECO",
      parametros: {
        formato: "html",
        codigo: resultado.item.codigo,
        unidade: resultado.unidade,
        quantidade,
        processo,
        escolha,
      },
      nomeArquivo,
      tamanhoBytes: Buffer.byteLength(html, "utf8"),
      geradoPorId: session.user.id as string,
    });
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
