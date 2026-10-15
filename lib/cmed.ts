import { db } from "@/lib/db";
import { ALIQUOTAS_ICMS, rotuloCompetencia } from "@/lib/cmed-aliquotas";
import { chaveApresentacaoCmed, competenciaVigenteEm, valorNaAliquota, type ListaCmedUsada } from "@/lib/cmed-competencia";

// ─────────────────────────────────────────────────────────────────────────────
// Listas mensais da CMED (CmedCompetencia × CmedVigencia × CmedPrecoVersao)
// lidas para o teto da Pesquisa de Preços. Devolve as linhas no MESMO formato
// que a pesquisa usava de PrecoCmed — o resto do cálculo (teto do painel, teto
// do medicamento de referência, Qt_Embal, curadoria) não muda.
//
// Sem as listas mensais carregadas (ambiente novo), `listarCompetencias`
// devolve vazio e a pesquisa segue com PrecoCmed, como antes.
// ─────────────────────────────────────────────────────────────────────────────

export interface CompetenciaCmed {
  /** "2026-08" */
  competencia: string;
  rotulo: string;
  registros: number;
  capPercentual: number | null;
  /** Códigos de ALIQUOTAS_ICMS com preço publicado na lista. */
  aliquotas: string[];
}

/** Listas carregadas, da mais recente para a mais antiga. */
export async function listarCompetencias(): Promise<CompetenciaCmed[]> {
  try {
    const rows = await db.cmedCompetencia.findMany({
      orderBy: { competencia: "desc" },
      select: { competencia: true, registros: true, capPercentual: true, aliquotas: true },
    });
    return rows.map((r) => {
      const competencia = r.competencia.toISOString().slice(0, 7);
      return {
        competencia,
        rotulo: rotuloCompetencia(competencia),
        registros: r.registros,
        capPercentual: r.capPercentual,
        aliquotas: r.aliquotas,
      };
    });
  } catch (error) {
    // Tabela ainda não criada (scripts/import_cmed_mensal.py).
    console.warn("[cmed] listas mensais indisponíveis:", (error as Error).message);
    return [];
  }
}

/**
 * A lista que a pesquisa usa: a pedida (consulta), se carregada; senão a
 * vigente na data de referência. Sem listas mensais, null (PrecoCmed).
 * Antes da primeira lista carregada, a mais antiga — sinalizada pelo rótulo.
 */
export function escolherLista(
  competencias: CompetenciaCmed[],
  dataReferencia: string,
  pedida: string | null | undefined
): ListaCmedUsada | null {
  if (!competencias.length) return null;
  const vigente =
    competenciaVigenteEm(
      competencias.map((c) => c.competencia),
      dataReferencia
    ) ?? competencias[competencias.length - 1].competencia;
  const usada = competencias.find((c) => c.competencia === pedida) ?? competencias.find((c) => c.competencia === vigente)!;
  return {
    competencia: usada.competencia,
    rotulo: usada.rotulo,
    vigente,
    rotuloVigente: rotuloCompetencia(vigente),
    capPercentual: usada.capPercentual,
    semImpostosPublicado: usada.aliquotas.includes("SEM_IMPOSTOS"),
    aliquotas: usada.aliquotas,
  };
}

/** Linha CMED no formato que a pesquisa usa (o de PrecoCmed). */
export interface LinhaCmed {
  /** Chave estável da apresentação (registro + GGREM) — ver chaveApresentacaoCmed. */
  id: string;
  registro: string | null;
  codigoGgrem: string | null;
  /** EAN 1 da lista. */
  ean: string | null;
  substancia: string;
  produto: string;
  apresentacao: string;
  laboratorio: string | null;
  cnpj: string | null;
  classeTerap: string | null;
  tipoProduto: string | null;
  regimePreco: string | null;
  /** PMVG "sem impostos"; nas listas que não o publicam, o de 0%. */
  pmvgSemImpostos: number;
  pmvg0: number | null;
  pmvg12: number | null;
  pmvg17: number | null;
  pmvg18: number | null;
  pf0: number | null;
  cap: boolean;
  /** PMVG da embalagem em cada alíquota, alinhado a ALIQUOTAS_ICMS (null = não publicado). */
  pmvgAliquotas: (number | null)[];
  /**
   * Isento de ICMS (Convênio CONFAZ 87/02, ICMS 0%, ou a lista só publica o
   * preço sem ICMS): numa alíquota sem preço, vale o PMVG a 0% (P4 do prompt CMED).
   */
  isentoIcms: boolean;
}

/**
 * Preços da lista `competencia` ("AAAA-MM") para os registros ANVISA pedidos.
 * Como em PrecoCmed, fica de fora a apresentação sem PMVG publicado (preço
 * "Liberado" ou sem a coluna). Conflito no mês (duas versões da mesma
 * apresentação) mantém as duas, com a versão na chave.
 */
export async function linhasDaCompetencia(registros: string[], competencia: string): Promise<LinhaCmed[]> {
  if (!registros.length) return [];
  const vigencias = await db.cmedVigencia.findMany({
    where: { competencia: new Date(`${competencia}-01T00:00:00Z`), versao: { registro: { in: registros } } },
    include: { versao: true },
  });
  const chaves = new Map<string, number>();
  for (const { versao: v } of vigencias) {
    const k = chaveApresentacaoCmed(v.registro, v.codigoGgrem, v.id);
    chaves.set(k, (chaves.get(k) ?? 0) + 1);
  }
  const linhas: LinhaCmed[] = [];
  for (const { versao: v } of vigencias) {
    const pmvgSemImpostos = valorNaAliquota(v.pmvg, "SEM_IMPOSTOS") ?? valorNaAliquota(v.pmvg, "0");
    if (pmvgSemImpostos == null || v.precoLiberado) continue;
    const chave = chaveApresentacaoCmed(v.registro, v.codigoGgrem, v.id);
    linhas.push({
      id: (chaves.get(chave) ?? 0) > 1 ? `${chave}:v${v.id}` : chave,
      registro: v.registro,
      codigoGgrem: v.codigoGgrem,
      ean: v.ean[0] ?? null,
      substancia: v.substancia ?? "",
      produto: v.produto ?? "",
      apresentacao: v.apresentacao ?? "",
      laboratorio: v.laboratorio,
      cnpj: v.cnpj,
      classeTerap: v.classeTerapeutica,
      tipoProduto: v.tipoProduto,
      regimePreco: v.regimePreco,
      pmvgSemImpostos,
      pmvg0: valorNaAliquota(v.pmvg, "0"),
      pmvg12: valorNaAliquota(v.pmvg, "12"),
      pmvg17: valorNaAliquota(v.pmvg, "17"),
      pmvg18: valorNaAliquota(v.pmvg, "18"),
      pf0: valorNaAliquota(v.pf, "0"),
      cap: v.cap === true,
      pmvgAliquotas: ALIQUOTAS_ICMS.map((c) => valorNaAliquota(v.pmvg, c)),
      isentoIcms: v.confaz87 === true || v.icms0 === true || soSemIcms(v.pmvg),
    });
  }
  return linhas.sort(
    (a, b) =>
      a.substancia.localeCompare(b.substancia, "pt-BR") ||
      a.produto.localeCompare(b.produto, "pt-BR") ||
      a.apresentacao.localeCompare(b.apresentacao, "pt-BR")
  );
}

/** A lista só publica o preço sem ICMS (0% ou "sem impostos"): produto isento. */
function soSemIcms(pmvg: unknown): boolean {
  const publicadas = ALIQUOTAS_ICMS.filter((c) => valorNaAliquota(pmvg, c) != null);
  return publicadas.length > 0 && publicadas.every((c) => c === "0" || c === "SEM_IMPOSTOS");
}

/** Registros ANVISA com preço na lista — a contagem "CMED" das unidades de fornecimento. */
export async function registrosComPrecoNaCompetencia(registros: string[], competencia: string): Promise<string[]> {
  if (!registros.length) return [];
  const linhas = await linhasDaCompetencia(registros, competencia);
  return Array.from(new Set(linhas.map((l) => l.registro).filter((r): r is string => !!r)));
}

/**
 * Exclusões da curadoria gravadas antes das listas mensais apontam para o id
 * da linha de PrecoCmed. Traduz para a chave estável (registro + GGREM), para
 * a decisão continuar valendo. Muda o mapa no lugar.
 */
export async function traduzirExclusoesLegadas(excluidos: Map<string, string> | undefined): Promise<void> {
  if (!excluidos?.size) return;
  const legados = Array.from(excluidos.keys()).filter((id) => !id.startsWith("cmed:"));
  if (!legados.length) return;
  try {
    const antigos = await db.precoCmed.findMany({
      where: { id: { in: legados } },
      select: { id: true, registro: true, codigoGgrem: true },
    });
    for (const a of antigos) {
      if (!a.registro || !a.codigoGgrem) continue;
      const chave = `cmed:${a.registro}:${a.codigoGgrem}`;
      if (!excluidos.has(chave)) excluidos.set(chave, excluidos.get(a.id) as string);
    }
  } catch (error) {
    console.warn("[cmed] exclusões antigas não traduzidas:", (error as Error).message);
  }
}
