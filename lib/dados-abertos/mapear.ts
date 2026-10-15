import { createHash } from "node:crypto";

// ─────────────────────────────────────────────────────────────────────────────
// APIs de dados abertos → linha de DadosAbertosPreco. ÚNICO lugar do painel
// que conhece os nomes de campo das APIs (Compras.gov.br e BPS do Ministério da
// Saúde); o resto lê DadosAbertosPreco.
//
// As regras foram portadas do Extrator-CATMAT-DA (abelogliari/Extrator-CATMAT-DA)
// e têm espelho em Python, scripts/dados_abertos_mapear.py, usado pela carga em
// lote da saída do extrator (scripts/import_extrator_da.py). Mudou uma regra
// aqui, mude lá: os dois são conferidos contra
// scripts/fixtures/dados-abertos/esperado_mapear.json.
//
// Ids estáveis (obrigatório): a curadoria grava exclusões pelo id do registro.
// Recoletar o mesmo CATMAT tem de devolver os mesmos ids — por isso nada de
// cuid() aqui:
//   COMPRASGOV:<chave de 22 dígitos do item da compra>
//   BPS:<sha1 do conteúdo canônico>  (o BPS não tem id de registro)
//   ARP:<nº de controle PNCP da ata>:<nº do item>
// ─────────────────────────────────────────────────────────────────────────────

export type OrigemDadosAbertos = "COMPRASGOV" | "BPS" | "PNCP_ITEM" | "ARP_ITEM";
export type OrigemCarga = "API_PAINEL" | "EXTRATOR";

/** Código de modalidade do Painel de Preços → nome (MAPA_MODALIDADE_DA do extrator). */
export const MAPA_MODALIDADE_DA: Record<string, string> = {
  "1": "Convite",
  "2": "Tomada de Preços",
  "3": "Concorrência",
  "4": "Concorrência Internacional",
  "5": "Pregão",
  "6": "Dispensa de Licitação",
  "7": "Inexigibilidade de Licitação",
  "20": "Concurso",
  "22": "Regime Diferenciado de Contratações",
  "99": "Não informado",
};

/**
 * Código de critério de julgamento do Painel de Preços → nome. Conferido contra
 * o critério que o PNCP devolve para as mesmas compras (15/10/2026): "V" e "1"
 * = menor preço; "0" e vazio aparecem nas dispensas, onde o PNCP diz "não se
 * aplica". Código fora da lista sai como "código X".
 */
export const MAPA_CRITERIO_DA: Record<string, string> = {
  V: "Menor preço",
  "1": "Menor preço",
  "0": "Não se aplica",
};

/** Sigla da unidade de fornecimento → nome (o _SIGLA_NOME do extrator). */
export const SIGLA_UNIDADE: Record<string, string> = {
  "FR-AM": "Frasco-Ampola", FR: "Frasco", CAPS: "Cápsula",
  COMPR: "Comprimido", AM: "Ampola", UN: "Unidade",
  SER: "Seringa", BIS: "Bisnaga", BLIS: "Blister",
  BOL: "Bolsa", BOM: "Bombona", CA: "Cartucho",
  CI: "Curie", CJ: "Conjunto", "DOSE(S)": "Dose(s)",
  DOSES: "Dose(s)", DRAG: "Drágea", EMB: "Embalagem",
  EMP: "Emplastro", ENV: "Envelope", FLAC: "Flaconete",
  G: "Grama", GL: "Galão", GLOB: "Glóbulo",
  KG: "Quilograma", L: "Litro", MCG: "Micrograma",
  MCU: "Milicurie", MG: "Miligrama",
  "MIL CTE": "Milheiro de Cartelas", ML: "Mililitro",
  PAST: "Pastilha", POTE: "Pote", RO: "Rolo",
  SAC: "Sachê", SUP: "Supositório", TAB: "Tablete",
  TBO: "Tubo", TBTE: "Tubete", UI: "Unid. Internacional",
};

// ── JSON da API ──────────────────────────────────────────────────────────────

/**
 * JSON.parse que não perde dígitos: o Compras.gov.br devolve `idCompra` como
 * inteiro de 16–17 dígitos, acima de 2^53, e o JavaScript o arredondaria
 * (78770006000872025 → 78770006000872030). Inteiros com 16+ dígitos viram
 * texto antes do parse.
 */
export function parseJsonSeguro(texto: string): unknown {
  return JSON.parse(texto.replace(/(:\s*)(-?\d{16,})(?=\s*[,}\]])/g, '$1"$2"'));
}

// ── Texto ────────────────────────────────────────────────────────────────────

/**
 * Caracteres de controle e quebras "falsas" (\x0b, \x0c, \x1c–\x1e, \x85,
 * \u2028, \u2029) viram espaço: o Excel recusa os de controle e o
 * `splitlines` do Python quebra linha nos outros.
 */
export function limparControle(v: unknown): string {
  return String(v ?? "")
    .replace(/\r\n|\r|\n/g, " ")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u001c-\u001e\u0085\u2028\u2029]/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
}

const TAGS = /<\/?(div|span|p|br|b|i|strong|em)[^>]*>/gi;
const ENTIDADES: Array<[string, string]> = [
  ["&#193;", "Á"], ["&#194;", "Â"], ["&#195;", "Ã"], ["&#199;", "Ç"],
  ["&#201;", "É"], ["&#202;", "Ê"], ["&#205;", "Í"], ["&#211;", "Ó"],
  ["&#212;", "Ô"], ["&#213;", "Õ"], ["&#218;", "Ú"], ["&#220;", "Ü"],
  ["&#225;", "á"], ["&#226;", "â"], ["&#227;", "ã"], ["&#231;", "ç"],
  ["&#233;", "é"], ["&#234;", "ê"], ["&#237;", "í"], ["&#243;", "ó"],
  ["&#244;", "ô"], ["&#245;", "õ"], ["&#250;", "ú"], ["&#252;", "ü"],
  ["&#186;", "º"], ["&#170;", "ª"],
];
/** O [[:space:]] do PostgreSQL. */
const ESP = "[ \\t\\n\\r\\f\\v]";
const DOIS_PONTOS = new RegExp(`${ESP}*:${ESP}*`, "g");
const ESPACO_VIRGULA = new RegExp(`${ESP}+,`, "g");
const ESPACOS = new RegExp(`${ESP}+`, "g");

/**
 * Descrição limpa exatamente como o `limpar_descricao_bps` do extrator (que é
 * o mesmo bloco do extracao_bps.sql e do tratar_catalogo.py), depois da
 * limpeza de controle. Vale para o BPS e para o Compras.gov.br (P25).
 */
export function limparDescricao(v: unknown): string {
  let s = limparControle(v);
  if (!s) return "";
  s = s.replace(TAGS, "");
  for (const [entidade, caractere] of ENTIDADES) s = s.split(entidade).join(caractere);
  s = s.replace(/¿/g, "°").replace(/\*/g, "");
  s = s.replace(DOIS_PONTOS, ": ").replace(ESPACO_VIRGULA, ",").replace(ESPACOS, " ");
  return s.replace(/^ +| +$/g, "");
}

function texto(v: unknown): string | null {
  const s = limparControle(v);
  return s && !["nan", "none", "null"].includes(s.toLowerCase()) ? s : null;
}

function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  // Planilha do extrator (CSV da API): "1.234,56" ou "1234.56".
  let s = String(v).trim();
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** "2026-08-13", "2026-08-13T00:00:00", "13/08/2026" → "2026-08-13". */
export function dataIso(v: unknown): string | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  const s = String(v ?? "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{2})[/-](\d{2})[/-](\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

/** CATMAT como chave: só dígitos, sem zeros à esquerda. */
export function codigoCatmat(v: unknown): string | null {
  const s = String(v ?? "").trim().replace(/\.0+$/, "");
  if (!/^\d+$/.test(s)) return null;
  return s.replace(/^0+/, "") || "0";
}

/** Só os dígitos de um CNPJ/CPF; null se não houver. */
export function soDigitos(v: unknown): string | null {
  const d = String(v ?? "").replace(/\D/g, "");
  return d || null;
}

// ── Compra e item da compra ──────────────────────────────────────────────────

/**
 * idCompra com 17 dígitos. UASG de 5 dígitos gera um id de 16; a API do PNCP
 * só acha a compra com o zero à esquerda (conferido em 15/10/2026).
 */
export function normalizarIdCompra(v: unknown): string | null {
  const s = String(v ?? "").trim().replace(/\.0+$/, "");
  if (!/^\d{16,17}$/.test(s)) return null;
  return s.padStart(17, "0");
}

/** Chave do item da compra = idCompra (17) + nº do item (5) — a "Identif Item Compra" do DW. */
export function chaveItem22(idCompra: unknown, numeroItem: unknown): string | null {
  const id = normalizarIdCompra(idCompra);
  const item = String(numeroItem ?? "").trim().replace(/\.0+$/, "");
  if (!id || !/^\d{1,5}$/.test(item)) return null;
  return id + item.padStart(5, "0");
}

/** idCompra de 17 dígitos = UASG (6) + modalidade (2) + número (5) + ano (4). */
export function partesIdCompra(id17: string): { uasg: string; modalidade: string; numero: string; ano: string } {
  return { uasg: id17.slice(0, 6), modalidade: id17.slice(6, 8), numero: id17.slice(8, 13), ano: id17.slice(13, 17) };
}

/** UASG com 6 dígitos ("90201" da planilha → "090201", como a API grava). */
export function normalizarUasg(v: unknown): string | null {
  const s = String(v ?? "").trim().replace(/\.0+$/, "");
  if (!s) return null;
  return /^\d{1,6}$/.test(s) ? s.padStart(6, "0") : s;
}

/** "90041/2026" — como o Compras.gov.br exibe o nº da compra. */
export function numeroCompraDoId(id17: string): string {
  const p = partesIdCompra(id17);
  return `${p.numero}/${p.ano}`;
}

/** "100,00" — a capacidade como a variante CSV da API a escreve. */
function capacidadeTexto(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

/**
 * Unidade de fornecimento como o extrator monta: nome (ou a sigla traduzida)
 * + capacidade + sigla da medida, estas duas só quando a capacidade não é 0.
 */
export function unidadeComprasGov(item: Record<string, unknown>): string {
  let nome = texto(item.nomeUnidadeFornecimento) ?? "";
  const sigla = texto(item.siglaUnidadeFornecimento) ?? "";
  if (!nome && sigla) nome = SIGLA_UNIDADE[sigla.toUpperCase()] ?? sigla;
  const capBruta = item.capacidadeUnidadeFornecimento;
  const cap = numero(capBruta);
  const medida = texto(item.siglaUnidadeMedida) ?? "";
  const partes = nome ? [nome] : [];
  if (cap !== null && cap !== 0) {
    partes.push(typeof capBruta === "string" && capBruta.trim() ? capBruta.trim() : capacidadeTexto(cap));
    if (medida) partes.push(medida);
  }
  return partes.join(" ");
}

export function nomeModalidade(codigo: unknown): string | null {
  const c = String(codigo ?? "").trim().replace(/\.0+$/, "");
  if (!c) return null;
  return MAPA_MODALIDADE_DA[c] ?? `Modalidade ${c}`;
}

export function nomeCriterio(codigo: unknown): string | null {
  const c = String(codigo ?? "").trim();
  if (!c) return null;
  return MAPA_CRITERIO_DA[c] ?? `código ${c}`;
}

// ── Linha de DadosAbertosPreco ───────────────────────────────────────────────

/** Campos de DadosAbertosPreco (prisma/schema.prisma), exceto `coletadoEm`/`bruto`. */
export interface LinhaDadosAbertos {
  id: string;
  origem: OrigemDadosAbertos;
  chaveOrigem: string;
  chaveItemCompra22: string | null;
  codigoCatmat: string;
  codigoPdm: string | null;
  descricao: string;
  descricaoDetalhada: string | null;
  unidade: string | null;
  capacidade: number | null;
  quantidade: number | null;
  precoUnitario: number;
  valorUnitarioEstimado: number | null;
  dataCompra: string | null;
  dataResultado: string | null;
  dataInsercao: string | null;
  idCompra: string | null;
  numeroCompra: string | null;
  numeroItemCompra: string | null;
  modalidade: string | null;
  criterioJulgamento: string | null;
  forma: string | null;
  situacao: string | null;
  codigoUasg: string | null;
  nomeUasg: string | null;
  orgao: string | null;
  cnpjOrgao: string | null;
  esfera: string | null;
  poder: string | null;
  uf: string | null;
  municipio: string | null;
  niFornecedor: string | null;
  nomeFornecedor: string | null;
  marca: string | null;
  cnpjFabricante: string | null;
  nomeFabricante: string | null;
  registroAnvisa: string | null;
  generico: boolean | null;
  processoCompra: string | null;
  numeroAta: string | null;
  validadeCompra: string | null;
  observacoes: string | null;
  numeroControlePncp: string | null;
  numeroControlePncpAta: string | null;
  origemCarga: OrigemCarga;
}

export type Mapeado = { ok: true; linha: LinhaDadosAbertos } | { ok: false; erro: string };

export function idEstavel(origem: OrigemDadosAbertos, chave: string): string {
  const prefixo = { COMPRASGOV: "COMPRASGOV", BPS: "BPS", PNCP_ITEM: "PNCP", ARP_ITEM: "ARP" }[origem];
  return `${prefixo}:${chave}`;
}

const vazio = (origemCarga: OrigemCarga) => ({
  chaveItemCompra22: null,
  codigoPdm: null,
  descricaoDetalhada: null,
  unidade: null,
  capacidade: null,
  quantidade: null,
  valorUnitarioEstimado: null,
  dataCompra: null,
  dataResultado: null,
  dataInsercao: null,
  idCompra: null,
  numeroCompra: null,
  numeroItemCompra: null,
  modalidade: null,
  criterioJulgamento: null,
  forma: null,
  situacao: null,
  codigoUasg: null,
  nomeUasg: null,
  orgao: null,
  cnpjOrgao: null,
  esfera: null,
  poder: null,
  uf: null,
  municipio: null,
  niFornecedor: null,
  nomeFornecedor: null,
  marca: null,
  cnpjFabricante: null,
  nomeFabricante: null,
  registroAnvisa: null,
  generico: null,
  processoCompra: null,
  numeroAta: null,
  validadeCompra: null,
  observacoes: null,
  numeroControlePncp: null,
  numeroControlePncpAta: null,
  origemCarga,
});

/** Item de /modulo-pesquisa-preco/1_consultarMaterial (ou da aba "Dados CATMAT" do extrator). */
export function mapearComprasGov(item: Record<string, unknown>, origemCarga: OrigemCarga): Mapeado {
  // A chave de 22 dígitos vem pronta em `idCompraItem` (texto, sem risco de
  // arredondamento); a planilha do extrator não a traz e é montada do idCompra.
  const pronta = String(item.idCompraItem ?? "").trim();
  const chave = /^\d{22}$/.test(pronta) ? pronta : chaveItem22(item.idCompra, item.numeroItemCompra);
  if (!chave) {
    return { ok: false, erro: `idCompra/numeroItemCompra inválidos: ${String(item.idCompra)}/${String(item.numeroItemCompra)}` };
  }
  const idCompra = chave.slice(0, 17);
  const catmat = codigoCatmat(item.codigoItemCatalogo);
  if (!catmat) return { ok: false, erro: `codigoItemCatalogo inválido: ${String(item.codigoItemCatalogo)}` };
  const preco = numero(item.precoUnitario);
  if (preco === null) return { ok: false, erro: `precoUnitario inválido na compra ${chave}` };
  const partes = partesIdCompra(idCompra);
  return {
    ok: true,
    linha: {
      ...vazio(origemCarga),
      id: idEstavel("COMPRASGOV", chave),
      origem: "COMPRASGOV",
      chaveOrigem: chave,
      chaveItemCompra22: chave,
      codigoCatmat: catmat,
      codigoPdm: texto(item.codigoPdm),
      descricao: limparDescricao(item.descricaoItem) || "—",
      descricaoDetalhada: limparDescricao(item.descricaoDetalhadaItem) || null,
      unidade: unidadeComprasGov(item) || null,
      capacidade: numero(item.capacidadeUnidadeFornecimento),
      quantidade: numero(item.quantidade),
      precoUnitario: preco,
      dataCompra: dataIso(item.dataCompra),
      dataResultado: dataIso(item.dataResultado),
      idCompra,
      numeroCompra: numeroCompraDoId(idCompra),
      numeroItemCompra: String(Number(chave.slice(17))),
      modalidade: nomeModalidade(item.modalidade ?? partes.modalidade),
      criterioJulgamento: nomeCriterio(item.criterioJulgamento),
      forma: texto(item.forma),
      codigoUasg: normalizarUasg(item.codigoUasg) ?? partes.uasg,
      nomeUasg: texto(item.nomeUasg),
      orgao: texto(item.nomeOrgao),
      esfera: texto(item.esfera),
      poder: texto(item.poder),
      uf: texto(item.estado)?.toUpperCase() ?? null,
      municipio: texto(item.municipio),
      niFornecedor: soDigitos(item.niFornecedor),
      nomeFornecedor: texto(item.nomeFornecedor),
      marca: texto(item.marca),
    },
  };
}

/** Conteúdo canônico do registro BPS — a identidade dele, já que a API não dá id. */
export function chaveBps(item: Record<string, unknown>): string {
  const canonico = [
    codigoCatmat(item.codigoCatmat) ?? "",
    soDigitos(item.cnpjInstituicao) ?? "",
    dataIso(item.dataCompra) ?? "",
    dataIso(item.dataInsercao) ?? "",
    soDigitos(item.cnpjFornecedor) ?? "",
    (numero(item.precoUnitario) ?? 0).toFixed(4),
    (numero(item.quantidade) ?? 0).toFixed(4),
    texto(item.numeroProcessoCompra) ?? "",
  ].join("|");
  return createHash("sha1").update(canonico).digest("hex");
}

/** Item de GET /economia-da-saude/bps (ou da aba "BPS" do extrator). */
export function mapearBps(item: Record<string, unknown>, origemCarga: OrigemCarga): Mapeado {
  const catmat = codigoCatmat(item.codigoCatmat);
  if (!catmat) return { ok: false, erro: `codigoCatmat inválido: ${String(item.codigoCatmat)}` };
  const preco = numero(item.precoUnitario);
  if (preco === null) return { ok: false, erro: "precoUnitario inválido" };
  // A API entrega a capacidade multiplicada por 100 (25000.0 = 250,00).
  const capBruta = numero(item.capacidade);
  const capacidade = capBruta === null ? null : capBruta / 100;
  const unidadeBase = texto(item.unidadeFornecimento) ?? "";
  const medida = texto(item.unidadeMedidaCapacidade) ?? texto(item.siglaUnidadeMedida) ?? "";
  const unidade =
    capacidade !== null && capacidade !== 0 && unidadeBase
      ? `${unidadeBase} ${capacidadeTexto(capacidade)}${medida && medida.toUpperCase() !== unidadeBase.toUpperCase() ? ` ${medida}` : ""}`
      : unidadeBase;
  const chave = chaveBps(item);
  const generico = item.generico;
  return {
    ok: true,
    linha: {
      ...vazio(origemCarga),
      id: idEstavel("BPS", chave),
      origem: "BPS",
      chaveOrigem: chave,
      codigoCatmat: catmat,
      codigoPdm: texto(item.codigoPdm),
      descricao: limparDescricao(item.descricaoItem) || "—",
      unidade: unidade || null,
      capacidade,
      quantidade: numero(item.quantidade),
      precoUnitario: preco,
      // No BPS, dataCompra é a data de homologação (no SQL, compra = dt_homologacao).
      dataCompra: dataIso(item.dataCompra),
      dataInsercao: dataIso(item.dataInsercao),
      modalidade: texto(item.modalidade),
      situacao: texto(item.tipoCompra),
      orgao: texto(item.nomeInstituicao),
      cnpjOrgao: soDigitos(item.cnpjInstituicao),
      esfera: texto(item.esfera),
      uf: texto(item.estado)?.toUpperCase() ?? null,
      municipio: texto(item.municipio),
      niFornecedor: soDigitos(item.cnpjFornecedor),
      nomeFornecedor: texto(item.nomeFornecedor),
      cnpjFabricante: soDigitos(item.cnpjFabricante),
      nomeFabricante: texto(item.nomeFabricante),
      registroAnvisa: soDigitos(item.registroAnvisa),
      generico:
        typeof generico === "boolean"
          ? generico
          : /^(s|sim|true|1)$/i.test(String(generico ?? ""))
            ? true
            : /^(n|nao|não|false|0)$/i.test(String(generico ?? ""))
              ? false
              : null,
      processoCompra: texto(item.numeroProcessoCompra),
      numeroAta: texto(item.numeroAta),
      validadeCompra: texto(item.validadeCompra),
      observacoes: texto(item.observacoes),
    },
  };
}

/** Item de /modulo-arp/2_consultarARPItem. */
export function mapearArpItem(item: Record<string, unknown>, origemCarga: OrigemCarga): Mapeado {
  const ata = texto(item.numeroControlePncpAta);
  if (!ata) return { ok: false, erro: "item de ata sem nº de controle PNCP" };
  const catmat = codigoCatmat(item.codigoItem);
  if (!catmat) return { ok: false, erro: `codigoItem inválido: ${String(item.codigoItem)}` };
  const preco = numero(item.valorUnitario);
  if (preco === null) return { ok: false, erro: "valorUnitario inválido" };
  // Há atas publicadas sem o nº do item: a chave cai para CATMAT + fornecedor.
  const numeroItem = /^\d{1,5}$/.test(texto(item.numeroItem) ?? "") ? String(Number(texto(item.numeroItem))) : null;
  const chave = numeroItem ? `${ata}:${numeroItem}` : `${ata}:cat${catmat}:${soDigitos(item.niFornecedor) ?? "sem-fornecedor"}`;
  const idCompra = normalizarIdCompra(item.idCompra);
  return {
    ok: true,
    linha: {
      ...vazio(origemCarga),
      id: idEstavel("ARP_ITEM", chave),
      origem: "ARP_ITEM",
      chaveOrigem: chave,
      chaveItemCompra22: idCompra && numeroItem ? chaveItem22(idCompra, numeroItem) : null,
      codigoCatmat: catmat,
      codigoPdm: texto(item.codigoPdm),
      descricao: limparDescricao(item.descricaoItem) || "—",
      quantidade: numero(item.quantidadeHomologadaVencedor) ?? numero(item.quantidadeHomologadaItem),
      precoUnitario: preco,
      // Vigência iniciada é o que conta para a janela da ata (P17).
      dataCompra: dataIso(item.dataVigenciaInicial) ?? dataIso(item.dataAssinatura),
      dataResultado: dataIso(item.dataAssinatura),
      idCompra,
      numeroCompra: texto(item.numeroCompra) && texto(item.anoCompra) ? `${texto(item.numeroCompra)}/${texto(item.anoCompra)}` : null,
      numeroItemCompra: numeroItem,
      modalidade: texto(item.nomeModalidadeCompra),
      situacao: item.itemExcluido === true ? "Item excluído da ata" : null,
      codigoUasg: normalizarUasg(item.codigoUnidadeGerenciadora),
      nomeUasg: texto(item.nomeUnidadeGerenciadora),
      orgao: texto(item.nomeUnidadeGerenciadora),
      niFornecedor: soDigitos(item.niFornecedor),
      nomeFornecedor: texto(item.nomeRazaoSocialFornecedor),
      numeroAta: texto(item.numeroAtaRegistroPreco),
      validadeCompra: dataIso(item.dataVigenciaFinal),
      numeroControlePncp: texto(item.numeroControlePncpCompra),
      numeroControlePncpAta: ata,
    },
  };
}
