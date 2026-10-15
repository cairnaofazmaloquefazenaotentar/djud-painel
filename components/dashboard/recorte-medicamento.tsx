"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ExternalLink, ListFilter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDemandasLista } from "@/hooks/useDemandas";
import { filtroParaQuery, type FiltroDemandas } from "@/lib/demandas-filtro-tipos";
import type { MetricsData } from "@/lib/metrics";
import { normalizarPrincipioAtivo } from "@/lib/principio-ativo";

// ─────────────────────────────────────────────────────────────────────────────
// "Resumo do recorte" e "Processos do recorte" (B3): quando há filtro de
// medicamento ou CATMAT, o painel mostra o medicamento direto na tela. Os
// números vêm do MESMO filtro da lista (a tabela de processos usa a própria
// rota da lista), então o total daqui bate com o da aba Demandas.
// ─────────────────────────────────────────────────────────────────────────────

const POR_PAGINA = 20;

const fmtData = (d: Date | string | null) =>
  d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—";

function Indicador({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{valor}</p>
      {detalhe && <p className="text-[11px] text-muted-foreground">{detalhe}</p>}
    </div>
  );
}

function Lista({ titulo, itens }: { titulo: string; itens: Array<{ rotulo: string; n: number }> }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="mb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">{titulo}</p>
      {itens.length === 0 ? (
        <p className="text-xs text-muted-foreground">—</p>
      ) : (
        <ul className="space-y-0.5 text-xs">
          {itens.map((i) => (
            <li key={i.rotulo} className="flex justify-between gap-2">
              <span className="truncate">{i.rotulo}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{i.n.toLocaleString("pt-BR")}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function RecorteMedicamento({ filtro, metrics }: { filtro: FiltroDemandas; metrics: MetricsData }) {
  const [pagina, setPagina] = useState(1);
  const qsLista = useMemo(() => filtroParaQuery(filtro).toString(), [filtro]);
  const qs = useMemo(() => {
    const sp = new URLSearchParams(qsLista);
    sp.set("page", String(pagina));
    sp.set("pageSize", String(POR_PAGINA));
    return sp.toString();
  }, [qsLista, pagina]);
  const { data, isFetching } = useDemandasLista(qs);
  const totalPaginas = data?.pagination.totalPages ?? 1;
  const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

  return (
    <section className="space-y-3 rounded-xl border border-border bg-muted/20 p-4" aria-label="Resumo do recorte">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Resumo do recorte</h2>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link href={`/demandas?${qsLista}`}>
            <ListFilter className="h-3.5 w-3.5" />
            Abrir na lista de Demandas
          </Link>
        </Button>
      </div>

      {metrics.medicamento && (
        <p className="text-xs text-muted-foreground">
          Medicamento “{metrics.medicamento.rotulo}”: demandas que citam{" "}
          <span className="font-mono text-foreground">{metrics.medicamento.termos.join(" + ")}</span> (com e sem acento) no
          princípio ativo, no medicamento identificado, no título ou na descrição — a mesma regra da lista e do filtro CATMAT.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Indicador
          rotulo="Processos"
          valor={metrics.totalDemandas.toLocaleString("pt-BR")}
          detalhe={`${metrics.demandasAtivas.toLocaleString("pt-BR")} ativos · ${metrics.demandasEncerradas.toLocaleString("pt-BR")} encerrados`}
        />
        <Indicador
          rotulo="Valor pago (SIAFI)"
          valor={brl(metrics.totalValorEstimado)}
          detalhe={`${metrics.demandasComValor.toLocaleString("pt-BR")} processo(s) com pagamento`}
        />
        <Indicador rotulo="Primeira entrada" valor={fmtData(metrics.primeiraEntrada)} detalhe={`última: ${fmtData(metrics.ultimaEntrada)}`} />
        <Indicador
          rotulo="Cessar Atos"
          valor={metrics.demandasCessarAtos.toLocaleString("pt-BR")}
          detalhe="no Ponto de Controle (não é status)"
        />
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
        <Lista titulo="Situação no Redmine" itens={metrics.statusDistribution.map((s) => ({ rotulo: s.status, n: s.count }))} />
        <Lista
          titulo="Apresentações"
          itens={metrics.apresentacaoDistribution.map((a) => ({ rotulo: a.rotulo, n: a.count }))}
        />
        <Lista
          titulo="Cinco principais UFs"
          itens={metrics.ufResidenciaDistribution.slice(0, 5).map((u) => ({ rotulo: u.uf ?? "(não informada)", n: u.count }))}
        />
        <Lista
          titulo="Cinco principais TRFs"
          itens={[...metrics.trfRegiaoDistribution]
            .filter((t) => t.trf)
            .sort((a, b) => b.count - a.count)
            .slice(0, 5)
            .map((t) => ({ rotulo: `TRF ${t.trf}ª Região`, n: t.count }))}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Processos do recorte</h3>
          <span className="text-xs text-muted-foreground">
            {(data?.pagination.total ?? 0).toLocaleString("pt-BR")} processo(s){isFetching ? " · atualizando…" : ""}
          </span>
        </div>
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 text-left text-muted-foreground">
              <tr>
                {["Nº DJUD", "Nº Processo", "Nº SEI", "Medicamento", "Status", "UF", "Entrada", ""].map((h) => (
                  <th key={h} className="px-2 py-1.5 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data?.data ?? []).map((d) => (
                <tr key={d.id} className="border-t border-border">
                  <td className="px-2 py-1 font-mono">{d.numero}</td>
                  <td className="px-2 py-1 font-mono text-muted-foreground">{d.numeroProcesso ?? "—"}</td>
                  <td className="px-2 py-1 font-mono text-muted-foreground">{d.nupSei ?? "—"}</td>
                  <td className="max-w-[220px] truncate px-2 py-1" title={d.medicamento ?? d.principioAtivo ?? ""}>
                    {d.medicamento ?? normalizarPrincipioAtivo(d.principioAtivo) ?? "—"}
                  </td>
                  <td className="px-2 py-1">{d.status ?? "—"}</td>
                  <td className="px-2 py-1">{d.ufResidencia ?? "—"}</td>
                  <td className="px-2 py-1">{fmtData(d.dataEntradaDJUD ?? null)}</td>
                  <td className="px-2 py-1">
                    <Link href={`/demandas/${d.id}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                      abrir <ExternalLink className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
              {data && data.data.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-2 py-3 text-center text-muted-foreground">
                    Nenhum processo no recorte.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {totalPaginas > 1 && (
          <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
            Página {pagina} de {totalPaginas.toLocaleString("pt-BR")}
            <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)} aria-label="Página anterior">
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={pagina >= totalPaginas}
              onClick={() => setPagina((p) => p + 1)}
              aria-label="Próxima página"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
