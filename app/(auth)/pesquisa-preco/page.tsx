"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { hasPermission } from "@/lib/permissions";
import { apiPath, appPath } from "@/lib/url";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Info,
  Loader2,
  Minus,
  Plus,
  ListChecks,
  Search,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MaterialSearch, type MaterialSelecionado } from "@/components/pesquisa-preco/material-search";
import { CestaSheet } from "@/components/pesquisa-preco/cesta-sheet";
import { CuradoriaDialog } from "@/components/pesquisa-preco/curadoria-dialog";
import { CamposEscolhaPreco, PreviaPrecoAdotado } from "@/components/pesquisa-preco/escolha-preco";
import { DadosAbertosPanel } from "@/components/pesquisa-preco/dados-abertos-panel";
import { useItemPesquisa, usePesquisaPrecos, type ParametrosBusca } from "@/hooks/usePesquisaPreco";
import { useAdicionarItemCesta } from "@/hooks/useCesta";
// Os filtros opcionais vêm do módulo puro: importar lib/pesquisa-preco aqui
// arrastaria o Prisma para o bundle do navegador (ver o cabeçalho de lá).
import {
  ROTULO_FILTRO,
  formatarCnpj,
  type CampoFiltro,
  type FiltrosOpcionais,
} from "@/lib/pesquisa-preco-filtros";
import type {
  ExclusaoRegistro,
  OrcamentoFornecedor,
} from "@/lib/pesquisa-preco-curadoria";
import {
  ESCOLHA_PADRAO_MAPA,
  resultadoComEscolha,
  type EscolhaPreco,
} from "@/lib/pesquisa-preco-metodo";
import { gerarJustificativa } from "@/lib/mapa-dlog/justificativa";
import type {
  CmedResultado,
  Consolidado,
  FonteMercadoResultado,
  ItemPesquisa,
  Recomendacao,
  RegistroMercado,
  UnidadeOpcao,
} from "@/lib/pesquisa-preco";

// ─────────────────────────────────────────────────────────────────────────────
// Pesquisa de Preço — três filtros obrigatórios (código do material, descrição
// CATMAT e unidade de fornecimento) dirigem a consulta consolidada em CMED,
// BPS, SIASG e PNCP (lib/pesquisa-preco.ts). O preço CMED é exibido por
// unidade de fornecimento (PMVG ÷ Qt_Embal).
// ─────────────────────────────────────────────────────────────────────────────

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (v: number | null | undefined, decimals = 4) => {
  if (v == null) return "—";
  const [int, dec] = v.toFixed(decimals).split(".");
  const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${intFmt},${dec}`;
};

const fmtDate = (d: string | Date) =>
  new Date(d).toLocaleDateString("pt-BR", { year: "numeric", month: "2-digit", day: "2-digit" });

const fmtInt = (n: number) => n.toLocaleString("pt-BR");

const CAMPOS_FILTRO = Object.keys(ROTULO_FILTRO) as CampoFiltro[];

const listarFiltros = (f: FiltrosOpcionais) => CAMPOS_FILTRO.filter((c) => f[c] != null);

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

// ── Contratação de origem do registro (obs. 7 e 8 da DLOG) ───────────────────

function ContratacaoLinha({ r }: { r: RegistroMercado }) {
  const c = r.contratacao;
  if (!c) return null;
  const partes = [
    [c.tipo, c.numero].filter(Boolean).join(" "),
    c.uasg ? `UASG ${c.uasg}` : null,
    c.numeroItem ? `item ${c.numeroItem}` : null,
    c.processo ? `processo ${c.processo}` : null,
    c.situacao,
    c.referencia,
  ].filter(Boolean);
  if (!partes.length && !c.url && !c.indisponivel) return null;
  return (
    <p className="text-muted-foreground truncate">
      Contratação: {partes.join(" · ") || "—"}
      {c.url ? (
        <>
          {" · "}
          <a
            href={c.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 text-primary underline underline-offset-2 hover:text-foreground"
          >
            PNCP
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        </>
      ) : c.indisponivel ? (
        <span> · {c.indisponivel}</span>
      ) : null}
    </p>
  );
}

// ── Painel de fonte de mercado ────────────────────────────────────────────────

function SourcePanel({
  label,
  color,
  stats,
  loading,
  comFiltros,
}: {
  label: string;
  color: string;
  stats: FonteMercadoResultado | null;
  loading: boolean;
  /** Há filtro opcional ativo — muda a leitura de um resultado vazio. */
  comFiltros: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  // Filtro pedido que esta base não tem como campo: ela nem foi consultada.
  const semCampo = stats?.filtrosNaoSuportados ?? [];

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${color}`} />
          <span className="font-semibold text-sm truncate">{label}</span>
        </div>
        {stats && semCampo.length === 0 && (
          <Badge variant="outline" className="text-xs shrink-0">
            {fmtInt(stats.total)} registros
          </Badge>
        )}
      </div>
      {stats?.origemDados === "API" && stats.coleta?.coletadoEm && (
        <p className={`text-[11px] ${stats.coleta.valida ? "text-muted-foreground" : "text-amber-700 dark:text-amber-400"}`}>
          {stats.coleta.origemCarga === "EXTRATOR" ? "Carga do extrator" : "Coletado"} em{" "}
          {new Date(stats.coleta.coletadoEm).toLocaleDateString("pt-BR")}
          {stats.coleta.valida ? "" : " — há mais de 7 dias; atualize antes de emitir"}
        </p>
      )}

      {loading && (
        <div className="h-16 flex items-center justify-center text-muted-foreground text-sm animate-pulse">
          Consultando…
        </div>
      )}

      {!loading && !stats && (
        <p className="text-sm text-muted-foreground">Realize uma pesquisa para ver resultados.</p>
      )}

      {!loading && stats && semCampo.length > 0 && (
        <p className="text-sm text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            Esta base não registra {semCampo.map((c) => ROTULO_FILTRO[c].toLowerCase()).join(" nem ")} —
            fonte fora da apuração enquanto o filtro estiver ativo.
          </span>
        </p>
      )}

      {!loading && stats && semCampo.length === 0 && stats.total === 0 && (
        <p className="text-sm text-muted-foreground">
          {comFiltros
            ? "Nenhum registro atende aos filtros aplicados."
            : "Nenhum registro para este código e unidade de fornecimento."}
        </p>
      )}

      {!loading && stats && stats.total > 0 && (
        <>
          {/* Os três métodos do art. 6º (média, mediana e menor valor) e o teto
              da amostra — a mediana em destaque por ser a adotada. */}
          <div className="grid grid-cols-4 gap-2 text-center">
            <div>
              <p className="text-xs text-muted-foreground">Média</p>
              <p className="text-sm font-medium">{fmt(stats.estatisticas.media)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-semibold">Mediana</p>
              <p className="text-sm font-bold text-primary">{fmt(stats.estatisticas.mediana)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Menor</p>
              <p className="text-sm font-medium">{fmt(stats.estatisticas.menor)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Maior</p>
              <p className="text-sm font-medium">{fmt(stats.estatisticas.maior)}</p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground text-center">
            {fmtInt(stats.estatisticas.n)} preço(s) no cálculo, de uma amostra de{" "}
            {fmtInt(stats.amostra)} registro(s) mais recente(s)
            {stats.outliersRemovidos > 0 ? ` · ${stats.outliersRemovidos} outlier(s) removido(s) (IQR)` : ""}
            {stats.excluidosManualmente > 0
              ? ` · ${stats.excluidosManualmente} desconsiderado(s) com justificativa`
              : ""}
          </p>

          {stats.registros.length > 0 && (
            <div>
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs text-muted-foreground h-7"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? (
                  <>
                    <ChevronUp className="h-3.5 w-3.5 mr-1" /> Ocultar registros
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3.5 w-3.5 mr-1" /> Ver últimos{" "}
                    {Math.min(stats.registros.length, 20)} registros
                  </>
                )}
              </Button>
              {expanded && (
                <div className="mt-2 space-y-1.5 max-h-60 overflow-y-auto">
                  {stats.registros.slice(0, 20).map((r) => (
                    <div
                      key={r.id}
                      className={`rounded border p-2 text-xs space-y-0.5 ${
                        r.excluidoPor ? "border-destructive/50 bg-destructive/5" : ""
                      }`}
                    >
                      <p className={`font-medium truncate ${r.excluidoPor ? "line-through opacity-70" : ""}`}>
                        {r.descricao}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-muted-foreground">
                        <span className="font-semibold text-foreground">{fmt(r.preco)}</span>
                        {r.unidade && <span>/{r.unidade}</span>}
                        <span>{fmtDate(r.data)}</span>
                        {r.uf && <span>{r.uf}</span>}
                        {r.esfera && <span>{r.esfera}</span>}
                        {r.modalidade && <span>{r.modalidade}</span>}
                        {r.orgao && <span className="truncate max-w-[14rem]">{r.orgao}</span>}
                        {r.outlierIqr && (
                          <Badge variant="secondary" className="h-4 text-[10px]">fora do IQR</Badge>
                        )}
                      </div>
                      {/* Empresa vencedora e marca/fabricante — vão para o relatório. */}
                      {(r.fornecedor || r.marca || r.fabricante) && (
                        <p className="text-muted-foreground truncate">
                          {r.fornecedor ? `Vencedora: ${r.fornecedor}` : ""}
                          {(r.marca || r.fabricante) && r.fornecedor ? " · " : ""}
                          {r.marca || r.fabricante
                            ? `Marca/fabr.: ${[r.marca, r.fabricante].filter(Boolean).join(" / ")}`
                            : ""}
                        </p>
                      )}
                      <ContratacaoLinha r={r} />
                      {r.excluidoPor && (
                        <p className="text-destructive">Desconsiderado: {r.excluidoPor}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Painel CMED ───────────────────────────────────────────────────────────────

function CmedPanel({
  data,
  unidade,
  loading,
  fabricante,
}: {
  data: CmedResultado | null;
  unidade: string | null;
  loading: boolean;
  /** Filtro de fabricante em vigor — recorta também o teto PMVG. */
  fabricante: string | null;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" />
          <span className="font-semibold text-sm">CMED — Teto PMVG</span>
          <Badge variant="secondary" className="text-xs">ANVISA</Badge>
          {fabricante && (
            <Badge variant="outline" className="text-xs font-normal">{fabricante}</Badge>
          )}
        </div>
        {data && <Badge variant="outline" className="text-xs shrink-0">{data.total} registro(s)</Badge>}
      </div>

      {loading && (
        <div className="h-10 flex items-center text-muted-foreground text-sm animate-pulse">
          Consultando CMED…
        </div>
      )}

      {!loading && !data && (
        <p className="text-sm text-muted-foreground">Realize uma pesquisa para ver o preço-teto da CMED.</p>
      )}

      {!loading && data && data.total === 0 && (
        <p className="text-sm text-amber-600">
          Nenhum registro ANVISA{fabricante ? " do fabricante informado" : ""} com preço CMED vigente
          para este código e unidade.
        </p>
      )}

      {!loading && data && data.total > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md bg-red-50 dark:bg-red-950/20 p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">PMVG unitário mín. (sem imp.)</p>
              <p className="text-base font-bold text-red-700 dark:text-red-400">{fmt(data.pmvgUnitMin)}</p>
            </div>
            <div className="rounded-md bg-red-50 dark:bg-red-950/20 p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">PMVG unitário máx. (sem imp.)</p>
              <p className="text-base font-bold text-red-700 dark:text-red-400">{fmt(data.pmvgUnitMax)}</p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground text-center">
            Preço por {unidade ?? "unidade"} = PMVG da embalagem ÷ quantidade por embalagem (Qt_Embal)
            {data.semQtEmbalagem > 0 ? ` · ${data.semQtEmbalagem} registro(s) sem Qt_Embal` : ""}
          </p>

          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs text-muted-foreground h-7"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5 mr-1" /> : <ChevronDown className="h-3.5 w-3.5 mr-1" />}
            {expanded ? "Ocultar" : "Ver"} registros CMED
          </Button>

          {expanded && (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {data.registros.map((r) => (
                <div key={r.id} className="rounded border p-2 text-xs space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{r.produto}</span>
                    <span className="text-muted-foreground">{r.apresentacao}</span>
                    {r.generico && <Badge variant="secondary" className="text-[10px] h-4">Genérico</Badge>}
                    {r.cap && <Badge variant="destructive" className="text-[10px] h-4">CAP</Badge>}
                  </div>
                  <p className="text-muted-foreground">
                    {r.substancia}
                    {r.laboratorio ? ` · ${r.laboratorio}` : ""} · Reg. {r.registro}
                  </p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                    <span>
                      Embalagem: <strong>{fmt(r.pmvgEmbalagem)}</strong>
                      {r.qtEmbalagem ? ` (${r.qtEmbalagem} × ${r.unidadeFornecimento ?? unidade ?? "un."})` : ""}
                    </span>
                    <span>
                      PMVG unit.: <strong className="text-red-700 dark:text-red-400">{fmt(r.pmvgUnitario)}</strong>
                    </span>
                    <span>PF 0% unit.: <strong>{fmt(r.pfUnitario)}</strong></span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Painel de recomendação ────────────────────────────────────────────────────

function RecomendacaoPanel({
  rec,
  consolidado,
  unidade,
  loading,
}: {
  rec: Recomendacao | null;
  consolidado: Consolidado | null;
  unidade: string | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-5 animate-pulse">
        <div className="h-4 bg-primary/20 rounded w-1/3 mb-3" />
        <div className="h-8 bg-primary/20 rounded w-1/2" />
      </div>
    );
  }

  if (!rec) return null;

  const hasPriceConflict =
    rec.limitePmvg !== null && rec.precoReferencia !== null && rec.precoReferencia > rec.limitePmvg;

  return (
    <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Recomendação — IN 65/2021</h3>
        {unidade && <Badge variant="outline" className="text-xs">por {unidade}</Badge>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="text-center">
          <p className="text-xs text-muted-foreground mb-1">Preço de Referência</p>
          <p className="text-2xl font-bold text-primary">{fmt(rec.precoReferencia)}</p>
          <p className="text-[10px] text-muted-foreground mt-1">
            Mediana das medianas por fonte (art. 6º)
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground mb-1">Teto PMVG unitário</p>
          <p className={`text-2xl font-bold ${hasPriceConflict ? "text-red-600" : "text-muted-foreground"}`}>
            {fmt(rec.limitePmvg)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">CMED sem impostos ÷ Qt_Embal</p>
          {/* P12: o teto pela regra da DLOG, ao lado, para comparação. */}
          {rec.tetos.referencia && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              PMVG {rec.escolha.aliquota}% do medicamento de referência: {fmt(rec.tetos.referencia.valorUnitario)}
            </p>
          )}
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground mb-1">Preço Final Sugerido</p>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{fmt(rec.precoFinal)}</p>
          <p className="text-[10px] text-muted-foreground mt-1">
            {hasPriceConflict
              ? "PMVG aplicado como teto"
              : rec.precoReferencia === null && rec.limitePmvg !== null
                ? "Sem preço de mercado — PMVG unitário"
                : "Preço de referência de mercado"}
          </p>
        </div>
      </div>

      {/* Art. 6º: os três métodos, por fonte e consolidados de duas maneiras. */}
      {consolidado && consolidado.fontes.length > 0 && (
        <div className="rounded-md border bg-card/60 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/50 text-muted-foreground">
                <th className="px-2 py-1.5 text-left font-medium">Fonte</th>
                <th className="px-2 py-1.5 text-right font-medium">Preços</th>
                <th className="px-2 py-1.5 text-right font-medium">Média</th>
                <th className="px-2 py-1.5 text-right font-medium">Mediana</th>
                <th className="px-2 py-1.5 text-right font-medium">Menor</th>
              </tr>
            </thead>
            <tbody>
              {consolidado.fontes.map((f) => (
                <tr key={f.fonte} className="border-b last:border-0">
                  <td className="px-2 py-1.5">{f.nome}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtInt(f.estatisticas.n)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmt(f.estatisticas.media)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-medium">
                    {fmt(f.estatisticas.mediana)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmt(f.estatisticas.menor)}</td>
                </tr>
              ))}
              <tr className="border-t bg-primary/10 font-semibold">
                <td className="px-2 py-1.5">
                  Consolidado por fonte
                  <span className="block font-normal text-[10px] text-muted-foreground">
                    cada fonte pesa igual — base do preço adotado
                  </span>
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtInt(consolidado.porFonte.n)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmt(consolidado.porFonte.media)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-primary">
                  {fmt(consolidado.porFonte.mediana)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmt(consolidado.porFonte.menor)}</td>
              </tr>
              <tr className="bg-muted/40">
                <td className="px-2 py-1.5">
                  Consolidado por registro
                  <span className="block font-normal text-[10px] text-muted-foreground">
                    cada compra pesa igual — contraprova
                  </span>
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtInt(consolidado.porRegistro.n)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmt(consolidado.porRegistro.media)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmt(consolidado.porRegistro.mediana)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmt(consolidado.porRegistro.menor)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="space-y-1.5">
        <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            {rec.metodologia}
            {rec.fontes.length > 0 && <> · Fontes: {rec.fontes.join(", ")}</>}
          </span>
        </div>
        {rec.observacoes.map((obs, i) => (
          <div key={i} className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{obs}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Resumo do item selecionado ────────────────────────────────────────────────

function ItemResumo({ item, unidades }: { item: ItemPesquisa; unidades: UnidadeOpcao[] }) {
  const comCmed = item.registros.length;
  return (
    <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={item.tipo === "CATMAT" ? "default" : "secondary"}>
          {item.tipo === "CATMAT" ? `CATMAT ${item.catmat}` : `Registro ANVISA ${item.registro}`}
        </Badge>
        {item.tipo === "REGISTRO" && (
          <Badge variant={item.catmat ? "outline" : "destructive"}>
            {item.catmat ? `CATMAT ${item.catmat}` : "Sem CATMAT associado"}
          </Badge>
        )}
        {item.codigoClasse && (
          <Badge variant="outline">
            Classe {item.codigoClasse} · {item.nomeClasse}
          </Badge>
        )}
        {item.nomePdm && <Badge variant="outline">PDM {item.nomePdm}</Badge>}
        {item.tipo === "CATMAT" && (
          <Badge variant="outline">{comCmed} registro(s) ANVISA vinculado(s)</Badge>
        )}
      </div>
      <p className="text-muted-foreground">{item.descricao}</p>
      {unidades.length === 0 && (
        <p className="text-amber-700 dark:text-amber-400 flex items-center gap-1">
          <AlertTriangle className="h-3.5 w-3.5" />
          Nenhuma unidade de fornecimento encontrada nas bases para este código.
        </p>
      )}
    </div>
  );
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function PesquisaPrecoPage() {
  const { data: session } = useSession();

  const [material, setMaterial] = useState<MaterialSelecionado | null>(null);
  const [unidade, setUnidade] = useState("");
  const [uf, setUf] = useState("todos");
  const [params, setParams] = useState<ParametrosBusca | null>(null);

  // "Mais filtros" — recorte opcional, recolhido por padrão.
  const [maisFiltros, setMaisFiltros] = useState(false);
  const [fornecedor, setFornecedor] = useState("");
  const [fabricante, setFabricante] = useState("");
  const [cnpjComprador, setCnpjComprador] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  // Curadoria da pesquisa em tela: exclusões justificadas e orçamentos
  // diretos. Estado efêmero — segue junto com o pedido do relatório; quem
  // precisa guardar isso entre sessões usa a cesta, que grava no banco.
  const [curadoriaOpen, setCuradoriaOpen] = useState(false);
  // "relatorio" = a conferência foi aberta a caminho da emissão e encadeia na
  // modal de metadados; "revisar" = o usuário só quis ajustar a pesquisa.
  const [curadoriaDestino, setCuradoriaDestino] = useState<"revisar" | "relatorio">("revisar");
  const [exclusoes, setExclusoes] = useState<ExclusaoRegistro[]>([]);
  const [orcamentos, setOrcamentos] = useState<OrcamentoFornecedor[]>([]);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [avisoCesta, setAvisoCesta] = useState<{ texto: string; erro: boolean } | null>(null);
  const [relMeta, setRelMeta] = useState({
    responsavel: "", cargo: "", orgao: "", processo: "", especificacao: "",
  });
  // Emissão (HTML e mapa XLSX): método e teto do item (P11/P12), quantidade e
  // justificativa. A mesma escolha vale para os dois documentos.
  const [escolha, setEscolha] = useState<EscolhaPreco>(ESCOLHA_PADRAO_MAPA);
  const [quantidade, setQuantidade] = useState("1");
  const [justificativa, setJustificativa] = useState("");
  const [justificativaEditada, setJustificativaEditada] = useState(false);
  const [gerandoXlsx, setGerandoXlsx] = useState(false);

  const canSearch = hasPermission(session as any, "precos:pesquisar");
  const canReport = hasPermission(session as any, "relatorios:gerar");

  const {
    data: detalhe,
    isLoading: carregandoItem,
    error: erroItem,
  } = useItemPesquisa(material?.codigo ?? null);
  const unidades = detalhe?.unidades ?? [];
  const unidadeSelecionada = unidades.find((u) => u.unidade === unidade) ?? null;

  const {
    data: result,
    isFetching: loading,
    error: erroBusca,
  } = usePesquisaPrecos(params);

  const adicionarCesta = useAdicionarItemCesta();

  // O aviso e a curadoria valem para a pesquisa que está na tela: outra
  // pesquisa, outros registros — manter exclusões de ids antigos aplicaria
  // justificativa de um item ao resultado de outro.
  useEffect(() => {
    setAvisoCesta(null);
    setExclusoes([]);
    setOrcamentos([]);
    setJustificativaEditada(false);
  }, [params]);

  // Prévia da escolha: a mesma função pura que o servidor usa na emissão.
  const resultadoEscolhido = result ? resultadoComEscolha(result, escolha) : null;
  // Enquanto o responsável não edita, o texto acompanha a escolha e os números.
  const textoJustificativa = justificativaEditada
    ? justificativa
    : resultadoEscolhido
      ? gerarJustificativa(resultadoEscolhido)
      : "";

  // Unidade: única opção → pré-seleciona; opção que sumiu → limpa.
  useEffect(() => {
    if (!detalhe) return;
    setUnidade((atual) => {
      if (detalhe.unidades.length === 1) return detalhe.unidades[0].unidade;
      return detalhe.unidades.some((u) => u.unidade === atual) ? atual : "";
    });
  }, [detalhe]);

  const selecionarMaterial = useCallback((m: MaterialSelecionado | null) => {
    setMaterial(m);
    setUnidade("");
    setParams(null);
  }, []);

  // O backend descarta texto com 1 caractere e CNPJ com menos de 8 dígitos
  // (normalizarFiltros). Bloqueamos a busca nesse caso em vez de ignorar em
  // silêncio: o relatório não pode declarar um filtro que não foi aplicado.
  const digitosCnpj = cnpjComprador.replace(/\D/g, "");
  const fornecedorCurto = fornecedor.trim().length === 1;
  const fabricanteCurto = fabricante.trim().length === 1;
  const cnpjCurto = digitosCnpj.length > 0 && digitosCnpj.length < 8;
  const filtrosInvalidos = fornecedorCurto || fabricanteCurto || cnpjCurto;
  const qtdFiltros = [fornecedor.trim(), fabricante.trim(), digitosCnpj].filter(Boolean).length;

  const canSubmit = !!material && !!unidade && !carregandoItem && !filtrosInvalidos;

  const limparFiltros = useCallback(() => {
    setFornecedor("");
    setFabricante("");
    setCnpjComprador("");
  }, []);

  const handleSearch = useCallback(() => {
    if (!material || !unidade) return;
    setParams({
      codigo: material.codigo,
      unidade,
      uf: uf !== "todos" ? uf : null,
      fornecedor: fornecedor.trim() || null,
      fabricante: fabricante.trim() || null,
      cnpjComprador: cnpjComprador.trim() || null,
    });
  }, [material, unidade, uf, fornecedor, fabricante, cnpjComprador]);

  const handleAdicionarCesta = useCallback(() => {
    if (!params) return;
    setAvisoCesta(null);
    adicionarCesta.mutate(
      {
        codigo: params.codigo,
        unidade: params.unidade,
        uf: params.uf,
        quantidade: 1,
        exclusoes,
        orcamentos,
      },
      {
        onSuccess: (r) =>
          setAvisoCesta({
            texto: r.duplicado
              ? `Item já estava na cesta — quantidade agora é ${r.item.quantidade}.`
              : "Item adicionado à cesta.",
            erro: false,
          }),
        onError: (e) => setAvisoCesta({ texto: e.message, erro: true }),
      }
    );
  }, [adicionarCesta, exclusoes, orcamentos, params]);

  /** Corpo comum ao HTML e ao mapa XLSX — a mesma escolha nos dois documentos. */
  const corpoEmissao = useCallback(
    () => ({
      ...params,
      ...relMeta,
      exclusoes,
      orcamentos,
      quantidade: Math.max(1, Math.trunc(Number(quantidade)) || 1),
      // Texto não editado vai como null: o servidor gera o mesmo texto com os
      // números da emissão.
      escolha: { ...escolha, justificativa: justificativaEditada ? textoJustificativa : null },
    }),
    [params, relMeta, exclusoes, orcamentos, quantidade, escolha, textoJustificativa, justificativaEditada]
  );

  const handleGerarXlsx = useCallback(async () => {
    if (!result || !params) return;
    setGerandoXlsx(true);
    try {
      const res = await fetch(apiPath("/api/relatorios/pesquisa-preco/xlsx"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpoEmissao()),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Erro ao gerar o mapa comparativo");
      }
      const nome =
        /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ??
        `Mapa_comparativo_de_Precos_${new Date().toISOString().slice(0, 10)}.xlsx`;
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = nome;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao gerar o mapa comparativo");
    } finally {
      setGerandoXlsx(false);
    }
  }, [result, params, corpoEmissao]);

  const handleGerarRelatorio = useCallback(async () => {
    if (!result || !params) return;
    // Abre a janela antes do await para o bloqueador de pop-up não interferir.
    const newWin = window.open("", "_blank");
    setGerandoPdf(true);
    try {
      const res = await fetch(apiPath("/api/relatorios/pesquisa-preco"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpoEmissao()),
      });
      if (!res.ok) {
        const d = await res.json();
        if (newWin) newWin.close();
        throw new Error(d.error || "Erro ao gerar relatório");
      }
      const html = await res.text();
      if (newWin) {
        newWin.document.open();
        newWin.document.write(html);
        newWin.document.close();
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setGerandoPdf(false);
      setModalOpen(false);
    }
  }, [result, params, corpoEmissao]);

  if (!canSearch) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <ShieldCheck className="h-10 w-10" />
        <p className="text-sm">Você não tem permissão para acessar a Pesquisa de Preços.</p>
      </div>
    );
  }

  const error = (erroBusca as Error | null)?.message ?? null;
  const unidadePesquisada = result?.unidade ?? null;
  // O que o backend de fato aplicou — pode diferir do que está digitado se o
  // usuário mexeu nos campos depois de buscar.
  const filtrosAplicados = result ? listarFiltros(result.filtros) : [];
  const curadoriaAtiva = exclusoes.length + orcamentos.length;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pesquisa de Preço</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Consulta consolidada por código CATMAT na CMED, no Compras.gov.br (Painel de Preços), no BPS,
            no SIASG judicial, no PNCP e nas atas de registro de preços · Metodologia IN 65/2021
          </p>
        </div>
        <CestaSheet podeGerarRelatorio={canReport} />
      </div>

      {/* Filtros obrigatórios */}
      <div className="rounded-lg border bg-card p-4 space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">
              Código do material <span className="text-destructive">*</span>
            </Label>
            <MaterialSearch modo="codigo" selecionado={material} onSelecionar={selecionarMaterial} />
            <p className="text-[11px] text-muted-foreground">
              CATMAT (6 dígitos) ou Registro ANVISA (13 dígitos)
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">
              Descrição CATMAT <span className="text-destructive">*</span>
            </Label>
            <MaterialSearch modo="descricao" selecionado={material} onSelecionar={selecionarMaterial} />
            <p className="text-[11px] text-muted-foreground">
              Busca no catálogo das 16 classes da saúde e nos registros da CMED
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_8rem] md:items-start">
          <div className="space-y-1.5">
            <Label className="text-xs">
              Unidade de fornecimento <span className="text-destructive">*</span>
            </Label>
            <Select value={unidade} onValueChange={setUnidade} disabled={!material || carregandoItem || unidades.length === 0}>
              <SelectTrigger className="w-full">
                <SelectValue
                  placeholder={
                    !material
                      ? "Selecione o material primeiro"
                      : carregandoItem
                        ? "Carregando unidades…"
                        : unidades.length === 0
                          ? "Sem unidades disponíveis"
                          : "Selecione a unidade"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {unidades.map((u) => (
                  <SelectItem key={u.unidade} value={u.unidade}>
                    {u.unidade} · {fmtInt(u.total)} registro(s)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {unidadeSelecionada && (
              <p className="text-[11px] text-muted-foreground">
                CMED {fmtInt(unidadeSelecionada.fontes.cmed)} · Compras.gov.br {fmtInt(unidadeSelecionada.fontes.comprasgov)} · BPS{" "}
                {fmtInt(unidadeSelecionada.fontes.bps)} · SIASG {fmtInt(unidadeSelecionada.fontes.siasg)} · PNCP{" "}
                {fmtInt(unidadeSelecionada.fontes.pncp)} · Atas {fmtInt(unidadeSelecionada.fontes.arp)}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">UF (opcional)</Label>
            <Select value={uf} onValueChange={setUf}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="UF" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas</SelectItem>
                {UFS.map((u) => (
                  <SelectItem key={u} value={u}>{u}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Filtros opcionais — recolhidos até o usuário pedir */}
        <div className="border-t pt-3 space-y-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 -ml-2 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setMaisFiltros((v) => !v)}
            aria-expanded={maisFiltros}
            aria-controls="mais-filtros"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />
            Mais filtros
            {maisFiltros ? (
              <Minus className="h-3.5 w-3.5 ml-1.5" />
            ) : (
              <Plus className="h-3.5 w-3.5 ml-1.5" />
            )}
            {!maisFiltros && qtdFiltros > 0 && (
              <Badge variant="secondary" className="ml-2 h-4 px-1.5 text-[10px]">
                {qtdFiltros}
              </Badge>
            )}
          </Button>

          {maisFiltros && (
            <div id="mais-filtros" className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="filtro-fornecedor">Fornecedor</Label>
                <Input
                  id="filtro-fornecedor"
                  placeholder="Ex.: ALTERMED"
                  value={fornecedor}
                  onChange={(e) => setFornecedor(e.target.value)}
                />
                <p className={`text-[11px] ${fornecedorCurto ? "text-destructive" : "text-muted-foreground"}`}>
                  {fornecedorCurto
                    ? "Informe ao menos 2 caracteres."
                    : "Trecho do nome de quem vendeu — BPS, SIASG e PNCP."}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="filtro-fabricante">Fabricante</Label>
                <Input
                  id="filtro-fabricante"
                  placeholder="Ex.: EMS"
                  value={fabricante}
                  onChange={(e) => setFabricante(e.target.value)}
                />
                <p className={`text-[11px] ${fabricanteCurto ? "text-destructive" : "text-muted-foreground"}`}>
                  {fabricanteCurto
                    ? "Informe ao menos 2 caracteres."
                    : "Trecho do laboratório — BPS, SIASG e CMED (recorta o teto PMVG). O PNCP não registra fabricante."}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="filtro-cnpj">CNPJ Comprador</Label>
                <Input
                  id="filtro-cnpj"
                  inputMode="numeric"
                  placeholder="00.000.000/0000-00"
                  value={cnpjComprador}
                  onChange={(e) => setCnpjComprador(formatarCnpj(e.target.value))}
                />
                <p className={`text-[11px] ${cnpjCurto ? "text-destructive" : "text-muted-foreground"}`}>
                  {cnpjCurto
                    ? "Informe ao menos a raiz do CNPJ (8 dígitos)."
                    : "Órgão que comprou — completo ou só a raiz (BPS e PNCP). O SIASG não registra."}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="mr-auto flex flex-wrap items-center gap-2">
            {/* Sem isto, o Buscar fica desabilitado sem motivo à vista. */}
            {filtrosInvalidos && !maisFiltros && (
              <button
                type="button"
                className="text-xs text-destructive underline underline-offset-2"
                onClick={() => setMaisFiltros(true)}
              >
                Filtro opcional incompleto — revisar em “Mais filtros”.
              </button>
            )}
            {qtdFiltros > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={limparFiltros}
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Limpar filtros opcionais
              </Button>
            )}
          </div>
          <Button onClick={handleSearch} disabled={!canSubmit || loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
            {loading ? "Buscando…" : "Buscar"}
          </Button>
        </div>

        {erroItem && (
          <p className="text-sm text-destructive flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {(erroItem as Error).message}
          </p>
        )}
        {material && detalhe && <ItemResumo item={detalhe.item} unidades={unidades} />}
        {material && detalhe && canSearch && <DadosAbertosPanel codigo={material.codigo} />}
      </div>

      {/* Filtros opcionais desta pesquisa */}
      {result && filtrosAplicados.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Filtros aplicados:</span>
          {filtrosAplicados.map((c) => (
            <Badge key={c} variant="secondary" className="font-normal">
              {ROTULO_FILTRO[c]}: {result.filtros[c]}
            </Badge>
          ))}
        </div>
      )}

      {/* Ações do resultado */}
      {result && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {avisoCesta && (
            <span
              className={`mr-auto text-xs ${avisoCesta.erro ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}
            >
              {avisoCesta.texto}
            </span>
          )}
          {filtrosAplicados.length > 0 && (
            <span className="text-[11px] text-muted-foreground max-w-xs text-right leading-snug">
              A cesta guarda código, unidade e UF: o relatório consolidado refaz a pesquisa
              <strong> sem</strong> os filtros opcionais. A curadoria (descartes e orçamentos)
              vai junto.
            </span>
          )}
          <Button
            variant="outline"
            onClick={() => {
              setCuradoriaDestino("revisar");
              setCuradoriaOpen(true);
            }}
          >
            <ListChecks className="h-4 w-4 mr-2" />
            Revisar registros
            {curadoriaAtiva > 0 && (
              <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">
                {curadoriaAtiva}
              </Badge>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={handleAdicionarCesta}
            disabled={adicionarCesta.isPending}
          >
            {adicionarCesta.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <ShoppingCart className="h-4 w-4 mr-2" />
            )}
            Adicionar à cesta
          </Button>
          {canReport && (
            // A emissão passa pela tela de conferência: é lá que os valores
            // destoantes são desconsiderados, de forma justificada, antes de
            // o documento ser gerado (art. 6º, §§ 1º e 2º da IN 65/2021).
            <Button
              variant="outline"
              onClick={() => {
                setCuradoriaDestino("relatorio");
                setCuradoriaOpen(true);
              }}
            >
              <FileText className="h-4 w-4 mr-2" />
              Gerar Relatório IN 65/2021
            </Button>
          )}
        </div>
      )}

      {/* Resumo da curadoria em vigor nesta pesquisa */}
      {result && curadoriaAtiva > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Curadoria aplicada:</span>
          {exclusoes.length > 0 && (
            <Badge variant="destructive" className="font-normal">
              {exclusoes.length} registro(s) desconsiderado(s) com justificativa
            </Badge>
          )}
          {orcamentos.length > 0 && (
            <Badge variant="secondary" className="font-normal">
              {orcamentos.length} orçamento(s) de fornecedor
            </Badge>
          )}
          <button
            type="button"
            className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
            onClick={() => {
              setExclusoes([]);
              setOrcamentos([]);
            }}
          >
            limpar
          </button>
        </div>
      )}

      {/* Erro */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Recomendação */}
      {(result || loading) && (
        <RecomendacaoPanel
          rec={result?.recomendacao ?? null}
          consolidado={result?.consolidado ?? null}
          unidade={unidadePesquisada}
          loading={loading}
        />
      )}

      {/* Painéis por fonte */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CmedPanel
          data={result?.resultados.cmed ?? null}
          unidade={unidadePesquisada}
          loading={loading}
          fabricante={result?.filtros.fabricante ?? null}
        />
        <SourcePanel
          label="Compras.gov.br — Painel de Preços (inciso I)"
          color="bg-indigo-500"
          stats={result?.resultados.comprasgov ?? null}
          loading={loading}
          comFiltros={filtrosAplicados.length > 0}
        />
        <SourcePanel
          label={
            result?.resultados.bps.origemDados === "API"
              ? "BPS — API do Ministério da Saúde (inciso I)"
              : "BPS — base histórica do painel (inciso I)"
          }
          color="bg-blue-500"
          stats={result?.resultados.bps ?? null}
          loading={loading}
          comFiltros={filtrosAplicados.length > 0}
        />
        <SourcePanel
          label="SIASG — Compras Judiciais"
          color="bg-amber-500"
          stats={result?.resultados.siasg ?? null}
          loading={loading}
          comFiltros={filtrosAplicados.length > 0}
        />
        <SourcePanel
          label="PNCP — base do painel, 2024–2025 (inciso II)"
          color="bg-emerald-500"
          stats={result?.resultados.pncp ?? null}
          loading={loading}
          comFiltros={filtrosAplicados.length > 0}
        />
        <SourcePanel
          label="Atas de registro de preços (inciso II)"
          color="bg-teal-500"
          stats={result?.resultados.arp ?? null}
          loading={loading}
          comFiltros={filtrosAplicados.length > 0}
        />
      </div>

      {/* Banco de Preços em Saúde — divulgação da base e canal de dúvidas */}
      <div className="rounded-lg border bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-4">
        {/* Fundo branco fixo: o "B" da marca é branco e sumiria no tema escuro. */}
        <div className="shrink-0 self-center rounded-md bg-white p-2 ring-1 ring-border">
          {/* src com appPath: em string o next/image não prefixa o basePath do deploy interno
              (o import estático do PNG faria isso, mas quebra o `tsc` do CI sem next-env.d.ts). */}
          <Image
            src={appPath("/marcas/bps.png")}
            alt="BPS — Banco de Preços em Saúde"
            width={480}
            height={369}
            className="h-20 w-auto"
            unoptimized
          />
        </div>
        <div className="text-sm text-muted-foreground space-y-2">
          <p>
            Consulte, em um único ambiente, dados de preços registrados no Banco de Preços em Saúde
            (BPS) em todo o Brasil.
          </p>
          <p>
            O{" "}
            <a
              href="https://infoms.saude.gov.br/extensions/SEIDIGI_DEMAS_BPS/SEIDIGI_DEMAS_BPS.html"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 font-medium text-primary underline underline-offset-2 hover:text-foreground"
            >
              Painel de Preços da Saúde
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>{" "}
            reúne informações sobre aquisições de medicamentos e
            dispositivos médicos e disponibiliza diferentes filtros para apoiar consultas,
            comparações e análises de preços, ampliando as informações disponíveis para a pesquisa
            de preços.
          </p>
          <div className="text-xs">
            <p className="font-medium text-foreground">Dúvidas e informações sobre o BPS:</p>
            <p>
              E-mail:{" "}
              <a
                href="mailto:bps@saude.gov.br"
                className="text-primary underline underline-offset-2 hover:text-foreground"
              >
                bps@saude.gov.br
              </a>
            </p>
            <p>Telefones: (61) 3315-3990 | 3315-3991 | 3315-3798</p>
          </div>
        </div>
      </div>

      {/* Metodologia */}
      <div className="rounded-lg border bg-muted/30 p-4 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">Metodologia</p>
        <p>
          Conforme IN SEGES/ME nº 65/2021: os preços são coletados por código CATMAT no Compras.gov.br
          (Painel de Preços), no BPS, no SIASG (compras judiciais), no PNCP e nas atas de registro de
          preços, na unidade de fornecimento selecionada, aplicando-se o critério de remoção de outliers
          (método IQR). No padrão do painel, o preço de referência é a mediana das medianas por fonte, e o
          PMVG vigente (CMED), convertido para a unidade de fornecimento pela quantidade por embalagem, é
          aplicado como teto obrigatório; o método e a regra do teto podem ser escolhidos na emissão.
          Registros ANVISA sem CATMAT retornam apenas o preço CMED.
        </p>
      </div>

      {/* Conferência dos valores antes de emitir o documento */}
      <CuradoriaDialog
        aberto={curadoriaOpen}
        onOpenChange={setCuradoriaOpen}
        titulo="Conferir valores antes de gerar o relatório"
        base={result ?? null}
        parametros={params}
        exclusoesIniciais={exclusoes}
        orcamentosIniciais={orcamentos}
        rotuloConfirmar={
          curadoriaDestino === "relatorio" ? "Continuar para o relatório" : "Aplicar à pesquisa"
        }
        onConfirmar={({ exclusoes: e, orcamentos: o }) => {
          setExclusoes(e);
          setOrcamentos(o);
          setCuradoriaOpen(false);
          if (curadoriaDestino === "relatorio") setModalOpen(true);
        }}
      />

      {/* Modal — metadados do relatório */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gerar Relatório de Pesquisa de Preços</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-2">
            Preencha os dados institucionais para instrução do processo. Todos os campos são opcionais.
          </p>
          {result && (
            <div className="rounded-md border bg-muted/30 p-2 text-xs space-y-0.5">
              <p className="font-medium truncate">{result.item.descricao}</p>
              <p className="text-muted-foreground">
                {result.item.tipo === "CATMAT" ? `CATMAT ${result.item.catmat}` : `Registro ANVISA ${result.item.registro}`}
                {" · "}Unidade: {result.unidade}
                {result.uf ? ` · UF: ${result.uf}` : ""}
              </p>
              {filtrosAplicados.length > 0 && (
                <p className="text-muted-foreground">
                  {filtrosAplicados.map((c) => `${ROTULO_FILTRO[c]}: ${result.filtros[c]}`).join(" · ")}
                </p>
              )}
            </div>
          )}
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Responsável pela pesquisa</Label>
                <Input
                  placeholder="Nome completo"
                  value={relMeta.responsavel}
                  onChange={(e) => setRelMeta((m) => ({ ...m, responsavel: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Cargo / Matrícula</Label>
                <Input
                  placeholder="Ex: Farmacêutico — Mat. 12345"
                  value={relMeta.cargo}
                  onChange={(e) => setRelMeta((m) => ({ ...m, cargo: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Órgão / Unidade</Label>
              <Input
                placeholder="Ex: Secretaria de Saúde — DIAF"
                value={relMeta.orgao}
                onChange={(e) => setRelMeta((m) => ({ ...m, orgao: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Nº do Processo / SEI</Label>
              <Input
                placeholder="Ex: 25000.123456/2025-01"
                value={relMeta.processo}
                onChange={(e) => setRelMeta((m) => ({ ...m, processo: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Especificação complementar (opcional)</Label>
              <Input
                placeholder="Ex: comprimido revestido 500 mg, blister"
                value={relMeta.especificacao}
                onChange={(e) => setRelMeta((m) => ({ ...m, especificacao: e.target.value }))}
              />
            </div>

            <div className="space-y-2 border-t pt-3">
              <p className="text-xs font-medium">Preço adotado</p>
              <CamposEscolhaPreco valor={escolha} onChange={setEscolha} idPrefixo="avulsa" />
              {resultadoEscolhido && (
                <PreviaPrecoAdotado recomendacao={resultadoEscolhido.recomendacao} unidade={resultadoEscolhido.unidade} />
              )}
              <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3 items-start">
                <div className="space-y-1">
                  <Label className="text-xs" htmlFor="emissao-quantidade">Quantidade</Label>
                  <Input
                    id="emissao-quantidade"
                    inputMode="numeric"
                    value={quantidade}
                    onChange={(e) => setQuantidade(e.target.value.replace(/\D/g, ""))}
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs" htmlFor="emissao-justificativa">Justificativa do preço adotado</Label>
                    {justificativaEditada && (
                      <button
                        type="button"
                        className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                        onClick={() => setJustificativaEditada(false)}
                      >
                        restaurar texto gerado
                      </button>
                    )}
                  </div>
                  <Textarea
                    id="emissao-justificativa"
                    className="min-h-24 text-xs"
                    value={textoJustificativa}
                    onChange={(e) => {
                      setJustificativa(e.target.value);
                      setJustificativaEditada(true);
                    }}
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                O relatório e o mapa comparativo (modelo da DLOG) usam esta mesma escolha. A edição da
                justificativa fica registrada no log de auditoria.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={gerandoPdf || gerandoXlsx}>
              Cancelar
            </Button>
            <Button variant="outline" onClick={handleGerarXlsx} disabled={gerandoPdf || gerandoXlsx}>
              {gerandoXlsx ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Gerando…</>
              ) : (
                <><FileSpreadsheet className="h-4 w-4 mr-2" />Mapa comparativo (XLSX)</>
              )}
            </Button>
            <Button onClick={handleGerarRelatorio} disabled={gerandoPdf || gerandoXlsx}>
              {gerandoPdf ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Gerando…</>
              ) : (
                <><FileText className="h-4 w-4 mr-2" />Gerar e abrir PDF</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
