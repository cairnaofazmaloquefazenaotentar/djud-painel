/**
 * Confere lib/dados-abertos/mapear.ts contra os casos de
 * scripts/fixtures/dados-abertos/esperado_mapear.json — os mesmos que o espelho
 * Python (scripts/dados_abertos_mapear.py --autoteste) confere.
 *
 * Uso:
 *   npx tsx scripts/conferir-mapear-dados-abertos.ts            # confere
 *   npx tsx scripts/conferir-mapear-dados-abertos.ts --gravar   # regrava o esperado
 *
 * Regravar só depois de revisar a diferença: o arquivo é o contrato entre as
 * duas implementações.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  chaveItem22,
  limparDescricao,
  mapearArpItem,
  mapearBps,
  mapearComprasGov,
  normalizarIdCompra,
  numeroCompraDoId,
  parseJsonSeguro,
  unidadeComprasGov,
} from "../lib/dados-abertos/mapear";

const DIR = join(__dirname, "fixtures", "dados-abertos");
// Como o cliente lê a API: sem arredondar os inteiros de 17 dígitos.
const ler = (nome: string) => parseJsonSeguro(readFileSync(join(DIR, nome), "utf8")) as Record<string, any>;

function casos() {
  const cg = ler("comprasgov_1_consultarMaterial.json").resultado as Record<string, unknown>[];
  const bps = ler("bps_economia_da_saude.json").bps as Record<string, unknown>[];
  const arp = ler("arp_2_consultarARPItem.json").resultado as Record<string, unknown>[];
  // Linhas como a planilha do extrator grava (CSV da API: números com vírgula,
  // idCompra de 16 dígitos sem o zero, sem idCompraItem).
  const planilha: Record<string, unknown>[] = [
    {
      idCompra: "9020105901632024",
      numeroItemCompra: "6",
      codigoItemCatalogo: "410020",
      descricaoItem: "ELTROMBOPAG OLAMINA , CONCENTRAÇÃO:50 MG*",
      nomeUnidadeFornecimento: "",
      siglaUnidadeFornecimento: "COMPR",
      capacidadeUnidadeFornecimento: "0,00",
      siglaUnidadeMedida: "",
      quantidade: "676.119,00",
      precoUnitario: "233,92",
      modalidade: "5",
      criterioJulgamento: "V",
      estado: "sp",
      codigoUasg: "90201",
      dataCompra: "10/01/2025",
    },
    {
      idCompra: "12019505900412026",
      numeroItemCompra: "122",
      codigoItemCatalogo: "0410020",
      descricaoItem: "<p>Solu&#231;&#227;o injet&#225;vel</p>   1¿C",
      nomeUnidadeFornecimento: "Frasco",
      siglaUnidadeFornecimento: "FR",
      capacidadeUnidadeFornecimento: "100,00",
      siglaUnidadeMedida: "ML",
      quantidade: "10",
      precoUnitario: "1.234,5",
      modalidade: "77",
      criterioJulgamento: "X",
      dataCompra: "2026-08-13",
    },
  ];
  return {
    funcoes: {
      normalizarIdCompra: ["9020105901632024", "12019505900412026", "123", 12019505900412026].map((v) => [
        String(v),
        normalizarIdCompra(v),
      ]),
      chaveItem22: [
        ["9020105901632024", "6"],
        ["12019505900412026", "122"],
        ["12019505900412026", "123456"],
      ].map(([a, b]) => [`${a}|${b}`, chaveItem22(a, b)]),
      numeroCompraDoId: ["12019505900412026", "09020105901632024", "98859905000292026"].map((v) => [v, numeroCompraDoId(v)]),
      limparDescricao: [
        "ELTROMBOPAG OLAMINA, CONCENTRAÇÃO:50 MG",
        "<div>Momelotinibe</div> ,  CONCENTRA&#199;&#195;O : 100 MG*",
        "Temperatura 2¿C a 8¿C\u000bcom\u2028quebra",
      ].map((v) => [v, limparDescricao(v)]),
      unidadeComprasGov: [
        { nomeUnidadeFornecimento: "COMPRIMIDO", capacidadeUnidadeFornecimento: 0 },
        { nomeUnidadeFornecimento: "", siglaUnidadeFornecimento: "FR-AM", capacidadeUnidadeFornecimento: 10, siglaUnidadeMedida: "ML" },
        { siglaUnidadeFornecimento: "XYZ", capacidadeUnidadeFornecimento: "0,00", siglaUnidadeMedida: "ML" },
      ].map((v) => [JSON.stringify(v), unidadeComprasGov(v)]),
    },
    comprasgov: cg.map((i) => mapearComprasGov(i, "API_PAINEL")),
    planilhaExtrator: planilha.map((i) => mapearComprasGov(i, "EXTRATOR")),
    bps: bps.map((i) => mapearBps(i, "API_PAINEL")),
    arp: arp.map((i) => mapearArpItem(i, "API_PAINEL")),
  };
}

const atual = JSON.parse(JSON.stringify(casos()));
const arquivo = join(DIR, "esperado_mapear.json");
if (process.argv.includes("--gravar")) {
  writeFileSync(arquivo, JSON.stringify(atual, null, 1) + "\n");
  console.log(`gravado: ${arquivo}`);
  process.exit(0);
}
const esperado = JSON.parse(readFileSync(arquivo, "utf8"));
const a = JSON.stringify(atual, null, 1).split("\n");
const e = JSON.stringify(esperado, null, 1).split("\n");
const diferencas = a.map((l, i) => (l === e[i] ? null : `  linha ${i + 1}: obtido ${l.trim()} | esperado ${(e[i] ?? "").trim()}`)).filter(Boolean);
if (diferencas.length || a.length !== e.length) {
  console.error(`mapear.ts difere do esperado (${diferencas.length} linha(s)):\n${diferencas.slice(0, 20).join("\n")}`);
  process.exit(1);
}
console.log("mapear.ts confere com esperado_mapear.json");
