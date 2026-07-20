"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  useSaidasRedmineOverview,
  useSaidasRedmineTabela,
} from "@/hooks/useSismatSaidasRedmine";
import type {
  RankItem,
  SaidasRedmineFiltro,
  SaidasRedmineFiltros,
} from "@/lib/sismat-saidas-redmine-metrics";
import { MetricCard } from "./metric-card";
import { SismatPieChart, type SismatPieDatum } from "./charts/sismat-pie-chart";
import { fmtBRL, fmtBRLCompact, colorAt } from "./charts/sismat-format";
import { Combobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Coins,
  FileText,
  Pill,
  ArrowUpFromLine,
  Stethoscope,
  Scale,
  Layers,
  MapPin,
  ClipboardCheck,
  PackageCheck,
  Filter,
  FilterX,
  Loader2,
  AlertTriangle,
  PackageOpen,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Saídas SISMAT × Redmine — réplica do dashboard_redmine_sismat.html:
// KPIs globais, Top 20 medicamentos, Top 15 CRM/OAB, 4 distribuições,
// filtros por atributo do Redmine e tabela dos processos com saídas.
// Os gráficos são GLOBAIS (não refiltram); os filtros regem os KPIs
// filtrados e a tabela — mesmo comportamento do dashboard de referência.
// ─────────────────────────────────────────────────────────────────────────────

const selectCn =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

/** Selects nativos (baixa cardinalidade); CRM e OAB usam Combobox pesquisável. */
const FILTROS_SELECT: { key: SaidasRedmineFiltro; lbl: string }[] = [
  { key: "grupo", lbl: "Grupo Temático" },
  { key: "regiao", lbl: "Região Brasil" },
  { key: "uf", lbl: "UF" },
  { key: "forma", lbl: "Forma Cumprimento" },
  { key: "modal", lbl: "Modalidade" },
  { key: "sabast", lbl: "Status Abastec." },
  { key: "status", lbl: "Status Redmine" },
];

const FILTROS_VAZIOS: Record<SaidasRedmineFiltro, string> = {
  grupo: "",
  regiao: "",
  uf: "",
  forma: "",
  modal: "",
  sabast: "",
  status: "",
  crm: "",
  oab: "",
};

const COLUNAS_TABELA: { key: string; lbl: string }[] = [
  { key: "sei", lbl: "SEI" },
  { key: "material", lbl: "Medicamento" },
  { key: "valor", lbl: "Valor (R$)" },
  { key: "crm", lbl: "CRM" },
  { key: "oab", lbl: "OAB" },
  { key: "grupo", lbl: "Grupo Temático" },
  { key: "regiao", lbl: "Região" },
  { key: "uf", lbl: "UF" },
  { key: "forma", lbl: "Forma Cumprimento" },
  { key: "modal", lbl: "Modalidade" },
  { key: "sabast", lbl: "Status Abastec." },
  { key: "status", lbl: "Status Redmine" },
];

// ── Painel (mesmo visual das demais seções do SISMAT) ─────────────────────────

function Panel({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-start gap-2 mb-1">
        <span className="text-primary mt-0.5 flex-shrink-0">{icon}</span>
        <div>
          <h3 className="text-base font-semibold leading-tight">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

// ── Barras horizontais (rankings por valor) ───────────────────────────────────

function HBarTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { nome: string; valor: number } }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-background/95 backdrop-blur-md border border-border rounded-lg px-3 py-2 shadow-lg text-xs max-w-xs">
      <p className="font-semibold text-foreground leading-snug">{d.nome}</p>
      <p className="text-muted-foreground tabular-nums mt-1">{fmtBRL(d.valor)}</p>
    </div>
  );
}

function RankingBarChart({
  items,
  height,
  maxLabel = 36,
}: {
  items: RankItem[];
  height: number;
  maxLabel?: number;
}) {
  const data = items.map((d) => ({
    nome: d.l,
    label: d.l.length > maxLabel ? d.l.slice(0, maxLabel - 1) + "…" : d.l,
    valor: d.v,
  }));
  if (!data.length) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted-foreground"
        style={{ height }}
      >
        Sem dados para o ranking.
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" opacity={0.25} />
        <XAxis
          type="number"
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          tickFormatter={(v: number) => fmtBRLCompact(v)}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={Math.min(250, maxLabel * 7)}
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          interval={0}
        />
        <Tooltip content={<HBarTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.25 }} />
        <Bar dataKey="valor" radius={[0, 3, 3, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={colorAt(i)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Distribuições (pizza) ─────────────────────────────────────────────────────

function Distribuicao({ items }: { items: RankItem[] }) {
  const data: SismatPieDatum[] = items.map((d) => ({ name: d.l, valor: d.v }));
  const total = items.reduce((s, d) => s + d.v, 0);
  return <SismatPieChart data={data} grandTotal={total} />;
}

// ── Componente principal ──────────────────────────────────────────────────────

export function SismatSaidasView() {
  const [filtros, setFiltros] = useState<Record<SaidasRedmineFiltro, string>>(FILTROS_VAZIOS);

  const filtrosAtivos = useMemo<SaidasRedmineFiltros>(() => {
    const f: SaidasRedmineFiltros = {};
    for (const [k, v] of Object.entries(filtros)) {
      if (v) f[k as SaidasRedmineFiltro] = v;
    }
    return f;
  }, [filtros]);
  const temFiltro = Object.keys(filtrosAtivos).length > 0;

  const { data: over, isLoading, error } = useSaidasRedmineOverview();
  const tabela = useSaidasRedmineTabela(filtrosAtivos);

  function setF(key: SaidasRedmineFiltro, value: string) {
    setFiltros((prev) => ({ ...prev, [key]: value }));
  }
  function limpar() {
    setFiltros(FILTROS_VAZIOS);
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
          <span className="font-medium text-sm">Erro ao carregar as saídas cruzadas com o Redmine</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {error instanceof Error ? error.message : "Não foi possível consultar o banco de dados."}
        </p>
      </div>
    );
  }

  if (!over || !over.hasData) {
    return (
      <div className="rounded-lg border border-border bg-card p-10 text-center space-y-2">
        <PackageOpen className="h-8 w-8 mx-auto text-muted-foreground" />
        <p className="text-sm font-medium">Nenhuma saída do SISMAT encontrada</p>
        <p className="text-xs text-muted-foreground">
          Após <code>npx prisma db push</code>, rode as importações:{" "}
          <code>npm run import:sismat-saidas -- --truncate --confirm --file=&quot;…Saidas.xlsx&quot;</code>{" "}
          e <code>npm run import:redmine-sei -- --truncate --confirm --file=&quot;…baseRedmine.xlsx&quot;</code>.
        </p>
      </div>
    );
  }

  const kpisFilt = tabela.data?.kpis;

  return (
    <div className="space-y-4">
      {/* ── KPIs globais ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard label="Valor Total de Saída" value={fmtBRL(over.kpis.valor)} subtext="SISMAT" icon={<Coins className="h-4 w-4" />} />
        <MetricCard label="Processos Únicos" value={over.kpis.processos} subtext="por nº SEI" icon={<FileText className="h-4 w-4" />} />
        <MetricCard label="Medicamentos" value={over.kpis.medicamentos} subtext="distintos" icon={<Pill className="h-4 w-4" />} />
        <MetricCard label="Total de Saídas" value={over.kpis.saidas} subtext="linhas SISMAT" icon={<ArrowUpFromLine className="h-4 w-4" />} />
      </div>

      {/* ── Top 20 medicamentos ──────────────────────────────────────────── */}
      <Panel
        icon={<Pill className="h-4 w-4" />}
        title="Top 20 Medicamentos por Valor Total de Saída"
        subtitle="Soma do valor das saídas SISMAT por material"
      >
        <RankingBarChart items={over.topMed} height={560} maxLabel={38} />
      </Panel>

      {/* ── Top CRM / OAB ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel
          icon={<Stethoscope className="h-4 w-4" />}
          title="Top 15 por Número CRM"
          subtitle="Prescritores com maior valor de saída (cruzamento Redmine por SEI)"
        >
          <RankingBarChart items={over.porCrm} height={360} maxLabel={18} />
        </Panel>
        <Panel
          icon={<Scale className="h-4 w-4" />}
          title="Top 15 por Número OAB"
          subtitle="Advogados com maior valor de saída (cruzamento Redmine por SEI)"
        >
          <RankingBarChart items={over.porOab} height={360} maxLabel={18} />
        </Panel>
      </div>

      {/* ── Distribuições ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel icon={<Layers className="h-4 w-4" />} title="Por Grupo Temático">
          <Distribuicao items={over.porGrupo} />
        </Panel>
        <Panel icon={<MapPin className="h-4 w-4" />} title="Por Região Brasil">
          <Distribuicao items={over.porRegiao} />
        </Panel>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel icon={<ClipboardCheck className="h-4 w-4" />} title="Por Forma de Cumprimento">
          <Distribuicao items={over.porForma} />
        </Panel>
        <Panel icon={<PackageCheck className="h-4 w-4" />} title="Por Status do Abastecimento">
          <Distribuicao items={over.porSabast} />
        </Panel>
      </div>

      {/* ── Filtros ──────────────────────────────────────────────────────── */}
      <Panel
        icon={<Filter className="h-4 w-4" />}
        title="Filtros"
        subtitle="Regem os totais filtrados e a tabela abaixo (os gráficos acima são globais)"
      >
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          {FILTROS_SELECT.map(({ key, lbl }) => (
            <div key={key} className="space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {lbl}
              </label>
              <select
                className={selectCn}
                value={filtros[key]}
                onChange={(e) => setF(key, e.target.value)}
              >
                <option value="">Todos</option>
                {over.opcoes[key].map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.value}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              CRM
            </label>
            <Combobox
              value={filtros.crm}
              onChange={(v) => setF("crm", v)}
              options={over.opcoes.crm.map((o) => ({ value: o.value, count: o.count }))}
              placeholder="Todos"
              searchPlaceholder="Buscar CRM…"
              allLabel="Todos"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              OAB
            </label>
            <Combobox
              value={filtros.oab}
              onChange={(v) => setF("oab", v)}
              options={over.opcoes.oab.map((o) => ({ value: o.value, count: o.count }))}
              placeholder="Todos"
              searchPlaceholder="Buscar OAB…"
              allLabel="Todos"
            />
          </div>
          <div className="flex items-end">
            <Button variant="outline" size="sm" onClick={limpar} disabled={!temFiltro} className="gap-1.5">
              <FilterX className="h-3.5 w-3.5" />
              Limpar Filtros
            </Button>
          </div>
        </div>
      </Panel>

      {/* ── Totais filtrados ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Totais Filtrados
        </h3>
        <span
          className={
            "text-[10px] font-bold rounded px-1.5 py-0.5 " +
            (temFiltro
              ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
              : "bg-primary/10 text-primary")
          }
        >
          {temFiltro ? "FILTRADO" : "SEM FILTRO"}
        </span>
        {tabela.isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard label="Valor Total de Saída" value={kpisFilt ? fmtBRL(kpisFilt.valor) : "—"} subtext="SISMAT" icon={<Coins className="h-4 w-4" />} />
        <MetricCard label="Processos Únicos" value={kpisFilt?.processos ?? 0} subtext="por nº SEI" icon={<FileText className="h-4 w-4" />} />
        <MetricCard label="Medicamentos" value={kpisFilt?.medicamentos ?? 0} subtext="distintos" icon={<Pill className="h-4 w-4" />} />
        <MetricCard label="Total de Saídas" value={kpisFilt?.saidas ?? 0} subtext="linhas SISMAT" icon={<ArrowUpFromLine className="h-4 w-4" />} />
      </div>

      {/* ── Tabela de processos com saídas ───────────────────────────────── */}
      <Panel
        icon={<FileText className="h-4 w-4" />}
        title="Processos com Saídas"
        subtitle={
          tabela.data
            ? `${tabela.data.total.toLocaleString("pt-BR")} registro(s)` +
              (tabela.data.total > tabela.data.limite
                ? ` — exibindo os ${tabela.data.limite} de maior valor`
                : "")
            : "Carregando…"
        }
      >
        <div className="overflow-auto max-h-[440px] rounded-md border border-border">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                {COLUNAS_TABELA.map((c) => (
                  <th
                    key={c.key}
                    className="sticky top-0 z-10 bg-primary text-primary-foreground text-left font-semibold px-3 py-2 whitespace-nowrap"
                  >
                    {c.lbl}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(tabela.data?.rows ?? []).map((r, i) => (
                <tr key={`${r.sei}-${i}`} className="border-b border-border/50 hover:bg-accent/40">
                  <td className="px-3 py-1.5 whitespace-nowrap max-w-[220px] truncate" title={r.sei}>{r.sei}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap max-w-[260px] truncate" title={r.material}>{r.material}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap text-right font-semibold tabular-nums text-primary">{fmtBRL(r.valor)}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap max-w-[140px] truncate" title={r.crm}>{r.crm}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap max-w-[140px] truncate" title={r.oab}>{r.oab}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap max-w-[220px] truncate" title={r.grupo}>{r.grupo}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{r.regiao}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{r.uf}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{r.forma}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{r.modal}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{r.sabast}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{r.status}</td>
                </tr>
              ))}
              {tabela.data && tabela.data.rows.length === 0 && (
                <tr>
                  <td colSpan={COLUNAS_TABELA.length} className="px-3 py-6 text-center text-muted-foreground">
                    Nenhum registro para os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
