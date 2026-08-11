import { db } from "@/lib/db";

// ─────────────────────────────────────────────────────────────────────────────
// Indicadores estruturais das Saídas SISMAT (aba "SISMAT-Saídas")
//
// Recorte: progSaude = "DEMANDA JUDICIAL - Aquisição" + dtBaixa não-nula.
//
// Todos os indicadores usam janela móvel de 3 meses — o valor exibido no card
// é o do último ponto da série (mês mais recente).
//
// 1. HHI de Materiais (0–10.000)
//    Índice de Herfindahl-Hirschman calculado sobre a participação de cada
//    materialNome no valor total de saídas. HHI alto = concentração num único
//    material; HHI baixo = portfólio diversificado.
//
// 2. Distância Ponderada de Rank
//    Para cada par de meses consecutivos na janela, calcula a mudança de
//    posição de cada material ponderada pela sua participação no valor total:
//      instab = Σ_i  |rank(i, M) − rank(i, M−1)| × share(i, M)
//    Materiais caros que se revezam no topo pesam mais. Valor 0 = ranking
//    idêntico entre meses; valores maiores = maior volatilidade.
//    A janela de 3 meses usa o par (M−1 → M) mais recente da fatia.
//
// 3. Proporção para Incineração
//    % do valor total enviado a destinatários de incineração:
//      - "PIONEIRA SANEAMENTO E LIMPEZA URBANA LTDA"
//      - "SISTEMA NOVA AMBIENTAL LTDA"
//    Campo usado: `destinatario` (texto livre, comparação case-insensitive).
// ─────────────────────────────────────────────────────────────────────────────

/** Ponto de série temporal mensal. */
export interface PontoIndicador {
  mes: string;   // 'YYYY-MM'
  valor: number;
}

/** Resultado de um indicador: último valor da janela + série completa. */
export interface IndicadorResult {
  /** Valor do último trimestre (exibido no card). */
  recente: number;
  /** Número de materiais distintos na janela mais recente (HHI/rank). */
  entidades: number;
  /** Série mensal completa (para o popup de evolução). */
  serie: PontoIndicador[];
}

export interface ProportionResult {
  /** % do valor para incineração na janela mais recente (0–100). */
  recente: number;
  /** Valor absoluto para incineração na janela mais recente. */
  valorIncineracao: number;
  /** Valor total na janela mais recente. */
  valorTotal: number;
  /** Série mensal completa. */
  serie: PontoIndicador[];
}

export interface SismatSaidasIndicadores {
  hhi: IndicadorResult;
  rankInstab: IndicadorResult;
  incineracao: ProportionResult;
  hasData: boolean;
}

// ── Destinatários de incineração ─────────────────────────────────────────────

const INCINERADORES = [
  "PIONEIRA SANEAMENTO E LIMPEZA URBANA LTDA",
  "SISTEMA NOVA AMBIENTAL LTDA",
];

function ehIncinerador(dest: string): boolean {
  const u = dest.trim().toUpperCase();
  return INCINERADORES.some((d) => u.includes(d));
}

// ── Helpers de agregação ──────────────────────────────────────────────────────

/** Linha bruta lida do banco. */
interface LinhaRaw {
  dtBaixa: Date;
  valorTotal: number | null;
  materialNome: string | null;
  destinatario: string | null;
}

/** Agrega linhas de um conjunto de meses em mapa material → valor total. */
function mapaMateria(linhas: LinhaRaw[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of linhas) {
    const k = (r.materialNome ?? "").trim();
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + (r.valorTotal == null ? 0 : Number(r.valorTotal)));
  }
  return m;
}

/** HHI (0–10.000) a partir de um mapa material → valor. */
function calcHhi(mapa: Map<string, number>): { hhi: number; entidades: number } {
  let total = 0;
  for (const v of mapa.values()) if (v > 0) total += v;
  if (total === 0) return { hhi: 0, entidades: 0 };
  let hhi = 0;
  let entidades = 0;
  for (const v of mapa.values()) {
    if (v <= 0) continue;
    entidades++;
    const s = v / total;
    hhi += s * s;
  }
  return { hhi: hhi * 10_000, entidades };
}

/**
 * Distância Ponderada de Rank entre dois mapas consecutivos.
 *
 * Usa a união dos dois trimestres. Materiais ausentes num trimestre
 * recebem rank fictício = N+1 (último+1), onde N é o tamanho daquele
 * mapa — capturando entradas e saídas do ranking como instabilidade real.
 * A ponderação pelo share em M atenua a contribuição de materiais com
 * baixo valor financeiro.
 *
 * Para cada material da união:
 *   - Rank em M  = posição no ranking da janela atual (1-based, desc por valor)
 *                  ou N_M+1 se ausente
 *   - Rank em M-1 = posição no ranking da janela anterior, ou N_M1+1 se ausente
 *   - Contribuição = |rank(M) − rank(M-1)| × share(M)
 *
 * Retorna 0 se algum mapa estiver vazio.
 */
function calcRankInstab(
  mapaMenos1: Map<string, number>,
  mapaM: Map<string, number>
): { instab: number; entidades: number } {
  if (mapaMenos1.size === 0 || mapaM.size === 0) return { instab: 0, entidades: 0 };

  // União dos dois trimestres
  const todos = new Set([...mapaMenos1.keys(), ...mapaM.keys()]);

  // Rank em M (ordenado por valor desc, 1-based)
  const rankM = new Map<string, number>();
  const sortedM = [...mapaM.entries()].sort((a, b) => b[1] - a[1]);
  sortedM.forEach(([k], i) => rankM.set(k, i + 1));
  const phantomM = sortedM.length + 1;

  // Rank em M-1
  const rankM1 = new Map<string, number>();
  const sortedM1 = [...mapaMenos1.entries()].sort((a, b) => b[1] - a[1]);
  sortedM1.forEach(([k], i) => rankM1.set(k, i + 1));
  const phantomM1 = sortedM1.length + 1;

  // Total de valor em M para calcular shares
  let totalM = 0;
  for (const v of mapaM.values()) totalM += v;
  if (totalM === 0) return { instab: 0, entidades: mapaM.size };

  let instab = 0;
  for (const mat of todos) {
    const rM   = rankM.get(mat)  ?? phantomM;
    const rM1  = rankM1.get(mat) ?? phantomM1;
    const shareM = (mapaM.get(mat) ?? 0) / totalM;
    instab += Math.abs(rM - rM1) * shareM;
  }

  return { instab, entidades: mapaM.size };
}

// ── Série mensal com janela móvel ─────────────────────────────────────────────

function porMes(linhas: LinhaRaw[]): Map<string, LinhaRaw[]> {
  const m = new Map<string, LinhaRaw[]>();
  for (const r of linhas) {
    const y = r.dtBaixa.getUTCFullYear();
    const mo = String(r.dtBaixa.getUTCMonth() + 1).padStart(2, "0");
    const k = `${y}-${mo}`;
    let lista = m.get(k);
    if (!lista) { lista = []; m.set(k, lista); }
    lista.push(r);
  }
  return m;
}

/** Últimos `janela` meses com dados (os mais recentes). */
function maisRecentes(grupos: Map<string, LinhaRaw[]>, janela = 3): LinhaRaw[] {
  const meses = [...grupos.keys()].sort();
  if (meses.length === 0) return [];
  const ultimos = new Set(meses.slice(-janela));
  return [...ultimos].flatMap((m) => grupos.get(m) ?? []);
}

// ── Função principal ──────────────────────────────────────────────────────────

export async function getSismatSaidasIndicadores(): Promise<SismatSaidasIndicadores> {
  const linhas = await db.sismatSaida.findMany({
    where: {
      progSaude: "DEMANDA JUDICIAL - Aquisição",
      dtBaixa: { not: null },
    },
    select: {
      dtBaixa: true,
      valorTotal: true,
      materialNome: true,
      destinatario: true,
    },
  }) as LinhaRaw[];

  if (linhas.length === 0) {
    return {
      hhi: { recente: 0, entidades: 0, serie: [] },
      rankInstab: { recente: 0, entidades: 0, serie: [] },
      incineracao: { recente: 0, valorIncineracao: 0, valorTotal: 0, serie: [] },
      hasData: false,
    };
  }

  const grupos = porMes(linhas);
  const meses  = [...grupos.keys()].sort();

  // ── Série de HHI (janela 3 meses) ──────────────────────────────────────────
  const hhiSerie: PontoIndicador[] = meses.map((mes, i) => {
    const fatia = meses.slice(Math.max(0, i - 2), i + 1); // últimos 3 inclusive
    const ls = fatia.flatMap((m) => grupos.get(m) ?? []);
    return { mes, valor: calcHhi(mapaMateria(ls)).hhi };
  });

  // ── Série de Instabilidade (janela 3 meses, par M-1 → M) ───────────────────
  // Para cada ponto M, usamos os mapas agregados da janela [M-2,M-1,M] e
  // [M-3,M-2,M-1] — assim cada ponto reflete a mudança entre dois trimestres.
  const rankSerie: PontoIndicador[] = meses.map((mes, i) => {
    if (i === 0) return { mes, valor: 0 };
    const fatiaCurr = meses.slice(Math.max(0, i - 2), i + 1);
    const fatiaAnt  = meses.slice(Math.max(0, i - 3), i);
    const mapaCurr = mapaMateria(fatiaCurr.flatMap((m) => grupos.get(m) ?? []));
    const mapaAnt  = mapaMateria(fatiaAnt .flatMap((m) => grupos.get(m) ?? []));
    return { mes, valor: calcRankInstab(mapaAnt, mapaCurr).instab };
  });

  // ── Série de Incineração (janela 3 meses) ───────────────────────────────────
  const incSerie: PontoIndicador[] = meses.map((mes, i) => {
    const fatia = meses.slice(Math.max(0, i - 2), i + 1);
    const ls = fatia.flatMap((m) => grupos.get(m) ?? []);
    let totalVal = 0;
    let incVal   = 0;
    for (const r of ls) {
      const v = r.valorTotal == null ? 0 : Number(r.valorTotal);
      totalVal += v;
      if (r.destinatario && ehIncinerador(r.destinatario)) incVal += v;
    }
    return { mes, valor: totalVal > 0 ? (incVal / totalVal) * 100 : 0 };
  });

  // ── Valores "recentes" (última janela de 3 meses) ───────────────────────────
  const linhasRecentes = maisRecentes(grupos, 3);

  // HHI recente
  const maisRecentesMap = mapaMateria(linhasRecentes);
  const { hhi: hhiRecente, entidades: hhiEntidades } = calcHhi(maisRecentesMap);

  // Rank instab recente: par (últimos 3 meses anteriores → últimos 3 meses)
  const mesInicio3 = meses.length >= 4 ? meses[meses.length - 4] : null;
  let rankRecente = 0;
  let rankEntidades = 0;
  if (mesInicio3 !== null) {
    const idxFim = meses.indexOf(meses[meses.length - 1]);
    const idxAnt = meses.indexOf(mesInicio3);
    const fatiaAnt  = meses.slice(idxAnt, idxAnt + 3);
    const fatiaCurr = meses.slice(Math.max(0, idxFim - 2), idxFim + 1);
    const mapaAnt  = mapaMateria(fatiaAnt .flatMap((m) => grupos.get(m) ?? []));
    const mapaCurr = mapaMateria(fatiaCurr.flatMap((m) => grupos.get(m) ?? []));
    const res = calcRankInstab(mapaAnt, mapaCurr);
    rankRecente   = res.instab;
    rankEntidades = res.entidades;
  } else {
    rankEntidades = maisRecentesMap.size;
  }

  // Incineração recente
  let totalRecente = 0;
  let incRecente   = 0;
  for (const r of linhasRecentes) {
    const v = r.valorTotal == null ? 0 : Number(r.valorTotal);
    totalRecente += v;
    if (r.destinatario && ehIncinerador(r.destinatario)) incRecente += v;
  }
  const pctRecente = totalRecente > 0 ? (incRecente / totalRecente) * 100 : 0;

  return {
    hhi: { recente: hhiRecente, entidades: hhiEntidades, serie: hhiSerie },
    rankInstab: { recente: rankRecente, entidades: rankEntidades, serie: rankSerie },
    incineracao: {
      recente: pctRecente,
      valorIncineracao: incRecente,
      valorTotal: totalRecente,
      serie: incSerie,
    },
    hasData: true,
  };
}
