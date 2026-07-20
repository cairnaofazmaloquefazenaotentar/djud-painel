#!/usr/bin/env node

/**
 * Script de Importação: dashboard_ComprasGov_Jud.html → schema "sismat" (tabela ComprasGovPreco)
 *
 * A base de preços praticados (ComprasGov, 2018–2025, ~53 mil compras) foi entregue
 * EMBUTIDA em um dashboard HTML estático (`const DATA = {...};` dentro do <script>).
 * Este script extrai esse JSON do HTML e grava os registros no banco — a partir daí a
 * aba "Preços" do painel consulta tudo via API/Prisma, sem carregar 9 MB no cliente.
 *
 * Particularidades:
 *   • Aceita o próprio .html OU um .json já extraído (mesma estrutura {records, combos, meta}).
 *   • Campos curtos da origem: m=material, u=unidade, e=esfera, c=modalidade,
 *     j=Judicial/Não Judicial, d=data (YYYY-MM-DD), q=quantidade, v=valor total,
 *     p=preço unitário. O id da origem é preservado (chave estável p/ ocultar outliers).
 *   • Datas viram meia-noite UTC (evita deslocamento de fuso nas séries temporais).
 *   • Números já vêm com ponto decimal (JSON) — NÃO aplicar parsing pt-BR.
 *
 * Uso:
 *   npx tsx scripts/import-comprasgov-precos.ts --dry-run
 *   npx tsx scripts/import-comprasgov-precos.ts --limit=100
 *   npx tsx scripts/import-comprasgov-precos.ts --truncate --confirm
 *   npx tsx scripts/import-comprasgov-precos.ts --file="/caminho/dashboard_ComprasGov_Jud.html"
 *
 * Fonte do arquivo: --file=... > env COMPRASGOV_HTML > ./dashboard_ComprasGov_Jud.html
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
const BATCH_SIZE = 1000;

const FILE_PATH =
  arg("file") ||
  process.env.COMPRASGOV_HTML ||
  path.join(process.cwd(), "dashboard_ComprasGov_Jud.html");

// ── Tipos da origem ──────────────────────────────────────────────────────────

interface RegistroOrigem {
  id: number;
  m: string; // material
  u: string; // unidade de fornecimento
  e: string; // esfera (Federal | Estadual | Municipal)
  c: string; // modalidade de compra
  j: string; // "Judicial" | "Não Judicial"
  d: string; // data "YYYY-MM-DD"
  q: number; // quantidade
  v: number; // valor total
  p: number; // preço unitário
}

interface DadosOrigem {
  records: RegistroOrigem[];
  combos?: Array<{ m: string; u: string; n: number }>;
  meta?: { total?: number; date_min?: string; date_max?: string; n_meds?: number };
}

interface LinhaBanco {
  id: number;
  material: string;
  unidade: string;
  esfera: string;
  modalidade: string;
  judicial: string;
  dtCompra: Date;
  quantidade: number;
  valorTotal: number;
  precoUnitario: number;
}

// ── Extração do JSON embutido no HTML ────────────────────────────────────────

/**
 * Localiza `const DATA = {...};` dentro do HTML e devolve o objeto parseado.
 * Estratégia robusta a `};` dentro de strings: o fim do objeto é o ÚLTIMO `}`
 * antes da próxima declaração (`const COLORS`), e não a primeira ocorrência
 * de `};` — assim nomes de medicamentos com caracteres exóticos não quebram.
 */
function extrairDataDoHtml(html: string): DadosOrigem {
  const marcador = "const DATA = ";
  const inicio = html.indexOf(marcador);
  if (inicio < 0) {
    throw new Error("Não encontrei `const DATA = ` no HTML — o arquivo é o dashboard correto?");
  }
  const jsonInicio = inicio + marcador.length;

  // A declaração seguinte no dashboard original é `const COLORS = [...]`.
  // Caso o marcador não exista (variação do arquivo), cai para o fim do <script>.
  let limite = html.indexOf("const COLORS", jsonInicio);
  if (limite < 0) limite = html.indexOf("</script>", jsonInicio);
  if (limite < 0) limite = html.length;

  const fim = html.lastIndexOf("}", limite);
  if (fim <= jsonInicio) {
    throw new Error("Não consegui delimitar o objeto DATA dentro do HTML.");
  }

  return JSON.parse(html.slice(jsonInicio, fim + 1)) as DadosOrigem;
}

function lerDados(): DadosOrigem {
  if (!fs.existsSync(FILE_PATH)) {
    throw new Error(
      `Arquivo não encontrado: ${FILE_PATH}\n` +
        `   Informe com --file="/caminho/dashboard_ComprasGov_Jud.html" ou env COMPRASGOV_HTML.`
    );
  }
  const conteudo = fs.readFileSync(FILE_PATH, "utf-8");
  const dados = FILE_PATH.toLowerCase().endsWith(".json")
    ? (JSON.parse(conteudo) as DadosOrigem)
    : extrairDataDoHtml(conteudo);

  if (!Array.isArray(dados.records)) {
    throw new Error("Estrutura inesperada: a propriedade `records` não é um array.");
  }
  return dados;
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
  const unidade = sanitizeStr(r.u);
  const esfera = sanitizeStr(r.e);
  const modalidade = sanitizeStr(r.c);
  const judicial = sanitizeStr(r.j);
  const dtCompra = parseDataUTC(r.d);

  if (
    typeof r.id !== "number" ||
    !material ||
    !unidade ||
    !esfera ||
    !modalidade ||
    !judicial ||
    !dtCompra ||
    typeof r.p !== "number" ||
    isNaN(r.p)
  ) {
    return null; // linha incompleta — descartada (contabilizada no resumo)
  }

  return {
    id: r.id,
    material,
    unidade,
    esfera,
    modalidade,
    judicial,
    dtCompra,
    quantidade: typeof r.q === "number" && !isNaN(r.q) ? r.q : 0,
    valorTotal: typeof r.v === "number" && !isNaN(r.v) ? r.v : 0,
    precoUnitario: r.p,
  };
}

// ── Resumo (dry-run e pré-importação) ────────────────────────────────────────

function resumo(linhas: LinhaBanco[], descartadas: number) {
  const materiais = new Set(linhas.map((l) => l.material));
  const combos = new Set(linhas.map((l) => `${l.material}|||${l.unidade}`));
  const judiciais = linhas.filter((l) => l.judicial === "Judicial").length;
  const datas = linhas.map((l) => l.dtCompra.getTime());
  const fmt = (t: number) => new Date(t).toISOString().slice(0, 10);

  console.log("\n📊 Resumo dos dados extraídos:");
  console.log(`   Registros válidos:      ${linhas.length.toLocaleString("pt-BR")}`);
  console.log(`   Linhas descartadas:     ${descartadas.toLocaleString("pt-BR")}`);
  console.log(`   Medicamentos distintos: ${materiais.size.toLocaleString("pt-BR")}`);
  console.log(`   Combos (med × unidade): ${combos.size.toLocaleString("pt-BR")}`);
  console.log(`   Compras judiciais:      ${judiciais.toLocaleString("pt-BR")}`);
  if (datas.length) {
    console.log(`   Período:                ${fmt(Math.min(...datas))} → ${fmt(Math.max(...datas))}`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`📁 Lendo: ${FILE_PATH}`);
  const dados = lerDados();

  let registros = dados.records;
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
        "   Ex.: npx tsx scripts/import-comprasgov-precos.ts --truncate --confirm"
    );
    return;
  }

  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient({ log: ["error"] });

  try {
    if (TRUNCATE) {
      console.log("\n🧹 Limpando tabela sismat.ComprasGovPreco...");
      const del = await db.comprasGovPreco.deleteMany({});
      console.log(`   ${del.count} registro(s) removido(s).`);
    }

    console.log(`\n💾 Inserindo ${linhas.length} registro(s) em lotes de ${BATCH_SIZE}...`);
    let inseridos = 0;
    for (let i = 0; i < linhas.length; i += BATCH_SIZE) {
      const lote = linhas.slice(i, i + BATCH_SIZE);
      // skipDuplicates: reexecuções não duplicam (id da origem é a PK)
      const res = await db.comprasGovPreco.createMany({ data: lote, skipDuplicates: true });
      inseridos += res.count;
      process.stdout.write(`\r   ${inseridos}/${linhas.length}`);
    }
    console.log(`\n✅ Importação concluída: ${inseridos} registro(s).`);
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
