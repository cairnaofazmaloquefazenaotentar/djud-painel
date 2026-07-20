"use client";

import { useMemo, useState } from "react";
import { usePmvgData } from "@/hooks/usePmvg";
import { Panel, selectCn } from "@/components/dashboard/sismat-shared";
import { MetricCard } from "@/components/dashboard/metric-card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PmvgRankChart } from "@/components/dashboard/charts/pmvg-rank-chart";
import { PmvgTimeSeriesChart } from "@/components/dashboard/charts/pmvg-timeseries-chart";
import { PmvgBoxPlot, computeBoxDomain } from "@/components/dashboard/charts/pmvg-box-plot";
import {
  fmtMoney,
  fmtNum,
  fmtPct,
  fmtDate,
  scoreBadgeTone,
  QTY_METHOD_LABEL,
  buildPmvgOrder,
  withPmvgCalcs,
  distributionStats,
  PMVG_RED,
  PMVG_BLUE,
  type PmvgRowCalc,
  type BadgeTone,
} from "@/components/dashboard/charts/pmvg-format";
import {
  AlertTriangle,
  BarChart2,
  Coins,
  Download,
  Gauge,
  Loader2,
  Scale,
  SlidersHorizontal,
  TrendingUp,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Sub-aba "PMVG" — preço unitário pago no SISMAT vs. PMVG vigente na entrega.
// Base pequena carregada de uma vez; todos os filtros e cálculos rodam aqui,
// reproduzindo o dashboard SISMAT × PMVG de origem. Estado de filtro em useState;
// tudo o mais é derivado (sem effects).
// ─────────────────────────────────────────────────────────────────────────────

const TONE_CLASS: Record<BadgeTone, string> = {
  good: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  warning: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  critical: "bg-destructive/15 text-destructive",
};

function ScoreBadge({ value }: { value: number | null }) {
  const tone = scoreBadgeTone(value);
  return (
    <span className={`inline-flex rounded-md px-1.5 py-0.5 text-xs font-medium ${TONE_CLASS[tone]}`}>
      {value === null ? "—" : fmtNum(value, 0)}
    </span>
  );
}

type SortKey =
  | "m" | "sm" | "f" | "d" | "q" | "vu" | "pmvgUnit"
  | "diffUnit" | "diffPct" | "pmvgPack" | "qp" | "qm" | "pd" | "sc";

interface Coluna {
  key: SortKey;
  label: string;
  type?: "date" | "num" | "money" | "pct" | "score" | "qm";
  wrap?: boolean;
}

const TABLE_COLUMNS: Coluna[] = [
  { key: "m", label: "Material (SISMAT)", wrap: true },
  { key: "sm", label: "Medicamento (PMVG)", wrap: true },
  { key: "f", label: "Fabricante", wrap: true },
  { key: "d", label: "Entrega", type: "date" },
  { key: "q", label: "Qtd", type: "num" },
  { key: "vu", label: "Valor unit. pago", type: "money" },
  { key: "pmvgUnit", label: "PMVG unit. (estim.)", type: "money" },
  { key: "diffUnit", label: "Diferença unitária", type: "money" },
  { key: "diffPct", label: "Diferença %", type: "pct" },
  { key: "pmvgPack", label: "PMVG embalagem (bruto)", type: "money" },
  { key: "qp", label: "Qtd/emb.", type: "num" },
  { key: "qm", label: "Método", type: "qm" },
  { key: "pd", label: "Data PMVG usada", type: "date" },
  { key: "sc", label: "Score", type: "score" },
];

const NEAR_COLUMNS: Coluna[] = [
  { key: "m", label: "Material (SISMAT)", wrap: true },
  { key: "sm", label: "Medicamento (PMVG)", wrap: true },
  { key: "f", label: "Fabricante", wrap: true },
  { key: "d", label: "Entrega", type: "date" },
  { key: "vu", label: "Valor unit. pago", type: "money" },
  { key: "pmvgUnit", label: "PMVG unit. (nesta alíquota)", type: "money" },
  { key: "diffPct", label: "Diferença %", type: "pct" },
];

function renderCell(r: PmvgRowCalc, col: Coluna) {
  const v = r[col.key] as unknown;
  if (col.type === "money") return fmtMoney(v as number | null);
  if (col.type === "pct") return fmtPct(v as number | null);
  if (col.type === "num") return fmtNum(v as number | null, 0);
  if (col.type === "date") return fmtDate(v as string | null);
  if (col.type === "qm") return QTY_METHOD_LABEL[v as string] || (v as string) || "—";
  if (col.type === "score") return <ScoreBadge value={r.sc} />;
  return v === null || v === undefined ? "—" : String(v);
}

function signClass(v: number | null | undefined) {
  if (v === null || v === undefined) return "";
  return v >= 0 ? "text-destructive" : "text-blue-600 dark:text-blue-400";
}

export function PmvgView() {
  const { data, isLoading, error } = usePmvgData();

  // ── Estado dos filtros (useState) ─────────────────────────────────────────
  const [pmvgIdxState, setPmvgIdxState] = useState<number>(-1); // -1 = default "PMVG 0%"
  const [minScore, setMinScore] = useState(70);
  const [dateFrom, setDateFrom] = useState(""); // "" = limite inferior da base
  const [dateTo, setDateTo] = useState(""); // "" = limite superior da base
  const [selMaterials, setSelMaterials] = useState<string[]>([]);
  const [selFabricantes, setSelFabricantes] = useState<string[]>([]);
  const [onlyPmvg, setOnlyPmvg] = useState(true);
  const [topN, setTopN] = useState(10);
  const [tableSearch, setTableSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "diffUnit", dir: -1 });
  const [nearIdxState, setNearIdxState] = useState<number | null>(null);
  const [nearThreshold, setNearThreshold] = useState(5);

  const cols = data?.cols ?? [];
  const pmvgOrder = useMemo(() => buildPmvgOrder(cols), [cols]);
  const defaultPmvgIdx = cols.indexOf("PMVG 0%");
  const pmvgIdx = pmvgIdxState >= 0 ? pmvgIdxState : defaultPmvgIdx >= 0 ? defaultPmvgIdx : 0;

  const dMin = data?.dataMin ?? "";
  const dMax = data?.dataMax ?? "";
  const fromEff = dateFrom || dMin;
  const toEff = dateTo || dMax;

  // ── Filtro base (score, data, material, fabricante) ───────────────────────
  const baseRows = useMemo(() => {
    if (!data) return [];
    const mats = new Set(selMaterials);
    const fabs = new Set(selFabricantes);
    return data.rows.filter((r) => {
      if (r.sc === null || r.sc < minScore) return false;
      if (r.d && fromEff && r.d < fromEff) return false;
      if (r.d && toEff && r.d > toEff) return false;
      if (mats.size && !mats.has(r.m)) return false;
      if (fabs.size && !fabs.has(r.f)) return false;
      return true;
    });
  }, [data, minScore, fromEff, toEff, selMaterials, selFabricantes]);

  // ── Linhas com cálculo pago-vs-PMVG na alíquota escolhida ─────────────────
  const filtered = useMemo(() => {
    let out = withPmvgCalcs(baseRows, pmvgIdx);
    if (onlyPmvg) out = out.filter((r) => r.pmvgUnit !== null);
    return out;
  }, [baseRows, pmvgIdx, onlyPmvg]);

  const comPmvg = useMemo(() => filtered.filter((r) => r.pmvgUnit !== null), [filtered]);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const totalPago = comPmvg.reduce((s, r) => s + (r.vt || 0), 0);
    const totalPmvg = comPmvg.reduce((s, r) => s + (r.pmvgTotal || 0), 0);
    const diff = totalPago - totalPmvg;
    const diffPct = totalPmvg ? (diff / totalPmvg) * 100 : 0;
    const diffPctVals = comPmvg.map((r) => r.diffPct).filter((v): v is number => v !== null && isFinite(v));
    const dstats = distributionStats(diffPctVals);
    let extra: string;
    if (dstats.n >= 2) extra = `desvio padrão da diferença % por item: ${fmtNum(dstats.std, 1)}pp (n=${dstats.n})`;
    else if (dstats.n === 1) extra = "apenas 1 item no filtro — sem desvio padrão";
    else extra = "sem itens com PMVG encontrado no filtro atual";
    return { totalPago, totalPmvg, diff, diffPct, extra };
  }, [comPmvg]);

  // ── Ranking por material (soma da diferença total) ────────────────────────
  const ranking = useMemo(() => {
    const byMat = new Map<string, number>();
    for (const r of comPmvg) byMat.set(r.m, (byMat.get(r.m) || 0) + (r.diffTotal || 0));
    const arr = Array.from(byMat, ([material, diff]) => ({ material, diff }));
    const top = arr.filter((d) => d.diff > 0).sort((a, b) => b.diff - a.diff).slice(0, topN);
    const bottom = arr.filter((d) => d.diff < 0).sort((a, b) => a.diff - b.diff).slice(0, topN);
    return { top, bottom };
  }, [comPmvg, topN]);

  // ── Material da série temporal ────────────────────────────────────────────
  const tsMaterial = useMemo(() => {
    if (selMaterials.length === 1) return selMaterials[0];
    const byMat = new Map<string, number>();
    comPmvg.forEach((r) => byMat.set(r.m, (byMat.get(r.m) || 0) + (r.diffTotal || 0)));
    const ranked = Array.from(byMat.entries()).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    return ranked.length ? ranked[0][0] : filtered.length ? filtered[0].m : null;
  }, [selMaterials, comPmvg, filtered]);

  const tsRows = useMemo(
    () => (tsMaterial ? filtered.filter((r) => r.m === tsMaterial && r.d) : []),
    [filtered, tsMaterial]
  );

  // ── Tabela de detalhe (busca + ordenação) ─────────────────────────────────
  const tableRows = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    let rows = filtered.filter((r) => r.pmvgUnit !== null || !onlyPmvg);
    if (q) rows = rows.filter((r) => `${r.m} ${r.sm || ""} ${r.f}`.toLowerCase().includes(q));
    const { key, dir } = sort;
    return rows.slice().sort((a, b) => {
      const av = a[key] as unknown;
      const bv = b[key] as unknown;
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === "string") return (av as string).localeCompare(bv as string) * dir;
      return ((av as number) - (bv as number)) * dir;
    });
  }, [filtered, tableSearch, onlyPmvg, sort]);

  // ── Estatísticas por alíquota + box plots ─────────────────────────────────
  const byRate = useMemo(() => {
    const groups = pmvgOrder.map((idx) => {
      const calcs = withPmvgCalcs(baseRows, idx).filter(
        (r) => r.pmvgUnit !== null && r.diffPct !== null && isFinite(r.diffPct)
      );
      const stats = distributionStats(calcs.map((r) => r.diffPct as number));
      return { idx, label: cols[idx], rows: calcs, stats };
    });
    const domain = computeBoxDomain(groups.map((g) => g.stats));
    return { groups, domain };
  }, [baseRows, pmvgOrder, cols]);

  // ── Compras próximas do PMVG (aba alíquota) ───────────────────────────────
  const nearAvailable = useMemo(() => byRate.groups.filter((g) => g.stats.n >= 1), [byRate]);
  const nearIdx = useMemo(() => {
    if (nearIdxState !== null && nearAvailable.some((g) => g.idx === nearIdxState)) return nearIdxState;
    const zero = nearAvailable.find((g) => g.label === "PMVG 0%");
    return zero ? zero.idx : nearAvailable.length ? nearAvailable[0].idx : null;
  }, [nearIdxState, nearAvailable]);

  const nearRows = useMemo(() => {
    const group = nearIdx !== null ? byRate.groups.find((g) => g.idx === nearIdx) : null;
    if (!group || !group.stats.n) return [];
    return group.rows
      .filter((r) => r.diffPct !== null && Math.abs(r.diffPct) < nearThreshold)
      .slice()
      .sort((a, b) => Math.abs(a.diffPct as number) - Math.abs(b.diffPct as number));
  }, [byRate, nearIdx, nearThreshold]);

  function toggleSort(key: SortKey) {
    setSort((prev) => ({ key, dir: prev.key === key ? ((prev.dir * -1) as 1 | -1) : -1 }));
  }

  function exportCsv() {
    const headers = TABLE_COLUMNS.map((c) => c.label);
    const lines = [headers.join(";")];
    tableRows.forEach((r) => {
      const vals = TABLE_COLUMNS.map((c) => {
        const v = r[c.key] as unknown;
        if (v === null || v === undefined) return "";
        if (typeof v === "number") return String(v).replace(".", ",");
        return String(v).replace(/;/g, ",");
      });
      lines.push(vals.join(";"));
    });
    const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sismat_x_pmvg_detalhe.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── Estados de carregamento / erro / vazio ────────────────────────────────
  if (error) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-6 space-y-3">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4" />
          <span className="font-medium text-sm">Erro ao carregar a base SISMAT × PMVG</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {error instanceof Error ? error.message : "Não foi possível consultar o banco de dados."}
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data?.hasData) {
    return (
      <div className="rounded-lg border border-border bg-card p-10 text-center space-y-2">
        <Scale className="h-8 w-8 mx-auto text-muted-foreground" />
        <p className="text-sm font-medium">Nenhum registro SISMAT × PMVG encontrado</p>
        <p className="text-xs text-muted-foreground">
          Importe a base com{" "}
          <code>npx tsx scripts/import-sismat-pmvg.ts --truncate --confirm</code> e recarregue a página.
        </p>
      </div>
    );
  }

  const refLabel = cols[pmvgIdx] ?? "—";

  return (
    <div className="space-y-6">
      {/* ── Filtros ──────────────────────────────────────────────────────── */}
      <Panel
        icon={<SlidersHorizontal className="h-4 w-4" />}
        title="Filtros"
        subtitle="Controlam todos os números, gráficos e tabelas desta sub-aba."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground">Referência PMVG (embalagem)</label>
            <select
              className={selectCn}
              value={pmvgIdx}
              onChange={(e) => setPmvgIdxState(parseInt(e.target.value, 10))}
            >
              {pmvgOrder.map((i) => (
                <option key={i} value={i}>
                  {cols[i]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground">
              Confiança mínima do match: <span className="font-medium text-foreground">{minScore}</span>
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={minScore}
              onChange={(e) => setMinScore(parseInt(e.target.value, 10))}
              className="w-full accent-primary"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground">
              Somente com PMVG vigente encontrado
            </label>
            <label className="inline-flex items-center gap-2 text-sm h-9">
              <input
                type="checkbox"
                checked={onlyPmvg}
                onChange={(e) => setOnlyPmvg(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              <span className="text-muted-foreground">Ocultar compras sem PMVG na data</span>
            </label>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground">Entrega de</label>
            <input
              type="date"
              className={selectCn}
              value={fromEff}
              min={dMin}
              max={dMax}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground">Entrega até</label>
            <input
              type="date"
              className={selectCn}
              value={toEff}
              min={dMin}
              max={dMax}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>

          <div className="hidden lg:block" />

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground">Material (múltiplo, vazio = todos)</label>
            <select
              multiple
              size={4}
              className={`${selectCn} h-auto`}
              value={selMaterials}
              onChange={(e) => setSelMaterials(Array.from(e.target.selectedOptions, (o) => o.value))}
            >
              {data.materiais.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground">Fabricante (múltiplo, vazio = todos)</label>
            <select
              multiple
              size={4}
              className={`${selectCn} h-auto`}
              value={selFabricantes}
              onChange={(e) => setSelFabricantes(Array.from(e.target.selectedOptions, (o) => o.value))}
            >
              {data.fabricantes.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Panel>

      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Total pago (SISMAT)" value={fmtMoney(kpis.totalPago)} icon={<Coins className="h-5 w-5" />} />
        <MetricCard label="Total teórico (PMVG)" value={fmtMoney(kpis.totalPmvg)} icon={<Scale className="h-5 w-5" />} />
        <MetricCard
          label="Diferença (pago − PMVG)"
          value={fmtMoney(kpis.diff)}
          subtext={`${fmtPct(kpis.diffPct)} vs. PMVG · ${kpis.extra}`}
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <MetricCard
          label="Itens analisados"
          value={`${comPmvg.length} / ${filtered.length}`}
          icon={<Gauge className="h-5 w-5" />}
        />
      </div>

      {/* ── Ranking ──────────────────────────────────────────────────────── */}
      <Panel
        icon={<BarChart2 className="h-4 w-4" />}
        title="Ranking de materiais por diferença total (pago − PMVG)"
        subtitle={`Vermelho = pago acima do PMVG (sobrepreço) · Azul = economia. Referência: ${refLabel}.`}
      >
        <div className="flex flex-col gap-1.5 mb-4 max-w-xs">
          <label className="text-xs text-muted-foreground">
            Materiais por coluna: <span className="font-medium text-foreground">{topN}</span>
          </label>
          <input
            type="range"
            min={4}
            max={20}
            value={topN}
            onChange={(e) => setTopN(parseInt(e.target.value, 10))}
            className="w-full accent-primary"
          />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Maiores sobrepreços (Top {topN})
            </p>
            <PmvgRankChart data={ranking.top} color={PMVG_RED} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Maiores economias (Bottom {topN})
            </p>
            <PmvgRankChart data={ranking.bottom} color={PMVG_BLUE} />
          </div>
        </div>
      </Panel>

      {/* ── Série temporal ───────────────────────────────────────────────── */}
      <Panel
        icon={<TrendingUp className="h-4 w-4" />}
        title="Preço pago x PMVG aplicável ao longo do tempo"
        subtitle={
          selMaterials.length === 1
            ? `Material: ${tsMaterial ?? "—"}`
            : `Material com maior diferença entre os do filtro: ${tsMaterial ?? "—"} (selecione um único material para focar)`
        }
      >
        <div className="flex flex-wrap gap-4 mb-3 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: PMVG_RED }} />
            Pago (unitário)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-4 rounded" style={{ background: PMVG_BLUE }} />
            PMVG unitário (referência selecionada)
          </span>
        </div>
        <PmvgTimeSeriesChart rows={tsRows} />
      </Panel>

      {/* ── Detalhe das compras ──────────────────────────────────────────── */}
      <Panel
        icon={<Scale className="h-4 w-4" />}
        title="Detalhe das compras"
        subtitle="PMVG unitário estimado = preço de embalagem ÷ unidades da embalagem (heurística de texto — confira Qtd/emb. e Método nos casos relevantes)."
      >
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <input
            type="text"
            value={tableSearch}
            onChange={(e) => setTableSearch(e.target.value)}
            placeholder="Buscar material, medicamento PMVG ou fabricante..."
            className={`${selectCn} flex-1 min-w-[16rem]`}
          />
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Baixar tabela filtrada (CSV)
          </Button>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {TABLE_COLUMNS.map((c) => (
                  <TableHead
                    key={c.key}
                    onClick={() => toggleSort(c.key)}
                    className={`cursor-pointer whitespace-nowrap select-none ${c.type && c.type !== "score" && c.type !== "qm" && c.type !== "date" ? "text-right" : ""}`}
                  >
                    {c.label}
                    {sort.key === c.key ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={TABLE_COLUMNS.length} className="text-center text-muted-foreground py-6">
                    Nenhuma compra com os filtros atuais.
                  </TableCell>
                </TableRow>
              ) : (
                tableRows.map((r, i) => (
                  <TableRow key={i}>
                    {TABLE_COLUMNS.map((c) => {
                      const isNum = c.type === "money" || c.type === "pct" || c.type === "num";
                      const cls =
                        c.key === "diffUnit" || c.key === "diffPct"
                          ? signClass(r[c.key] as number | null)
                          : "";
                      return (
                        <TableCell
                          key={c.key}
                          className={`${c.wrap ? "max-w-[16rem] whitespace-normal" : "whitespace-nowrap"} ${isNum ? "text-right tabular-nums" : ""} ${cls}`}
                        >
                          {renderCell(r, c)}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Panel>

      {/* ── Diferença % por alíquota (box plots) ─────────────────────────── */}
      <Panel
        icon={<Gauge className="h-4 w-4" />}
        title="Diferença percentual (pago − PMVG) por alíquota do PMVG"
        subtitle={`Distribuição da diferença % por item em cada alíquota (respeita os filtros acima, independente da Referência PMVG). Escala: ${fmtPct(byRate.domain.lo)} a ${fmtPct(byRate.domain.hi)}.`}
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Alíquota</TableHead>
                <TableHead className="text-right">N</TableHead>
                <TableHead className="text-right">Média %</TableHead>
                <TableHead className="text-right">Desvio (pp)</TableHead>
                <TableHead className="text-right">Mediana %</TableHead>
                <TableHead className="text-right">Q1 %</TableHead>
                <TableHead className="text-right">Q3 %</TableHead>
                <TableHead>Distribuição da diferença %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byRate.groups.map((g) => (
                <TableRow key={g.idx}>
                  <TableCell className="whitespace-nowrap font-medium">{g.label}</TableCell>
                  <TableCell className="text-right tabular-nums">{g.stats.n}</TableCell>
                  <TableCell className="text-right tabular-nums">{g.stats.n ? fmtPct(g.stats.mean) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{g.stats.std !== null ? fmtNum(g.stats.std, 1) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{g.stats.n ? fmtPct(g.stats.median) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{g.stats.n ? fmtPct(g.stats.q1) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{g.stats.n ? fmtPct(g.stats.q3) : "—"}</TableCell>
                  <TableCell>
                    <PmvgBoxPlot stats={g.stats} domain={byRate.domain} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Panel>

      {/* ── Compras próximas do PMVG ─────────────────────────────────────── */}
      <Panel
        icon={<Scale className="h-4 w-4" />}
        title="Compras com preço próximo do PMVG"
        subtitle="Respeita os filtros acima. Ordenado pelo módulo da diferença %, do mais próximo ao mais distante do PMVG."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground">Alíquota do PMVG (só com observações)</label>
            <select
              className={selectCn}
              value={nearIdx ?? ""}
              onChange={(e) => setNearIdxState(e.target.value === "" ? null : parseInt(e.target.value, 10))}
            >
              {nearAvailable.length === 0 ? (
                <option value="">Sem alíquotas com dados</option>
              ) : (
                nearAvailable.map((g) => {
                  const near = g.rows.filter((r) => r.diffPct !== null && Math.abs(r.diffPct) < nearThreshold).length;
                  return (
                    <option key={g.idx} value={g.idx}>
                      {g.label} ({near} de {g.stats.n} próximos)
                    </option>
                  );
                })
              )}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground">
              Diferença % máxima (módulo): <span className="font-medium text-foreground">{nearThreshold}%</span>
            </label>
            <input
              type="range"
              min={1}
              max={30}
              step={1}
              value={nearThreshold}
              onChange={(e) => setNearThreshold(parseInt(e.target.value, 10))}
              className="w-full accent-primary"
            />
          </div>
        </div>
        <div className="overflow-x-auto max-h-[420px]">
          <Table>
            <TableHeader>
              <TableRow>
                {NEAR_COLUMNS.map((c) => (
                  <TableHead
                    key={c.key}
                    className={`whitespace-nowrap ${c.type === "money" || c.type === "pct" ? "text-right" : ""}`}
                  >
                    {c.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {nearRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={NEAR_COLUMNS.length} className="text-center text-muted-foreground py-6">
                    Nenhuma compra dentro dessa diferença do PMVG nesta alíquota, para os filtros atuais.
                  </TableCell>
                </TableRow>
              ) : (
                nearRows.map((r, i) => (
                  <TableRow key={i}>
                    {NEAR_COLUMNS.map((c) => {
                      const isNum = c.type === "money" || c.type === "pct";
                      const cls = c.key === "diffPct" ? signClass(r.diffPct) : "";
                      return (
                        <TableCell
                          key={c.key}
                          className={`${c.wrap ? "max-w-[16rem] whitespace-normal" : "whitespace-nowrap"} ${isNum ? "text-right tabular-nums" : ""} ${cls}`}
                        >
                          {renderCell(r, c)}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Panel>
    </div>
  );
}
