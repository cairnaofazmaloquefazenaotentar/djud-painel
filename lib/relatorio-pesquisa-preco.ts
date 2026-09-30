import { ROTULO_FILTRO, filtrosAtivos } from "@/lib/pesquisa-preco-filtros";
import { NOME_FONTE_CURADA } from "@/lib/pesquisa-preco-curadoria";
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
        ${filtrosAtivos(resultado.filtros)
          .map(
            (c) =>
              `<tr><td style="border:1px solid #ccc;padding:4px 8px;background:#f5f5f5;font-weight:bold;">${esc(ROTULO_FILTRO[c])} (filtro)</td><td style="border:1px solid #ccc;padding:4px 8px;">${esc(resultado.filtros[c])}</td></tr>`
          )
          .join("")}
      </table>`;
}

export function conteudoMetodo(): string {
  return `<p style="font-size:11px;margin-bottom:6px;">A pesquisa foi realizada em conformidade com o art. 5º da IN SEGES/ME nº 65/2021, a partir do código CATMAT e da unidade de fornecimento do item, consultando as seguintes bases de dados oficiais:</p>
      <ul style="padding-left:18px;font-size:11px;line-height:1.8;">
        <li><strong>CMED/ANVISA</strong> — Câmara de Regulação do Mercado de Medicamentos: preço máximo de venda ao governo (PMVG) como teto regulatório obrigatório, convertido da embalagem para a unidade de fornecimento pela quantidade por embalagem (Qt_Embal) do registro ANVISA.</li>
        <li><strong>BPS</strong> — Banco de Preços em Saúde (DATASUS/MS): registros de compras hospitalares públicas 2020–2025, por código CATMAT.</li>
        <li><strong>SIASG/Comprasnet</strong> — Sistema Integrado de Administração de Serviços Gerais: compras públicas com ação judicial, anos 2002–2021, por código CATMAT.</li>
        <li><strong>PNCP</strong> — Portal Nacional de Contratações Públicas: contratos de materiais homologados, 2024–2025, por código do item de catálogo (CATMAT).</li>
        <li><strong>Orçamento direto de fornecedor</strong> (art. 5º, IV) — propostas apresentadas diretamente ao órgão, quando juntadas ao processo. Fonte especialmente relevante em medicamentos importados, cujas aquisições nem sempre têm contratações públicas comparáveis nas bases acima.</li>
      </ul>
      <p style="font-size:11px;margin-top:6px;">Para cada fonte, aplicou-se o método de remoção de outliers pelo intervalo interquartil (IQR) e apuraram-se os três métodos admitidos pelo art. 6º da IN 65/2021 — média, mediana e menor valor —, apresentados também de forma consolidada. O preço de referência adotado é a mediana das medianas apuradas por fonte, critério que impede que a base com mais registros determine sozinha o resultado. Quando o preço de mercado supera o PMVG unitário vigente, este último é adotado como teto obrigatório (Lei nº 10.742/2003, art. 3º, §2º).</p>`;
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
function colunasMercado(ultima: Coluna<RegistroMercado>): Coluna<RegistroMercado>[] {
  return [
    { label: "Descrição", fn: (r) => esc((r.descricao || "").substring(0, 45)) },
    {
      // Um valor descartado pelo IQR continua na amostra impressa, mas riscado:
      // sem a marca, quem lê vê um preço dez vezes menor que a mediana ao lado
      // dela e não tem como saber que ele ficou fora do cálculo.
      label: "Preço",
      fn: (r) =>
        r.outlierIqr
          ? `<span style="text-decoration:line-through;color:#c0392b;">${fmtBRL(r.preco)}</span> <sup>*</sup>`
          : fmtBRL(r.preco),
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
    return `<p style="color:#666;font-style:italic;font-size:11px;">${vazio}</p>`;
  }
  const considerados = fonte.registros.filter((r) => r.excluidoPor === null);
  const exibidos = considerados.slice(0, 10);
  return `
      <p style="font-size:11px;margin-bottom:8px;">${intro(fonte)} Analisada amostra de <strong>${fonte.amostra}</strong> registros mais recentes. ${
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
        ${estatBox("PMVG unitário mínimo (sem impostos)", fmtBRL(cmed.pmvgUnitMin), true)}
        ${estatBox("PMVG unitário máximo (sem impostos)", fmtBRL(cmed.pmvgUnitMax))}
        ${capAplica ? estatBox("Desconto CAP obrigatório", "21,53% sobre PF", true) : ""}
      </div>
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
          true
        )}
        ${linhaConsolidada(
          "CONSOLIDADO POR REGISTRO",
          "cada compra pesa igual — todos os registros depurados reunidos num conjunto único",
          porRegistro,
          false
        )}
      </tbody>
    </table>
    <p style="font-size:10px;color:#444;margin-bottom:12px;">
      <strong>Como ler os consolidados.</strong> O <strong>consolidado por fonte</strong> trata cada base como um voto: as estatísticas incidem sobre as medianas apuradas em cada fonte, de modo que uma base com milhares de registros não sobrepuja outra com poucos. É dele que sai o preço adotado — a <strong>mediana das medianas, ${fmtBRL(recomendacao.precoReferencia)}</strong>. O <strong>consolidado por registro</strong> reúne todos os registros depurados num conjunto único, em que cada compra pesa igual; serve de contraprova da ordem de grandeza, e não como preço de referência, porque a base mais numerosa domina o resultado. Os três métodos do art. 6º estão apresentados em ambos.
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:12px;">
      <tbody>
        <tr style="background:#eef2f7;">
          ${td(
            `<strong>Preço de referência adotado</strong> — mediana das medianas por fonte (art. 6º, caput)`
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
            "⚠ Preço de mercado superior ao PMVG unitário — aplicado PMVG sem impostos ÷ Qt_Embal como teto (art. 3º, §2º, Lei nº 10.742/2003)"
          )}
          ${td(`<strong style="color:#c0392b;">${fmtBRL(recomendacao.limitePmvg)}</strong>`, true)}
        </tr>`
            : ""
        }
        ${
          recomendacao.precoReferencia === null && recomendacao.limitePmvg !== null
            ? `
        <tr style="background:#fef3cd;">
          ${td("Sem preço apurado nas fontes consultadas — adotado o menor PMVG unitário sem impostos (CMED)")}
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

export function conteudoOrcamentos(resultado: ResultadoPesquisa): string {
  const { orcamentos, resultados, unidade } = resultado;
  if (!orcamentos.length) return "";
  const noCalculo = resultados.orcamentos?.estatisticas.n ?? 0;

  return `
    <p style="font-size:11px;margin-bottom:8px;">Foram juntadas ao processo <strong>${orcamentos.length}</strong> proposta(s) apresentada(s) diretamente por fornecedor, nos termos do art. 5º, IV da IN SEGES/ME nº 65/2021. ${
      noCalculo > 0
        ? `<strong>${noCalculo}</strong> compõe(m) a apuração do preço de referência como fonte adicional; a(s) demais permanece(m) registrada(s) apenas para instrução do processo.`
        : "Nenhuma foi considerada no cálculo do preço de referência — todas constam apenas para instrução do processo."
    } Esta fonte não passa pela remoção automática de outliers (IQR): as propostas foram selecionadas pelo responsável, e descartá-las automaticamente contrariaria a própria juntada.</p>
    ${tabela(orcamentos, [
      { label: "Fornecedor", fn: (o) => esc(o.fornecedor.substring(0, 38)) },
      { label: "CNPJ", fn: (o) => esc(o.cnpj || "—") },
      { label: "Marca / Fabricante", fn: (o) => esc(marcaFabricante(o).substring(0, 30)) },
      { label: `Valor por ${unidade}`, fn: (o) => `<strong>${fmtBRL(o.valorUnitario)}</strong>`, right: true },
      { label: "Data", fn: (o) => fmtDate(o.dataOrcamento) },
      { label: "Validade", fn: (o) => (o.validade ? fmtDate(o.validade) : "—") },
      { label: "Documento", fn: (o) => esc((o.documento || "—").substring(0, 24)) },
      {
        label: "No cálculo",
        fn: (o) => (o.considerarNoCalculo ? "Sim" : "<span style='color:#c0392b;'>Não</span>"),
      },
    ])}
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
