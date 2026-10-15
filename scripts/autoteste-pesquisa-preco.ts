/**
 * Autoteste dos módulos puros da Pesquisa de Preços que a avaliação da DLOG
 * (out/2026) acrescentou: período do art. 5º (D1), IPCA (D2), duplicidade
 * entre bases (P18), a escolha gravada na cesta (P11/P12) e a lista CMED do
 * teto (a consultada na tela × a vigente na data de referência, do relatório).
 *
 * Uso:
 *   npx tsx scripts/autoteste-pesquisa-preco.ts
 *
 * Sai com código 1 se algum caso falhar. Não toca no banco.
 */
import {
  descricaoPeriodo,
  inicioDasBases,
  janelaDaFonte,
  normalizarPeriodo,
  periodoAmpliado,
  subtrairMeses,
  validarPeriodo,
} from "../lib/pesquisa-preco-periodo";
import { fatorIpca, mesAnterior, mesBaseIpca, type IndicesIpca } from "../lib/ipca";
import { marcarDuplicidades, type RegistroParaDuplicidade } from "../lib/pesquisa-preco-duplicidade";
import { corrigidoPeloIpca, ORDEM_FONTES } from "../lib/pesquisa-preco-fontes";
import { calcularTetos, escolhaGravada, isentoAZero, pmvgNaAliquota } from "../lib/pesquisa-preco-metodo";
import type { CmedResultado, RegistroCmedPreco } from "../lib/pesquisa-preco";
import {
  chaveApresentacaoCmed,
  competenciaVigenteEm,
  descreverListaCmed,
  rotuloCap,
  valorNaAliquota,
} from "../lib/cmed-competencia";
import { ALIQUOTAS_ICMS } from "../lib/cmed-aliquotas";

let falhas = 0;
let casos = 0;
function confere(nome: string, obtido: unknown, esperado: unknown) {
  casos += 1;
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a !== b) {
    falhas += 1;
    console.log(`  FALHOU  ${nome}\n          obtido:   ${a}\n          esperado: ${b}`);
  }
}
const perto = (a: number, b: number, tol = 1e-12) => Math.abs(a - b) <= tol;

// ── Período (D1) ─────────────────────────────────────────────────────────────

confere("12 meses antes, mesmo dia", subtrairMeses("2026-10-15", 12), "2025-10-15");
confere("dia inexistente vira o último do mês", subtrairMeses("2026-03-31", 1), "2026-02-28");
confere("29/02 menos 12 meses", subtrairMeses("2024-02-29", 12), "2023-02-28");
confere("virada de ano", subtrairMeses("2026-01-10", 6), "2025-07-10");

const hoje = "2026-10-15";
confere("data futura vira hoje", normalizarPeriodo({ dataReferencia: "2027-01-01" }, hoje).dataReferencia, hoje);
confere("data inválida vira hoje", normalizarPeriodo({ dataReferencia: "2026-02-30" }, hoje).dataReferencia, hoje);
confere("data passada é mantida", normalizarPeriodo({ dataReferencia: "2026-03-10" }, hoje).dataReferencia, "2026-03-10");
confere("meses '24' (texto)", normalizarPeriodo({ mesesMercado: "24" }, hoje).mesesMercado, 24);
confere("meses null = todo o período", normalizarPeriodo({ mesesMercado: null }, hoje).mesesMercado, null);
confere("meses fora da lista = 12", normalizarPeriodo({ mesesMercado: 18 }, hoje).mesesMercado, 12);
confere("ausente = 12", normalizarPeriodo(undefined, hoje).mesesMercado, 12);

confere("12 meses não pede justificativa", validarPeriodo(normalizarPeriodo({}, hoje)), null);
confere(
  "24 meses sem justificativa é recusado",
  validarPeriodo(normalizarPeriodo({ mesesMercado: 24, justificativaAmpliacao: "curta" }, hoje)) !== null,
  true
);
confere(
  "24 meses com 20 caracteres passa",
  validarPeriodo(normalizarPeriodo({ mesesMercado: 24, justificativaAmpliacao: "x".repeat(20) }, hoje)),
  null
);
confere(
  "todo o período sem justificativa é recusado",
  validarPeriodo(normalizarPeriodo({ mesesMercado: null }, hoje)) !== null,
  true
);

const p12 = normalizarPeriodo({ dataReferencia: hoje }, hoje);
const p36 = normalizarPeriodo({ dataReferencia: hoje, mesesMercado: 36, justificativaAmpliacao: "x".repeat(20) }, hoje);
const pTodo = normalizarPeriodo({ dataReferencia: hoje, mesesMercado: null, justificativaAmpliacao: "x".repeat(20) }, hoje);
confere("Compras.gov.br em 12 meses", janelaDaFonte("comprasgov", p12), { inicio: "2025-10-15", fim: hoje, meses: 12, inciso: "I" });
confere("ata segue o período ampliado", janelaDaFonte("arp", p36).inicio, "2023-10-15");
confere("todo o período: sem início", janelaDaFonte("bps", pTodo).inicio, null);
// Preço informado fica na janela do seu inciso, mesmo com as bases ampliadas.
confere("mídia (III): 6 meses", janelaDaFonte("midia", p36), { inicio: "2026-04-15", fim: hoje, meses: 6, inciso: "III" });
confere("cotação (IV): 6 meses", janelaDaFonte("orcamentos", pTodo).meses, 6);
confere("nota fiscal (V): 12 meses", janelaDaFonte("notaFiscal", p36).meses, 12);

// Intervalo de datas (pedido da DLOG): de "inicio" até a data de referência.
const curto = normalizarPeriodo({ dataReferencia: hoje, inicio: "2026-03-01" }, hoje);
const longo = normalizarPeriodo({ dataReferencia: hoje, inicio: "2024-01-01" }, hoje);
confere("intervalo: início guardado", [curto.inicio, inicioDasBases(curto)], ["2026-03-01", "2026-03-01"]);
confere("intervalo depois da referência é ignorado", normalizarPeriodo({ dataReferencia: "2026-01-01", inicio: "2026-05-01" }, hoje).inicio, null);
confere("intervalo de 7 meses não é ampliação", periodoAmpliado(curto), false);
confere("intervalo de quase 3 anos é ampliação", periodoAmpliado(longo), true);
confere("intervalo longo sem justificativa é recusado", validarPeriodo(longo) !== null, true);
confere("janela das bases no intervalo", janelaDaFonte("comprasgov", curto), {
  inicio: "2026-03-01",
  fim: hoje,
  meses: null,
  inciso: "I",
  personalizado: true,
});
confere("preço informado segue o inciso mesmo com intervalo", janelaDaFonte("orcamentos", longo).meses, 6);
confere("descrição do intervalo", descricaoPeriodo(curto).includes("intervalo de 01/03/2026 a 15/10/2026"), true);
confere("contratação similar (II): 12 meses", janelaDaFonte("similar", p36).meses, 12);

// ── IPCA (D2) ────────────────────────────────────────────────────────────────

// Tabela sintética a partir de variações mensais: o número-índice é o produto.
const variacoes: Record<string, number> = {
  "2026-01": 0.5,
  "2026-02": 0.8,
  "2026-03": 0.3,
  "2026-04": -0.1,
  "2026-05": 0.4,
  "2026-06": 0.2,
  "2026-07": 0.6,
  "2026-08": 0.1,
  "2026-09": 0.4,
};
const indices: IndicesIpca = new Map([["2025-12", 7000]]);
let ni = 7000;
for (const [mes, v] of Object.entries(variacoes)) {
  ni *= 1 + v / 100;
  indices.set(mes, ni);
}

confere("mês anterior (virada de ano)", mesAnterior("2026-01-10"), "2025-12");
confere("mês-base = mês anterior à referência", mesBaseIpca("2026-10-15", indices), "2026-09");
confere("mês-base nunca é o próprio mês", mesBaseIpca("2026-09-30", indices), "2026-08");
confere(
  "mês-base = último publicado",
  mesBaseIpca("2026-12-01", new Map(Array.from(indices).filter(([m]) => m <= "2026-08"))),
  "2026-08"
);
confere("sem índice anterior = sem mês-base", mesBaseIpca("2025-12-15", indices), null);

const f = fatorIpca("2026-03", "2026-09", indices);
// Correção a partir do mês SEGUINTE ao do preço: abril a setembro.
const produto = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"].reduce(
  (acc, m) => acc * (1 + variacoes[m] / 100),
  1
);
const soma = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"].reduce((acc, m) => acc + variacoes[m] / 100, 0);
confere("fator = produto das variações seguintes", perto(f.fator, produto, 1e-12), true);
confere("fator ≠ soma das variações (erro 1 da planilha)", perto(f.fator, 1 + soma, 1e-6), false);
confere("o próprio mês do preço não entra", perto(fatorIpca("2026-09", "2026-09", indices).fator, 1), true);
confere("preço depois do mês-base: fator 1", fatorIpca("2026-10", "2026-09", indices), {
  fator: 1,
  mesPreco: "2026-10",
  mesBase: "2026-09",
  semIndice: false,
});
confere("mês sem índice: fator 1, sinalizado", fatorIpca("2024-05", "2026-09", indices), {
  fator: 1,
  mesPreco: "2024-05",
  mesBase: "2026-09",
  semIndice: true,
});
confere(
  "IPCA só nos incisos I e II",
  ORDEM_FONTES.filter(corrigidoPeloIpca),
  ["comprasgov", "bps", "arp", "similar"]
);
confere("bases do Compras.gov.br também são corrigidas", [corrigidoPeloIpca("siasg"), corrigidoPeloIpca("pncp")], [true, true]);
confere("SIASG e PNCP não são fonte própria", ORDEM_FONTES.includes("siasg") || ORDEM_FONTES.includes("pncp"), false);

// ── Duplicidade entre bases (P18) ────────────────────────────────────────────

const reg = (r: Partial<RegistroParaDuplicidade> & Pick<RegistroParaDuplicidade, "id" | "fonte">): RegistroParaDuplicidade => ({
  chaveItemCompra22: null,
  cnpjFornecedor: "11.222.333/0001-44",
  preco: 100,
  uf: "SP",
  data: "2026-05-10T00:00:00.000Z",
  qtd: 50,
  ...r,
});
const chave = "1201950590041202600122";

const porChave = marcarDuplicidades([
  reg({ id: "PNCP:1", fonte: "pncp", chaveItemCompra22: chave }),
  reg({ id: "COMPRASGOV:1", fonte: "comprasgov", chaveItemCompra22: chave }),
  reg({ id: "ARP:1", fonte: "arp", chaveItemCompra22: chave }),
]);
confere("mesma chave: prevalece o Compras.gov.br", Array.from(porChave.keys()).sort(), ["ARP:1", "PNCP:1"]);
confere("mesma chave: não é 'provável'", porChave.get("PNCP:1"), { fonte: "comprasgov", id: "COMPRASGOV:1", provavel: false });

const compras = reg({ id: "COMPRASGOV:9", fonte: "comprasgov" });
confere(
  "BPS: mesmo CNPJ, preço, UF e qtd, 10 dias → provável",
  marcarDuplicidades([compras, reg({ id: "BPS:a", fonte: "bps", data: "2026-05-20T00:00:00.000Z" })]).get("BPS:a"),
  { fonte: "comprasgov", id: "COMPRASGOV:9", provavel: true }
);
confere(
  "BPS: mesma qtd, 16 dias → não",
  marcarDuplicidades([compras, reg({ id: "BPS:a", fonte: "bps", data: "2026-05-26T00:00:00.000Z" })]).has("BPS:a"),
  false
);
confere(
  "BPS: sem qtd, 3 dias → provável",
  marcarDuplicidades([compras, reg({ id: "BPS:a", fonte: "bps", qtd: null, data: "2026-05-13T00:00:00.000Z" })]).has("BPS:a"),
  true
);
confere(
  "BPS: sem qtd, 4 dias → não",
  marcarDuplicidades([compras, reg({ id: "BPS:a", fonte: "bps", qtd: null, data: "2026-05-14T00:00:00.000Z" })]).has("BPS:a"),
  false
);
confere(
  "BPS: preço diferente no centavo → não",
  marcarDuplicidades([compras, reg({ id: "BPS:a", fonte: "bps", preco: 100.01 })]).has("BPS:a"),
  false
);
confere(
  "BPS: outra UF → não",
  marcarDuplicidades([compras, reg({ id: "BPS:a", fonte: "bps", uf: "RJ" })]).has("BPS:a"),
  false
);
confere(
  "BPS: CNPJ com e sem pontuação casa",
  marcarDuplicidades([compras, reg({ id: "BPS:a", fonte: "bps", cnpjFornecedor: "11222333000144" })]).has("BPS:a"),
  true
);
confere(
  "revertida pelo responsável → não marca",
  marcarDuplicidades([compras, reg({ id: "BPS:a", fonte: "bps" })], new Set(["BPS:a"])).has("BPS:a"),
  false
);
const dois = marcarDuplicidades([compras, reg({ id: "BPS:a", fonte: "bps" }), reg({ id: "BPS:b", fonte: "bps" })]);
confere("cada compra casa com um registro do BPS só", Array.from(dois.keys()), ["BPS:a"]);

// Base PNCP do painel × API (sem fornecedor na base): UF, preço, quantidade e até 3 dias.
const semCnpj = (r: Partial<RegistroParaDuplicidade> & Pick<RegistroParaDuplicidade, "id" | "fonte">) =>
  reg({ cnpjFornecedor: null, ...r });
confere(
  "base PNCP: mesma UF, preço e qtd, 2 dias → provável",
  marcarDuplicidades([compras, semCnpj({ id: "P:1", fonte: "pncp", data: "2026-05-12T00:00:00.000Z" })]).get("P:1"),
  { fonte: "comprasgov", id: "COMPRASGOV:9", provavel: true }
);
confere(
  "base PNCP: 5 dias → não",
  marcarDuplicidades([compras, semCnpj({ id: "P:1", fonte: "pncp", data: "2026-05-15T00:00:00.000Z" })]).has("P:1"),
  false
);
confere(
  "base PNCP: quantidade diferente → não",
  marcarDuplicidades([compras, semCnpj({ id: "P:1", fonte: "pncp", qtd: 51 })]).has("P:1"),
  false
);
confere(
  "a mesma compra na base PNCP e no BPS: as duas cópias são marcadas",
  Array.from(marcarDuplicidades([compras, semCnpj({ id: "P:1", fonte: "pncp" }), reg({ id: "BPS:a", fonte: "bps" })]).keys()).sort(),
  ["BPS:a", "P:1"]
);

// ── Escolha gravada na cesta (P11/P12) ───────────────────────────────────────

confere("sem escolha gravada", escolhaGravada({ metodoPreco: null, regraTeto: null, aliquotaTeto: null }), null);
confere(
  "escolha gravada completa",
  escolhaGravada({ metodoPreco: "criterio_dlog", regraTeto: "pmvg_referencia", aliquotaTeto: "17" }),
  { metodo: "criterio_dlog", regraTeto: "pmvg_referencia", aliquota: "17" }
);
confere(
  "valor desconhecido é ignorado",
  escolhaGravada({ metodoPreco: "inventado", regraTeto: "pmvg_referencia", aliquotaTeto: "99" }),
  { regraTeto: "pmvg_referencia" }
);

// ── Lista CMED do teto (decisão do usuário, out/2026) ───────────────────────

const listas = ["2026-08", "2026-07", "2026-06", "2020-01"];
confere("lista vigente: a última até o mês da referência", competenciaVigenteEm(listas, "2026-10-15"), "2026-08");
confere("lista vigente: o próprio mês da referência conta", competenciaVigenteEm(listas, "2026-07-01"), "2026-07");
confere("lista vigente: referência no passado", competenciaVigenteEm(listas, "2026-06-30"), "2026-06");
confere("lista vigente: antes da primeira lista", competenciaVigenteEm(listas, "2019-12-31"), null);
confere("lista vigente: sem listas", competenciaVigenteEm([], "2026-10-15"), null);

const pmvg = ALIQUOTAS_ICMS.map((_, i) => (i === 0 ? 100 : i === 4 ? 121.95 : null));
confere("alíquota sem impostos (posição 0)", valorNaAliquota(pmvg, "SEM_IMPOSTOS"), 100);
confere("alíquota 17% (posição 4)", valorNaAliquota(pmvg, "17"), 121.95);
confere("alíquota não publicada", valorNaAliquota(pmvg, "18"), null);
confere("array antigo, mais curto: posição ausente = sem preço", valorNaAliquota([100, 90], "23_ALC"), null);
confere("JSON que não é array", valorNaAliquota({ "0": 1 }, "0"), null);

confere("chave da apresentação: registro + GGREM", chaveApresentacaoCmed("1006811320035", "526815070044017", 77), "cmed:1006811320035:526815070044017");
confere("chave sem GGREM: a versão", chaveApresentacaoCmed("1006811320035", null, 77), "cmed:1006811320035:v77");
confere("CAP da lista", rotuloCap(21.5349), "21,53%");
confere("CAP sem lista mensal", rotuloCap(null), "21,53%");
const usada = { competencia: "2026-08", rotulo: "ago/2026", vigente: "2026-08", rotuloVigente: "ago/2026", capPercentual: 21.53, semImpostosPublicado: true };
confere("descrição: a lista do relatório", descreverListaCmed(usada), "lista CMED de ago/2026, a última publicada até a data de referência");
confere(
  "descrição: consulta de outra lista",
  descreverListaCmed({ ...usada, competencia: "2026-03", rotulo: "mar/2026" }),
  "lista CMED de mar/2026 (consulta; o relatório usa a de ago/2026, a última publicada até a data de referência)"
);

// ── Alíquota ICMS do teto (decisão do usuário: filtro, padrão 17%) ──────────

const pmvgs = (v: Record<string, number>) => ALIQUOTAS_ICMS.map((c) => v[c] ?? null);
const regCmed = (id: string, p: Partial<RegistroCmedPreco>): RegistroCmedPreco => ({
  id, registro: id, substancia: "X", produto: id, apresentacao: "", laboratorio: null, cnpj: null, ean: null,
  classeTerapeutica: null, tipoProduto: "Genérico", regimePreco: null, unidadeFornecimento: null, qtEmbalagem: 10,
  pmvgEmbalagem: 0, pmvg0: null, pmvg12: null, pmvg17: null, pmvg18: null, pmvgAliquotas: [], isentoIcms: false,
  pmvgAliquotaEmbalagem: null, pmvgUnitario: null, isentoAZero: false, pfEmbalagem: null, pfUnitario: null,
  cap: false, generico: null, excluidoPor: null, ...p,
});
const comum = regCmed("A", { pmvgEmbalagem: 80, pmvgAliquotas: pmvgs({ SEM_IMPOSTOS: 80, "0": 90, "17": 110 }) });
const isento = regCmed("B", { pmvgEmbalagem: 70, isentoIcms: true, pmvgAliquotas: pmvgs({ SEM_IMPOSTOS: 70, "0": 75 }) });
const novo = regCmed("C", { tipoProduto: "Novo", pmvgEmbalagem: 150, pmvgAliquotas: pmvgs({ SEM_IMPOSTOS: 150, "0": 160, "17": 195 }) });
confere("PMVG na alíquota publicada", pmvgNaAliquota(comum, "17"), 110);
confere("alíquota não publicada, produto não isento: sem preço", pmvgNaAliquota(comum, "18"), null);
confere("isento de ICMS: vale o PMVG a 0%", pmvgNaAliquota(isento, "17"), 75);
confere("isento: sinalizado", isentoAZero(isento, "17"), true);
confere("não isento: não sinalizado", isentoAZero(comum, "17"), false);
confere(
  "lista sem a coluna 'sem impostos': usa o PMVG da embalagem (0%)",
  pmvgNaAliquota(regCmed("D", { pmvgEmbalagem: 90, pmvgAliquotas: pmvgs({ "0": 90 }) }), "SEM_IMPOSTOS"),
  90
);
const cmedTeste = (registros: RegistroCmedPreco[]): CmedResultado => ({
  total: registros.length, registros, pmvgUnitMin: null, pmvgUnitMax: null, semQtEmbalagem: 0,
  excluidosManualmente: 0, lista: null, aliquota: "17", isentosAZero: 0,
});
const t17 = calcularTetos(cmedTeste([comum, isento, novo]), "17");
confere("teto menor a 17%: o isento (7,50 a 0%) é o menor", [t17.menor?.registroId, t17.menor?.valorUnitario, t17.menor?.isentoAZero], ["B", 7.5, true]);
confere("teto do medicamento de referência a 17%", [t17.referencia?.registroId, t17.referencia?.valorUnitario], ["C", 19.5]);
const tSem = calcularTetos(cmedTeste([comum, isento, novo]), "SEM_IMPOSTOS");
confere("teto menor sem impostos", [tSem.menor?.registroId, tSem.menor?.valorUnitario], ["B", 7]);
confere("escolha gravada só com a alíquota", escolhaGravada({ metodoPreco: null, regraTeto: null, aliquotaTeto: "12" }), { aliquota: "12" });

console.log(`${casos - falhas}/${casos} caso(s) conferido(s).`);
if (falhas) {
  console.log(`${falhas} falha(s).`);
  process.exit(1);
}
