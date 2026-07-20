#!/usr/bin/env node

/**
 * Script de Importação: dashboard_sismat_pmvg.html → schema "sismat" (tabela SismatPmvg)
 *
 * A base SISMAT × PMVG (compras do SISMAT já pareadas com o PMVG vigente na data
 * de entrega, ~1,3 mil linhas) foi entregue EMBUTIDA em um dashboard HTML
 * estático (`const PAYLOAD = {...};` dentro do <script>). Este script extrai
 * esse JSON do HTML e grava os registros no banco — a partir daí a sub-aba
 * "PMVG" (aba Preços) consulta tudo via API/Prisma.
 *
 * Particularidades:
 *   • Aceita o próprio .html OU um .json já extraído (mesma estrutura {cols, rows}).
 *   • Campos curtos da origem: m=material (SISMAT), sm=medicamento (PMVG),
 *     f=fabricante, d=data de entrega (YYYY-MM-DD), q=quantidade, vu=valor
 *     unitário pago, vt=valor total, sc=score do match, qp=unid./embalagem,
 *     qm=método da qtd (leading_count|trailing_x|default_single), pd=competência
 *     do PMVG usada (YYYY-MM-DD ou null), ap=apresentação, p=[preço de embalagem
 *     por alíquota, na ordem de PAYLOAD.cols; null onde ausente].
 *   • PAYLOAD.cols é VALIDADO contra a ordem esperada (mesma de PMVG_COLS em
 *     lib/pmvg-metrics.ts) — se a origem mudar as colunas, o script aborta em
 *     vez de gravar índices desalinhados.
 *   • Datas viram meia-noite UTC (mesma convenção dos demais imports).
 *   • Números já vêm com ponto decimal (JSON) — NÃO aplicar parsing pt-BR.
 *
 * Uso:
 *   npx tsx scripts/import-sismat-pmvg.ts --dry-run
 *   npx tsx scripts/import-sismat-pmvg.ts --limit=100
 *   npx tsx scripts/import-sismat-pmvg.ts --truncate --confirm
 *   npx tsx scripts/import-sismat-pmvg.ts --file="/caminho/dashboard_sismat_pmvg.html"
 *
 * Fonte do arquivo: --file=... > env SISMAT_PMVG_HTML > ./dashboard_sismat_pmvg.html
 */

import * as fs from "fs";
import * as path from "path";

// ── Flags / config ──────────────────────────────────────────────────────────

const arg = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");

const DRY_RUN = process.argv.includes("--dry-run");
const CONFIRM = process.argv.includes("--confirm");
const TRUNCATE = process.argv.includes("--truncate");
const LIMIT = parseInt(arg("limit") || "0", 10);
const BATCH_SIZE = 500;

const FILE_PATH =
  arg("file") ||
  process.env.SISMAT_PMVG_HTML ||
  path.join(process.cwd(), "dashboard_sismat_pmvg.html");

/**
 * Ordem esperada das colunas de alíquota — DEVE ser idêntica a PMVG_COLS em
 * lib/pmvg-metrics.ts (o array p[] gravado no banco é indexado por esta ordem).
 * Duplicado aqui de propósito: o script roda via tsx sem os aliases "@/" e sem
 * o client Prisma gerado no --dry-run; a validação abaixo garante o alinhamento.
 */
const EXPECTED_COLS = [
  "PMVG 0%",
  "PMVG 12%",
  "PMVG 12% ALC",
  "PMVG 17%",
  "PMVG 17% ALC",
  "PMVG 17,5%",
  "PMVG 17,5% ALC",
  "PMVG 18%",
  "PMVG 18% ALC",
  "PMVG 19%",
  "PMVG 19% ALC",
  "PMVG 19,5%",
  "PMVG 19,5% ALC",
  "PMVG 20%",
  "PMVG 20% ALC",
  "PMVG 20,5%",
  "PMVG 20,5% ALC",
  "PMVG 21%",
  "PMVG 21% ALC",
  "PMVG 22%",
  "PMVG 22% ALC",
  "PMVG 22,5%",
  "PMVG 22,5% ALC",
  "PMVG 23%",
  "PMVG 23% ALC",
  "PMVG Sem Impostos",
];

// ── Tipos da origem ──────────────────────────────────────────────────────────

interface RegistroOrigem {
  m: string; // material (SISMAT)
  sm: string; // medicamento/princípio ativo (PMVG)
  f: string; // fabricante
  d: string; // data de entrega "YYYY-MM-DD"
  q: number; // quantidade de unidades
  vu: number; // valor unitário pago
  vt: number; // valor total pago
  sc: number; // score do match (0–100)
  qp: number; // unidades por embalagem estimadas
  qm: string; // método da qtd/emb.
  pd: string | null; // competência do PMVG usada, ou null
  ap: string | null; // apresentação do PMVG pareado
  p: (number | null)[]; // preço de embalagem por alíquota (ordem de cols)
}

interface DadosOrigem {
  cols: string[];
  rows: RegistroOrigem[];
  generated_at?: string;
}

interface LinhaBanco {
  material: string;
  subMaterial: string;
  fabricante: string;
  dtEntrega: Date;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
  score: number;
  qtdEmbalagem: number;
  metodoQtd: string;
  pmvgCompetencia: Date | null;
  apresentacao: string | null;
  pmvgPrecos: (number | null)[];
}

// ── Extração do JSON embutido no HTML ────────────────────────────────────────

/**
 * Localiza `const PAYLOAD = {...};` dentro do HTML e devolve o objeto parseado.
 * Estratégia robusta a `};` dentro de strings: o fim do objeto é o ÚLTIMO `}`
 * antes da próxima declaração (`const COLS`), e não a primeira ocorrência de
 * `};` — assim nomes de materiais/apresentações com caracteres exóticos não
 * quebram (mesma abordagem do import-comprasgov-precos.ts).
 */
function extrairPayloadDoHtml(html: string): DadosOrigem {
  const marcador = "const PAYLOAD = ";
  const inicio = html.indexOf(marcador);
  if (inicio < 0) {
    throw new Error("Não encontrei `const PAYLOAD = ` no HTML — o arquivo é o dashboard correto?");
  }
  const jsonInicio = inicio + marcador.length;

  // A declaração seguinte no dashboard original é `const COLS = PAYLOAD.cols;`.
  // Caso o marcador não exista (variação do arquivo), cai para o fim do <script>.
  let limite = html.indexOf("const COLS", jsonInicio);
  if (limite < 0) limite = html.indexOf("</script>", jsonInicio);
  if (limite < 0) limite = html.length;

  const fim = html.lastIndexOf("}", limite);
  if (fim <= jsonInicio) {
    throw new Error("Não consegui delimitar o objeto PAYLOAD dentro do HTML.");
  }

  return JSON.parse(html.slice(jsonInicio, fim + 1)) as DadosOrigem;
}

function lerDados(): DadosOrigem {
  if (!fs.existsSync(FILE_PATH)) {
    throw new Error(
      `Arquivo não encontrado: ${FILE_PATH}\n` +
        `   Informe com --file="/caminho/dashboard_sismat_pmvg.html" ou env SISMAT_PMVG_HTML.`
    );
  }
  const conteudo = fs.readFileSync(FILE_PATH, "utf-8");
  const dados = FILE_PATH.toLowerCase().endsWith(".json")
    ? (JSON.parse(conteudo) as DadosOrigem)
    : extrairPayloadDoHtml(conteudo);

  if (!Array.isArray(dados.rows)) {
    throw new Error("Estrutura inesperada: a propriedade `rows` não é um array.");
  }
  if (!Array.isArray(dados.cols)) {
    throw new Error("Estrutura inesperada: a propriedade `cols` não é um array.");
  }
  validarCols(dados.cols);
  return dados;
}

/** Aborta se as colunas de alíquota não baterem (ordem E valores) com o app. */
function validarCols(cols: string[]) {
  const iguais =
    cols.length === EXPECTED_COLS.length && cols.every((c, i) => c === EXPECTED_COLS[i]);
  if (!iguais) {
    throw new Error(
      "As colunas de alíquota do PAYLOAD não batem com PMVG_COLS (lib/pmvg-metrics.ts).\n" +
        `   Esperado (${EXPECTED_COLS.length}): ${EXPECTED_COLS.join(" | ")}\n` +
        `   Recebido (${cols.length}): ${cols.join(" | ")}\n` +
        "   Atualize PMVG_COLS e EXPECTED_COLS em conjunto antes de importar."
    );
  }
}

// ── Mapeamento origem → banco ────────────────────────────────────────────────

function sanitizeStr(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).replace(/\u200b/g, "").trim();
  return s || null;
}

/** Data "YYYY-MM-DD" → meia-noite UTC (mesma convenção dos demais imports). */
function parseDataUTC(d: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d).trim());
  if (!m) return null;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return isNaN(dt.getTime()) ? null : dt;
}

function paraLinha(r: RegistroOrigem): LinhaBanco | null {
  const material = sanitizeStr(r.m);
  const subMaterial = sanitizeStr(r.sm);
  const fabricante = sanitizeStr(r.f);
  const metodoQtd = sanitizeStr(r.qm);
  const dtEntrega = r.d ? parseDataUTC(r.d) : null;
  const pmvgCompetencia = r.pd ? parseDataUTC(r.pd) : null;

  if (
    !material ||
    !subMaterial ||
    !fabricante ||
    !metodoQtd ||
    !dtEntrega ||
    typeof r.vu !== "number" ||
    isNaN(r.vu) ||
    typeof r.sc !== "number" ||
    isNaN(r.sc)
  ) {
    return null; // linha incompleta — descartada (contabilizada no resumo)
  }

  // p[] normalizado para o comprimento das colunas: números finitos ou null.
  const pmvgPrecos: (number | null)[] = EXPECTED_COLS.map((_, i) => {
    const v = Array.isArray(r.p) ? r.p[i] : null;
    return typeof v === "number" && isFinite(v) ? v : null;
  });

  return {
    material,
    subMaterial,
    fabricante,
    dtEntrega,
    quantidade: typeof r.q === "number" && !isNaN(r.q) ? r.q : 0,
    valorUnitario: r.vu,
    valorTotal: typeof r.vt === "number" && !isNaN(r.vt) ? r.vt : 0,
    score: r.sc,
    qtdEmbalagem: typeof r.qp === "number" && !isNaN(r.qp) && r.qp > 0 ? r.qp : 1,
    metodoQtd,
    pmvgCompetencia,
    apresentacao: sanitizeStr(r.ap),
    pmvgPrecos,
  };
}

// ── Resumo (dry-run e pré-importação) ────────────────────────────────────────

function resumo(linhas: LinhaBanco[], descartadas: number) {
  const materiais = new Set(linhas.map((l) => l.material));
  const fabricantes = new Set(linhas.map((l) => l.fabricante));
  const comPmvg = linhas.filter((l) => l.pmvgPrecos.some((v) => v !== null)).length;
  const datas = linhas.map((l) => l.dtEntrega.getTime());
  const fmt = (t: number) => new Date(t).toISOString().slice(0, 10);

  console.log("\n📊 Resumo dos dados extraídos:");
  console.log(`   Registros válidos:      ${linhas.length.toLocaleString("pt-BR")}`);
  console.log(`   Linhas descartadas:     ${descartadas.toLocaleString("pt-BR")}`);
  console.log(`   Materiais distintos:    ${materiais.size.toLocaleString("pt-BR")}`);
  console.log(`   Fabricantes distintos:  ${fabricantes.size.toLocaleString("pt-BR")}`);
  console.log(
    `   Com PMVG na entrega:    ${comPmvg.toLocaleString("pt-BR")} (${linhas.length ? ((100 * comPmvg) / linhas.length).toFixed(1) : "0.0"}%)`
  );
  if (datas.length) {
    console.log(`   Período de entregas:    ${fmt(Math.min(...datas))} → ${fmt(Math.max(...datas))}`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`📁 Lendo: ${FILE_PATH}`);
  const dados = lerDados();
  console.log(`   Colunas de alíquota OK (${dados.cols.length}) — ordem validada contra PMVG_COLS.`);

  let registros = dados.rows;
  if (LIMIT > 0) registros = registros.slice(0, LIMIT);

  const linhas: LinhaBanco[] = [];
  let descartadas = 0;
  for (const r of registros) {
    const linha = paraLinha(r);
    if (linha) linhas.push(linha);
    else descartadas++;
  }

  resumo(linhas, descartadas);

  if (DRY_RUN) {
    console.log("\n✅ DRY_RUN concluído — nenhum dado gravado.");
    return;
  }

  if (!LIMIT && !CONFIRM) {
    console.log(
      "\n⛔ Importação completa requer --confirm (ou use --limit=N para testar).\n" +
        "   Ex.: npx tsx scripts/import-sismat-pmvg.ts --truncate --confirm"
    );
    return;
  }

  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient({ log: ["error"] });

  try {
    if (TRUNCATE) {
      console.log("\n🧹 Limpando tabela sismat.SismatPmvg...");
      const del = await db.sismatPmvg.deleteMany({});
      console.log(`   ${del.count} registro(s) removido(s).`);
    }

    console.log(`\n💾 Inserindo ${linhas.length} registro(s) em lotes de ${BATCH_SIZE}...`);
    let inseridos = 0;
    for (let i = 0; i < linhas.length; i += BATCH_SIZE) {
      const lote = linhas.slice(i, i + BATCH_SIZE);
      const res = await db.sismatPmvg.createMany({ data: lote });
      inseridos += res.count;
      process.stdout.write(`\r   ${inseridos}/${linhas.length}`);
    }
    console.log(`\n✅ Importação concluída: ${inseridos} registro(s).`);
    console.log("   Reexecuções: use --truncate para substituir a base (id é autoincremento).");
  } catch (err) {
    console.error("\n❌ Erro na importação:", err);
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
