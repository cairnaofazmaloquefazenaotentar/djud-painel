"use client";

import { useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { hasPermission } from "@/lib/permissions";
import {
  Search,
  AlertTriangle,
  ShieldCheck,
  Info,
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SourceStats {
  total: number;
  amostra: number;
  precoMin: number | null;
  precoMax: number | null;
  precoMediana: number | null;
  registros: any[];
}

interface BuscarResult {
  query: string;
  termoNormalizado: string;
  resultados: {
    cmed: { total: number; registros: any[]; pmvgMin: number | null; pmvgMax: number | null };
    bps: SourceStats;
    siasg: SourceStats;
    pncp: SourceStats;
  };
  recomendacao: {
    precoReferencia: number | null;
    limitePmvg: number | null;
    precoFinal: number | null;
    metodologia: string;
    fontes: string[];
    observacoes: string[];
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (v: number | null, decimals = 4) => {
  if (v == null) return "—";
  const [int, dec] = v.toFixed(decimals).split(".");
  const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${intFmt},${dec}`;
};

const fmtDate = (d: string | Date) =>
  new Date(d).toLocaleDateString("pt-BR", { year: "numeric", month: "2-digit", day: "2-digit" });

// ── Source Panel ──────────────────────────────────────────────────────────────

function SourcePanel({
  label,
  color,
  stats,
  loading,
}: {
  label: string;
  color: string;
  stats: SourceStats | null;
  loading: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
          <span className="font-semibold text-sm">{label}</span>
        </div>
        {stats && (
          <Badge variant="outline" className="text-xs">
            {stats.total.toLocaleString("pt-BR")} registros
          </Badge>
        )}
      </div>

      {loading && (
        <div className="h-16 flex items-center justify-center text-muted-foreground text-sm animate-pulse">
          Consultando…
        </div>
      )}

      {!loading && !stats && (
        <p className="text-sm text-muted-foreground">Realize uma pesquisa para ver resultados.</p>
      )}

      {!loading && stats && (
        <>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xs text-muted-foreground">Mínimo</p>
              <p className="text-sm font-medium">{fmt(stats.precoMin)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-semibold">Mediana</p>
              <p className="text-sm font-bold text-primary">{fmt(stats.precoMediana)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Máximo</p>
              <p className="text-sm font-medium">{fmt(stats.precoMax)}</p>
            </div>
          </div>

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
                    <ChevronDown className="h-3.5 w-3.5 mr-1" /> Ver últimos {stats.registros.length} registros
                  </>
                )}
              </Button>
              {expanded && (
                <div className="mt-2 space-y-1.5 max-h-60 overflow-y-auto">
                  {stats.registros.map((r, i) => (
                    <div key={r.id || i} className="rounded border p-2 text-xs space-y-0.5">
                      <p className="font-medium truncate">{r.descricao || r.descricaoResumida || r.nomeNorm}</p>
                      <div className="flex items-center gap-3 text-muted-foreground">
                        <span className="font-semibold text-foreground">{fmt(r.preco ?? r.valorUnitResultado)}</span>
                        {r.unidade && <span>/{r.unidade}</span>}
                        {r.data && <span>{fmtDate(r.data)}</span>}
                        {r.uf && <span>{r.uf}</span>}
                        {r.modalidade && <span>{r.modalidade}</span>}
                      </div>
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

// ── CMED Panel ────────────────────────────────────────────────────────────────

function CmedPanel({
  data,
  loading,
}: {
  data: BuscarResult["resultados"]["cmed"] | null;
  loading: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
          <span className="font-semibold text-sm">CMED — Teto PMVG</span>
          <Badge variant="secondary" className="text-xs">ANVISA</Badge>
        </div>
        {data && (
          <Badge variant="outline" className="text-xs">{data.total} produto(s)</Badge>
        )}
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
        <p className="text-sm text-amber-600">Substância não encontrada na tabela CMED vigente.</p>
      )}

      {!loading && data && data.total > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md bg-red-50 dark:bg-red-950/20 p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">PMVG Mín (sem imp.)</p>
              <p className="text-base font-bold text-red-700 dark:text-red-400">{fmt(data.pmvgMin)}</p>
            </div>
            <div className="rounded-md bg-red-50 dark:bg-red-950/20 p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">PMVG Máx (sem imp.)</p>
              <p className="text-base font-bold text-red-700 dark:text-red-400">{fmt(data.pmvgMax)}</p>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs text-muted-foreground h-7"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5 mr-1" /> : <ChevronDown className="h-3.5 w-3.5 mr-1" />}
            {expanded ? "Ocultar" : "Ver"} produtos CMED
          </Button>

          {expanded && (
            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {data.registros.map((r, i) => (
                <div key={r.id || i} className="rounded border p-2 text-xs space-y-0.5">
                  <p className="font-medium">{r.substancia}</p>
                  <p className="text-muted-foreground">{r.produto} — {r.apresentacao}</p>
                  <div className="flex gap-3">
                    <span>PMVG: <strong>{fmt(r.pmvgSemImpostos)}</strong></span>
                    <span>PF: <strong>{fmt(r.pf0)}</strong></span>
                    {r.cap && <Badge variant="destructive" className="text-[10px] h-4">CAP</Badge>}
                    {r.laboratorio && <span className="text-muted-foreground">{r.laboratorio}</span>}
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

// ── Recommendation Panel ──────────────────────────────────────────────────────

function RecomendacaoPanel({
  rec,
  loading,
}: {
  rec: BuscarResult["recomendacao"] | null;
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
    rec.limitePmvg !== null &&
    rec.precoReferencia !== null &&
    rec.precoReferencia > rec.limitePmvg;

  return (
    <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Recomendação — IN 65/2021</h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="text-center">
          <p className="text-xs text-muted-foreground mb-1">Preço de Referência</p>
          <p className="text-2xl font-bold text-primary">{fmt(rec.precoReferencia, 4)}</p>
          <p className="text-[10px] text-muted-foreground mt-1">Mediana das medianas</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground mb-1">Teto PMVG</p>
          <p className={`text-2xl font-bold ${hasPriceConflict ? "text-red-600" : "text-muted-foreground"}`}>
            {fmt(rec.limitePmvg, 4)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">CMED sem impostos</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground mb-1">Preço Final Sugerido</p>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {fmt(rec.precoFinal, 4)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            {hasPriceConflict ? "PMVG aplicado como teto" : "Preço de referência de mercado"}
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0" />
          <span>{rec.metodologia}</span>
          {rec.fontes.length > 0 && (
            <span>· Fontes: {rec.fontes.join(", ")}</span>
          )}
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

// ── Main Page ─────────────────────────────────────────────────────────────────

const UFS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
  "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

export default function PesquisaPrecoPage() {
  const { data: session } = useSession();
  const [query, setQuery] = useState("");
  const [uf, setUf] = useState<string>("todos");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BuscarResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [relMeta, setRelMeta] = useState({
    responsavel: "", cargo: "", orgao: "", processo: "", especificacao: "", unidade: "UN",
  });

  const canSearch = hasPermission(session as any, "precos:pesquisar");
  const canReport = hasPermission(session as any, "relatorios:gerar");

  const handleSearch = useCallback(async () => {
    if (!query.trim() || query.trim().length < 3) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const params = new URLSearchParams({ q: query.trim() });
      if (uf && uf !== "todos") params.set("uf", uf);
      const res = await fetch(`/api/precos/buscar?${params}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro na pesquisa");
      }
      setResult(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [query, uf]);

  const handleGerarRelatorio = useCallback(async () => {
    if (!result) return;
    // Open window synchronously (before await) so popup blocker doesn't fire
    const newWin = window.open("", "_blank");
    setGerandoPdf(true);
    try {
      const res = await fetch("/api/relatorios/pesquisa-preco", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ termo: query.trim(), ...relMeta }),
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
  }, [result, query, relMeta]);

  if (!canSearch) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <ShieldCheck className="h-10 w-10" />
        <p className="text-sm">Você não tem permissão para acessar a Pesquisa de Preços.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pesquisa de Preço</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Consulta consolidada nas bases CMED, BPS, SIASG judicial e PNCP · Metodologia IN 65/2021
        </p>
      </div>

      {/* Search bar */}
      <div className="flex gap-2">
        <Input
          placeholder="Ex: paracetamol, amoxicilina 500mg, insulina glargina…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="flex-1"
          disabled={loading}
        />
        <Select value={uf} onValueChange={setUf}>
          <SelectTrigger className="w-28">
            <SelectValue placeholder="UF" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            {UFS.map((u) => (
              <SelectItem key={u} value={u}>{u}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={handleSearch} disabled={loading || query.trim().length < 3}>
          <Search className="h-4 w-4 mr-2" />
          {loading ? "Buscando…" : "Buscar"}
        </Button>
      </div>

      {/* Gerar Relatório */}
      {result && canReport && (
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => setModalOpen(true)}>
            <FileText className="h-4 w-4 mr-2" />
            Gerar Relatório IN 65/2021
          </Button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Recommendation */}
      {(result || loading) && (
        <RecomendacaoPanel rec={result?.recomendacao ?? null} loading={loading} />
      )}

      {/* Source panels grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CmedPanel data={result?.resultados.cmed ?? null} loading={loading} />
        <SourcePanel
          label="BPS — Banco de Preços em Saúde"
          color="bg-blue-500"
          stats={result?.resultados.bps ?? null}
          loading={loading}
        />
        <SourcePanel
          label="SIASG — Compras Judiciais"
          color="bg-amber-500"
          stats={result?.resultados.siasg ?? null}
          loading={loading}
        />
        <SourcePanel
          label="PNCP — Portal Nacional (2024–2025)"
          color="bg-emerald-500"
          stats={result?.resultados.pncp ?? null}
          loading={loading}
        />
      </div>

      {/* Methodology note */}
      <div className="rounded-lg border bg-muted/30 p-4 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">Metodologia</p>
        <p>
          Conforme IN SEGES/ME nº 65/2021: os preços são coletados de ao menos 3 fontes distintas,
          aplicando-se o critério de remoção de outliers (método IQR). O preço de referência é a
          mediana das medianas por fonte. Para medicamentos controlados, o PMVG vigente (CMED) é
          aplicado como teto obrigatório.
        </p>
      </div>

      {/* Modal — metadados do relatório */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Gerar Relatório de Pesquisa de Preços</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-2">
            Preencha os dados institucionais para instrução do processo. Todos os campos são opcionais.
          </p>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Responsável pela pesquisa</Label>
                <Input
                  placeholder="Nome completo"
                  value={relMeta.responsavel}
                  onChange={e => setRelMeta(m => ({ ...m, responsavel: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Cargo / Matrícula</Label>
                <Input
                  placeholder="Ex: Farmacêutico — Mat. 12345"
                  value={relMeta.cargo}
                  onChange={e => setRelMeta(m => ({ ...m, cargo: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Órgão / Unidade</Label>
              <Input
                placeholder="Ex: Secretaria de Saúde — DIAF"
                value={relMeta.orgao}
                onChange={e => setRelMeta(m => ({ ...m, orgao: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Nº do Processo / SEI</Label>
              <Input
                placeholder="Ex: 25000.123456/2025-01"
                value={relMeta.processo}
                onChange={e => setRelMeta(m => ({ ...m, processo: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">Especificação / Apresentação</Label>
                <Input
                  placeholder="Ex: comprimido 500 mg, cápsula 20 mg"
                  value={relMeta.especificacao}
                  onChange={e => setRelMeta(m => ({ ...m, especificacao: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Unidade</Label>
                <Input
                  placeholder="UN, CP, FR…"
                  value={relMeta.unidade}
                  onChange={e => setRelMeta(m => ({ ...m, unidade: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={gerandoPdf}>
              Cancelar
            </Button>
            <Button onClick={handleGerarRelatorio} disabled={gerandoPdf}>
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
