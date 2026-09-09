export const runtime = "nodejs";
export const maxDuration = 60;

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { listarCesta, type CestaItemDTO } from "@/lib/cesta";
import { relatorioCestaSchema } from "@/lib/cesta-schemas";
import { pesquisarPrecos, type ResultadoPesquisa } from "@/lib/pesquisa-preco";
import {
  AZUL,
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
  subSecao,
  tabela,
  validadeEm,
  type MetaRelatorio,
} from "@/lib/relatorio-pesquisa-preco";
import { NextRequest, NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────────────────────
// Relatório consolidado da cesta (IN SEGES/ME nº 65/2021) — vários itens em um
// único documento, com quadro-resumo, valor global e o detalhamento por fonte
// de cada item.
//
// A pesquisa de CADA item é refeita na emissão: o preço que instrui o processo
// é o da data do relatório, não o snapshot guardado quando o item entrou na
// cesta. Por isso o limite de itens (MAX_ITENS_CESTA) e a execução com
// concorrência limitada.
// ─────────────────────────────────────────────────────────────────────────────

const CONCORRENCIA = 4;

interface ItemProcessado {
  cesta: CestaItemDTO;
  resultado: ResultadoPesquisa | null;
  /** precoFinal recalculado × quantidade; null quando não há preço. */
  valorTotal: number | null;
}

async function processarItens(itens: CestaItemDTO[]): Promise<ItemProcessado[]> {
  const saida: ItemProcessado[] = new Array(itens.length);
  let cursor = 0;

  async function worker() {
    for (;;) {
      const i = cursor;
      cursor += 1;
      if (i >= itens.length) return;
      const cesta = itens[i];
      let resultado: ResultadoPesquisa | null = null;
      try {
        resultado = await pesquisarPrecos({
          codigo: cesta.codigo,
          unidade: cesta.unidade,
          uf: cesta.uf,
        });
      } catch (error) {
        console.error("[relatorios/cesta] falha ao pesquisar", cesta.codigo, error);
      }
      const precoFinal = resultado?.recomendacao.precoFinal ?? null;
      saida[i] = {
        cesta,
        resultado,
        valorTotal: precoFinal === null ? null : precoFinal * cesta.quantidade,
      };
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCORRENCIA, itens.length) }, () => worker())
  );
  return saida;
}

// ── Blocos próprios do relatório de cesta ────────────────────────────────────

function quadroResumo(processados: ItemProcessado[], valorGlobal: number, semPreco: number): string {
  const linhas = tabela(processados, [
    { label: "#", fn: (_p, i) => String(i + 1) },
    {
      label: "Código",
      fn: (p) =>
        p.cesta.tipo === "CATMAT"
          ? `CATMAT ${esc(p.cesta.codigo)}`
          : `Reg. ${esc(p.cesta.codigo)}${p.cesta.catmat ? `<br/><span style="color:#666;">CATMAT ${esc(p.cesta.catmat)}</span>` : ""}`,
    },
    { label: "Descrição", fn: (p) => esc(p.cesta.descricao.substring(0, 90)) },
    { label: "Unid. fornecimento", fn: (p) => esc(p.cesta.unidade) },
    { label: "UF", fn: (p) => esc(p.cesta.uf || "Todas") },
    { label: "Qtd.", fn: (p) => p.cesta.quantidade.toLocaleString("pt-BR"), right: true },
    {
      label: "Preço unitário",
      fn: (p) =>
        p.resultado
          ? `<strong>${fmtBRL(p.resultado.recomendacao.precoFinal)}</strong>`
          : `<span style="color:#c0392b;">não localizado</span>`,
      right: true,
    },
    {
      label: "Valor total",
      fn: (p) => (p.valorTotal === null ? "—" : `<strong>${fmtBRL(p.valorTotal, 2)}</strong>`),
      right: true,
    },
  ]);

  return `
    <p style="font-size:11px;margin-bottom:8px;">A cesta reúne <strong>${processados.length}</strong> item(ns). O preço unitário de cada linha é o preço estimado apurado na data de emissão deste relatório, conforme a metodologia da seção anterior; o valor total é o preço unitário multiplicado pela quantidade demandada.</p>
    ${linhas}
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:10px;">
      <tr style="background:#eef2f7;">
        <td style="border:1px solid ${AZUL};padding:8px 10px;font-weight:bold;color:${AZUL};">VALOR GLOBAL ESTIMADO DA CESTA</td>
        <td style="border:1px solid ${AZUL};padding:8px 10px;text-align:right;font-weight:bold;font-size:16px;color:${AZUL};">${fmtBRL(valorGlobal, 2)}</td>
      </tr>
    </table>
    ${
      semPreco > 0
        ? `<p style="font-size:10px;color:#c0392b;margin-top:6px;"><strong>Atenção:</strong> ${semPreco} item(ns) sem preço apurado nas bases consultadas não compõem o valor global. Recomenda-se cotação direta a fornecedores para esses itens.</p>`
        : ""
    }`;
}

function detalhamentoItem(p: ItemProcessado, indice: number): string {
  const rotulo = `Item ${indice + 1} — ${esc(p.cesta.descricao.substring(0, 100))}`;

  if (!p.resultado) {
    return subSecao(
      rotulo,
      `<p style="font-size:11px;color:#c0392b;">O código ${esc(p.cesta.codigo)} não foi localizado no catálogo CATMAT nem nos registros ANVISA (CMED) no momento da emissão deste relatório. O item permanece na cesta, mas não compõe o valor global.</p>`
    );
  }

  const r = p.resultado;
  const pmvgAplicado = pmvgFoiAplicado(r);
  const capAplica = r.resultados.cmed.registros.some((x) => x.cap);

  const cabecalho = `
    <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:10px;">
      <tr>
        <td style="border:1px solid ${AZUL};padding:6px 10px;background:#eef2f7;">
          <span style="font-size:9px;color:#666;text-transform:uppercase;display:block;">Preço unitário estimado</span>
          <strong style="font-size:15px;color:${AZUL};">${fmtBRL(r.recomendacao.precoFinal)}</strong>
          <span style="font-size:10px;color:#555;"> por ${esc(r.unidade)}</span>
        </td>
        <td style="border:1px solid #ddd;padding:6px 10px;">
          <span style="font-size:9px;color:#666;text-transform:uppercase;display:block;">Quantidade demandada</span>
          <strong style="font-size:13px;">${p.cesta.quantidade.toLocaleString("pt-BR")}</strong>
          <span style="font-size:10px;color:#555;"> ${esc(r.unidade)}</span>
        </td>
        <td style="border:1px solid ${AZUL};padding:6px 10px;background:#eef2f7;">
          <span style="font-size:9px;color:#666;text-transform:uppercase;display:block;">Valor total do item</span>
          <strong style="font-size:15px;color:${AZUL};">${p.valorTotal === null ? "—" : fmtBRL(p.valorTotal, 2)}</strong>
        </td>
      </tr>
    </table>
    ${pmvgAplicado ? `<p style="font-size:10px;color:#c0392b;margin-bottom:4px;">* Teto PMVG aplicado — preço de mercado acima do limite regulatório ANVISA/CMED.</p>` : ""}
    ${capAplica ? `<p style="font-size:10px;color:#c0392b;margin-bottom:4px;">* Produto sujeito a desconto CAP de 21,53% sobre o PF nas aquisições não judiciais.</p>` : ""}
    ${p.cesta.observacao ? `<p style="font-size:10px;margin-bottom:6px;"><strong>Observação do solicitante:</strong> ${esc(p.cesta.observacao)}</p>` : ""}`;

  const detalhe = `
    ${cabecalho}
    <p style="font-size:11px;margin-bottom:8px;">${linhaCodigo(r)} · Unidade de fornecimento <strong>${esc(r.unidade)}</strong>${r.uf ? ` · UF ${esc(r.uf)}` : ""}</p>
    ${conteudoEspecificacao(r, especificacaoDoItem(r, ""))}
    <div style="margin-top:10px;"><strong style="font-size:11px;">CMED/ANVISA — teto regulatório por unidade</strong></div>
    ${conteudoCmed(r)}
    <div style="margin-top:10px;"><strong style="font-size:11px;">BPS — Banco de Preços em Saúde</strong></div>
    ${conteudoBps(r)}
    <div style="margin-top:10px;"><strong style="font-size:11px;">SIASG/Comprasnet — compras com ação judicial</strong></div>
    ${conteudoSiasg(r)}
    <div style="margin-top:10px;"><strong style="font-size:11px;">PNCP — Portal Nacional de Contratações Públicas</strong></div>
    ${conteudoPncp(r)}
    <div style="margin-top:10px;"><strong style="font-size:11px;">Apuração do preço de referência</strong></div>
    ${conteudoAnalise(r, false)}
    ${conteudoObservacoes(r)}`;

  return subSecao(rotulo, detalhe);
}

function gerarHTML(processados: ItemProcessado[], meta: MetaRelatorio): string {
  const comPreco = processados.filter((p) => p.valorTotal !== null);
  const valorGlobal = comPreco.reduce((s, p) => s + (p.valorTotal ?? 0), 0);
  const semPreco = processados.length - comPreco.length;
  const validade = validadeEm(meta.geradoEm);

  const naoLocalizados = processados.filter((p) => !p.resultado);
  const poucasFontes = processados.filter(
    (p) => p.resultado !== null && p.resultado.recomendacao.fontes.length < 3
  );

  const conclusao = `
    <div style="border:2px solid ${AZUL};padding:12px;margin-bottom:16px;border-radius:4px;background:#eef2f7;">
      <p style="font-size:13px;font-weight:bold;color:${AZUL};margin-bottom:6px;">VALOR GLOBAL ESTIMADO DA CONTRATAÇÃO:</p>
      <p style="font-size:22px;font-weight:bold;color:${AZUL};">${fmtBRL(valorGlobal, 2)}</p>
      <p style="font-size:10px;color:#555;margin-top:4px;">Soma dos preços unitários estimados multiplicados pelas quantidades demandadas de ${comPreco.length} item(ns).</p>
    </div>
    <ul style="padding-left:18px;margin-bottom:14px;">
      ${
        naoLocalizados.length > 0
          ? `<li style="font-size:10px;margin-bottom:3px;color:#c0392b;">${naoLocalizados.length} item(ns) não localizados nas bases na data de emissão (códigos ${naoLocalizados.map((p) => esc(p.cesta.codigo)).join(", ")}) — excluídos do valor global.</li>`
          : ""
      }
      ${
        semPreco - naoLocalizados.length > 0
          ? `<li style="font-size:10px;margin-bottom:3px;color:#c0392b;">${semPreco - naoLocalizados.length} item(ns) localizados, porém sem preço apurado em nenhuma fonte — excluídos do valor global.</li>`
          : ""
      }
      ${
        poucasFontes.length > 0
          ? `<li style="font-size:10px;margin-bottom:3px;">${poucasFontes.length} item(ns) com menos de 3 fontes de mercado com dados. O art. 5º, §3º da IN 65/2021 recomenda consulta a no mínimo 3 fontes — recomenda-se complementar com cotação direta a fornecedores.</li>`
          : ""
      }
      <li style="font-size:10px;margin-bottom:3px;">Os preços unitários foram apurados individualmente por item, na respectiva unidade de fornecimento, e o PMVG vigente (CMED) foi aplicado como teto obrigatório sempre que o preço de mercado o superou.</li>
    </ul>
    <p style="font-size:11px;margin-bottom:6px;"><strong>Validade desta pesquisa:</strong> 90 (noventa) dias, conforme art. 5º, §4º da IN SEGES/ME nº 65/2021 — até <strong>${fmtDateLong(validade)}</strong>.</p>
    <p style="font-size:11px;margin-bottom:16px;"><strong>Bases consultadas:</strong> CMED/ANVISA (tabela vigente, preço por unidade de fornecimento), BPS 2020–2025, SIASG/Comprasnet (compras judiciais 2002–2021) e PNCP (materiais 2024–2025).</p>
    ${blocoAssinaturas(meta)}`;

  const corpo = [
    secao(
      1,
      "Identificação do Objeto",
      `<p style="font-size:11px;">O presente relatório tem por objeto a pesquisa de preços para aquisição de <strong>${processados.length} item(ns)</strong> relacionados no quadro-resumo da seção 3, conforme demanda constante no processo identificado acima. Cada item foi pesquisado individualmente pelo respectivo código (CATMAT ou registro ANVISA) e unidade de fornecimento.</p>`
    ),
    secao(2, "Método de Pesquisa de Preços", conteudoMetodo()),
    secao(3, "Quadro-Resumo dos Itens e Valor Global", quadroResumo(processados, valorGlobal, semPreco)),
    secao(4, "Detalhamento por Item", processados.map(detalhamentoItem).join("\n")),
    secao(5, "Conclusão, Recomendação, Validade e Responsável", conclusao),
    secao(6, "Referências Normativas", conteudoReferencias()),
  ].join("\n");

  return paginaHTML({
    tituloDocumento: `Relatório de Pesquisa de Preços — ${processados.length} itens`,
    subtitulo: "RELATÓRIO CONSOLIDADO DE PESQUISA DE PREÇOS",
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
    const userId = session.user.id as string;

    const body = await request.json().catch(() => null);
    const parsed = relatorioCestaSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const { responsavel, cargo, orgao, processo, limparCesta } = parsed.data;

    const cesta = await listarCesta(userId);
    if (cesta.itens.length === 0) {
      return NextResponse.json(
        { error: "A cesta está vazia. Adicione itens antes de gerar o relatório." },
        { status: 400 }
      );
    }

    const geradoEm = new Date();
    const processados = await processarItens(cesta.itens);
    const html = gerarHTML(processados, { responsavel, cargo, orgao, processo, geradoEm });

    const valorGlobal = processados.reduce((s, p) => s + (p.valorTotal ?? 0), 0);

    if (limparCesta) {
      await db.cestaItem.deleteMany({ where: { userId } });
    } else {
      // Mantém a cesta em dia com os preços que acabaram de sair no relatório.
      for (const p of processados) {
        const rec = p.resultado?.recomendacao;
        if (!rec) continue;
        await db.cestaItem.updateMany({
          where: { id: p.cesta.id, userId },
          data: {
            precoReferencia: rec.precoReferencia,
            limitePmvg: rec.limitePmvg,
            precoFinal: rec.precoFinal,
            calculadoEm: geradoEm,
          },
        });
      }
    }

    await db.auditLog.create({
      data: {
        action: "EXPORT",
        entity: "RelatorioCestaPesquisaPreco",
        entityId: null,
        userId,
        metadata: {
          itens: processados.length,
          valorGlobal,
          naoLocalizados: processados.filter((p) => !p.resultado).length,
          cestaLimpa: limparCesta,
          orgao,
          processo,
          codigos: processados.map((p) => ({
            codigo: p.cesta.codigo,
            unidade: p.cesta.unidade,
            uf: p.cesta.uf,
            quantidade: p.cesta.quantidade,
            precoFinal: p.resultado?.recomendacao.precoFinal ?? null,
          })),
        },
      },
    });

    const nomeArquivo = `pesquisa_preco_cesta_${processados.length}_itens_${geradoEm.toISOString().slice(0, 10)}.html`;
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="${nomeArquivo}"`,
      },
    });
  } catch (error) {
    console.error("[relatorios/cesta]", error);
    return NextResponse.json({ error: "Erro ao gerar o relatório da cesta" }, { status: 500 });
  }
}
