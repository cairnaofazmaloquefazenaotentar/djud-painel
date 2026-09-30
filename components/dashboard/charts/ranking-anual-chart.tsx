"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";
import { PALETTE_CATEGORICAL, gridStroke } from "./chart-utils";
import type { RankingAnual } from "@/lib/metrics-ranking-anual";

// ─────────────────────────────────────────────────────────────────────────────
// Ranking em série anual — o mesmo Top N do painel, aberto ano a ano.
//
// Duas leituras na mesma seção, de propósito:
//   • linhas — a tendência das 5 primeiras posições, que é o que responde
//     "está subindo ou caindo?";
//   • tabela — as 15 posições com todos os anos e a variação, que é o que vai
//     copiado para a instrução processual.
//
// As linhas param em 5 séries porque a paleta categórica é atribuída em ordem
// fixa e sem reciclagem (a 11ª série repetiria a cor da 1ª); a tabela logo
// abaixo cobre o resto do ranking sem depender de cor nenhuma.
// ─────────────────────────────────────────────────────────────────────────────

/** Séries plotadas. O restante do Top N fica só na tabela. */
const SERIES_NO_GRAFICO = 5;

type EntradaTooltip = { value?: number; dataKey?: string | number; color?: string };

// Fora do render (regra react-hooks/static-components), como nos demais
// gráficos do painel. O Recharts injeta active/payload/label via cloneElement,
// preservando o prop `format`.
function RankingTooltip({
  active,
  payload,
  label,
  format,
}: {
  active?: boolean;
  payload?: EntradaTooltip[];
  label?: string;
  format: (n: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-background/95 px-3 py-2 text-xs shadow-lg backdrop-blur-md">
      <p className="mb-1 font-semibold text-foreground">{label}</p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="flex justify-between gap-4 text-foreground">
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: p.color }}
            />
            {String(p.dataKey).substring(0, 34)}
          </span>
          <span className="font-medium">{format(p.value || 0)}</span>
        </p>
      ))}
    </div>
  );
}

interface Props {
  ranking: RankingAnual;
  anos: number[];
}

type PontoAno = { ano: string } & Record<string, number | string>;

export function RankingAnualChart({ ranking, anos }: Props) {
  const emReais = ranking.unidade === "reais";

  const fmtValor = useMemo(
    () => (v: number) =>
      emReais
        ? v >= 1_000_000
          ? `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M`
          : `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`
        : v.toLocaleString("pt-BR"),
    [emReais]
  );

  const destaques = ranking.linhas.slice(0, SERIES_NO_GRAFICO);

  // Recharts quer um ponto por ano com uma chave por série.
  const dados: PontoAno[] = useMemo(
    () =>
      anos.map((ano) => {
        const ponto: PontoAno = { ano: String(ano) };
        for (const l of destaques) ponto[l.categoria] = l.porAno[ano] ?? 0;
        return ponto;
      }),
    [anos, destaques]
  );

  if (!ranking.linhas.length) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Sem dados para este ranking no recorte selecionado.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {anos.length < 2 ? (
        <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          O recorte atual tem um único ano ({anos[0] ?? "—"}). A comparação entre exercícios
          precisa de pelo menos dois — amplie o intervalo de datas para ver a tendência.
        </p>
      ) : (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dados} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis dataKey="ano" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={emReais ? 66 : 48}
                tickFormatter={fmtValor}
              />
              <Tooltip content={<RankingTooltip format={fmtValor} />} />
              <Legend
                wrapperStyle={{ fontSize: 11 }}
                formatter={(v) => String(v).substring(0, 34)}
              />
              {destaques.map((l, i) => (
                <Line
                  key={l.categoria}
                  type="monotone"
                  dataKey={l.categoria}
                  stroke={PALETTE_CATEGORICAL[i]}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tabela: o ranking inteiro, sem depender de cor para identificar linha. */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="px-2 py-1.5 text-left font-medium">#</th>
              <th className="px-2 py-1.5 text-left font-medium">Categoria</th>
              {anos.map((a) => (
                <th key={a} className="px-2 py-1.5 text-right font-medium">
                  {a}
                </th>
              ))}
              <th className="px-2 py-1.5 text-right font-medium">Total</th>
              <th className="px-2 py-1.5 text-right font-medium">Variação</th>
            </tr>
          </thead>
          <tbody>
            {ranking.linhas.map((l, i) => (
              <tr key={l.categoria} className="border-b last:border-0">
                <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{i + 1}</td>
                <td className="px-2 py-1.5">
                  <span className="flex items-center gap-1.5">
                    {i < SERIES_NO_GRAFICO && anos.length >= 2 && (
                      <span
                        className="inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: PALETTE_CATEGORICAL[i] }}
                      />
                    )}
                    <span className="truncate" title={l.categoria}>
                      {l.categoria}
                    </span>
                  </span>
                </td>
                {anos.map((a) => (
                  <td key={a} className="px-2 py-1.5 text-right tabular-nums">
                    {l.porAno[a] ? fmtValor(l.porAno[a]) : "—"}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right font-semibold tabular-nums">
                  {fmtValor(l.total)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {l.variacao === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span
                      className={`inline-flex items-center gap-0.5 ${
                        l.variacao > 5
                          ? "text-red-600 dark:text-red-400"
                          : l.variacao < -5
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-muted-foreground"
                      }`}
                    >
                      {l.variacao > 5 ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : l.variacao < -5 ? (
                        <ArrowDown className="h-3 w-3" />
                      ) : (
                        <ArrowRight className="h-3 w-3" />
                      )}
                      {l.variacao >= 0 ? "+" : ""}
                      {l.variacao.toFixed(0)}%
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">
        As {ranking.linhas.length} maiores categorias do período inteiro, com a distribuição por
        ano. A variação compara o primeiro e o último ano em que a própria categoria aparece —
        seta para cima significa crescimento do volume judicializado, não melhora.
      </p>
    </div>
  );
}
