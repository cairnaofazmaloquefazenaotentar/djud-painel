"use client";

import { useMemo, useState } from "react";
import { useSismatEstoque } from "@/hooks/useSismatEstoque";
import type { SismatPeriodo } from "@/lib/sismat-metrics";
import type { SismatSaldoMaterial } from "@/lib/sismat-estoque-metrics";
import { SismatFluxChart } from "./charts/sismat-flux-chart";
import {
  fmtBRL,
  fmtQty,
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
  BarChart3,
  Loader2,
  AlertTriangle,
  ArrowUpDown,
  Info,
  X,
  Package,
  Calendar,
} from "lucide-react";

const PERIODOS: { value: SismatPeriodo; label: string }[] = [
  { value: "monthly", label: "Mensal" },
  { value: "yearly", label: "Anual" },
];

type SortField =
  | "nome"
  | "entradas"
  | "saidas"
  | "saldo"
  | "quantidadeEntradas"
  | "quantidadeSaidas"
  | "saldoQuantidade"
  | "mediasSaidasMesBRL"
  | "mediasSaidasMesQty"
  | "mesesEstoque";

function fmtMeses(v: number | null): string {
  if (v == null) return "—";
  if (!isFinite(v)) return "—";
  if (v < 0) return "< 0";
  return v.toFixed(1) + " m";
}

function SortBtn({
  field,
  active,
  dir,
  onClick,
  children,
}: {
  field: SortField;
  active: boolean;
  dir: 1 | -1;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${
        active ? "text-foreground font-semibold" : ""
      }`}
      onClick={onClick}
    >
      {children}
      <ArrowUpDown className={`h-3 w-3 ${active ? "opacity-100" : "opacity-40"}`} />
    </button>
  );
}

export function SismatEstoqueView() {
  const [period, setPeriod] = useState<SismatPeriodo>("monthly");
  const [year, setYear] = useState("");
  const [materialNome, setMaterialNome] = useState("");
  const [sortField, setSortField] = useState<SortField>("saldo");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  const { data, isLoading, error } = useSismatEstoque(period, materialNome || undefined);

  const hasFilter = !!materialNome;

  const fluxoExibido = useMemo(() => {
    if (!data) return [];
    const fy = year && period === "monthly" ? year : null;
    return fy ? data.fluxo.filter((f) => f.period.startsWith(fy)) : data.fluxo;
  }, [data, year, period]);

  const ranking = useMemo((): SismatSaldoMaterial[] => {
    if (!data) return [];
    const dir = sortDir;
    return [...data.porMaterial].sort((a, b) => {
      if (sortField === "nome") return dir * a.nome.localeCompare(b.nome, "pt-BR");
      if (sortField === "mesesEstoque") {
        const ma = a.mesesEstoque ?? -Infinity;
        const mb = b.mesesEstoque ?? -Infinity;
        return dir * (ma - mb);
      }
      return dir * ((a[sortField] as number) - (b[sortField] as number));
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

  if (!data || !data.hasData) {
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

        {/* Filtro por material (principio ativo) */}
        <div className="flex flex-col gap-1.5 min-w-[220px]">
          <span className="text-xs text-muted-foreground">Material</span>
          <div className="relative">
            <select
              className={selectCn + " w-full pr-8"}
              value={materialNome}
              onChange={(e) => {
                setMaterialNome(e.target.value);
                setYear("");
              }}
            >
              <option value="">Todos os materiais</option>
              {data.materiaisDisponiveis.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            {materialNome && (
              <button
                onClick={() => setMaterialNome("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                title="Limpar filtro"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Período Mensal/Anual */}
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
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        )}

        {/* Badge do filtro ativo */}
        {materialNome && (
          <div className="flex items-center gap-1.5 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-medium">
            <Package className="h-3 w-3" />
            {materialNome}
            <button onClick={() => setMaterialNome("")} className="ml-1 hover:text-primary/70">
              <X className="h-3 w-3" />
            </button>
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
          description={`De ${data.porMaterial.length} materiais`}
        />
      </div>

      {/* ── Gráfico(s) de fluxo ─────────────────────────────────────────────
           Sem filtro: 1 gráfico (R$)
           Com filtro: 2 gráficos lado a lado — R$ e Unidades           */}
      {hasFilter ? (
        <div className="grid grid-cols-1 gap-6">
          <Panel
            icon={<BarChart3 className="h-4 w-4" />}
            title={`Entradas e saídas — R$ (${period === "monthly" ? "mensal" : "anual"})`}
            subtitle={`${materialNome}${year && period === "monthly" ? ` — ${year}` : ""}`}
          >
            <SismatFluxChart data={fluxoExibido} periodType={period} mode="brl" />
          </Panel>
          <Panel
            icon={<BarChart3 className="h-4 w-4" />}
            title={`Entradas e saídas — Unidades (${period === "monthly" ? "mensal" : "anual"})`}
            subtitle={`${materialNome}${year && period === "monthly" ? ` — ${year}` : ""}`}
          >
            <SismatFluxChart data={fluxoExibido} periodType={period} mode="qty" />
          </Panel>
        </div>
      ) : (
        <Panel
          icon={<BarChart3 className="h-4 w-4" />}
          title={`Entradas e saídas por ${period === "monthly" ? "mês" : "ano"}`}
          subtitle={`Aquisições recebidas vs. entregas realizadas · linha = saldo acumulado${year && period === "monthly" ? ` — ano ${year}` : ""}`}
        >
          <SismatFluxChart data={fluxoExibido} periodType={period} mode="brl" />
          <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
            <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
            <span>
              Saldo <strong>derivado</strong> dos dois extratos disponíveis — não é o estoque contábil do SISMAT.
              O estoque anterior a 2018 não consta nas entradas; valorações diferentes podem gerar acumulado negativo.
            </span>
          </p>
        </Panel>
      )}

      {/* ── Tabela de materiais ────────────────────────────────────────────── */}
      <Panel
        icon={<Boxes className="h-4 w-4" />}
        title="Saldo derivado por material"
        subtitle={`${data.porMaterial.length} materiais${materialNome ? ` · filtrado: ${materialNome}` : ""}`}
      >
        <div className="overflow-x-auto">
          <div className="max-h-[480px] overflow-y-auto pr-1">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b border-border text-xs text-muted-foreground">
                  {/* Identificação */}
                  <th className="text-left py-2 pr-3 font-medium min-w-[160px]">
                    <SortBtn field="nome" active={sortField === "nome"} dir={sortDir} onClick={() => toggleSort("nome")}>
                      Material
                    </SortBtn>
                  </th>
                  {/* Valores em R$ */}
                  <th className="text-right py-2 px-2 font-medium whitespace-nowrap">
                    <SortBtn field="entradas" active={sortField === "entradas"} dir={sortDir} onClick={() => toggleSort("entradas")}>
                      Entradas R$
                    </SortBtn>
                  </th>
                  <th className="text-right py-2 px-2 font-medium whitespace-nowrap">
                    <SortBtn field="saidas" active={sortField === "saidas"} dir={sortDir} onClick={() => toggleSort("saidas")}>
                      Saídas R$
                    </SortBtn>
                  </th>
                  <th className="text-right py-2 px-2 font-medium whitespace-nowrap">
                    <SortBtn field="saldo" active={sortField === "saldo"} dir={sortDir} onClick={() => toggleSort("saldo")}>
                      Saldo R$
                    </SortBtn>
                  </th>
                  {/* Quantidades */}
                  <th className="text-right py-2 px-2 font-medium whitespace-nowrap">
                    <SortBtn field="quantidadeEntradas" active={sortField === "quantidadeEntradas"} dir={sortDir} onClick={() => toggleSort("quantidadeEntradas")}>
                      Ent. un.
                    </SortBtn>
                  </th>
                  <th className="text-right py-2 px-2 font-medium whitespace-nowrap">
                    <SortBtn field="quantidadeSaidas" active={sortField === "quantidadeSaidas"} dir={sortDir} onClick={() => toggleSort("quantidadeSaidas")}>
                      Saí. un.
                    </SortBtn>
                  </th>
                  <th className="text-right py-2 px-2 font-medium whitespace-nowrap">
                    <SortBtn field="saldoQuantidade" active={sortField === "saldoQuantidade"} dir={sortDir} onClick={() => toggleSort("saldoQuantidade")}>
                      Saldo un.
                    </SortBtn>
                  </th>
                  {/* Médias mensais */}
                  <th className="text-right py-2 px-2 font-medium whitespace-nowrap">
                    <SortBtn field="mediasSaidasMesBRL" active={sortField === "mediasSaidasMesBRL"} dir={sortDir} onClick={() => toggleSort("mediasSaidasMesBRL")}>
                      Média/mês R$
                    </SortBtn>
                  </th>
                  <th className="text-right py-2 px-2 font-medium whitespace-nowrap">
                    <SortBtn field="mediasSaidasMesQty" active={sortField === "mediasSaidasMesQty"} dir={sortDir} onClick={() => toggleSort("mediasSaidasMesQty")}>
                      Média/mês un.
                    </SortBtn>
                  </th>
                  {/* Cobertura */}
                  <th className="text-right py-2 pl-2 font-medium whitespace-nowrap">
                    <SortBtn field="mesesEstoque" active={sortField === "mesesEstoque"} dir={sortDir} onClick={() => toggleSort("mesesEstoque")}>
                      <Calendar className="h-3 w-3 mr-0.5" />
                      Cobertura
                    </SortBtn>
                  </th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((r) => (
                  <tr key={r.nome} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    {/* Material */}
                    <td className="py-2 pr-3 max-w-[200px]">
                      <span className="truncate block font-medium" title={r.nome}>
                        {r.nome}
                      </span>
                      {r.principioAtivo && r.principioAtivo !== r.nome && (
                        <span className="text-[10px] text-muted-foreground truncate block">
                          {r.principioAtivo}
                        </span>
                      )}
                      <div className="h-1 mt-1 rounded bg-muted overflow-hidden w-full">
                        <div
                          className="h-full rounded"
                          style={{
                            width: `${(Math.abs(r.saldo) / maxAbs) * 100}%`,
                            backgroundColor: r.saldo >= 0 ? SISMAT_SALDO_COLOR : SISMAT_SAIDA_COLOR,
                          }}
                        />
                      </div>
                    </td>
                    {/* R$ */}
                    <td className="py-2 px-2 text-right tabular-nums whitespace-nowrap" style={{ color: SISMAT_ENTRADA_COLOR }}>
                      {fmtBRL(r.entradas)}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums whitespace-nowrap" style={{ color: SISMAT_SAIDA_COLOR }}>
                      {fmtBRL(r.saidas)}
                    </td>
                    <td
                      className="py-2 px-2 text-right tabular-nums whitespace-nowrap font-medium"
                      style={{ color: r.saldo >= 0 ? SISMAT_SALDO_COLOR : SISMAT_SAIDA_COLOR }}
                    >
                      {fmtBRL(r.saldo)}
                    </td>
                    {/* Quantidades */}
                    <td className="py-2 px-2 text-right tabular-nums text-xs text-muted-foreground whitespace-nowrap">
                      {r.quantidadeEntradas > 0 ? fmtQty(r.quantidadeEntradas) : "—"}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-xs text-muted-foreground whitespace-nowrap">
                      {r.quantidadeSaidas > 0 ? fmtQty(r.quantidadeSaidas) : "—"}
                    </td>
                    <td
                      className="py-2 px-2 text-right tabular-nums text-xs whitespace-nowrap font-medium"
                      style={{ color: r.saldoQuantidade >= 0 ? SISMAT_SALDO_COLOR : SISMAT_SAIDA_COLOR }}
                    >
                      {r.quantidadeEntradas > 0 || r.quantidadeSaidas > 0 ? fmtQty(r.saldoQuantidade) : "—"}
                    </td>
                    {/* Médias */}
                    <td className="py-2 px-2 text-right tabular-nums text-xs text-muted-foreground whitespace-nowrap">
                      {r.mediasSaidasMesBRL > 0 ? fmtBRL(r.mediasSaidasMesBRL) : "—"}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-xs text-muted-foreground whitespace-nowrap">
                      {r.mediasSaidasMesQty > 0.001 ? fmtQty(r.mediasSaidasMesQty) : "—"}
                    </td>
                    {/* Cobertura */}
                    <td
                      className="py-2 pl-2 text-right tabular-nums text-xs whitespace-nowrap font-medium"
                      style={{
                        color:
                          r.mesesEstoque == null
                            ? undefined
                            : r.mesesEstoque < 3
                            ? SISMAT_SAIDA_COLOR
                            : r.mesesEstoque < 6
                            ? "#ffd43b"
                            : SISMAT_SALDO_COLOR,
                      }}
                      title="Saldo ÷ saída média mensal (últimos 12 meses)"
                    >
                      {fmtMeses(r.mesesEstoque)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground flex items-center gap-1">
          <Info className="h-3 w-3 flex-shrink-0" />
          Cobertura = saldo em unidades ÷ saída média mensal dos últimos 12 meses. Cores: &lt;3 m vermelho, 3–6 m amarelo, &gt;6 m verde.
          Média/mês em R$ usada como fallback quando quantidade não disponível.
        </p>
      </Panel>
    </div>
  );
}
