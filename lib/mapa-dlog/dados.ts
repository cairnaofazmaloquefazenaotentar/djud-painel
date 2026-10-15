import {
  INFO_FONTE,
  ORDEM_FONTES,
  fontesDoResultado,
  type FonteMercadoChave,
  type Inciso,
} from "@/lib/pesquisa-preco-fontes";
import {
  ROTULO_METODO,
  ehReferencia,
  pmvgNaAliquota,
  rotuloRegraTeto,
  type AliquotaTeto,
  type MetodoPreco,
  type RegraTeto,
  type TetoCmed,
} from "@/lib/pesquisa-preco-metodo";
import { ESTATISTICAS_VAZIAS, type Estatisticas } from "@/lib/pesquisa-preco-curadoria";
import type { RegistroMercado, ResultadoPesquisa } from "@/lib/pesquisa-preco";
import { gerarJustificativa, type ContextoJustificativa } from "@/lib/mapa-dlog/justificativa";
import { NAO_DISPONIVEL, NAO_INFORMADO, abaItem } from "@/lib/mapa-dlog/layout";
import { descricaoPeriodo } from "@/lib/pesquisa-preco-periodo";

// ─────────────────────────────────────────────────────────────────────────────
// Mapa comparativo no modelo da DLOG — dados de cada aba, sem exceljs.
//
// Transforma o ResultadoPesquisa (o mesmo que a tela e o HTML usam) nas linhas
// A–Y da base de preços, no resumo estatístico, no bloco por fonte e no bloco
// da aba CMED. NÃO recalcula preço: os números saem da pesquisa, e as
// fórmulas que o gerador escreve na planilha só os reproduzem para auditoria
// (scripts/conferir_mapa_dlog.py confere que dão o mesmo resultado).
//
// Módulo puro, testável sem banco e sem exceljs.
// ─────────────────────────────────────────────────────────────────────────────

export interface EntradaMapa {
  /** Número do item no mapa (1, 2…): nome da aba e coluna A. */
  numero: number;
  /** Código pesquisado (CATMAT ou registro ANVISA). */
  codigo: string;
  /** Descrição de reserva, para item não localizado na emissão. */
  descricao: string;
  unidade: string;
  quantidade: number;
  resultado: ResultadoPesquisa | null;
  /** Texto do responsável; ausente = justificativa gerada. */
  justificativaEditada?: string | null;
  /** false = método e teto vieram do padrão, sem decisão registrada para o item. */
  escolhaExplicita: boolean;
  /** Data/hora da consulta às bases do painel (coluna E das bases sem coleta). */
  consultadoEm: Date;
  contexto?: ContextoJustificativa;
}

/** Uma linha da base de preços coletados (colunas A–Z e a auxiliar AB). */
export interface LinhaBase {
  fonte: FonteMercadoChave;
  /** B — rótulo da fonte no modelo da DLOG. */
  rotulo: string;
  /** C */
  numeroCompra: string;
  /** D — ISO (data). */
  dataCompra: string | null;
  /** E — ISO (data e hora). */
  dataCotacao: string | null;
  /** F */
  anulada: string;
  /** G */
  numeroItemCompra: string;
  /** H */
  modalidade: string;
  /** I */
  criterio: string;
  /** J — número quando o código é numérico. */
  codigoItem: number | string;
  /** K */
  descricao: string;
  /** L */
  unidade: string;
  /** M */
  quantidade: number | null;
  /** N — preço como publicado. */
  precoNominal: number;
  /** O */
  cnpjFornecedor: string;
  /** P */
  fornecedor: string;
  /** Q */
  orgao: string;
  /** R */
  uasg: string;
  /** S */
  nomeUasg: string;
  /** T — texto e, quando houver, o link. */
  referencia: { texto: string; url: string | null };
  /** U — compõe o conjunto único (a base de dados final). */
  compoe: boolean;
  /** V — 1º dia do mês do preço (ISO). */
  mesReferencia: string | null;
  /** W — índice acumulado do IPCA (fator − 1); 0 com o IPCA desligado. */
  ipcaAcumulado: number;
  /** X — preço corrigido, como a pesquisa calculou. */
  precoCorrigido: number;
  /** Y */
  motivo: string;
  /** Z */
  identificador: string;
  /** AB — compõe a estatística da própria fonte (duplicata entre bases conta na sua fonte). */
  compoeFonte: boolean;
  /** O preço foi corrigido pelo IPCA (incisos I e II): a coluna W vira fórmula. */
  ipcaAplicado: boolean;
}

export interface ResumoFonte {
  fonte: FonteMercadoChave;
  rotulo: string;
  inciso: Inciso;
  estatisticas: Estatisticas;
}

export interface LinhaCmed {
  substancia: string;
  cnpj: string;
  laboratorio: string;
  registro: string;
  ean: string;
  produto: string;
  apresentacao: string;
  classeTerapeutica: string;
  tipoProduto: string;
  regimePreco: string;
  pmvgSemImpostos: number;
  pmvg0: number | null;
  /** PMVG da embalagem na alíquota do item (coluna M). */
  pmvgAliquota: number | null;
  qtEmbalagem: number | null;
  /** O = M ÷ N. */
  unitarioAliquota: number | null;
  /** Unitário sem impostos (K ÷ N) — o teto do painel. */
  unitarioSemImpostos: number | null;
  marcacao: string;
  /** Esta linha forma o teto escolhido (D12 da aba do item aponta para ela). */
  formaTeto: boolean;
}

export interface MapaItem {
  numero: number;
  aba: string;
  localizado: boolean;
  /** B2 */
  medicamento: string;
  /** B3 */
  catmat: number | string;
  /** C3 */
  descricaoCatmat: string;
  /** D3 */
  unidade: string;
  /** F3 */
  quantidade: number;
  /** B6–B9, E6–E8 — o conjunto único (cada compra pesa igual). */
  conjuntoUnico: Estatisticas;
  /** Bloco H5 — uma linha por fonte com preço. */
  fontes: ResumoFonte[];
  /** Linha "Mediana das medianas" do bloco H5. */
  porFonte: Estatisticas;
  metodo: MetodoPreco;
  regraTeto: RegraTeto;
  aliquota: AliquotaTeto;
  /** F12 */
  descricaoMetodo: string;
  /** B12 — preço final da pesquisa. */
  precoAdotado: number | null;
  /** D12 */
  teto: TetoCmed | null;
  /** B13 */
  valorTotal: number | null;
  /** B14 */
  justificativa: string;
  justificativaEditada: boolean;
  /** Coluna H da Consolidação. */
  status: string;
  linhas: LinhaBase[];
  /** Algum registro foi corrigido pelo IPCA: a coluna W vira fórmula sobre a aba de índices. */
  ipcaLigado: boolean;
  cmed: LinhaCmed[];
  /** Texto curto da regra do teto, para a aba Parâmetros. */
  descricaoTeto: string;
  /** Período do art. 5º aplicado ao item (aba Parâmetros). */
  descricaoPeriodo: string;
}

// ── Utilidades ───────────────────────────────────────────────────────────────

/** "ELTROMBOPAG OLAMINA 50 MG" a partir do PDM e da concentração do catálogo. */
export function nomeMedicamento(r: ResultadoPesquisa): string {
  const { item } = r;
  if (item.tipo === "REGISTRO" && !item.catmat && item.registros[0]) {
    const reg = item.registros[0];
    return [reg.substancia, reg.apresentacao].filter(Boolean).join(" — ") || item.descricao;
  }
  // Até o próximo ", RÓTULO:" — a concentração pode ter vírgula decimal ("56,25 MG/ML").
  const concentracao = /CONCENTRA[ÇC][ÃA]O:?\s*(.+?)\s*(?:,\s*[A-ZÀ-Úa-zà-ú. /]+:|$)/i.exec(item.descricao)?.[1]?.trim();
  const base = item.nomePdm || item.descricao.split(",")[0].trim();
  return concentracao ? `${base} ${concentracao}` : item.descricao;
}

function numeroOuTexto(v: string | null | undefined): number | string {
  const s = String(v ?? "").trim();
  return /^\d{1,15}$/.test(s) ? Number(s) : s;
}

function primeiroDiaDoMes(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return `${iso.slice(0, 7)}-01`;
}

const texto = (v: string | null | undefined, padrao = ""): string => {
  const s = String(v ?? "").trim();
  return s || padrao;
};

// ── Linhas da base de preços ─────────────────────────────────────────────────

function motivoNaoCompoe(
  r: RegistroMercado,
  fonte: FonteMercadoChave,
  somenteRegistro: Set<string>
): string {
  if (r.excluidoPor) {
    if (INFO_FONTE[fonte].informado && somenteRegistro.has(r.id)) return "somente registro";
    // Fora da janela do inciso é regra do art. 5º, não decisão do responsável.
    if (r.excluidoPor.startsWith("Fora do período")) return `f${r.excluidoPor.slice(1)}`;
    return `exclusão justificada: ${r.excluidoPor}`;
  }
  if (r.outlierIqr) return "fora do IQR";
  if (!(r.preco > 0)) return "preço zerado";
  if (r.duplicadoDe) {
    const nome = INFO_FONTE[r.duplicadoDe.fonte].nome;
    return r.duplicadoDe.provavel ? `provável duplicata de ${nome}` : `duplicado de ${nome}`;
  }
  return "";
}

function linhaDaBase(
  r: RegistroMercado,
  fonte: FonteMercadoChave,
  ctx: { codigoItem: number | string; unidade: string; consultadoEm: Date; somenteRegistro: Set<string>; resultado: ResultadoPesquisa }
): LinhaBase {
  const info = INFO_FONTE[fonte];
  const c = r.contratacao ?? null;
  const motivo = motivoNaoCompoe(r, fonte, ctx.somenteRegistro);
  const compoeFonte = !r.excluidoPor && !r.outlierIqr && r.preco > 0;
  const orcamento = fonte === "orcamentos" ? ctx.resultado.orcamentos.find((o) => o.id === r.id) : undefined;

  // Identificação da contratação: o que a origem tiver; senão, o motivo.
  const semDado = c?.indisponivel ? c.indisponivel : NAO_DISPONIVEL;
  let numeroCompra = c?.numero ?? (c?.processo ? `Processo ${c.processo}` : semDado);
  let referencia: LinhaBase["referencia"] = c?.url
    ? { texto: c.numeroControlePncpAta ?? c.numeroControlePncp ?? "PNCP", url: c.url }
    : { texto: c?.referencia ?? c?.numeroControlePncp ?? semDado, url: null };
  if (orcamento) {
    numeroCompra = texto(orcamento.documento, "proposta juntada ao processo");
    referencia = {
      texto: [orcamento.documento, orcamento.observacao].filter(Boolean).join(" — ") || "proposta juntada ao processo",
      url: null,
    };
  }

  const ipcaLigado = r.fatorIpca != null;
  return {
    fonte,
    rotulo: info.rotulo,
    numeroCompra,
    dataCompra: r.data ? r.data.slice(0, 10) : null,
    dataCotacao: r.coletadoEm ?? (info.informado ? r.data : ctx.consultadoEm.toISOString()),
    anulada: texto(c?.situacao, NAO_INFORMADO),
    numeroItemCompra: texto(c?.numeroItem, info.informado ? "" : semDado),
    modalidade: texto(c?.tipo ?? r.modalidade, NAO_INFORMADO),
    criterio: texto(c?.criterioJulgamento, NAO_INFORMADO),
    codigoItem: ctx.codigoItem,
    descricao: texto(r.descricao, "—"),
    unidade: texto(r.unidade, ctx.unidade),
    quantidade: r.qtd ?? null,
    precoNominal: r.precoNominal ?? r.preco,
    cnpjFornecedor: texto(r.cnpjFornecedor),
    fornecedor: texto(r.fornecedor, info.informado ? info.nome : ""),
    orgao: texto(r.orgao),
    uasg: texto(c?.uasg, info.informado ? "" : semDado),
    nomeUasg: texto(c?.nomeUasg, info.informado ? "" : semDado),
    referencia,
    compoe: motivo === "",
    mesReferencia: primeiroDiaDoMes(r.mesIndice ? `${r.mesIndice}-01` : r.data),
    ipcaAcumulado: ipcaLigado ? (r.fatorIpca as number) - 1 : 0,
    precoCorrigido: r.preco,
    motivo,
    identificador: `${fonte}:${r.id}`,
    compoeFonte,
    ipcaAplicado: ipcaLigado,
  };
}

/** Por inciso (ordem do art. 5º) e, dentro da fonte, da compra mais recente para a mais antiga. */
function ordenarLinhas(linhas: LinhaBase[]): LinhaBase[] {
  const ordem = new Map(ORDEM_FONTES.map((f, i) => [f, i]));
  return [...linhas].sort(
    (a, b) =>
      (ordem.get(a.fonte) ?? 99) - (ordem.get(b.fonte) ?? 99) ||
      String(b.dataCompra ?? "").localeCompare(String(a.dataCompra ?? ""))
  );
}

// ── CMED ─────────────────────────────────────────────────────────────────────

function linhasCmed(r: ResultadoPesquisa, aliquota: AliquotaTeto): LinhaCmed[] {
  const { tetos, teto } = r.recomendacao;
  return r.resultados.cmed.registros.map((c) => {
    const qt = c.qtEmbalagem && c.qtEmbalagem > 0 ? c.qtEmbalagem : null;
    const pmvgAliq = pmvgNaAliquota(c, aliquota);
    const marcas: string[] = [];
    if (tetos.menorSemImpostos?.registroId === c.id) marcas.push("menor teto (PMVG sem impostos)");
    if (ehReferencia(c)) marcas.push("medicamento de referência");
    if (tetos.referencia?.registroId === c.id && !ehReferencia(c)) marcas.push(`maior PMVG ${aliquota}%`);
    if (teto?.registroId === c.id) marcas.push("teto adotado");
    if (c.excluidoPor) marcas.push(`desconsiderado: ${c.excluidoPor}`);
    if (!qt) marcas.push("sem Qt_Embal — fora do teto");
    return {
      substancia: texto(c.substancia),
      cnpj: texto(c.cnpj),
      laboratorio: texto(c.laboratorio),
      registro: texto(c.registro),
      ean: texto(c.ean),
      produto: texto(c.produto),
      apresentacao: texto(c.apresentacao),
      classeTerapeutica: texto(c.classeTerapeutica),
      tipoProduto: texto(c.tipoProduto),
      regimePreco: texto(c.regimePreco),
      pmvgSemImpostos: c.pmvgEmbalagem,
      pmvg0: c.pmvg0,
      pmvgAliquota: pmvgAliq,
      qtEmbalagem: qt,
      unitarioAliquota: pmvgAliq !== null && qt ? pmvgAliq / qt : null,
      unitarioSemImpostos: qt ? c.pmvgEmbalagem / qt : null,
      marcacao: marcas.join("; "),
      formaTeto: teto?.registroId === c.id,
    };
  });
}

// ── Item ─────────────────────────────────────────────────────────────────────

function statusDoItem(e: EntradaMapa): string {
  const r = e.resultado;
  if (!r) return "Item não localizado";
  if (r.recomendacao.precoFinal === null) return "Sem preço";
  if (!e.escolhaExplicita) return "Decisão pendente";
  // Teto como preço: não há os três preços do art. 6º — também pede justificativa.
  if (r.recomendacao.precoReferencia === null) return "Teto CMED — sem preço de mercado";
  if (r.consolidado.porRegistro.n < 3) return "Menos de 3 preços — justificar";
  return "Concluída";
}

export function montarMapaItem(e: EntradaMapa): MapaItem {
  const r = e.resultado;
  const aba = abaItem(e.numero);
  if (!r) {
    return {
      numero: e.numero,
      aba,
      localizado: false,
      medicamento: e.descricao,
      catmat: numeroOuTexto(e.codigo),
      descricaoCatmat: `Código ${e.codigo} não localizado no catálogo CATMAT nem nos registros ANVISA na data de emissão`,
      unidade: e.unidade,
      quantidade: e.quantidade,
      conjuntoUnico: { ...ESTATISTICAS_VAZIAS },
      fontes: [],
      porFonte: { ...ESTATISTICAS_VAZIAS },
      metodo: "mediana_medianas",
      regraTeto: "menor_pmvg_sem_impostos",
      aliquota: "17",
      descricaoMetodo: "Sem preço apurado",
      precoAdotado: null,
      teto: null,
      valorTotal: null,
      justificativa: texto(e.justificativaEditada, "Item não localizado nas bases na data de emissão; não compõe o valor global."),
      justificativaEditada: !!texto(e.justificativaEditada),
      status: statusDoItem(e),
      linhas: [],
      ipcaLigado: false,
      cmed: [],
      descricaoTeto: "—",
      descricaoPeriodo: "—",
    };
  }

  const { recomendacao: rec, consolidado } = r;
  const codigoItem = numeroOuTexto(r.item.catmat ?? r.item.codigo);
  const somenteRegistro = new Set(r.orcamentos.filter((o) => !o.considerarNoCalculo).map((o) => o.id));
  const linhas = ordenarLinhas(
    fontesDoResultado(r).flatMap(({ fonte, dados }) =>
      dados.registros.map((reg) =>
        linhaDaBase(reg, fonte, {
          codigoItem,
          unidade: r.unidade,
          consultadoEm: e.consultadoEm,
          somenteRegistro,
          resultado: r,
        })
      )
    )
  );

  const editada = texto(e.justificativaEditada);
  const precoAdotado = rec.precoFinal;
  return {
    numero: e.numero,
    aba,
    localizado: true,
    medicamento: nomeMedicamento(r),
    catmat: codigoItem,
    descricaoCatmat: r.item.descricao,
    unidade: r.unidade,
    quantidade: e.quantidade,
    conjuntoUnico: consolidado.porRegistro,
    fontes: consolidado.fontes
      .filter((f): f is typeof f & { fonte: FonteMercadoChave } => f.fonte !== "cmed")
      .map((f) => ({
        fonte: f.fonte,
        rotulo: INFO_FONTE[f.fonte].rotulo,
        inciso: INFO_FONTE[f.fonte].inciso,
        estatisticas: f.estatisticas,
      })),
    porFonte: consolidado.porFonte,
    metodo: rec.escolha.metodo,
    regraTeto: rec.escolha.regraTeto,
    aliquota: rec.escolha.aliquota,
    descricaoMetodo: rec.descricaoMetodo,
    precoAdotado,
    teto: rec.teto,
    valorTotal: precoAdotado === null ? null : precoAdotado * e.quantidade,
    justificativa: editada || gerarJustificativa(r, e.contexto),
    justificativaEditada: !!editada,
    status: statusDoItem(e),
    linhas,
    ipcaLigado: fontesDoResultado(r).some(({ dados }) => dados.registros.some((x) => x.fatorIpca != null)),
    cmed: linhasCmed(r, rec.escolha.aliquota),
    descricaoTeto: `${rotuloRegraTeto(rec.escolha.regraTeto, rec.escolha.aliquota)}${
      rec.teto ? ` — ${rec.teto.produto} (reg. ${rec.teto.registro})` : " — sem PMVG vigente"
    }`,
    descricaoPeriodo: `${descricaoPeriodo(r.periodo)}${
      r.ipca.ligado && r.ipca.mesBase ? ` IPCA até ${r.ipca.mesBase.slice(5, 7)}/${r.ipca.mesBase.slice(0, 4)}.` : " Sem correção pelo IPCA."
    }${r.duplicidades ? ` ${r.duplicidades} duplicata(s) entre bases fora do conjunto único.` : ""}`,
  };
}

/** Nota de rodapé da Consolidação a partir do que foi usado de fato. */
export function notaConsolidacao(itens: MapaItem[]): string {
  const contagem = new Map<string, number>();
  for (const i of itens) {
    if (i.precoAdotado === null) continue;
    const chave = i.descricaoMetodo.startsWith("Teto CMED") ? "teto CMED" : ROTULO_METODO[i.metodo].curto.toLowerCase();
    contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
  }
  const metodos = Array.from(contagem.entries())
    .map(([m, n]) => `${m} (${n} ${n === 1 ? "item" : "itens"})`)
    .join(", ");
  return `Valores calculados conforme IN SEGES/ME nº 65/2021, a partir das bases consultadas pelo Painel DJUD. ${
    metodos ? `Métodos: ${metodos}.` : "Nenhum item com preço apurado."
  } O detalhamento de cada item, com os registros que compõem e os que não compõem a base, está na aba do respectivo item; a memória de cálculo e a justificativa técnica, na aba MEMÓRIA DE CÁLCULO.`;
}
