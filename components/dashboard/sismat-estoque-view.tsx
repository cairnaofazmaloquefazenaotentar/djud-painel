"use client";

import { useMemo, useState } from "react";
import { useSismatEstoque } from "@/hooks/useSismatEstoque";
import type { SismatPeriodo } from "@/lib/sismat-metrics";
import { SismatFluxChart } from "./charts/sismat-flux-chart";
import { SismatSaldoChart } from "./charts/sismat-saldo-chart";
import {
  fmtBRL,
  SISMAT_ENTRADA_COLOR,
  SISMAT_SAIDA_COLOR,
  SISMAT_SALDO_COLOR,
} from "./charts/sismat-format";
import { MetricCard } from "./metric-card";
import { Panel, selectCn } from "./sismat-shared";
import { Button } from "@/components/ui/button";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Wallet,
  Boxes,
  TrendingUp,
  BarChart3,
  Loader2,
  AlertTriangle,
  ArrowUpDown,
  Info,
} from "lucide-react";

const PERIODOS: { value: SismatPeriodo; label: string }[] = [
  { value: "monthly", label: "Mensal" },
  { value: "yearly", label: "Anual" },
];

type SortField = "nome" | "entradas" | "saidas" | "saldo";

export function SismatEstoqueView() {
  const [period, setPeriod] = useState<SismatPeriodo>("monthly");
  const [year, setYear] = useState("");
  const [sortField, setSortField] = useState<SortField>("saldo");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  const { data, isLoading, error } = useSismatEstoque(period);

  const view = useMemo(() => {
    if (!data) return null;

    // Fluxo exibido: filtro de ano (client-side) só faz sentido no mensal
    const fy = year && period === "monthly" ? year : null;
    const fluxoExibido = fy ? data.fluxo.filter((f) => f.period.startsWith(fy)) : data.fluxo;

    // Saldo derivado acumulado ao longo de TODOS os períodos disponíveis
    let acc = 0;
    const saldoAcumulado = data.fluxo.map((f) => {
      acc += f.entradas - f.saidas;
      return { period: f.period, saldoAcumulado: acc };
    });

    return { fluxoExibido, saldoAcumulado };
  }, [data, year, period]);

  const ranking = useMemo(() => {
    if (!data) return [];
    const dir = sortDir;
    return [...data.porMaterial].sort((a, b) => {
      if (sortField === "nome") return dir * a.nome.localeCompare(b.nome, "pt-BR");
      return dir * (a[sortField] - b[sortField]);
    });
  }, [data, sortField, sortDir]);

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortField(field);
      setSortDir(field === "nome" ? 1 : -1);
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-6 space-y-2">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4" />
          <span className="font-medium text-sm">Erro ao carregar o cruzamento Entradas × Saídas</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {error instanceof Error ? error.message : "Não foi possível consultar o banco de dados."}
        </p>
      </div>
    );
  }

  if (!data || !view || !data.hasData) {
    return (
      <div className="rounded-lg border border-border bg-card p-10 text-center space-y-2">
        <Boxes className="h-8 w-8 mx-auto text-muted-foreground" />
        <p className="text-sm font-medium">Sem dados para o cruzamento Entradas × Saídas</p>
        <p className="text-xs text-muted-foreground">
          Importe as duas bases: <code>import:sismat</code> (entradas) e <code>import:sismat-saidas</code> (saídas).
        </p>
      </div>
    );
  }

  const maxAbs = Math.max(...ranking.map((r) => Math.abs(r.saldo)), 1);

  return (
    <div className="space-y-6">
      {/* ── Controles ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-4 bg-card border border-border rounded-xl p-4 shadow-sm">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">Período</span>
          <div className="flex gap-1">
            {PERIODOS.map((p) => (
              <Button
                key={p.value}
                size="sm"
                variant={period === p.value ? "default" : "outline"}
                onClick={() => {
                  setPeriod(p.value);
                  if (p.value === "yearly") setYear("");
                }}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>

        {period === "monthly" && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">Ano (fluxo mensal)</span>
            <select className={selectCn} value={year} onChange={(e) => setYear(e.target.value)}>
              <option value="">Todos os anos</option>
              {data.years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ── KPIs ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Total de entradas"
          value={fmtBRL(data.totalEntradas)}
          icon={<ArrowDownToLine className="h-5 w-5" />}
          description="Aquisições (todo o período)"
        />
        <MetricCard
          label="Total de saídas"
          value={fmtBRL(data.totalSaidas)}
          icon={<ArrowUpFromLine className="h-5 w-5" />}
          description="Entregas (todo o período)"
        />
        <MetricCard
          label="Saldo derivado (E − S)"
          value={fmtBRL(data.saldo)}
          icon={<Wallet className="h-5 w-5" />}
          description="Diferença dos extratos"
        />
        <MetricCard
          label="Materiais com saldo positivo"
          value={data.materiaisComSaldoPositivo}
          icon={<Boxes className="h-5 w-5" />}
          description={`De ${data.porMaterial.length} materiais cruzados`}
        />
      </div>

      {/* ── Fluxo E×S ──────────────────────────────────────────────────────── */}
      <Panel
        icon={<BarChart3 className="h-4 w-4" />}
        title={`Entradas e saídas por ${period === "monthly" ? "mês" : "ano"}`}
        subtitle={`Aquisições recebidas vs. entregas realizadas${year && period === "monthly" ? ` — ano ${year}` : ""}`}
      >
        <SismatFluxChart data={view.fluxoExibido} periodType={period} />
      </Panel>

      {/* ── Saldo acumulado + Ranking por material ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel
          icon={<TrendingUp className="h-4 w-4" />}
          title="Evolução do saldo derivado acumulado"
          subtitle={`Acumulado de (entradas − saídas) ${period === "monthly" ? "mês a mês" : "ano a ano"}, todo o período`}
        >
          <SismatSaldoChart data={view.saldoAcumulado} />
          <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
            <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
            <span>
              Saldo <strong>derivado</strong> dos dois extratos disponíveis — não é o estoque contábil do
              SISMAT. O estoque anterior a 2018 não consta nas entradas e a valoração de saída pode diferir
              da de entrada, por isso o acumulado pode ficar negativo.
            </span>
          </p>
        </Panel>

        <Panel
          icon={<Boxes className="h-4 w-4" />}
          title="Saldo derivado por material"
          subtitle={`Entradas, saídas e saldo por princípio ativo · ${data.porMaterial.length} materiais`}
        >
          <div className="max-h-[360px] overflow-y-auto pr-1">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="text-left py-2 font-medium">
                    <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("nome")}>
                      Material <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="text-right py-2 font-medium">
                    <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("entradas")}>
                      Entradas <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="text-right py-2 font-medium">
                    <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("saidas")}>
                      Saídas <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="text-right py-2 font-medium">
                    <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("saldo")}>
                      Saldo <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((r) => (
                  <tr key={r.nome} className="border-b border-border/50">
                    <td className="py-2 pr-2 max-w-[180px]">
                      <span className="truncate block" title={r.nome}>
                        {r.nome}
                      </span>
                      <div className="h-1 mt-1 rounded bg-muted overflow-hidden">
                        <div
                          className="h-full rounded"
                          style={{
                            width: `${(Math.abs(r.saldo) / maxAbs) * 100}%`,
                            backgroundColor: r.saldo >= 0 ? SISMAT_SALDO_COLOR : SISMAT_SAIDA_COLOR,
                          }}
                        />
                      </div>
                    </td>
                    <td className="py-2 text-right tabular-nums whitespace-nowrap" style={{ color: SISMAT_ENTRADA_COLOR }}>
                      {fmtBRL(r.entradas)}
                    </td>
                    <td className="py-2 text-right tabular-nums whitespace-nowrap" style={{ color: SISMAT_SAIDA_COLOR }}>
                      {fmtBRL(r.saidas)}
                    </td>
                    <td
                      className="py-2 text-right tabular-nums whitespace-nowrap font-medium"
                      style={{ color: r.saldo >= 0 ? SISMAT_SALDO_COLOR : SISMAT_SAIDA_COLOR }}
                    >
                      {fmtBRL(r.saldo)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}
