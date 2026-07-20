"use client";

import { useMemo, useRef, useState } from "react";
import { usePrecosOverview, usePrecosSerie } from "@/hooks/usePrecos";
import { Panel } from "@/components/dashboard/sismat-shared";
import { MetricCard } from "@/components/dashboard/metric-card";
import { Combobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PrecosScatterChart,
  PRECOS_PALETTE,
  fmtPreco,
  fmtDataISO,
  glyphFor,
} from "@/components/dashboard/charts/precos-scatter-chart";
import {
  AlertTriangle,
  BarChart2,
  Calendar,
  Coins,
  Database,
  Loader2,
  Pill,
  RotateCcw,
  TrendingUp,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Aba "Preços" — comparativo dos preços praticados em compras públicas de
// medicamentos (base ComprasGov 2018–2025). Cada ponto do gráfico é uma
// compra; a cor separa esfera OU modalidade e o formato do marcador destaca
// as compras judiciais frente às administrativas.
// ─────────────────────────────────────────────────────────────────────────────

const SEP = "|||"; // separador do value do combobox (mesma convenção da base de origem)

const GROUP_LABELS: Record<"e" | "c", string> = {
  e: "Esfera",
  c: "Modalidade de compra",
};

/** Valores de "Judicial" presentes na base — legenda fixa de formatos. */
const JUDICIAL_VALUES = ["Judicial", "Não Judicial"] as const;

export function PrecosView() {
  const [comboEscolhido, setComboEscolhido] = useState(""); // "MATERIAL|||UNIDADE" (escolha do usuário)
  const [groupKey, setGroupKey] = useState<"e" | "c">("e");
  const [excluded, setExcluded] = useState<Set<number>>(new Set());

  const seletorRef = useRef<HTMLDivElement>(null);

  const { data: overview, isLoading: overviewLoading, error: overviewError } = usePrecosOverview();

  // Sem escolha do usuário, o primeiro medicamento da lista fica selecionado
  // (como no dashboard original) — valor DERIVADO, sem setState em effect.
  const combo = useMemo(() => {
    if (comboEscolhido) return comboEscolhido;
    const primeiro = overview?.combos[0];
    return primeiro ? `${primeiro.material}${SEP}${primeiro.unidade}` : "";
  }, [comboEscolhido, overview]);

  const [material, unidade] = useMemo(() => {
    const i = combo.indexOf(SEP);
    return i < 0 ? ["", ""] : [combo.slice(0, i), combo.slice(i + SEP.length)];
  }, [combo]);

  const { data: serie, isLoading: serieLoading } = usePrecosSerie(material, unidade);

  function selecionarCombo(novo: string) {
    setComboEscolhido(novo);
    setExcluded(new Set()); // trocar de medicamento restaura os pontos ocultados
  }

  function ocultarPonto(id: number) {
    setExcluded((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  const comboOptions = useMemo(
    () =>
      (overview?.combos ?? []).map((c) => ({
        value: `${c.material}${SEP}${c.unidade}`,
        label: `${c.material} — ${c.unidade}`,
        count: c.n,
      })),
    [overview]
  );

  const todosPontos = useMemo(() => serie?.pontos ?? [], [serie]);
  const pontos = useMemo(
    () => todosPontos.filter((p) => !excluded.has(p.id)),
    [todosPontos, excluded]
  );
  const ocultados = todosPontos.length - pontos.length;

  // Categorias visíveis (cores do gráfico, legenda e tabela-resumo).
  const categorias = useMemo(
    () =>
      Array.from(new Set(pontos.map((p) => p[groupKey]))).sort((a, b) =>
        a.localeCompare(b, "pt-BR")
      ),
    [pontos, groupKey]
  );

  // Resumo por categoria: nº de compras, preço médio, mín, máx e variação.
  const resumo = useMemo(
    () =>
      categorias.map((cat) => {
        const precos = pontos.filter((p) => p[groupKey] === cat).map((p) => p.p);
        const n = precos.length;
        const soma = precos.reduce((a, b) => a + b, 0);
        const min = Math.min(...precos);
        const max = Math.max(...precos);
        return { cat, n, media: soma / n, min, max, razao: min > 0 ? max / min : 0 };
      }),
    [categorias, pontos, groupKey]
  );

  // ── Erro ao carregar a visão geral ─────────────────────────────────────────
  if (overviewError) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-6 space-y-3">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4" />
          <span className="font-medium text-sm">Erro ao carregar a base de preços</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {overviewError instanceof Error
            ? overviewError.message
            : "Não foi possível consultar o banco de dados."}
        </p>
        <button onClick={() => window.location.reload()} className="text-xs text-primary underline">
          Recarregar página
        </button>
      </div>
    );
  }

  if (overviewLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Base ainda não importada ───────────────────────────────────────────────
  if (!overview?.hasData) {
    return (
      <div className="rounded-lg border border-border bg-card p-10 text-center space-y-2">
        <Coins className="h-8 w-8 mx-auto text-muted-foreground" />
        <p className="text-sm font-medium">Nenhum registro de preços encontrado</p>
        <p className="text-xs text-muted-foreground">
          Importe a base ComprasGov com{" "}
          <code>npx tsx scripts/import-comprasgov-precos.ts --truncate --confirm</code> e recarregue
          a página.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Cards de resumo da base ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard
          label="Compras registradas"
          value={overview.totalRegistros}
          icon={<Database className="h-5 w-5" />}
        />
        <MetricCard
          label="Medicamentos"
          value={overview.totalMedicamentos}
          icon={<Pill className="h-5 w-5" />}
        />
        <MetricCard
          label="Início da série"
          value={overview.dataMin ? fmtDataISO(overview.dataMin) : "—"}
          icon={<Calendar className="h-5 w-5" />}
        />
        <MetricCard
          label="Fim da série"
          value={overview.dataMax ? fmtDataISO(overview.dataMax) : "—"}
          icon={<Calendar className="h-5 w-5" />}
        />
      </div>

      {/* ── Seleção + gráfico de dispersão ──────────────────────────────────── */}
      <div ref={seletorRef}>
        <Panel
          icon={<Coins className="h-4 w-4" />}
          title="Preço praticado ao longo do tempo"
          subtitle="Cada ponto é uma compra — cor: esfera ou modalidade · formato do marcador: se a compra é judicial"
        >
          <div className="flex flex-wrap items-end gap-4 mb-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Medicamento — unidade de fornecimento</span>
              <Combobox
                value={combo}
                onChange={(v) => v && selecionarCombo(v)}
                options={comboOptions}
                placeholder="Selecione o medicamento..."
                searchPlaceholder="Buscar medicamento..."
                allLabel="Selecione um medicamento"
                emptyText="Nenhum medicamento encontrado."
                className="w-[26rem] max-w-full"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Comparar por</span>
              <div className="inline-flex rounded-lg border border-border bg-card p-1">
                {(Object.keys(GROUP_LABELS) as Array<"e" | "c">).map((k) => (
                  <button
                    key={k}
                    onClick={() => setGroupKey(k)}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      groupKey === k
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {GROUP_LABELS[k]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {serieLoading && (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!serieLoading && serie && pontos.length === 0 && (
            <div className="flex flex-col items-center justify-center h-[300px] gap-3 text-sm text-muted-foreground">
              <p>Todos os pontos foram ocultados.</p>
              <Button variant="outline" size="sm" onClick={() => setExcluded(new Set())}>
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Restaurar pontos ocultados
              </Button>
            </div>
          )}

          {!serieLoading && serie && pontos.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_13rem] gap-6">
              <div>
                <PrecosScatterChart
                  pontos={pontos}
                  groupKey={groupKey}
                  categorias={categorias}
                  onPointClick={ocultarPonto}
                />
                <p className="text-xs text-muted-foreground mt-2">
                  {pontos.length.toLocaleString("pt-BR")} compra(s) exibida(s) de{" "}
                  <span className="font-medium text-foreground">
                    {serie.material} ({serie.unidade})
                  </span>
                  . Clique em um ponto para ocultá-lo da visualização (útil para remover outliers).
                </p>
                {ocultados > 0 && (
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs text-muted-foreground">
                      {ocultados.toLocaleString("pt-BR")} ponto(s) ocultado(s).
                    </span>
                    <Button variant="outline" size="sm" onClick={() => setExcluded(new Set())}>
                      <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                      Restaurar pontos ocultados
                    </Button>
                  </div>
                )}
              </div>

              {/* ── Legendas (cor + formato) ─────────────────────────────────── */}
              <div className="space-y-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    {GROUP_LABELS[groupKey]}
                  </p>
                  <div className="space-y-1.5">
                    {categorias.map((cat, i) => (
                      <div key={cat} className="flex items-center gap-2 text-sm">
                        <span
                          className="h-3 w-3 rounded-sm shrink-0"
                          style={{ backgroundColor: PRECOS_PALETTE[i % PRECOS_PALETTE.length] }}
                        />
                        <span className="truncate">{cat}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Judicial
                  </p>
                  <div className="space-y-1.5">
                    {JUDICIAL_VALUES.map((j) => (
                      <div key={j} className="flex items-center gap-2 text-sm">
                        <span className="w-3 text-center text-muted-foreground shrink-0">
                          {glyphFor(j)}
                        </span>
                        <span>{j}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </Panel>
      </div>

      {/* ── Resumo por categoria ────────────────────────────────────────────── */}
      <Panel
        icon={<BarChart2 className="h-4 w-4" />}
        title="Resumo por categoria (item selecionado)"
        subtitle="Estatísticas dos preços praticados considerando apenas os pontos visíveis no gráfico"
      >
        {resumo.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Selecione um medicamento acima.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{GROUP_LABELS[groupKey]}</TableHead>
                <TableHead className="text-right">Nº compras</TableHead>
                <TableHead className="text-right">Preço médio</TableHead>
                <TableHead className="text-right">Preço mín</TableHead>
                <TableHead className="text-right">Preço máx</TableHead>
                <TableHead className="text-right">Variação (máx/mín)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resumo.map((r, i) => (
                <TableRow key={r.cat}>
                  <TableCell className="font-medium">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: PRECOS_PALETTE[i % PRECOS_PALETTE.length] }}
                      />
                      {r.cat}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.n.toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtPreco(r.media)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtPreco(r.min)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtPreco(r.max)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.razao > 0 ? `${r.razao.toFixed(2)}x` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      {/* ── Top variação geral ──────────────────────────────────────────────── */}
      <Panel
        icon={<TrendingUp className="h-4 w-4" />}
        title="Medicamentos com maior variação de preço (geral)"
        subtitle="Top itens por razão preço máximo / preço mínimo — mínimo de 5 compras registradas. Clique para analisar."
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Medicamento</TableHead>
              <TableHead>Unidade</TableHead>
              <TableHead className="text-right">Nº compras</TableHead>
              <TableHead className="text-right">Preço mín</TableHead>
              <TableHead className="text-right">Preço máx</TableHead>
              <TableHead className="text-right">Variação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {overview.topVariacao.map((it) => (
              <TableRow
                key={`${it.material}${SEP}${it.unidade}`}
                className="cursor-pointer"
                onClick={() => {
                  selecionarCombo(`${it.material}${SEP}${it.unidade}`);
                  seletorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                <TableCell className="font-medium">{it.material}</TableCell>
                <TableCell className="text-muted-foreground">{it.unidade}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {it.n.toLocaleString("pt-BR")}
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmtPreco(it.precoMin)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtPreco(it.precoMax)}</TableCell>
                <TableCell className="text-right tabular-nums text-primary font-medium">
                  {it.razao.toFixed(1)}x
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}
