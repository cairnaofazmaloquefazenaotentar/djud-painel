import { ROTULO_FILTRO, filtrosAtivos } from "@/lib/pesquisa-preco-filtros";
import {
  NOME_FONTE_CURADA,
  ORDEM_TIPOS_INFORMADOS,
  TIPOS_PRECO_INFORMADO,
  type OrcamentoFornecedor,
} from "@/lib/pesquisa-preco-curadoria";
import { INFO_FONTE, ORDEM_FONTES, ROTULO_BASE, corrigidoPeloIpca } from "@/lib/pesquisa-preco-fontes";
import { descricaoPeriodo } from "@/lib/pesquisa-preco-periodo";
import {
  ROTULO_METODO,
  rotuloRegraTeto,
  rotuloRegraTetoCurto,
  type TetoCmed,
} from "@/lib/pesquisa-preco-metodo";
import type {
  Estatisticas,
  FonteMercadoResultado,
  RegistroMercado,
  ResultadoPesquisa,
} from "@/lib/pesquisa-preco";

// ─────────────────────────────────────────────────────────────────────────────
// Blocos de HTML do Relatório de Pesquisa de Preços (IN SEGES/ME nº 65/2021).
//
// Compartilhados por dois relatórios:
//   • app/api/relatorios/pesquisa-preco → um item (a pesquisa da tela)
//   • app/api/relatorios/cesta          → vários itens (a cesta do usuário)
//
// A numeração das seções fica com o chamador (`secao`/`subSecao`), porque a
// ordem muda entre os dois documentos: no relatório da cesta o método e as
// referências aparecem uma única vez e o detalhamento por fonte vira
// subseção de cada item.
// ─────────────────────────────────────────────────────────────────────────────

export const AZUL = "#1a3a5c";

// ── Formatação ────────────────────────────────────────────────────────────────

export function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function fmtBRL(v: number | null | undefined, dec = 4): string {
  if (v == null) return "—";
  const [int, d] = v.toFixed(dec).split(".");
  const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${intFmt},${d}`;
}

export function fmtInt(n: number): string {
  return n.toLocaleString("pt-BR");
}

/**
 * Data de calendário (meia-noite UTC: "2026-03-10", data da compra, da
 * proposta) sai como foi gravada; instante (data e hora: emissão, coleta), no
 * fuso de Brasília. Sem isso, o mesmo relatório mudava de dia conforme o fuso
 * do servidor.
 */
function fusoDe(d: Date): string {
  const meiaNoiteUtc =
    d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
  return meiaNoiteUtc ? "UTC" : "America/Sao_Paulo";
}

export function fmtDate(d: Date | string): string {
  const dt = new Date(d);
  return dt.toLocaleDateString("pt-BR", { timeZone: fusoDe(dt) });
}

export function fmtDateLong(d: Date | string): string {
  const dt = new Date(d);
  return dt.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: fusoDe(dt) });
}

/** "2026-09" → "09/2026". */
export function fmtMes(mes: string | null | undefined): string {
  if (!mes) return "—";
  return `${mes.slice(5, 7)}/${mes.slice(0, 4)}`;
}

export function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Validade da pesquisa: 90 dias (art. 5º, §4º da IN 65/2021). */
export function validadeEm(geradoEm: Date): Date {
  const d = new Date(geradoEm);
  d.setDate(d.getDate() + 90);
  return d;
}

// ── Primitivos de layout ──────────────────────────────────────────────────────

export function secao(num: string | number, titulo: string, conteudo: string): string {
  return `
    <div class="section" style="margin-bottom:24px; page-break-inside:avoid;">
      <div class="section-header" style="background:${AZUL}; color:#fff; padding:6px 12px; font-size:12px; font-weight:bold; margin-bottom:8px;">
        ${num}. ${titulo.toUpperCase()}
      </div>
      <div style="padding:0 4px;">${conteudo}</div>
    </div>`;
}

export function subSecao(titulo: string, conteudo: string): string {
  return `
    <div style="margin-bottom:14px;">
      <div style="border-left:3px solid ${AZUL}; background:#eef2f7; padding:4px 8px; font-size:11px; font-weight:bold; color:${AZUL}; margin-bottom:6px;">
        ${titulo}
      </div>
      <div style="padding:0 2px;">${conteudo}</div>
    </div>`;
}

export function estatBox(label: string, valor: string, destaque = false): string {
  return `<div style="flex:1;min-width:100px;border:1px solid ${destaque ? AZUL : "#ddd"};padding:8px;text-align:center;border-radius:4px;background:${destaque ? "#eef2f7" : "#fff"}">
      <div style="font-size:9px;color:#666;margin-bottom:4px;">${label}</div>
      <div style="font-size:${destaque ? "14px" : "12px"};font-weight:bold;color:${destaque ? AZUL : "#333"};">${valor}</div>
    </div>`;
}

export interface Coluna<T> {
  label: string;
  fn: (r: T, i: number) => string;
  right?: boolean;
}

export function tabela<T>(rows: T[], colunas: Coluna<T>[]): string {
  if (!rows.length) {
    return `<p style="color:#666;font-size:11px;font-style:italic;">Nenhum registro na amostra.</p>`;
  }
  return `
      <table style="width:100%;border-collapse:collapse;font-size:10px;">
        <thead>
          <tr style="background:#e8edf2;">
            ${colunas.map((c) => `<th style="border:1px solid #ccc;padding:4px 6px;text-align:${c.right ? "right" : "left"};">${c.label}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r, i) => `
            <tr style="background:${i % 2 === 0 ? "#fff" : "#f9fafb"}">
              ${colunas.map((c) => `<td style="border:1px solid #ccc;padding:4px 6px;text-align:${c.right ? "right" : "left"};">${c.fn(r, i)}</td>`).join("")}
            </tr>`
            )
            .join("")}
        </tbody>
      </table>`;
}

// ── Blocos da pesquisa de preços ──────────────────────────────────────────────

/** "CATMAT 267140" ou "Registro ANVISA … · CATMAT …". */
export function linhaCodigo(resultado: ResultadoPesquisa): string {
  const { item } = resultado;
  return item.tipo === "CATMAT"
    ? `CATMAT ${esc(item.catmat)}`
    : `Registro ANVISA ${esc(item.registro)}${item.catmat ? ` · CATMAT ${esc(item.catmat)}` : " · sem CATMAT associado"}`;
}

/** Especificação informada pelo usuário, ou deduzida do registro ANVISA. */
export function especificacaoDoItem(resultado: ResultadoPesquisa, informada: string): string {
  const { item } = resultado;
  const registroUnico = item.tipo === "REGISTRO" ? item.registros[0] : undefined;
  return (
    informada ||
    (registroUnico ? [registroUnico.produto, registroUnico.apresentacao].filter(Boolean).join(" — ") : "") ||
    "Conforme demanda — ver processo"
  );
}

export function conteudoEspecificacao(resultado: ResultadoPesquisa, especificacao: string): string {
  const { item, unidade, uf } = resultado;
  return `<table style="width:100%;border-collapse:collapse;font-size:11px;">
        <tr><td style="border:1px solid #ccc;padding:4px 8px;width:30%;background:#f5f5f5;font-weight:bold;">Medicamento / Item</td><td style="border:1px solid #ccc;padding:4px 8px;">${esc(item.descricao)}</td></tr>
        <tr><td style="border:1px solid #ccc;padding:4px 8px;background:#f5f5f5;font-weight:bold;">Código CATMAT</td><td style="border:1px solid #ccc;padding:4px 8px;">${item.catmat ? esc(item.catmat) : "Não possui CATMAT associado"}</td></tr>
        <tr><td style="border:1px solid #ccc;padding:4px 8px;background:#f5f5f5;font-weight:bold;">Registro ANVISA</td><td style="border:1px solid #ccc;padding:4px 8px;">${
          item.registro
            ? esc(item.registro)
            : item.registros.length
              ? `${item.registros.length} registro(s) vinculado(s) ao CATMAT na base CMED`
              : "—"
        }</td></tr>
        <tr><td style="border:1px solid #ccc;padding:4px 8px;background:#f5f5f5;font-weight:bold;">Classe / PDM</td><td style="border:1px solid #ccc;padding:4px 8px;">${
          item.codigoClasse ? `${esc(item.codigoClasse)} — ${esc(item.nomeClasse)}` : "—"
        }${item.nomePdm ? ` · PDM ${esc(item.nomePdm)}` : ""}</td></tr>
        <tr><td style="border:1px solid #ccc;padding:4px 8px;background:#f5f5f5;font-weight:bold;">Especificação / Apresentação</td><td style="border:1px solid #ccc;padding:4px 8px;">${esc(especificacao)}</td></tr>
        <tr><td style="border:1px solid #ccc;padding:4px 8px;background:#f5f5f5;font-weight:bold;">Unidade de fornecimento</td><td style="border:1px solid #ccc;padding:4px 8px;">${esc(unidade)}</td></tr>
        ${uf ? `<tr><td style="border:1px solid #ccc;padding:4px 8px;background:#f5f5f5;font-weight:bold;">UF (filtro)</td><td style="border:1px solid #ccc;padding:4px 8px;">${esc(uf)}</td></tr>` : ""}
        ${filtrosAtivos(resultado.filtros)
          .map(
            (c) =>
              `<tr><td style="border:1px solid #ccc;padding:4px 8px;background:#f5f5f5;font-weight:bold;">${esc(ROTULO_FILTRO[c])} (filtro)</td><td style="border:1px solid #ccc;padding:4px 8px;">${esc(resultado.filtros[c])}</td></tr>`
          )
          .join("")}
      </table>`;
}

/**
 * `metodoUnico`/`tetoUnico`: o método e a regra do teto quando valem para o
 * documento inteiro (relatório de um item, ou cesta com a mesma escolha em
 * todos os itens); ausentes, o texto remete ao detalhamento de cada item.
 */
export function conteudoMetodo(
  metodoUnico?: keyof typeof ROTULO_METODO | null,
  tetoUnico?: string | null
): string {
  return `<p style="font-size:11px;margin-bottom:6px;">A pesquisa foi realizada em conformidade com o art. 5º da IN SEGES/ME nº 65/2021, a partir do código CATMAT e da unidade de fornecimento do item, consultando as seguintes bases de dados oficiais:</p>
      <ul style="padding-left:18px;font-size:11px;line-height:1.8;">
        <li><strong>CMED/ANVISA</strong> — Câmara de Regulação do Mercado de Medicamentos: preço máximo de venda ao governo (PMVG) como teto regulatório obrigatório, convertido da embalagem para a unidade de fornecimento pela quantidade por embalagem (Qt_Embal) do registro ANVISA.</li>
        <li><strong>Compras.gov.br</strong> (inciso I): preços praticados nas compras públicas por código CATMAT, reunindo três bases — a API de dados abertos do Painel de Preços (compras dos últimos 36 meses, com o número da compra, a UASG e o item), o SIASG/Comprasnet judicial (2002–2021) e a base de contratos do PNCP carregada no painel (2024–2025). O PNCP é também o portal da contratação de cada compra: o link vai em cada registro.</li>
        <li><strong>BPS</strong> — Banco de Preços em Saúde (Ministério da Saúde): compras hospitalares públicas por código CATMAT, coletadas da API de dados abertos (com nº do processo, da ata e registro ANVISA) ou, sem coleta, da base histórica carregada no painel (2020–2025).</li>
        <li><strong>Atas de registro de preços</strong> (inciso II): itens de atas com vigência iniciada nos últimos 12 meses, por código CATMAT, coletados da API de dados abertos, com o link da ata no PNCP.</li>
        <li><strong>Preços informados pelo responsável</strong> (art. 5º, II a V) — contratação similar fora das bases, mídia especializada ou sítio eletrônico, cotação com fornecedor e nota fiscal eletrônica, quando juntados ao processo. Fonte especialmente relevante em medicamentos importados, cujas aquisições nem sempre têm contratações públicas comparáveis nas bases acima.</li>
      </ul>
      <p style="font-size:11px;margin-top:6px;">Cada fonte é consultada no período do art. 5º — bases e contratações similares, 12 meses antes da data de referência, salvo ampliação justificada; mídia e cotação, 6 meses — e, por padrão, os preços dos incisos I e II são atualizados pelo IPCA. A data de referência, o período e a atualização aplicados constam da seção própria.</p>
      <p style="font-size:11px;margin-top:6px;">Para cada fonte, aplicou-se o método de remoção de outliers pelo intervalo interquartil (IQR) e apuraram-se os três métodos admitidos pelo art. 6º da IN 65/2021 — média, mediana e menor valor —, apresentados também de forma consolidada. ${
        metodoUnico
          ? `O preço de referência adotado é o seguinte: <strong>${esc(ROTULO_METODO[metodoUnico].longo.toLowerCase())}</strong>${
              metodoUnico === "mediana_medianas"
                ? ", critério que impede que a base com mais registros determine sozinha o resultado"
                : ""
            }.`
          : "O método de cada item consta do respectivo detalhamento."
      } Quando o preço de mercado supera o PMVG unitário vigente, este último é adotado como teto obrigatório (Lei nº 10.742/2003, art. 3º, §2º)${
        tetoUnico ? `, pela regra do <strong>${esc(tetoUnico)}</strong>` : ""
      }.</p>`;
}

/** "EMS — Genérico" / "—" quando a base não registra marca nem fabricante. */
export function marcaFabricante(r: {
  marca: string | null;
  fabricante: string | null;
}): string {
  const partes = [r.marca, r.fabricante].filter(Boolean) as string[];
  if (!partes.length) return "—";
  // Marca e fabricante iguais viram uma coisa só (o SIASG repete os dois).
  const unicos = Array.from(new Set(partes.map((p) => p.trim().toUpperCase())));
  return unicos.join(" / ");
}

/**
 * Colunas da amostra de mercado. A unidade de fornecimento não vira coluna:
 * ela é filtro obrigatório da pesquisa, então é a mesma em todas as linhas.
 * Empresa vencedora e marca/fabricante são obrigatórias no relatório.
 */
/** "Pregão 90041/2026 · UASG 120195 · item 122 · PNCP ↗" (obs. 7 e 8 da DLOG). */
export function contratacaoHtml(r: RegistroMercado): string {
  const c = r.contratacao;
  if (!c) return "—";
  const partes = [
    [c.tipo, c.numero].filter(Boolean).join(" "),
    c.uasg ? `UASG ${c.uasg}` : null,
    c.numeroItem ? `item ${c.numeroItem}` : null,
    c.processo && !c.numero?.includes(c.processo) ? `proc. ${c.processo}` : null,
    c.referencia,
    c.situacao,
  ].filter(Boolean) as string[];
  const link = c.url ? ` <a href="${esc(c.url)}" style="color:#1a56db;">PNCP&nbsp;↗</a>` : "";
  const texto = partes.length ? esc(partes.join(" · ")) : esc(c.indisponivel ?? "—");
  return `${texto}${link}`;
}

function colunasMercado(ultima: Coluna<RegistroMercado>): Coluna<RegistroMercado>[] {
  return [
    { label: "Descrição", fn: (r) => esc((r.descricao || "").substring(0, 38)) },
    { label: "Contratação de referência", fn: contratacaoHtml },
    {
      // Um valor descartado pelo IQR continua na amostra impressa, mas riscado:
      // sem a marca, quem lê vê um preço dez vezes menor que a mediana ao lado
      // dela e não tem como saber que ele ficou fora do cálculo.
      label: "Preço",
      fn: (r) => {
        const preco = r.outlierIqr
          ? `<span style="text-decoration:line-through;color:#c0392b;">${fmtBRL(r.preco)}</span> <sup>*</sup>`
          : fmtBRL(r.preco);
        // Com o IPCA, o publicado (nominal) aparece sempre ao lado (P10).
        return r.fatorIpca != null && r.fatorIpca !== 1 && r.precoNominal != null
          ? `${preco}<br/><span style="font-size:8px;color:#666;">${fmtBRL(r.precoNominal)} × ${r.fatorIpca
              .toFixed(4)
              .replace(".", ",")}</span>`
          : preco;
      },
      right: true,
    },
    { label: "Data", fn: (r) => (r.data ? fmtDate(r.data) : "—") },
    { label: "UF", fn: (r) => esc(r.uf || "—") },
    { label: "Empresa vencedora", fn: (r) => esc((r.fornecedor || "—").substring(0, 32)) },
    { label: "Marca / Fabricante", fn: (r) => esc(marcaFabricante(r).substring(0, 28)) },
    ultima,
  ];
}

/** Média, mediana, menor e maior — os três métodos do art. 6º mais o teto da amostra. */
function boxesEstatisticas(e: Estatisticas): string {
  return `<div style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap;">
        ${estatBox("Média", fmtBRL(e.media))}
        ${estatBox("Mediana", fmtBRL(e.mediana), true)}
        ${estatBox("Menor valor", fmtBRL(e.menor))}
        ${estatBox("Maior valor", fmtBRL(e.maior))}
        ${estatBox("Preços no cálculo", String(e.n))}
      </div>`;
}

/**
 * Janela do art. 5º aplicada à fonte (D1): " Período considerado: 12 meses (de
 * 15/10/2025 a 15/10/2026), art. 5º, inciso I. Fora do período: 3 registro(s),
 * o mais recente em 02/09/2025 — não entram na apuração."
 */
export function textoPeriodoFonte(f: FonteMercadoResultado): string {
  const p = f.periodo;
  if (!p) return "";
  const janela = p.personalizado && p.inicio
    ? `intervalo de ${fmtDate(p.inicio)} a ${fmtDate(p.fim)}`
    : p.inicio
      ? `${p.meses} meses (de ${fmtDate(p.inicio)} a ${fmtDate(p.fim)})`
      : `todo o período disponível até ${fmtDate(p.fim)}`;
  // Base: o que está fora da janela nem é lido. Preço informado: fica listado e
  // sai do cálculo, salvo justificativa do responsável (coluna "No cálculo").
  const fora = p.foraDoPeriodo
    ? ` Fora do período: <strong>${fmtInt(p.foraDoPeriodo)}</strong> ${
        f.origemDados === "INFORMADO" ? "preço(s)" : "registro(s)"
      }${p.maisRecenteFora ? `, o mais recente em ${fmtDate(p.maisRecenteFora)}` : ""} — ${
        f.origemDados === "INFORMADO"
          ? "fora do cálculo, salvo justificativa do responsável (ver a coluna “No cálculo”)."
          : "não entram na apuração."
      }`
    : "";
  return ` Período considerado: ${janela}, art. 5º, inciso ${p.inciso}.${fora}`;
}

function conteudoMercado(
  fonte: FonteMercadoResultado,
  vazio: string,
  intro: (f: FonteMercadoResultado) => string,
  ultima: Coluna<RegistroMercado>
): string {
  if (fonte.filtrosNaoSuportados.length > 0) {
    const campos = fonte.filtrosNaoSuportados.map((c) => ROTULO_FILTRO[c].toLowerCase()).join(" nem ");
    return `<p style="color:#666;font-style:italic;font-size:11px;">Esta base não registra ${esc(campos)}. Com esse filtro ativo, a fonte foi excluída da apuração do preço de referência.</p>`;
  }
  if (fonte.total === 0) {
    // Vazia na janela, mas com registros fora dela: diz quantos e de quando
    // (art. 5º, §1º — priorizar os incisos I e II e justificar).
    return `<p style="color:#666;font-style:italic;font-size:11px;">${vazio}${textoPeriodoFonte(fonte)}</p>`;
  }
  const considerados = fonte.registros.filter((r) => r.excluidoPor === null);
  const exibidos = considerados.slice(0, 10);
  return `
      <p style="font-size:11px;margin-bottom:8px;">${intro(fonte)}${textoPeriodoFonte(fonte)} Analisada amostra de <strong>${fonte.amostra}</strong> registros mais recentes do período. ${
        fonte.outliersRemovidos > 0
          ? `Removidos <strong>${fonte.outliersRemovidos}</strong> outliers pelo método IQR.`
          : "Nenhum outlier identificado."
      }${
        fonte.excluidosManualmente > 0
          ? ` Desconsiderados <strong>${fonte.excluidosManualmente}</strong> registro(s) por decisão fundamentada — ver a seção de registros desconsiderados.`
          : ""
      }</p>
      ${boxesEstatisticas(fonte.estatisticas)}
      ${tabela(exibidos, colunasMercado(ultima))}
      ${
        exibidos.some((r) => r.outlierIqr)
          ? `<p style="font-size:9px;color:#666;margin-top:3px;"><sup>*</sup> Valor riscado: descartado do cálculo da média, da mediana e do menor valor por estar fora do intervalo interquartil (Q1−1,5×IQR a Q3+1,5×IQR). Permanece listado para rastreabilidade.</p>`
          : ""
      }`;
}

export function conteudoCmed(resultado: ResultadoPesquisa): string {
  const { item, unidade, resultados } = resultado;
  const cmed = resultados.cmed;
  if (cmed.total === 0) {
    return `<p style="color:#c0392b;font-style:italic;font-size:11px;">Nenhum registro ANVISA com preço CMED vigente para este código na unidade de fornecimento selecionada. Não há preço-teto regulado pela ANVISA para este item.</p>`;
  }
  const capAplica = cmed.registros.some((r) => r.cap);
  const considerados = cmed.registros.filter((r) => r.excluidoPor === null);
  return `
      <p style="font-size:11px;margin-bottom:8px;">Foram encontrados <strong>${cmed.total}</strong> registro(s) ANVISA com preço na tabela CMED vigente (Câmara de Regulação do Mercado de Medicamentos — ANVISA) para ${item.tipo === "CATMAT" ? `o CATMAT ${esc(item.catmat)}` : `o registro ${esc(item.registro)}`}, na unidade de fornecimento <strong>${esc(unidade)}</strong>. O PMVG da tabela CMED é expresso por embalagem; o valor unitário abaixo corresponde ao PMVG dividido pela quantidade de unidades por embalagem (Qt_Embal).${
        cmed.semQtEmbalagem > 0
          ? ` <strong>${cmed.semQtEmbalagem}</strong> registro(s) sem quantidade por embalagem informada aparecem apenas com o preço por embalagem e não compõem o teto.`
          : ""
      }${
        cmed.excluidosManualmente > 0
          ? ` <strong>${cmed.excluidosManualmente}</strong> registro(s) desconsiderado(s) por decisão fundamentada não compõem o teto — ver a seção de registros desconsiderados.`
          : ""
      }</p>
      <div style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap;">
        ${estatBox("PMVG unitário mínimo (sem impostos)", fmtBRL(cmed.pmvgUnitMin), resultado.recomendacao.escolha.regraTeto === "menor_pmvg_sem_impostos")}
        ${estatBox(
          `PMVG ${resultado.recomendacao.escolha.aliquota}% do medicamento de referência (unit.)`,
          fmtBRL(resultado.recomendacao.tetos.referencia?.valorUnitario ?? null),
          resultado.recomendacao.escolha.regraTeto === "pmvg_referencia"
        )}
        ${estatBox("PMVG unitário máximo (sem impostos)", fmtBRL(cmed.pmvgUnitMax))}
        ${capAplica ? estatBox("Desconto CAP obrigatório", "21,53% sobre PF", true) : ""}
      </div>
      <p style="font-size:10px;color:#444;margin-bottom:8px;">Teto adotado neste item: <strong>${esc(
        rotuloRegraTeto(resultado.recomendacao.escolha.regraTeto, resultado.recomendacao.escolha.aliquota)
      )}</strong>${descricaoTeto(resultado.recomendacao.teto)}. O outro teto aparece acima para comparação (destaque = regra adotada).</p>
      ${tabela(considerados.slice(0, 10), [
        { label: "Registro", fn: (r) => esc(r.registro) },
        { label: "Produto / Apresentação", fn: (r) => `${esc(r.produto || "—")} / ${esc(r.apresentacao || "—")}` },
        { label: "Laboratório", fn: (r) => esc((r.laboratorio || "—").substring(0, 30)) },
        { label: "Qt/emb.", fn: (r) => (r.qtEmbalagem ? String(r.qtEmbalagem) : "—"), right: true },
        { label: "PMVG emb.", fn: (r) => fmtBRL(r.pmvgEmbalagem), right: true },
        { label: "PMVG unit.", fn: (r) => `<strong>${fmtBRL(r.pmvgUnitario)}</strong>`, right: true },
        { label: "PF 0% unit.", fn: (r) => fmtBRL(r.pfUnitario), right: true },
        { label: "CAP", fn: (r) => (r.cap ? "Sim" : "Não") },
      ])}`;
}

export function conteudoBps(resultado: ResultadoPesquisa): string {
  const { item, unidade, uf, resultados } = resultado;
  const daApi = resultados.bps.origemDados === "API";
  return conteudoMercado(
    resultados.bps,
    "Nenhum registro encontrado no BPS para este código e unidade de fornecimento.",
    (f) =>
      `Foram identificados <strong>${fmtInt(f.total)}</strong> registros no BPS (${
        daApi ? "API de dados abertos do Ministério da Saúde, compras dos últimos 36 meses" : "base histórica carregada no painel, anos 2020–2025"
      }) para o CATMAT ${esc(item.catmat)} na unidade <strong>${esc(unidade)}</strong>${uf ? `, UF ${esc(uf)}` : ""}.`,
    { label: "Instituição", fn: (r) => esc((r.orgao || "—").substring(0, 40)) }
  );
}

/** Data da coleta da API, para o texto da fonte. */
function textoColeta(f: FonteMercadoResultado): string {
  if (!f.coleta?.coletadoEm) return "";
  return ` Dados coletados em ${fmtDate(f.coleta.coletadoEm)}${f.coleta.valida ? "" : " (há mais de 7 dias)"}.`;
}

/** Quanto veio de cada base da fonte Compras.gov.br (API, SIASG judicial, base PNCP). */
function textoComposicao(f: FonteMercadoResultado): string {
  if (!f.composicao?.length) return "";
  const partes = f.composicao.map(
    (c) =>
      `${ROTULO_BASE[c.base]}: ${fmtInt(c.total)}${c.semCampo.length ? " (fora do filtro adicional)" : ""}`
  );
  return ` Composição: ${partes.join("; ")}.`;
}

/**
 * Compras.gov.br: uma fonte, três bases (pedido da DLOG) — a API de dados
 * abertos (Painel de Preços), o SIASG judicial e a base PNCP carregados no
 * painel. O PNCP não é fonte de preço à parte: é onde a contratação de cada
 * compra é publicada, e o link vai em cada registro.
 */
export function conteudoComprasGov(resultado: ResultadoPesquisa): string {
  const { item, unidade, uf, resultados } = resultado;
  const fonte = resultados.comprasgov;
  if (!fonte) return `<p style="color:#666;font-style:italic;font-size:11px;">Fonte não consultada nesta pesquisa.</p>`;
  const pncp = `<p style="font-size:10px;color:#444;margin-top:4px;"><strong>PNCP:</strong> o Portal Nacional de Contratações Públicas não entra como fonte de preço separada — é onde a contratação de cada compra do Compras.gov.br é publicada. A coluna "Contratação de referência" traz o nº da compra, a UASG, o item e o link da contratação no PNCP (quando publicada).</p>`;
  return `${conteudoMercado(
    fonte,
    `Nenhuma compra no Compras.gov.br para este código e unidade de fornecimento${fonte.coleta?.coletadoEm ? "" : " — o CATMAT ainda não foi coletado da API de dados abertos"}.${textoComposicao(fonte)}`,
    (f) =>
      `Foram identificadas <strong>${fmtInt(f.total)}</strong> compras no Compras.gov.br para o CATMAT ${esc(item.catmat)} na unidade <strong>${esc(unidade)}</strong>${uf ? `, UF ${esc(uf)}` : ""}.${textoComposicao(f)}${textoColeta(f)}`,
    { label: "UASG / Órgão", fn: (r) => esc((r.contratacao?.nomeUasg || r.orgao || "—").substring(0, 40)) }
  )}${pncp}`;
}

export function conteudoArp(resultado: ResultadoPesquisa): string {
  const { item, unidade, resultados } = resultado;
  const fonte = resultados.arp;
  if (!fonte) return `<p style="color:#666;font-style:italic;font-size:11px;">Fonte não consultada nesta pesquisa.</p>`;
  return conteudoMercado(
    fonte,
    "Nenhum item de ata de registro de preços com vigência iniciada nos últimos 12 meses para este código e unidade de fornecimento.",
    (f) =>
      `Foram identificados <strong>${fmtInt(f.total)}</strong> itens de atas de registro de preços (vigência iniciada nos últimos 12 meses) para o CATMAT ${esc(item.catmat)} na unidade <strong>${esc(unidade)}</strong>.${textoColeta(f)}`,
    { label: "Gerenciadora", fn: (r) => esc((r.contratacao?.nomeUasg || r.orgao || "—").substring(0, 40)) }
  );
}

/** ": REVOLADE (reg. 1006811320035), Novartis — R$ 4.094,06 ÷ 14". */
export function descricaoTeto(t: TetoCmed | null): string {
  if (!t) return " (não há PMVG vigente para formar o teto)";
  return ` — ${esc(t.produto)} (reg. ${esc(t.registro)})${t.laboratorio ? `, ${esc(t.laboratorio)}` : ""}: ${fmtBRL(
    t.valorEmbalagem,
    2
  )} ÷ ${t.qtEmbalagem} = ${fmtBRL(t.valorUnitario)} por unidade`;
}

/** true quando o preço de mercado ficou acima do teto PMVG e o teto prevaleceu. */
export function pmvgFoiAplicado(resultado: ResultadoPesquisa): boolean {
  const { limitePmvg, precoReferencia } = resultado.recomendacao;
  return limitePmvg !== null && precoReferencia !== null && precoReferencia > limitePmvg;
}

const th = (label: string, right = false) =>
  `<th style="border:1px solid #ccc;padding:5px 6px;text-align:${right ? "right" : "left"};">${label}</th>`;
const td = (valor: string, right = false, extra = "") =>
  `<td style="border:1px solid #ccc;padding:5px 6px;text-align:${right ? "right" : "left"};${extra}">${valor}</td>`;

/**
 * Quadro do art. 6º: média, mediana e menor valor de cada fonte e, embaixo, os
 * dois consolidados. A explicação do que é cada consolidado vai junto — sem
 * ela, dois números diferentes para "o preço" no mesmo documento confundem
 * quem instrui o processo.
 */
export function conteudoAnalise(resultado: ResultadoPesquisa, comMetodologia = true): string {
  const { recomendacao, consolidado } = resultado;
  const linhas = consolidado.fontes;
  const pmvgAplicado = pmvgFoiAplicado(resultado);
  const { porFonte, porRegistro } = consolidado;
  const metodo = recomendacao.escolha.metodo;
  const porFonteAdotado = metodo === "mediana_medianas";

  const linhaConsolidada = (
    rotulo: string,
    detalhe: string,
    e: Estatisticas,
    destaque: boolean
  ) => `
        <tr style="background:${destaque ? "#eef2f7" : "#f4f6f9"};">
          ${td(
            `<strong>${rotulo}</strong><br/><span style="font-size:9px;color:#555;font-weight:normal;">${detalhe}</span>`
          )}
          ${td(String(e.n), true)}
          ${td(fmtBRL(e.media), true, destaque ? "font-weight:bold;" : "")}
          ${td(
            fmtBRL(e.mediana),
            true,
            destaque ? `font-weight:bold;color:${AZUL};font-size:13px;` : "font-weight:bold;"
          )}
          ${td(fmtBRL(e.menor), true, destaque ? "font-weight:bold;" : "")}
        </tr>`;

  return `
    ${
      comMetodologia
        ? `<p style="font-size:11px;margin-bottom:10px;">A metodologia adotada segue o disposto nos arts. 5º e 6º da IN SEGES/ME nº 65/2021: coleta de preços em fontes oficiais pelo código CATMAT e unidade de fornecimento, desconsideração de valores inexequíveis ou excessivamente elevados pelo método do intervalo interquartil (IQR: valores fora de Q1−1,5×IQR ou Q3+1,5×IQR são descartados) e apuração, para cada fonte, dos três métodos admitidos pelo art. 6º — <strong>média</strong>, <strong>mediana</strong> e <strong>menor valor</strong>.</p>`
        : ""
    }
    <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:8px;">
      <thead>
        <tr style="background:#e8edf2;">
          ${th("Fonte")}
          ${th("Preços no cálculo", true)}
          ${th("Média", true)}
          ${th("Mediana", true)}
          ${th("Menor valor", true)}
        </tr>
      </thead>
      <tbody>
        ${linhas
          .map(
            (f, i) => `
          <tr style="background:${i % 2 === 0 ? "#fff" : "#f9fafb"}">
            ${td(esc(f.nome))}
            ${td(String(f.estatisticas.n), true)}
            ${td(fmtBRL(f.estatisticas.media), true)}
            ${td(fmtBRL(f.estatisticas.mediana), true, "font-weight:bold;")}
            ${td(fmtBRL(f.estatisticas.menor), true)}
          </tr>`
          )
          .join("")}
        ${
          linhas.length === 0
            ? `<tr>${td('<span style="color:#c0392b;font-style:italic;">Nenhuma fonte apurou preço para este item e unidade de fornecimento.</span>')}<td colspan="4" style="border:1px solid #ccc;"></td></tr>`
            : ""
        }
        ${linhaConsolidada(
          "CONSOLIDADO POR FONTE",
          `cada fonte pesa igual — cálculo sobre as ${porFonte.n} mediana(s) apurada(s) acima`,
          porFonte,
          porFonteAdotado
        )}
        ${linhaConsolidada(
          "CONSOLIDADO POR REGISTRO",
          "cada compra pesa igual — todos os registros depurados reunidos num conjunto único",
          porRegistro,
          !porFonteAdotado
        )}
      </tbody>
    </table>
    <p style="font-size:10px;color:#444;margin-bottom:12px;">
      <strong>Como ler os consolidados.</strong> O <strong>consolidado por fonte</strong> trata cada base como um voto: as estatísticas incidem sobre as medianas apuradas em cada fonte, de modo que uma base com milhares de registros não sobrepuja outra com poucos. O <strong>consolidado por registro</strong> reúne todos os registros depurados num conjunto único, em que cada compra pesa igual; nele, a base mais numerosa domina o resultado. ${
        porFonteAdotado
          ? `O preço adotado sai do consolidado por fonte — a <strong>mediana das medianas, ${fmtBRL(recomendacao.precoReferencia)}</strong> —, e o consolidado por registro serve de contraprova da ordem de grandeza.`
          : `Neste item, o preço adotado sai do consolidado por registro — <strong>${esc(ROTULO_METODO[metodo].longo.toLowerCase())}, ${fmtBRL(recomendacao.precoReferencia)}</strong> —, e o consolidado por fonte serve de contraprova.`
      } Os três métodos do art. 6º estão apresentados em ambos.
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:12px;">
      <tbody>
        <tr style="background:#eef2f7;">
          ${td(
            `<strong>Preço de referência adotado</strong> — ${esc(ROTULO_METODO[metodo].longo.toLowerCase())} (art. 6º)`
          )}
          ${td(
            `<strong style="color:${AZUL};font-size:13px;">${fmtBRL(recomendacao.precoReferencia)}</strong>`,
            true
          )}
        </tr>
        ${
          pmvgAplicado
            ? `
        <tr style="background:#fef3cd;">
          ${td(
            `⚠ Preço de mercado superior ao teto CMED — aplicado o ${esc(
              rotuloRegraTetoCurto(recomendacao.escolha.regraTeto, recomendacao.escolha.aliquota)
            )} ÷ Qt_Embal como teto (art. 3º, §2º, Lei nº 10.742/2003)`
          )}
          ${td(`<strong style="color:#c0392b;">${fmtBRL(recomendacao.limitePmvg)}</strong>`, true)}
        </tr>`
            : ""
        }
        ${
          recomendacao.precoReferencia === null && recomendacao.limitePmvg !== null
            ? `
        <tr style="background:#fef3cd;">
          ${td(
            `Sem preço apurado nas fontes consultadas — adotado o teto CMED (${esc(
              rotuloRegraTetoCurto(recomendacao.escolha.regraTeto, recomendacao.escolha.aliquota)
            )} por unidade)`
          )}
          ${td(`<strong style="color:#c0392b;">${fmtBRL(recomendacao.limitePmvg)}</strong>`, true)}
        </tr>`
            : ""
        }
      </tbody>
    </table>
    ${
      linhas.length < 3
        ? `<p style="font-size:10px;color:#c0392b;"><strong>Atenção:</strong> Apenas ${linhas.length} fonte(s) com dados disponíveis. O art. 5º, §3º da IN 65/2021 recomenda consulta a no mínimo 3 fontes. Recomenda-se complementar a pesquisa com orçamento direto de fornecedor (art. 5º, IV).</p>`
        : ""
    }`;
}

// ── Orçamentos diretos de fornecedor (art. 5º, IV) ───────────────────────────

/** Situação de um preço informado no cálculo: considerado, fora do período justificado ou fora. */
function situacaoInformado(o: OrcamentoFornecedor, resultado: ResultadoPesquisa): string {
  const fonte = TIPOS_PRECO_INFORMADO[o.tipo ?? "IV"].fonte;
  const descarte = resultado.descartes.find((d) => d.fonte === fonte && d.id === o.id);
  if (descarte) return `<span style="color:#c0392b;">Não — ${esc(descarte.motivo)}</span>`;
  const per = resultado.resultados[fonte as keyof ResultadoPesquisa["resultados"]] as FonteMercadoResultado | null | undefined;
  const dia = o.dataOrcamento.slice(0, 10);
  const fora = per?.periodo && ((per.periodo.inicio !== null && dia < per.periodo.inicio) || dia > per.periodo.fim);
  if (fora && o.justificativaForaPeriodo) {
    return `Sim — fora do período do inciso, mantido com justificativa: ${esc(o.justificativaForaPeriodo)}`;
  }
  return "Sim";
}

/** Identificação do documento de cada tipo: proposta, página consultada, NF-e ou contrato. */
function identificacaoInformado(o: OrcamentoFornecedor): string {
  const partes: string[] = [];
  if (o.documento) partes.push(esc(o.documento));
  if (o.chaveNfe) partes.push(`chave NF-e ${esc(o.chaveNfe)}`);
  if (o.url) {
    partes.push(
      `<a href="${esc(o.url)}" style="color:#1a56db;word-break:break-all;">${esc(o.url.substring(0, 60))}</a>${
        o.acessadoEm ? ` (acesso em ${esc(new Date(o.acessadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }))})` : ""
      }`
    );
  }
  return partes.length ? partes.join("<br/>") : "—";
}

/**
 * Preços informados pelo responsável (P13): cotação com fornecedor (IV), mídia
 * especializada ou sítio (III), nota fiscal (V) e contratação similar fora das
 * bases (II). Cada tipo é uma fonte própria no consolidado; nenhum passa por
 * IQR; fora da janela do seu inciso sai do cálculo, salvo justificativa.
 */
export function conteudoPrecosInformados(resultado: ResultadoPesquisa): string {
  const { orcamentos, unidade } = resultado;
  if (!orcamentos.length) return "";
  const considerados = orcamentos.filter((o) => situacaoInformado(o, resultado).startsWith("Sim")).length;

  const grupos = ORDEM_TIPOS_INFORMADOS.map((tipo) => {
    const doTipo = orcamentos.filter((o) => (o.tipo ?? "IV") === tipo);
    if (!doTipo.length) return "";
    const { fonte, rotulo } = TIPOS_PRECO_INFORMADO[tipo];
    const dados = resultado.resultados[fonte as keyof ResultadoPesquisa["resultados"]] as
      | FonteMercadoResultado
      | null
      | undefined;
    const registro = (id: string) => dados?.registros.find((r) => r.id === id);
    return `
    <div style="margin-top:8px;"><strong style="font-size:10px;">${esc(rotulo)}</strong>${
      dados ? `<span style="font-size:10px;color:#444;">${textoPeriodoFonte(dados)}</span>` : ""
    }</div>
    ${tabela(doTipo, [
      { label: tipo === "III" ? "Fonte / Fornecedor" : "Fornecedor", fn: (o) => esc(o.fornecedor.substring(0, 38)) },
      { label: "CNPJ", fn: (o) => esc(o.cnpj || "—") },
      { label: "Marca / Fabricante", fn: (o) => esc(marcaFabricante(o).substring(0, 30)) },
      {
        label: `Valor por ${unidade}`,
        fn: (o) => {
          const r = registro(o.id);
          // A contratação similar (II) é atualizada pelo IPCA como as bases.
          return r && r.fatorIpca != null && r.fatorIpca !== 1
            ? `<strong>${fmtBRL(r.preco)}</strong><br/><span style="font-size:8px;color:#666;">${fmtBRL(o.valorUnitario)} × ${r.fatorIpca
                .toFixed(4)
                .replace(".", ",")}</span>`
            : `<strong>${fmtBRL(o.valorUnitario)}</strong>`;
        },
        right: true,
      },
      { label: tipo === "V" ? "Emissão" : "Data", fn: (o) => fmtDate(o.dataOrcamento) },
      ...(tipo === "IV" ? [{ label: "Validade", fn: (o: OrcamentoFornecedor) => (o.validade ? fmtDate(o.validade) : "—") }] : []),
      { label: TIPOS_PRECO_INFORMADO[tipo].documento, fn: identificacaoInformado },
      { label: "No cálculo", fn: (o) => situacaoInformado(o, resultado) },
    ])}`;
  }).join("");

  return `
    <p style="font-size:11px;margin-bottom:8px;">Foram juntados ao processo <strong>${orcamentos.length}</strong> preço(s) informado(s) pelo responsável pela pesquisa (art. 5º, incisos II a V da IN SEGES/ME nº 65/2021). ${
      considerados > 0
        ? `<strong>${considerados}</strong> compõe(m) a apuração do preço de referência — cada tipo como uma fonte própria no consolidado; os demais permanecem registrados apenas para instrução do processo, com o motivo.`
        : "Nenhum foi considerado no cálculo do preço de referência — todos constam apenas para instrução do processo, com o motivo."
    } Estes preços não passam pela remoção automática de outliers (IQR): foram selecionados pelo responsável, e descartá-los automaticamente contrariaria a própria juntada. Janelas do art. 5º: contratação similar (II) e nota fiscal (V), 12 meses; mídia especializada (III) e cotação com fornecedor (IV), 6 meses — fora delas, o preço sai do cálculo, salvo justificativa.</p>
    ${grupos}
    ${
      orcamentos.some((o) => o.observacao)
        ? `<ul style="margin-top:6px;padding-left:18px;">${orcamentos
            .filter((o) => o.observacao)
            .map(
              (o) =>
                `<li style="font-size:10px;margin-bottom:2px;"><strong>${esc(o.fornecedor)}:</strong> ${esc(o.observacao)}</li>`
            )
            .join("")}</ul>`
        : ""
    }`;
}

// ── Período e atualização monetária (D1/D2) ──────────────────────────────────

/** Data de referência, período das bases e janelas dos preços informados (D1). */
export function conteudoPeriodo(resultado: ResultadoPesquisa): string {
  const p = resultado.periodo;
  const vazias = ORDEM_FONTES.filter((f) => !INFO_FONTE[f].informado).flatMap((f) => {
    const dados = resultado.resultados[f as keyof ResultadoPesquisa["resultados"]] as
      | FonteMercadoResultado
      | null
      | undefined;
    return dados && dados.total === 0 && (dados.periodo?.foraDoPeriodo ?? 0) > 0 ? [INFO_FONTE[f].nome] : [];
  });
  return `<p style="font-size:11px;margin-bottom:6px;">${esc(descricaoPeriodo(p))}</p>
    <p style="font-size:10px;color:#444;margin-bottom:6px;">A janela de cada fonte e os registros que ficaram fora dela constam do resultado da respectiva fonte. Não há ampliação automática: ampliar o período das bases exige justificativa do responsável, impressa acima.</p>${
      vazias.length
        ? `<p style="font-size:10px;color:#c0392b;margin-bottom:6px;">Sem preço no período, mas com registros mais antigos: ${esc(vazias.join(", "))}. Art. 5º, §1º: priorizam-se os incisos I e II; a ausência de preços no período deve ser considerada na justificativa do preço adotado.</p>`
        : ""
    }`;
}

/**
 * Atualização monetária (D2): mês-base, convenção, fontes corrigidas e o
 * intervalo dos fatores. O preço publicado aparece ao lado do atualizado em
 * cada registro; o teto CMED nunca é corrigido.
 */
export function conteudoAtualizacaoMonetaria(resultado: ResultadoPesquisa): string {
  const { ipca } = resultado;
  if (!ipca.pedido) {
    return `<p style="font-size:11px;">Atualização monetária não aplicada por opção do responsável: os preços estão em valores nominais, como publicados nas bases.</p>`;
  }
  if (!ipca.ligado || !ipca.mesBase) {
    return `<p style="font-size:11px;color:#c0392b;">Atualização pelo IPCA pedida, mas a tabela de números-índices não estava disponível na emissão: os preços estão em valores nominais, como publicados.</p>`;
  }
  const linhas = ORDEM_FONTES.filter(corrigidoPeloIpca).flatMap((f) => {
    const dados = resultado.resultados[f as keyof ResultadoPesquisa["resultados"]] as
      | FonteMercadoResultado
      | null
      | undefined;
    const corrigidos = (dados?.registros ?? []).filter((r) => r.fatorIpca != null && r.fatorIpca !== 1);
    if (!dados || !dados.registros.length) return [];
    const fatores = corrigidos.map((r) => r.fatorIpca as number);
    const meses = dados.registros.map((r) => r.mesIndice).filter(Boolean) as string[];
    return [
      {
        fonte: INFO_FONTE[f].nome,
        registros: dados.registros.length,
        corrigidos: corrigidos.length,
        menor: fatores.length ? Math.min(...fatores) : null,
        maior: fatores.length ? Math.max(...fatores) : null,
        maisAntigo: meses.length ? meses.reduce((a, b) => (a < b ? a : b)) : null,
      },
    ];
  });
  const fator = (v: number | null) => (v === null ? "—" : v.toFixed(4).replace(".", ","));
  return `<p style="font-size:11px;margin-bottom:6px;">Os preços das bases de compras públicas, das atas e das contratações similares (art. 5º, incisos I e II) foram atualizados pelo IPCA (IBGE) até <strong>${fmtMes(
    ipca.mesBase
  )}</strong> — o último número-índice publicado não posterior ao mês anterior à data de referência (${fmtDate(
    resultado.periodo.dataReferencia
  )}). ${esc(ipca.convencao)} O fator é composto (razão entre números-índices), e não a soma das variações mensais. O preço publicado (nominal) consta ao lado do atualizado em cada registro. Mídia especializada, cotação com fornecedor e nota fiscal (incisos III a V) ficam no valor informado, e o teto CMED não é corrigido.${
    ipca.semIndice
      ? ` <span style="color:#c0392b;">${fmtInt(ipca.semIndice)} registro(s) sem número-índice para o mês do preço ficaram sem correção (fator 1).</span>`
      : ""
  }</p>
    ${
      linhas.length
        ? tabela(linhas, [
            { label: "Fonte", fn: (l) => esc(l.fonte) },
            { label: "Registros", fn: (l) => fmtInt(l.registros), right: true },
            { label: "Atualizados", fn: (l) => fmtInt(l.corrigidos), right: true },
            { label: "Fator (menor – maior)", fn: (l) => (l.menor === null ? "—" : `${fator(l.menor)} – ${fator(l.maior)}`), right: true },
            { label: "Mês do preço mais antigo", fn: (l) => fmtMes(l.maisAntigo) },
          ])
        : ""
    }`;
}

// ── Registros desconsiderados (art. 6º, §§ 1º e 2º) ──────────────────────────

/**
 * Rastreabilidade do descarte: o registro sai do cálculo, mas não do
 * documento. Sem esta seção, uma exclusão vira um número menor sem explicação.
 */
export function conteudoDescartes(resultado: ResultadoPesquisa): string {
  const { descartes } = resultado;
  if (!descartes.length) {
    return `<p style="font-size:11px;color:#666;font-style:italic;">Nenhum registro foi desconsiderado por decisão do responsável nesta pesquisa. Os únicos valores retirados do cálculo foram os classificados como discrepantes pelo método objetivo do intervalo interquartil (IQR), informados fonte a fonte nas seções anteriores.</p>`;
  }
  return `
    <p style="font-size:11px;margin-bottom:8px;">Os <strong>${descartes.length}</strong> registro(s) abaixo foram desconsiderados no cálculo da média, da mediana e do menor valor por decisão fundamentada do responsável pela pesquisa, nos termos do art. 6º, §§ 1º e 2º da IN SEGES/ME nº 65/2021. Permanecem relacionados neste relatório, com a respectiva justificativa, para preservar a rastreabilidade dos valores desconsiderados.</p>
    ${tabela(descartes, [
      { label: "Fonte", fn: (d) => esc(NOME_FONTE_CURADA[d.fonte]) },
      { label: "Registro", fn: (d) => esc((d.descricao || "—").substring(0, 45)) },
      { label: "Valor", fn: (d) => fmtBRL(d.preco), right: true },
      { label: "Data", fn: (d) => (d.data ? fmtDate(d.data) : "—") },
      { label: "UF", fn: (d) => esc(d.uf || "—") },
      { label: "Fornecedor", fn: (d) => esc((d.fornecedor || "—").substring(0, 26)) },
      { label: "Justificativa do descarte", fn: (d) => esc(d.motivo) },
    ])}`;
}

export function conteudoObservacoes(resultado: ResultadoPesquisa): string {
  const { observacoes } = resultado.recomendacao;
  if (!observacoes.length) return "";
  return `
    <div style="margin-bottom:14px;">
      <strong style="font-size:11px;">Observações:</strong>
      <ul style="margin-top:4px;padding-left:18px;">
        ${observacoes.map((o) => `<li style="font-size:10px;margin-bottom:3px;">${esc(o)}</li>`).join("")}
      </ul>
    </div>`;
}

export function conteudoReferencias(): string {
  return `<ul style="padding-left:18px;font-size:10px;line-height:1.8;color:#444;">
        <li>IN SEGES/ME nº 65, de 7 de julho de 2021 — Dispõe sobre o procedimento administrativo para a realização de pesquisa de preços para a aquisição de bens e contratação de serviços.</li>
        <li>Lei nº 10.742, de 6 de outubro de 2003 — Regulação econômica do mercado de medicamentos.</li>
        <li>Lei nº 14.133, de 1º de abril de 2021 — Lei de Licitações e Contratos Administrativos (art. 23).</li>
        <li>Resolução ANVISA — RDC nº 56/2021 — Tabela CMED de preços máximos de medicamentos.</li>
      </ul>`;
}

export interface MetaRelatorio {
  orgao: string;
  responsavel: string;
  cargo: string;
  processo: string;
  geradoEm: Date;
}

export function blocoAssinaturas(meta: MetaRelatorio): string {
  return `<table style="width:100%;border-collapse:collapse;font-size:11px;margin-top:8px;">
      <tr>
        <td style="width:50%;padding-right:20px;">
          <div style="border-top:1px solid #333;margin-top:40px;padding-top:6px;">
            <strong>${esc(meta.responsavel) || "_".repeat(40)}</strong><br/>
            <span style="font-size:10px;color:#555;">${esc(meta.cargo) || "Cargo / Matrícula"}</span><br/>
            <span style="font-size:10px;color:#555;">${esc(meta.orgao) || "Órgão"}</span>
          </div>
        </td>
        <td style="width:50%;padding-left:20px;">
          <div style="border-top:1px solid #333;margin-top:40px;padding-top:6px;">
            <strong style="color:#aaa;">${"_".repeat(40)}</strong><br/>
            <span style="font-size:10px;color:#555;">Autoridade Competente</span><br/>
            <span style="font-size:10px;color:#555;">Data: ____/____/________</span>
          </div>
        </td>
      </tr>
    </table>`;
}

// ── Documento ─────────────────────────────────────────────────────────────────

export interface PaginaRelatorio {
  /** Vai para o <title> do documento. */
  tituloDocumento: string;
  /** Segunda linha do cabeçalho (tipo do relatório). */
  subtitulo: string;
  meta: MetaRelatorio;
  /** Seções já montadas. */
  corpo: string;
}

export function paginaHTML({ tituloDocumento, subtitulo, meta, corpo }: PaginaRelatorio): string {
  const validade = validadeEm(meta.geradoEm);
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${esc(tituloDocumento)}</title>
  <style>
    @page { size: A4; margin: 18mm 15mm 20mm 20mm; }
    @media print {
      .no-print { display: none !important; }
      body { background: white !important; }
      .section { page-break-inside: avoid; }
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: "Times New Roman", Times, serif; font-size: 11px; color: #111; background: #f0f0f0; }
    .page { background: white; max-width: 800px; margin: 20px auto; padding: 24px 28px; box-shadow: 0 2px 12px rgba(0,0,0,.15); }
    .header-top { display: flex; align-items: flex-start; gap: 16px; border-bottom: 3px solid ${AZUL}; padding-bottom: 10px; margin-bottom: 14px; }
    .header-brasao { width: 56px; flex-shrink: 0; text-align: center; font-size: 9px; color: #555; }
    .header-text h1 { font-size: 13px; font-weight: bold; color: ${AZUL}; text-transform: uppercase; letter-spacing: .3px; }
    .header-text h2 { font-size: 11px; font-weight: normal; color: #444; margin-top: 2px; }
    .header-meta { margin-top: 10px; display: grid; grid-template-columns: repeat(3,1fr); gap: 6px; font-size: 10px; }
    .header-meta .meta-item { border: 1px solid #ddd; padding: 4px 8px; border-radius: 3px; }
    .header-meta .meta-item strong { display: block; color: ${AZUL}; font-size: 9px; text-transform: uppercase; }
    .print-btn { position: fixed; top: 16px; right: 16px; background: ${AZUL}; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,.3); }
    .print-btn:hover { background: #2563a8; }
    footer { border-top: 1px solid #ccc; margin-top: 20px; padding-top: 6px; font-size: 9px; color: #777; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <button class="no-print print-btn" onclick="window.print()">⊕ Imprimir / Salvar PDF</button>
  <div class="page">

    <!-- Cabeçalho -->
    <div class="header-top">
      <div class="header-brasao">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="24" cy="24" r="22" stroke="${AZUL}" stroke-width="2" fill="#eef2f7"/>
          <text x="24" y="28" text-anchor="middle" font-size="18" font-weight="bold" fill="${AZUL}">⚖</text>
        </svg>
        <div>DJUD</div>
      </div>
      <div class="header-text" style="flex:1;">
        <h1>Ministério da Saúde — Departamento de Judicialização</h1>
        <h2>${esc(subtitulo)}</h2>
        <h2>Instrução Normativa SEGES/ME nº 65, de 7 de julho de 2021</h2>
      </div>
    </div>

    <div class="header-meta">
      <div class="meta-item"><strong>Processo / Nº SEI</strong>${esc(meta.processo) || "—"}</div>
      <div class="meta-item"><strong>Data de emissão</strong>${fmtDateLong(meta.geradoEm)}</div>
      <div class="meta-item"><strong>Validade</strong>${fmtDateLong(validade)}</div>
      <div class="meta-item"><strong>Órgão demandante</strong>${esc(meta.orgao) || "—"}</div>
      <div class="meta-item"><strong>Responsável</strong>${esc(meta.responsavel) || "—"}</div>
      <div class="meta-item"><strong>Sistema gerador</strong>DJUD Painel v1.0</div>
    </div>

    <hr style="margin: 16px 0; border-color:#ddd;"/>

    ${corpo}

    <footer>
      <span>Gerado automaticamente pelo sistema DJUD Painel — Ministério da Saúde · ${fmtDate(meta.geradoEm)}</span>
      <span>IN SEGES/ME nº 65/2021 · Página <span style="font-style:italic;">impresso via navegador</span></span>
    </footer>
  </div>
</body>
</html>`;
}
