export const runtime = "nodejs";
export const maxDuration = 60;

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { escolhaGravada, listarCesta, parametrosDoItem, type CestaItemDTO } from "@/lib/cesta";
import { relatorioCestaSchema } from "@/lib/cesta-schemas";
import {
  ESCOLHA_PADRAO,
  ROTULO_METODO,
  hojeBrasilia,
  normalizarEscolha,
  rotuloRegraTeto,
  type EscolhaPreco,
  type ResultadoPesquisa,
} from "@/lib/pesquisa-preco";
import { processarItens } from "@/lib/pesquisa-preco-processar";
import { escolhaExplicita, type EscolhaItemInput } from "@/lib/relatorio-schemas";
import { gerarJustificativa } from "@/lib/mapa-dlog/justificativa";
import { registrarRelatorio } from "@/lib/relatorio-registro";
import {
  AZUL,
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
// A pesquisa de CADA item é refeita na emissão (lib/pesquisa-preco-processar):
// o preço que instrui o processo é o da data do relatório, não o snapshot
// guardado quando o item entrou na cesta. Por isso o limite de itens
// (MAX_ITENS_CESTA) e a execução com concorrência limitada.
// ─────────────────────────────────────────────────────────────────────────────

interface ItemProcessado {
  cesta: CestaItemDTO;
  resultado: ResultadoPesquisa | null;
  /** precoFinal recalculado × quantidade; null quando não há preço. */
  valorTotal: number | null;
  /** Justificativa do preço adotado — a editada na emissão ou a gerada. */
  justificativa: string;
}

async function apurarCesta(
  itens: CestaItemDTO[],
  escolhas: Record<string, EscolhaItemInput>
): Promise<ItemProcessado[]> {
  // A pesquisa é refeita, mas a curadoria e as escolhas do item são
  // reaplicadas: decisão do responsável, não resultado de consulta. A data de
  // referência é a da emissão (D1).
  const dataReferencia = hojeBrasilia();
  const apurados = await processarItens(itens, (cesta) =>
    parametrosDoItem(cesta, dataReferencia, normalizarEscolha(escolhas[cesta.id] ?? escolhaGravada(cesta), ESCOLHA_PADRAO))
  );
  return apurados.map(({ item: cesta, resultado }) => {
    const precoFinal = resultado?.recomendacao.precoFinal ?? null;
    const editada = (escolhas[cesta.id]?.justificativa ?? cesta.justificativa)?.trim();
    return {
      cesta,
      resultado,
      valorTotal: precoFinal === null ? null : precoFinal * cesta.quantidade,
      justificativa: editada || (resultado ? gerarJustificativa(resultado) : ""),
    };
  });
}

/** Método e teto comuns a todos os itens, para o texto da seção de método. */
function escolhaComum(processados: ItemProcessado[]): EscolhaPreco | null {
  const escolhas = processados
    .map((p) => p.resultado?.recomendacao.escolha)
    .filter((e): e is EscolhaPreco => !!e);
  if (!escolhas.length) return null;
  const chave = (e: EscolhaPreco) => `${e.metodo}|${e.regraTeto}|${e.aliquota}`;
  return escolhas.every((e) => chave(e) === chave(escolhas[0])) ? escolhas[0] : null;
}

// ── Blocos próprios do relatório de cesta ────────────────────────────────────

/** Valor global da cesta apurado por cada um dos três métodos do art. 6º. */
function globaisPorMetodo(processados: ItemProcessado[]) {
  const somar = (fn: (p: ItemProcessado) => number | null | undefined) =>
    processados.reduce((s, p) => {
      const v = fn(p);
      return v == null ? s : s + v * p.cesta.quantidade;
    }, 0);
  return {
    media: somar((p) => p.resultado?.consolidado.porFonte.media),
    adotado: somar((p) => p.resultado?.recomendacao.precoFinal),
    menor: somar((p) => p.resultado?.consolidado.porFonte.menor),
  };
}

function quadroResumo(processados: ItemProcessado[], valorGlobal: number, semPreco: number): string {
  const preco = (p: ItemProcessado, fn: (r: NonNullable<ItemProcessado["resultado"]>) => number | null) =>
    p.resultado ? fmtBRL(fn(p.resultado)) : `<span style="color:#c0392b;">n/loc.</span>`;

  const linhas = tabela(processados, [
    { label: "#", fn: (_p, i) => String(i + 1) },
    {
      label: "Código",
      fn: (p) =>
        p.cesta.tipo === "CATMAT"
          ? `CATMAT ${esc(p.cesta.codigo)}`
          : `Reg. ${esc(p.cesta.codigo)}${p.cesta.catmat ? `<br/><span style="color:#666;">CATMAT ${esc(p.cesta.catmat)}</span>` : ""}`,
    },
    { label: "Descrição", fn: (p) => esc(p.cesta.descricao.substring(0, 70)) },
    { label: "Unid. fornecimento", fn: (p) => esc(p.cesta.unidade) },
    { label: "UF", fn: (p) => esc(p.cesta.uf || "Todas") },
    { label: "Qtd.", fn: (p) => p.cesta.quantidade.toLocaleString("pt-BR"), right: true },
    { label: "Média unit.", fn: (p) => preco(p, (r) => r.consolidado.porFonte.media), right: true },
    {
      label: "Preço adotado unit.",
      fn: (p) =>
        `<strong>${preco(p, (r) => r.recomendacao.precoFinal)}</strong>${
          p.resultado ? `<br/><span style="color:#666;font-size:9px;">${esc(p.resultado.recomendacao.descricaoMetodo)}</span>` : ""
        }`,
      right: true,
    },
    { label: "Menor unit.", fn: (p) => preco(p, (r) => r.consolidado.porFonte.menor), right: true },
    {
      label: "Valor total",
      fn: (p) => (p.valorTotal === null ? "—" : `<strong>${fmtBRL(p.valorTotal, 2)}</strong>`),
      right: true,
    },
  ]);

  const globais = globaisPorMetodo(processados);

  return `
    <p style="font-size:11px;margin-bottom:8px;">A cesta reúne <strong>${processados.length}</strong> item(ns). Os preços unitários de cada linha são os apurados na data de emissão deste relatório, conforme a metodologia da seção anterior: a média e o menor valor consolidados por fonte, para comparação, e o <strong>preço adotado</strong> pelo método escolhido para o item (indicado abaixo do valor). O <strong>valor total</strong> de cada item é o preço adotado multiplicado pela quantidade demandada; o teto PMVG da CMED prevalece quando o preço de mercado o supera.</p>
    ${linhas}
    <table style="width:100%;border-collapse:collapse;font-size:11px;margin-top:10px;">
      <tr>
        <td style="border:1px solid #ccc;padding:6px 10px;background:#f9fafb;">Valor global se adotada a <strong>média</strong> consolidada por fonte</td>
        <td style="border:1px solid #ccc;padding:6px 10px;text-align:right;">${fmtBRL(globais.media, 2)}</td>
      </tr>
      <tr style="background:#eef2f7;">
        <td style="border:1px solid ${AZUL};padding:8px 10px;font-weight:bold;color:${AZUL};">VALOR GLOBAL ESTIMADO DA CESTA — <strong>preço adotado</strong> de cada item</td>
        <td style="border:1px solid ${AZUL};padding:8px 10px;text-align:right;font-weight:bold;font-size:16px;color:${AZUL};">${fmtBRL(valorGlobal, 2)}</td>
      </tr>
      <tr>
        <td style="border:1px solid #ccc;padding:6px 10px;background:#f9fafb;">Valor global se adotado o <strong>menor valor</strong> consolidado por fonte</td>
        <td style="border:1px solid #ccc;padding:6px 10px;text-align:right;">${fmtBRL(globais.menor, 2)}</td>
      </tr>
    </table>
    <p style="font-size:10px;color:#444;margin-top:6px;">Os três valores globais acima decorrem das mesmas bases e dos mesmos parâmetros de pesquisa; diferem apenas no método de estimativa aplicado sobre os preços coletados. São apresentados para permitir a comparação exigida pelo art. 6º; o método adotado em cada item consta, com a justificativa, do respectivo detalhamento.</p>
    ${
      semPreco > 0
        ? `<p style="font-size:10px;color:#c0392b;margin-top:6px;"><strong>Atenção:</strong> ${semPreco} item(ns) sem preço apurado nas bases consultadas não compõem os valores globais. Recomenda-se juntar orçamento direto de fornecedor (art. 5º, IV) para esses itens.</p>`
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
    <p style="font-size:10px;margin-bottom:4px;"><strong>Método:</strong> ${esc(ROTULO_METODO[r.recomendacao.escolha.metodo].longo)} · <strong>Teto:</strong> ${esc(rotuloRegraTeto(r.recomendacao.escolha.regraTeto, r.recomendacao.escolha.aliquota))}</p>
    <p style="font-size:10px;margin-bottom:6px;"><strong>Justificativa do preço adotado:</strong> ${esc(p.justificativa)}</p>
    ${p.cesta.observacao ? `<p style="font-size:10px;margin-bottom:6px;"><strong>Observação do solicitante:</strong> ${esc(p.cesta.observacao)}</p>` : ""}`;

  const detalhe = `
    ${cabecalho}
    <p style="font-size:11px;margin-bottom:8px;">${linhaCodigo(r)} · Unidade de fornecimento <strong>${esc(r.unidade)}</strong>${r.uf ? ` · UF ${esc(r.uf)}` : ""}</p>
    ${conteudoEspecificacao(r, especificacaoDoItem(r, ""))}
    <div style="margin-top:10px;"><strong style="font-size:11px;">Período da pesquisa e atualização monetária (art. 5º)</strong></div>
    ${conteudoPeriodo(r)}
    ${conteudoAtualizacaoMonetaria(r)}
    <div style="margin-top:10px;"><strong style="font-size:11px;">CMED/ANVISA — teto regulatório por unidade</strong></div>
    ${conteudoCmed(r)}
    <div style="margin-top:10px;"><strong style="font-size:11px;">Compras.gov.br — API, SIASG judicial e base PNCP</strong></div>
    ${conteudoComprasGov(r)}
    <div style="margin-top:10px;"><strong style="font-size:11px;">BPS — Banco de Preços em Saúde</strong></div>
    ${conteudoBps(r)}
    <div style="margin-top:10px;"><strong style="font-size:11px;">Atas de registro de preços</strong></div>
    ${conteudoArp(r)}
    ${
      r.orcamentos.length
        ? `<div style="margin-top:10px;"><strong style="font-size:11px;">Preços informados pelo responsável (art. 5º, II a V)</strong></div>
    ${conteudoPrecosInformados(r)}`
        : ""
    }
    <div style="margin-top:10px;"><strong style="font-size:11px;">Média, mediana e menor valor — por fonte e consolidados (art. 6º)</strong></div>
    ${conteudoAnalise(r, false)}
    ${
      r.descartes.length
        ? `<div style="margin-top:10px;"><strong style="font-size:11px;">Registros desconsiderados e respectivas justificativas</strong></div>
    ${conteudoDescartes(r)}`
        : ""
    }
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
  const totalOrcamentos = processados.reduce((s, p) => s + (p.resultado?.orcamentos.length ?? 0), 0);
  const totalDescartes = processados.reduce((s, p) => s + (p.resultado?.descartes.length ?? 0), 0);

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
      ${
        totalOrcamentos > 0
          ? `<li style="font-size:10px;margin-bottom:3px;">${totalOrcamentos} preço(s) informado(s) pelo responsável (cotação, mídia especializada, nota fiscal ou contratação similar — art. 5º, II a V da IN 65/2021) foram juntados à pesquisa e estão detalhados no item correspondente.</li>`
          : ""
      }
      ${
        totalDescartes > 0
          ? `<li style="font-size:10px;margin-bottom:3px;">${totalDescartes} registro(s) foram desconsiderados por decisão fundamentada do responsável (art. 6º, §§ 1º e 2º). Cada descarte consta do detalhamento do respectivo item, com a justificativa, preservando a rastreabilidade dos valores desconsiderados.</li>`
          : ""
      }
    </ul>
    <p style="font-size:11px;margin-bottom:6px;"><strong>Validade desta pesquisa:</strong> 90 (noventa) dias, conforme art. 5º, §4º da IN SEGES/ME nº 65/2021 — até <strong>${fmtDateLong(validade)}</strong>.</p>
    <p style="font-size:11px;margin-bottom:16px;"><strong>Bases consultadas:</strong> CMED/ANVISA (tabela vigente, preço por unidade de fornecimento), Compras.gov.br (API de dados abertos do Painel de Preços, SIASG/Comprasnet judicial 2002–2021 e base PNCP de contratos 2024–2025, com o link da contratação no PNCP), BPS (API de dados abertos do Ministério da Saúde quando coletado; senão, base histórica 2020–2025) e atas de registro de preços (API de dados abertos).</p>
    ${blocoAssinaturas(meta)}`;

  const corpo = [
    secao(
      1,
      "Identificação do Objeto",
      `<p style="font-size:11px;">O presente relatório tem por objeto a pesquisa de preços para aquisição de <strong>${processados.length} item(ns)</strong> relacionados no quadro-resumo da seção 3, conforme demanda constante no processo identificado acima. Cada item foi pesquisado individualmente pelo respectivo código (CATMAT ou registro ANVISA) e unidade de fornecimento.</p>`
    ),
    secao(
      2,
      "Método de Pesquisa de Preços",
      (() => {
        const comum = escolhaComum(processados);
        return comum
          ? conteudoMetodo(comum.metodo, rotuloRegraTeto(comum.regraTeto, comum.aliquota))
          : conteudoMetodo();
      })()
    ),
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
    const { responsavel, cargo, orgao, processo, limparCesta, escolhas } = parsed.data;

    const cesta = await listarCesta(userId);
    if (cesta.itens.length === 0) {
      return NextResponse.json(
        { error: "A cesta está vazia. Adicione itens antes de gerar o relatório." },
        { status: 400 }
      );
    }

    const geradoEm = new Date();
    const processados = await apurarCesta(cesta.itens, escolhas);
    const html = gerarHTML(processados, { responsavel, cargo, orgao, processo, geradoEm });

    const valorGlobal = processados.reduce((s, p) => s + (p.valorTotal ?? 0), 0);

    if (limparCesta) {
      await db.cestaItem.deleteMany({ where: { userId } });
    } else {
      // Mantém a cesta em dia com os preços que acabaram de sair no relatório
      // e grava no item a escolha e a justificativa feitas na modal (E2).
      for (const p of processados) {
        const rec = p.resultado?.recomendacao;
        const e = escolhas[p.cesta.id];
        await db.cestaItem.updateMany({
          where: { id: p.cesta.id, userId },
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
            escolha: p.resultado?.recomendacao.escolha ?? null,
            escolhaExplicita: escolhaExplicita(escolhas[p.cesta.id]),
            justificativaEditada: !!(escolhas[p.cesta.id]?.justificativa ?? p.cesta.justificativa)?.trim(),
            // Período (com a justificativa da ampliação), IPCA e duplicatas mantidas (D1/D2/P18).
            periodo: p.resultado?.periodo ?? null,
            ipca: p.resultado ? { ligado: p.resultado.ipca.ligado, mesBase: p.resultado.ipca.mesBase } : null,
            duplicidadesRevertidas: p.cesta.duplicidadesRevertidas,
            mediaConsolidada: p.resultado?.recomendacao.mediaConsolidada ?? null,
            menorConsolidado: p.resultado?.recomendacao.menorConsolidado ?? null,
            // Rastreabilidade fora do documento: quem descartou o quê e por quê.
            descartes: (p.resultado?.descartes ?? []).map((d) => ({
              fonte: d.fonte,
              id: d.id,
              preco: d.preco,
              motivo: d.motivo,
            })),
            orcamentos: (p.resultado?.orcamentos ?? []).map((o) => ({
              fornecedor: o.fornecedor,
              valorUnitario: o.valorUnitario,
              considerarNoCalculo: o.considerarNoCalculo,
            })),
          })),
        },
      },
    });

    const nomeArquivo = `pesquisa_preco_cesta_${processados.length}_itens_${geradoEm.toISOString().slice(0, 10)}.html`;
    await registrarRelatorio({
      tipo: "PESQUISA_PRECO",
      parametros: {
        formato: "html",
        cesta: true,
        itens: processados.length,
        valorGlobal,
        processo,
      },
      nomeArquivo,
      tamanhoBytes: Buffer.byteLength(html, "utf8"),
      geradoPorId: userId,
    });
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
