"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Ban,
  Check,
  FileText,
  Loader2,
  Plus,
  RotateCcw,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MAX_ORCAMENTOS,
  MOTIVO_MIN,
  NOME_FONTE_CURADA,
  motivoValido,
  type ExclusaoRegistro,
  type FonteCurada,
  type OrcamentoFornecedor,
} from "@/lib/pesquisa-preco-curadoria";
import { formatarCnpj } from "@/lib/pesquisa-preco-filtros";
import type { ResultadoPesquisa } from "@/lib/pesquisa-preco";

// ─────────────────────────────────────────────────────────────────────────────
// Curadoria da pesquisa — a tela que antecede a emissão do relatório.
//
// Duas coisas acontecem aqui, ambas exigidas pela IN SEGES/ME nº 65/2021:
//
//   • Desconsiderar, de forma justificada, valores que destoem do padrão
//     (art. 6º, §§ 1º e 2º). A justificativa é obrigatória e acompanha o
//     registro descartado até o relatório — rastreabilidade é do descarte.
//   • Juntar orçamento apresentado diretamente por fornecedor (art. 5º, IV),
//     fonte muitas vezes indispensável em medicamentos importados.
//
// O efeito de cada mexida é recalculado NO SERVIDOR (POST /api/precos/buscar)
// e não no navegador: o número que aparece aqui tem de ser o mesmo que sai
// impresso, e duplicar a estatística no cliente criaria duas verdades.
//
// O mesmo componente serve à pesquisa avulsa (estado efêmero, enviado junto
// com o relatório) e ao item da cesta (estado gravado no banco). Quem decide
// como persistir é o chamador, em `onConfirmar`.
// ─────────────────────────────────────────────────────────────────────────────

const fmt = (v: number | null | undefined, dec = 4) => {
  if (v == null) return "—";
  const [int, d] = v.toFixed(dec).split(".");
  return `R$ ${int.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${d}`;
};

const fmtData = (d: string | null) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

const hoje = () => new Date().toISOString().slice(0, 10);

/** Fontes com registros individuais a curar — orçamentos têm aba própria. */
const FONTES_REGISTROS: Exclude<FonteCurada, "orcamentos">[] = ["bps", "siasg", "pncp", "cmed"];

/** Linha exibida na curadoria, no formato comum às quatro fontes. */
interface LinhaCuradoria {
  id: string;
  titulo: string;
  detalhe: string;
  preco: number;
  data: string | null;
  uf: string | null;
  outlierIqr: boolean;
  /** Distância relativa da mediana da fonte, em % — ordena a lista. */
  desvio: number | null;
}

function linhasDaFonte(
  base: ResultadoPesquisa,
  fonte: Exclude<FonteCurada, "orcamentos">
): LinhaCuradoria[] {
  const relativo = (preco: number, mediana: number | null) =>
    mediana && mediana > 0 ? ((preco - mediana) / mediana) * 100 : null;

  if (fonte === "cmed") {
    const cmed = base.resultados.cmed;
    // A CMED é teto regulatório, não amostra de mercado: a referência de
    // desvio aqui é o menor PMVG unitário, que é o valor que forma o teto.
    const ref = cmed.pmvgUnitMin;
    return cmed.registros.map((r) => ({
      id: r.id,
      titulo: `${r.produto || r.substancia || "Registro"} — ${r.apresentacao || "—"}`,
      detalhe: [r.laboratorio, `Reg. ${r.registro}`, r.cap ? "CAP" : null]
        .filter(Boolean)
        .join(" · "),
      preco: r.pmvgUnitario ?? r.pmvgEmbalagem,
      data: null,
      uf: null,
      outlierIqr: false,
      desvio: relativo(r.pmvgUnitario ?? r.pmvgEmbalagem, ref),
    }));
  }

  const dados = base.resultados[fonte];
  const mediana = dados.estatisticas.mediana;
  return dados.registros.map((r) => ({
    id: r.id,
    titulo: r.descricao || "Sem descrição",
    detalhe: [
      r.fornecedor ? `Vencedora: ${r.fornecedor}` : null,
      r.marca || r.fabricante ? `Marca/fabr.: ${[r.marca, r.fabricante].filter(Boolean).join(" / ")}` : null,
      r.orgao,
      r.modalidade,
    ]
      .filter(Boolean)
      .join(" · "),
    preco: r.preco,
    data: r.data,
    uf: r.uf,
    outlierIqr: r.outlierIqr,
    desvio: relativo(r.preco, mediana),
  }));
}

// ── Linha de registro ────────────────────────────────────────────────────────

function LinhaRegistro({
  linha,
  motivo,
  onAlternar,
  onMotivo,
}: {
  linha: LinhaCuradoria;
  /** null = considerado; string = desconsiderado com esta justificativa. */
  motivo: string | null;
  onAlternar: () => void;
  onMotivo: (v: string) => void;
}) {
  const excluido = motivo !== null;
  const motivoCurto = excluido && !motivoValido(motivo);

  return (
    <div
      className={`rounded-md border p-2.5 text-xs space-y-1.5 ${
        excluido ? "border-destructive/50 bg-destructive/5" : "bg-card"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <p className={`font-medium leading-snug ${excluido ? "line-through opacity-70" : ""}`}>
            {linha.titulo}
          </p>
          {linha.detalhe && <p className="text-muted-foreground leading-snug">{linha.detalhe}</p>}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground">
            <span className="font-semibold text-foreground">{fmt(linha.preco)}</span>
            {linha.data && <span>{fmtData(linha.data)}</span>}
            {linha.uf && <span>{linha.uf}</span>}
            {linha.desvio !== null && (
              <span
                className={
                  Math.abs(linha.desvio) >= 50 ? "text-amber-700 dark:text-amber-400 font-medium" : ""
                }
              >
                {linha.desvio > 0 ? "+" : ""}
                {linha.desvio.toFixed(0)}% da mediana
              </span>
            )}
            {linha.outlierIqr && (
              <Badge variant="secondary" className="h-4 text-[10px]">
                fora do IQR
              </Badge>
            )}
          </div>
        </div>
        <Button
          type="button"
          variant={excluido ? "outline" : "ghost"}
          size="sm"
          className={`h-7 shrink-0 px-2 text-[11px] ${excluido ? "" : "text-muted-foreground"}`}
          onClick={onAlternar}
        >
          {excluido ? (
            <>
              <RotateCcw className="mr-1 h-3 w-3" />
              Reconsiderar
            </>
          ) : (
            <>
              <Ban className="mr-1 h-3 w-3" />
              Desconsiderar
            </>
          )}
        </Button>
      </div>

      {excluido && (
        <div className="space-y-1">
          <Input
            autoFocus
            value={motivo}
            placeholder="Justificativa do descarte (obrigatória)"
            className="h-7 text-xs"
            onChange={(e) => onMotivo(e.target.value)}
          />
          {motivoCurto && (
            <p className="text-[11px] text-destructive">
              Descreva o motivo com pelo menos {MOTIVO_MIN} caracteres — ele vai impresso no
              relatório.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Aba: registros ───────────────────────────────────────────────────────────

function AbaRegistros({
  base,
  exclusoes,
  setExclusoes,
}: {
  base: ResultadoPesquisa;
  exclusoes: Map<string, string>;
  setExclusoes: (fn: (m: Map<string, string>) => Map<string, string>) => void;
}) {
  const [soDestoantes, setSoDestoantes] = useState(false);

  const porFonte = useMemo(
    () =>
      FONTES_REGISTROS.map((fonte) => ({
        fonte,
        // Maior desvio primeiro: é o que a IN manda examinar, e evita rolar
        // uma lista de 150 linhas atrás do valor que destoa.
        linhas: linhasDaFonte(base, fonte).sort(
          (a, b) => Math.abs(b.desvio ?? 0) - Math.abs(a.desvio ?? 0)
        ),
      })),
    [base]
  );

  const alternar = useCallback(
    (chave: string) =>
      setExclusoes((m) => {
        const novo = new Map(m);
        if (novo.has(chave)) novo.delete(chave);
        else novo.set(chave, "");
        return novo;
      }),
    [setExclusoes]
  );

  const definirMotivo = useCallback(
    (chave: string, valor: string) =>
      setExclusoes((m) => new Map(m).set(chave, valor)),
    [setExclusoes]
  );

  const totalLinhas = porFonte.reduce((s, f) => s + f.linhas.length, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {totalLinhas} registro(s) disponíveis para conferência, do maior para o menor
          afastamento da mediana da fonte.
        </p>
        <Button
          type="button"
          variant={soDestoantes ? "default" : "outline"}
          size="sm"
          className="h-7 text-xs"
          onClick={() => setSoDestoantes((v) => !v)}
        >
          <TrendingUp className="mr-1.5 h-3.5 w-3.5" />
          {soDestoantes ? "Mostrando só ±50% ou IQR" : "Só os que destoam"}
        </Button>
      </div>

      {porFonte.map(({ fonte, linhas }) => {
        const visiveis = soDestoantes
          ? linhas.filter((l) => l.outlierIqr || Math.abs(l.desvio ?? 0) >= 50)
          : linhas;
        const excluidosNaFonte = linhas.filter((l) => exclusoes.has(`${fonte}:${l.id}`)).length;

        return (
          <div key={fonte} className="space-y-2">
            <div className="flex items-center gap-2 border-b pb-1">
              <span className="text-sm font-semibold">{NOME_FONTE_CURADA[fonte]}</span>
              <Badge variant="outline" className="text-[10px]">
                {linhas.length} registro(s)
              </Badge>
              {excluidosNaFonte > 0 && (
                <Badge variant="destructive" className="text-[10px]">
                  {excluidosNaFonte} desconsiderado(s)
                </Badge>
              )}
            </div>

            {visiveis.length === 0 ? (
              <p className="text-xs italic text-muted-foreground">
                {linhas.length === 0
                  ? "Nenhum registro nesta fonte para o código e a unidade pesquisados."
                  : "Nenhum registro destoante nesta fonte."}
              </p>
            ) : (
              <div className="space-y-1.5">
                {visiveis.map((l) => {
                  const chave = `${fonte}:${l.id}`;
                  return (
                    <LinhaRegistro
                      key={chave}
                      linha={l}
                      motivo={exclusoes.get(chave) ?? null}
                      onAlternar={() => alternar(chave)}
                      onMotivo={(v) => definirMotivo(chave, v)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Aba: orçamentos ──────────────────────────────────────────────────────────

/** Campos do formulário de orçamento — todos texto até a validação. */
type FormOrcamento = {
  fornecedor: string;
  cnpj: string;
  marca: string;
  fabricante: string;
  valorUnitario: string;
  dataOrcamento: string;
  validade: string;
  documento: string;
  observacao: string;
};

const ORCAMENTO_VAZIO: FormOrcamento = {
  fornecedor: "",
  cnpj: "",
  marca: "",
  fabricante: "",
  valorUnitario: "",
  dataOrcamento: hoje(),
  validade: "",
  documento: "",
  observacao: "",
};

function AbaOrcamentos({
  unidade,
  orcamentos,
  setOrcamentos,
}: {
  unidade: string;
  orcamentos: OrcamentoFornecedor[];
  setOrcamentos: (fn: (o: OrcamentoFornecedor[]) => OrcamentoFornecedor[]) => void;
}) {
  const [form, setForm] = useState<FormOrcamento>(ORCAMENTO_VAZIO);
  const [erro, setErro] = useState<string | null>(null);

  const campo = (k: keyof FormOrcamento) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const adicionar = () => {
    const valor = Number(form.valorUnitario.replace(/\./g, "").replace(",", "."));
    if (form.fornecedor.trim().length < 2) {
      setErro("Informe a empresa que apresentou a proposta.");
      return;
    }
    if (!Number.isFinite(valor) || valor <= 0) {
      setErro(`Informe o valor da proposta por ${unidade}.`);
      return;
    }
    if (!form.dataOrcamento) {
      setErro("Informe a data da proposta.");
      return;
    }
    if (orcamentos.length >= MAX_ORCAMENTOS) {
      setErro(`Máximo de ${MAX_ORCAMENTOS} orçamentos por item.`);
      return;
    }
    setErro(null);
    setOrcamentos((lista) => [
      ...lista,
      {
        // id local: o banco gera o definitivo ao gravar; aqui ele só precisa
        // ser estável dentro da sessão para casar exclusões e remoções.
        id: `novo-${Date.now()}-${lista.length}`,
        fornecedor: form.fornecedor.trim(),
        cnpj: form.cnpj.trim() || null,
        marca: form.marca.trim() || null,
        fabricante: form.fabricante.trim() || null,
        valorUnitario: valor,
        dataOrcamento: new Date(`${form.dataOrcamento}T00:00:00`).toISOString(),
        validade: form.validade ? new Date(`${form.validade}T00:00:00`).toISOString() : null,
        documento: form.documento.trim() || null,
        observacao: form.observacao.trim() || null,
        considerarNoCalculo: true,
      },
    ]);
    setForm({ ...ORCAMENTO_VAZIO, dataOrcamento: form.dataOrcamento });
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Proposta apresentada diretamente por fornecedor — fonte admitida pelo art. 5º, IV da IN
        65/2021 e frequentemente a única disponível em medicamentos importados. O valor deve ser
        por <strong>{unidade}</strong>, a mesma unidade de fornecimento da pesquisa. Cada orçamento
        entra na apuração como uma fonte a mais, sem passar pela remoção automática de outliers.
      </p>

      {orcamentos.length > 0 && (
        <div className="space-y-1.5">
          {orcamentos.map((o) => (
            <div key={o.id} className="rounded-md border bg-card p-2.5 text-xs space-y-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{o.fornecedor}</p>
                  <p className="text-muted-foreground">
                    {[o.cnpj, o.marca, o.fabricante].filter(Boolean).join(" · ") || "—"}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-2 text-muted-foreground">
                    <span className="font-semibold text-foreground">{fmt(o.valorUnitario)}</span>
                    <span>por {unidade}</span>
                    <span>proposta {fmtData(o.dataOrcamento)}</span>
                    {o.validade && <span>validade {fmtData(o.validade)}</span>}
                    {o.documento && <span>{o.documento}</span>}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label="Remover orçamento"
                  onClick={() => setOrcamentos((l) => l.filter((x) => x.id !== o.id))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-primary"
                  checked={o.considerarNoCalculo}
                  onChange={(e) =>
                    setOrcamentos((l) =>
                      l.map((x) =>
                        x.id === o.id ? { ...x, considerarNoCalculo: e.target.checked } : x
                      )
                    )
                  }
                />
                <span className="text-[11px]">
                  Considerar no cálculo do preço de referência
                  {!o.considerarNoCalculo && (
                    <span className="text-muted-foreground">
                      {" "}
                      — permanece no relatório apenas como registro
                    </span>
                  )}
                </span>
              </label>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-md border bg-muted/30 p-3 space-y-3">
        <p className="text-xs font-medium">Juntar orçamento</p>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-[11px]">Empresa / fornecedor *</Label>
            <Input
              className="h-8 text-xs"
              placeholder="Razão social de quem apresentou a proposta"
              value={form.fornecedor}
              onChange={(e) => campo("fornecedor")(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">CNPJ</Label>
            <Input
              className="h-8 text-xs"
              inputMode="numeric"
              placeholder="00.000.000/0000-00"
              value={form.cnpj}
              onChange={(e) => campo("cnpj")(formatarCnpj(e.target.value))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Marca ofertada</Label>
            <Input
              className="h-8 text-xs"
              value={form.marca}
              onChange={(e) => campo("marca")(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Fabricante</Label>
            <Input
              className="h-8 text-xs"
              value={form.fabricante}
              onChange={(e) => campo("fabricante")(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Valor por {unidade} (R$) *</Label>
            <Input
              className="h-8 text-xs"
              inputMode="decimal"
              placeholder="0,0000"
              value={form.valorUnitario}
              onChange={(e) => campo("valorUnitario")(e.target.value.replace(/[^\d.,]/g, ""))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Documento / nº da proposta</Label>
            <Input
              className="h-8 text-xs"
              placeholder="Ex.: Proposta 123/2026 — SEI 25000.000000/2026-00"
              value={form.documento}
              onChange={(e) => campo("documento")(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Data da proposta *</Label>
            <Input
              type="date"
              className="h-8 text-xs"
              value={form.dataOrcamento}
              onChange={(e) => campo("dataOrcamento")(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Validade da proposta</Label>
            <Input
              type="date"
              className="h-8 text-xs"
              value={form.validade}
              onChange={(e) => campo("validade")(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">Observação</Label>
          <Textarea
            className="min-h-14 text-xs"
            placeholder="Ex.: condição de pagamento, prazo de entrega, incoterm, cotação em moeda estrangeira convertida em…"
            value={form.observacao}
            onChange={(e) => campo("observacao")(e.target.value)}
          />
        </div>
        {erro && (
          <p className="flex items-start gap-1.5 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {erro}
          </p>
        )}
        <Button type="button" size="sm" className="h-8" onClick={adicionar}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Adicionar à pesquisa
        </Button>
      </div>
    </div>
  );
}

// ── Diálogo ──────────────────────────────────────────────────────────────────

export interface CuradoriaDialogProps {
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
  titulo: string;
  /** Resultado da pesquisa deste item — de onde saem os registros a conferir. */
  base: ResultadoPesquisa | null;
  /** Parâmetros para o recálculo no servidor. */
  parametros: {
    codigo: string;
    unidade: string;
    uf: string | null;
    fornecedor?: string | null;
    fabricante?: string | null;
    cnpjComprador?: string | null;
  } | null;
  exclusoesIniciais: ExclusaoRegistro[];
  orcamentosIniciais: OrcamentoFornecedor[];
  /** Rótulo do botão de confirmação (varia entre pesquisa e cesta). */
  rotuloConfirmar: string;
  onConfirmar: (dados: {
    exclusoes: ExclusaoRegistro[];
    orcamentos: OrcamentoFornecedor[];
  }) => Promise<void> | void;
}

export function CuradoriaDialog({
  aberto,
  onOpenChange,
  titulo,
  base,
  parametros,
  exclusoesIniciais,
  orcamentosIniciais,
  rotuloConfirmar,
  onConfirmar,
}: CuradoriaDialogProps) {
  const [exclusoes, setExclusoes] = useState<Map<string, string>>(new Map());
  const [orcamentos, setOrcamentos] = useState<OrcamentoFornecedor[]>([]);
  const [previa, setPrevia] = useState<ResultadoPesquisa | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Reabrir o diálogo recomeça da curadoria gravada, não do rascunho anterior.
  useEffect(() => {
    if (!aberto) return;
    setExclusoes(new Map(exclusoesIniciais.map((e) => [`${e.fonte}:${e.id}`, e.motivo])));
    setOrcamentos(orcamentosIniciais);
    setPrevia(null);
    setErro(null);
  }, [aberto, exclusoesIniciais, orcamentosIniciais]);

  const listaExclusoes = useMemo<ExclusaoRegistro[]>(
    () =>
      Array.from(exclusoes.entries())
        .filter(([, motivo]) => motivoValido(motivo))
        .map(([chave, motivo]) => {
          const corte = chave.indexOf(":");
          return {
            fonte: chave.slice(0, corte) as FonteCurada,
            id: chave.slice(corte + 1),
            motivo,
          };
        }),
    [exclusoes]
  );

  const pendentes = Array.from(exclusoes.values()).filter((m) => !motivoValido(m)).length;

  // Recalcula no servidor com um respiro, para não disparar uma consulta a
  // cada tecla da justificativa.
  const assinatura = useMemo(
    () => JSON.stringify({ e: listaExclusoes, o: orcamentos }),
    [listaExclusoes, orcamentos]
  );
  // Chave por VALOR, não por identidade: um chamador que monte `parametros`
  // como objeto literal criaria uma referência nova a cada render e o efeito
  // abaixo — que muda estado — entraria em laço.
  const chaveParametros = parametros ? JSON.stringify(parametros) : "";

  useEffect(() => {
    if (!aberto || !parametros) return;
    if (listaExclusoes.length === 0 && orcamentos.length === 0) {
      setPrevia(null);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setCalculando(true);
      setErro(null);
      try {
        const res = await fetch("/api/precos/buscar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...parametros, exclusoes: listaExclusoes, orcamentos }),
          signal: ctrl.signal,
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || "Não foi possível recalcular a pesquisa");
        }
        setPrevia(await res.json());
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setErro(e instanceof Error ? e.message : "Erro ao recalcular");
        }
      } finally {
        setCalculando(false);
      }
    }, 700);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
    // `assinatura` e `chaveParametros` resumem as entradas em valores estáveis.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, assinatura, chaveParametros]);

  const confirmar = async () => {
    setSalvando(true);
    setErro(null);
    try {
      await onConfirmar({ exclusoes: listaExclusoes, orcamentos });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar a curadoria");
    } finally {
      setSalvando(false);
    }
  };

  const antes = base?.consolidado.porFonte ?? null;
  const depois = previa?.consolidado.porFonte ?? antes;
  const mudou = previa !== null;

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
        </DialogHeader>

        {!base ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando a pesquisa do item…
          </div>
        ) : (
          <>
            <p className="-mt-2 text-sm text-muted-foreground">
              Confira os valores coletados antes de emitir o documento. Registros
              desconsiderados saem do cálculo da média, da mediana e do menor valor, mas
              continuam impressos no relatório com a justificativa informada (art. 6º, §§ 1º e
              2º da IN 65/2021).
            </p>

            {/* Efeito da curadoria sobre os três métodos do art. 6º */}
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-medium">
                  Consolidado por fonte {mudou ? "— com a curadoria aplicada" : "— pesquisa atual"}
                </span>
                {calculando && (
                  <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    recalculando…
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                {(
                  [
                    ["Média", antes?.media ?? null, depois?.media ?? null],
                    ["Mediana (adotada)", antes?.mediana ?? null, depois?.mediana ?? null],
                    ["Menor valor", antes?.menor ?? null, depois?.menor ?? null],
                  ] as const
                ).map(([rotulo, a, d]) => (
                  <div key={rotulo}>
                    <p className="text-[11px] text-muted-foreground">{rotulo}</p>
                    <p
                      className={`text-sm font-bold ${
                        rotulo === "Mediana (adotada)" ? "text-primary" : ""
                      }`}
                    >
                      {fmt(d)}
                    </p>
                    {mudou && a !== d && (
                      <p className="text-[10px] text-muted-foreground line-through">{fmt(a)}</p>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Cada fonte pesa igual: o cálculo incide sobre as medianas apuradas em BPS, SIASG,
                PNCP e nos orçamentos diretos. O preço adotado pelo painel é a mediana.
              </p>
            </div>

            <Tabs defaultValue="registros">
              <TabsList>
                <TabsTrigger value="registros">
                  Registros
                  {listaExclusoes.length > 0 && (
                    <Badge variant="destructive" className="ml-1.5 h-4 px-1.5 text-[10px]">
                      {listaExclusoes.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="orcamentos">
                  Orçamentos de fornecedor
                  {orcamentos.length > 0 && (
                    <Badge variant="secondary" className="ml-1.5 h-4 px-1.5 text-[10px]">
                      {orcamentos.length}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="registros">
                <AbaRegistros base={base} exclusoes={exclusoes} setExclusoes={setExclusoes} />
              </TabsContent>

              <TabsContent value="orcamentos">
                <AbaOrcamentos
                  unidade={base.unidade}
                  orcamentos={orcamentos}
                  setOrcamentos={setOrcamentos}
                />
              </TabsContent>
            </Tabs>

            {erro && (
              <p className="flex items-start gap-1.5 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {erro}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
              {pendentes > 0 && (
                <span className="mr-auto text-xs text-destructive">
                  {pendentes} descarte(s) sem justificativa — não serão aplicados.
                </span>
              )}
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
                Cancelar
              </Button>
              <Button onClick={confirmar} disabled={salvando || calculando}>
                {salvando ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando…
                  </>
                ) : (
                  <>
                    {rotuloConfirmar.toLowerCase().includes("relat") ? (
                      <FileText className="mr-2 h-4 w-4" />
                    ) : (
                      <Check className="mr-2 h-4 w-4" />
                    )}
                    {rotuloConfirmar}
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
