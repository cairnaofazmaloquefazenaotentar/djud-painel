import type {
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

export function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("pt-BR");
}

export function fmtDateLong(d: Date | string): string {
  return new Date(d).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
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
      </table>`;
}

export function conteudoMetodo(): string {
  return `<p style="font-size:11px;margin-bottom:6px;">A pesquisa foi realizada em conformidade com o art. 5º da IN SEGES/ME nº 65/2021, a partir do código CATMAT e da unidade de fornecimento do item, consultando as seguintes bases de dados oficiais:</p>
      <ul style="padding-left:18px;font-size:11px;line-height:1.8;">
        <li><strong>CMED/ANVISA</strong> — Câmara de Regulação do Mercado de Medicamentos: preço máximo de venda ao governo (PMVG) como teto regulatório obrigatório, convertido da embalagem para a unidade de fornecimento pela quantidade por embalagem (Qt_Embal) do registro ANVISA.</li>
        <li><strong>BPS</strong> — Banco de Preços em Saúde (DATASUS/MS): registros de compras hospitalares públicas 2020–2025, por código CATMAT.</li>
        <li><strong>SIASG/Comprasnet</strong> — Sistema Integrado de Administração de Serviços Gerais: compras públicas com ação judicial, anos 2002–2021, por código CATMAT.</li>
        <li><strong>PNCP</strong> — Portal Nacional de Contratações Públicas: contratos de materiais homologados, 2024–2025, por código do item de catálogo (CATMAT).</li>
      </ul>
      <p style="font-size:11px;margin-top:6px;">Para cada fonte, aplicou-se o método de remoção de outliers pelo intervalo interquartil (IQR), e o preço estimado foi calculado como a mediana da distribuição resultante. O preço de referência consolidado corresponde à mediana das medianas apuradas nas fontes BPS, SIASG e PNCP (método das medianas de medianas). Quando o preço de mercado supera o PMVG unitário vigente, este último é adotado como teto obrigatório (Lei nº 10.742/2003, art. 3º, §2º).</p>`;
}

function colunasMercado(ultima: Coluna<RegistroMercado>): Coluna<RegistroMercado>[] {
  return [
    { label: "Descrição", fn: (r) => esc((r.descricao || "").substring(0, 60)) },
    { label: "Preço", fn: (r) => fmtBRL(r.preco), right: true },
    { label: "Unidade", fn: (r) => esc(r.unidade || "—") },
    { label: "Data", fn: (r) => (r.data ? fmtDate(r.data) : "—") },
    { label: "UF", fn: (r) => esc(r.uf || "—") },
    ultima,
  ];
}

function conteudoMercado(
  fonte: FonteMercadoResultado,
  vazio: string,
  intro: (f: FonteMercadoResultado) => string,
  ultima: Coluna<RegistroMercado>
): string {
  if (fonte.total === 0) {
    return `<p style="color:#666;font-style:italic;font-size:11px;">${vazio}</p>`;
  }
  return `
      <p style="font-size:11px;margin-bottom:8px;">${intro(fonte)} Analisada amostra de <strong>${fonte.amostra}</strong> registros mais recentes. ${
        fonte.outliersRemovidos > 0
          ? `Removidos <strong>${fonte.outliersRemovidos}</strong> outliers pelo método IQR.`
          : "Nenhum outlier identificado."
      }</p>
      <div style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap;">
        ${estatBox("Mínimo (pós-limpeza)", fmtBRL(fonte.precoMin))}
        ${estatBox("Mediana", fmtBRL(fonte.precoMediana), true)}
        ${estatBox("Máximo (pós-limpeza)", fmtBRL(fonte.precoMax))}
        ${estatBox("Registros na amostra", String(fonte.amostra))}
      </div>
      ${tabela(fonte.registros, colunasMercado(ultima))}`;
}

export function conteudoCmed(resultado: ResultadoPesquisa): string {
  const { item, unidade, resultados } = resultado;
  const cmed = resultados.cmed;
  if (cmed.total === 0) {
    return `<p style="color:#c0392b;font-style:italic;font-size:11px;">Nenhum registro ANVISA com preço CMED vigente para este código na unidade de fornecimento selecionada. Não há preço-teto regulado pela ANVISA para este item.</p>`;
  }
  const capAplica = cmed.registros.some((r) => r.cap);
  return `
      <p style="font-size:11px;margin-bottom:8px;">Foram encontrados <strong>${cmed.total}</strong> registro(s) ANVISA com preço na tabela CMED vigente (Câmara de Regulação do Mercado de Medicamentos — ANVISA) para ${item.tipo === "CATMAT" ? `o CATMAT ${esc(item.catmat)}` : `o registro ${esc(item.registro)}`}, na unidade de fornecimento <strong>${esc(unidade)}</strong>. O PMVG da tabela CMED é expresso por embalagem; o valor unitário abaixo corresponde ao PMVG dividido pela quantidade de unidades por embalagem (Qt_Embal).${
        cmed.semQtEmbalagem > 0
          ? ` <strong>${cmed.semQtEmbalagem}</strong> registro(s) sem quantidade por embalagem informada aparecem apenas com o preço por embalagem e não compõem o teto.`
          : ""
      }</p>
      <div style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap;">
        ${estatBox("PMVG unitário mínimo (sem impostos)", fmtBRL(cmed.pmvgUnitMin), true)}
        ${estatBox("PMVG unitário máximo (sem impostos)", fmtBRL(cmed.pmvgUnitMax))}
        ${capAplica ? estatBox("Desconto CAP obrigatório", "21,53% sobre PF", true) : ""}
      </div>
      ${tabela(cmed.registros.slice(0, 10), [
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
  return conteudoMercado(
    resultados.bps,
    "Nenhum registro encontrado no BPS para este código e unidade de fornecimento.",
    (f) =>
      `Foram identificados <strong>${fmtInt(f.total)}</strong> registros no BPS (anos 2020–2025) para o CATMAT ${esc(item.catmat)} na unidade <strong>${esc(unidade)}</strong>${uf ? `, UF ${esc(uf)}` : ""}.`,
    { label: "Instituição", fn: (r) => esc((r.orgao || "—").substring(0, 40)) }
  );
}

export function conteudoSiasg(resultado: ResultadoPesquisa): string {
  const { item, unidade, uf, resultados } = resultado;
  return conteudoMercado(
    resultados.siasg,
    "Nenhum registro encontrado no SIASG para compras judiciais deste código e unidade de fornecimento.",
    (f) =>
      `Foram identificados <strong>${fmtInt(f.total)}</strong> registros de compras com ação judicial no SIASG (2002–2021) para o CATMAT ${esc(item.catmat)} na unidade <strong>${esc(unidade)}</strong>${uf ? `, UF ${esc(uf)}` : ""}.`,
    { label: "Órgão", fn: (r) => esc((r.orgao || "—").substring(0, 40)) }
  );
}

export function conteudoPncp(resultado: ResultadoPesquisa): string {
  const { item, unidade, uf, resultados } = resultado;
  return conteudoMercado(
    resultados.pncp,
    "Nenhum registro encontrado no PNCP para este código e unidade de fornecimento.",
    (f) =>
      `Foram identificados <strong>${fmtInt(f.total)}</strong> registros no PNCP (materiais, 2024–2025) para o CATMAT ${esc(item.catmat)} na unidade <strong>${esc(unidade)}</strong>${uf ? `, UF ${esc(uf)}` : ""}.`,
    { label: "Fornecedor", fn: (r) => esc((r.fornecedor || "—").substring(0, 40)) }
  );
}

/** Quantas fontes de mercado (BPS/SIASG/PNCP) apuraram mediana para o item. */
export function fontesComMediana(resultado: ResultadoPesquisa) {
  const { bps, siasg, pncp } = resultado.resultados;
  return [
    { fonte: "BPS", mediana: bps.precoMediana, n: bps.amostra, removidos: bps.outliersRemovidos },
    { fonte: "SIASG (judicial)", mediana: siasg.precoMediana, n: siasg.amostra, removidos: siasg.outliersRemovidos },
    { fonte: "PNCP", mediana: pncp.precoMediana, n: pncp.amostra, removidos: pncp.outliersRemovidos },
  ].filter((f) => f.mediana !== null);
}

/** true quando o preço de mercado ficou acima do teto PMVG e o teto prevaleceu. */
export function pmvgFoiAplicado(resultado: ResultadoPesquisa): boolean {
  const { limitePmvg, precoReferencia } = resultado.recomendacao;
  return limitePmvg !== null && precoReferencia !== null && precoReferencia > limitePmvg;
}

export function conteudoAnalise(resultado: ResultadoPesquisa, comMetodologia = true): string {
  const { recomendacao } = resultado;
  const linhas = fontesComMediana(resultado);
  const pmvgAplicado = pmvgFoiAplicado(resultado);

  return `
    ${
      comMetodologia
        ? `<p style="font-size:11px;margin-bottom:10px;">A metodologia adotada segue o disposto no art. 5º da IN SEGES/ME nº 65/2021: coleta de preços em fontes oficiais pelo código CATMAT e unidade de fornecimento, remoção de valores inexequíveis ou excessivos pelo método do intervalo interquartil (IQR: valores fora de Q1−1,5×IQR ou Q3+1,5×IQR são descartados) e cálculo da mediana como preço estimado.</p>`
        : ""
    }
    <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:12px;">
      <thead>
        <tr style="background:#e8edf2;">
          <th style="border:1px solid #ccc;padding:5px 8px;text-align:left;">Fonte</th>
          <th style="border:1px solid #ccc;padding:5px 8px;text-align:right;">Registros analisados</th>
          <th style="border:1px solid #ccc;padding:5px 8px;text-align:right;">Outliers removidos</th>
          <th style="border:1px solid #ccc;padding:5px 8px;text-align:right;">Mediana apurada</th>
        </tr>
      </thead>
      <tbody>
        ${linhas
          .map(
            (f, i) => `
          <tr style="background:${i % 2 === 0 ? "#fff" : "#f9fafb"}">
            <td style="border:1px solid #ccc;padding:5px 8px;">${f.fonte}</td>
            <td style="border:1px solid #ccc;padding:5px 8px;text-align:right;">${f.n}</td>
            <td style="border:1px solid #ccc;padding:5px 8px;text-align:right;">${f.removidos}</td>
            <td style="border:1px solid #ccc;padding:5px 8px;text-align:right;font-weight:bold;">${fmtBRL(f.mediana)}</td>
          </tr>`
          )
          .join("")}
        <tr style="background:#eef2f7;font-weight:bold;">
          <td style="border:1px solid #ccc;padding:5px 8px;" colspan="3">Preço de referência (mediana das medianas por fonte)</td>
          <td style="border:1px solid #ccc;padding:5px 8px;text-align:right;color:${AZUL};font-size:13px;">${fmtBRL(recomendacao.precoReferencia)}</td>
        </tr>
        ${
          pmvgAplicado
            ? `
        <tr style="background:#fef3cd;">
          <td style="border:1px solid #ccc;padding:5px 8px;" colspan="3">⚠ Preço de mercado superior ao PMVG unitário — aplicado PMVG sem impostos ÷ Qt_Embal como teto (art. 3º, §2º, Lei nº 10.742/2003)</td>
          <td style="border:1px solid #ccc;padding:5px 8px;text-align:right;font-weight:bold;color:#c0392b;">${fmtBRL(recomendacao.limitePmvg)}</td>
        </tr>`
            : ""
        }
        ${
          recomendacao.precoReferencia === null && recomendacao.limitePmvg !== null
            ? `
        <tr style="background:#fef3cd;">
          <td style="border:1px solid #ccc;padding:5px 8px;" colspan="3">Sem preço de mercado nas bases consultadas — adotado o menor PMVG unitário sem impostos (CMED)</td>
          <td style="border:1px solid #ccc;padding:5px 8px;text-align:right;font-weight:bold;color:#c0392b;">${fmtBRL(recomendacao.limitePmvg)}</td>
        </tr>`
            : ""
        }
      </tbody>
    </table>
    ${
      linhas.length < 3
        ? `<p style="font-size:10px;color:#c0392b;"><strong>Atenção:</strong> Apenas ${linhas.length} fonte(s) com dados disponíveis. O art. 5º, §3º da IN 65/2021 recomenda consulta a no mínimo 3 fontes. Recomenda-se complementar a pesquisa com cotação direta a fornecedores.</p>`
        : ""
    }`;
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
