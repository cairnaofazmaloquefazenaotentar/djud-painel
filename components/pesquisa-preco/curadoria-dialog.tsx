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
  ORDEM_TIPOS_INFORMADOS,
  TIPOS_PRECO_INFORMADO,
  motivoValido,
  type ExclusaoRegistro,
  type FonteCurada,
  type OrcamentoFornecedor,
  type TipoPrecoInformado,
} from "@/lib/pesquisa-preco-curadoria";
import { formatarCnpj } from "@/lib/pesquisa-preco-filtros";
import { fontesDoResultado, type FonteMercadoChave } from "@/lib/pesquisa-preco-fontes";
import type { ResultadoPesquisa } from "@/lib/pesquisa-preco";
import { apiPath } from "@/lib/url";

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

/** Fonte com registros individuais a curar nesta aba. */
type FonteRegistros = FonteMercadoChave | "cmed";

/**
 * Fontes consultadas em base que vieram na pesquisa, mais a CMED. Os preços
 * informados pelo responsável (orçamentos e afins) têm aba própria.
 */
function fontesRegistros(base: ResultadoPesquisa): FonteRegistros[] {
  return [
    ...fontesDoResultado(base)
      .filter((f) => !f.info.informado)
      .map((f) => f.fonte),
    "cmed",
  ];
}

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
  /** Cópia de uma compra de outra base (P18): "duplicado de Compras.gov.br". */
  duplicata: { texto: string; provavel: boolean } | null;
  /** Preço publicado e fator do IPCA quando o preço foi atualizado (D2). */
  ipca: { nominal: number; fator: number } | null;
}

function linhasDaFonte(base: ResultadoPesquisa, fonte: FonteRegistros): LinhaCuradoria[] {
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
      duplicata: null,
      ipca: null,
    }));
  }

  const dados = base.resultados[fonte];
  if (!dados) return [];
  const mediana = dados.estatisticas.mediana;
  return dados.registros.map((r) => ({
    id: r.id,
    titulo: r.descricao || "Sem descrição",
    detalhe: [
      r.fornecedor ? `Vencedora: ${r.fornecedor}` : null,
      r.marca || r.fabricante ? `Marca/fabr.: ${[r.marca, r.fabricante].filter(Boolean).join(" / ")}` : null,
      r.orgao,
      r.modalidade,
      // Contratação de origem (obs. 7 da DLOG): nº da compra, UASG e item.
      r.contratacao?.numero
        ? [r.contratacao.numero, r.contratacao.uasg ? `UASG ${r.contratacao.uasg}` : null, r.contratacao.numeroItem ? `item ${r.contratacao.numeroItem}` : null]
            .filter(Boolean)
            .join(" · ")
        : null,
      r.contratacao?.situacao,
      r.registroAnvisa ? `Reg. ANVISA ${r.registroAnvisa}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
    preco: r.preco,
    data: r.data,
    uf: r.uf,
    outlierIqr: r.outlierIqr,
    desvio: relativo(r.preco, mediana),
    duplicata: r.duplicadoDe
      ? {
          texto: `${r.duplicadoDe.provavel ? "provável duplicata de" : "duplicado de"} ${NOME_FONTE_CURADA[r.duplicadoDe.fonte]}`,
          provavel: r.duplicadoDe.provavel,
        }
      : null,
    ipca:
      r.fatorIpca != null && r.fatorIpca !== 1 && r.precoNominal != null
        ? { nominal: r.precoNominal, fator: r.fatorIpca }
        : null,
  }));
}

// ── Linha de registro ────────────────────────────────────────────────────────

function LinhaRegistro({
  linha,
  motivo,
  onAlternar,
  onMotivo,
  revertida,
  onReverter,
}: {
  linha: LinhaCuradoria;
  /** null = considerado; string = desconsiderado com esta justificativa. */
  motivo: string | null;
  onAlternar: () => void;
  onMotivo: (v: string) => void;
  /** A provável duplicata foi mantida no conjunto único pelo responsável. */
  revertida: boolean;
  onReverter: () => void;
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
            {linha.ipca && (
              <span title="Preço publicado × fator do IPCA = preço atualizado">
                ({fmt(linha.ipca.nominal)} × {linha.ipca.fator.toFixed(4).replace(".", ",")} IPCA)
              </span>
            )}
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
            {(linha.duplicata || revertida) && (
              <span className="inline-flex items-center gap-1">
                <Badge variant="outline" className="h-4 text-[10px]">
                  {revertida ? "mantida no conjunto único" : linha.duplicata?.texto}
                </Badge>
                {(revertida || linha.duplicata?.provavel) && (
                  <button
                    type="button"
                    className="text-[10px] underline underline-offset-2 hover:text-foreground"
                    onClick={onReverter}
                  >
                    {revertida ? "tratar como duplicata" : "não é a mesma compra"}
                  </button>
                )}
              </span>
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
  revertidas,
  setRevertidas,
}: {
  base: ResultadoPesquisa;
  exclusoes: Map<string, string>;
  setExclusoes: (fn: (m: Map<string, string>) => Map<string, string>) => void;
  revertidas: Set<string>;
  setRevertidas: (fn: (s: Set<string>) => Set<string>) => void;
}) {
  const [soDestoantes, setSoDestoantes] = useState(false);

  const porFonte = useMemo(
    () =>
      fontesRegistros(base).map((fonte) => ({
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
                      revertida={revertidas.has(l.id)}
                      onReverter={() =>
                        setRevertidas((atual) => {
                          const novo = new Set(atual);
                          if (novo.has(l.id)) novo.delete(l.id);
                          else novo.add(l.id);
                          return novo;
                        })
                      }
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

// ── Aba: preços informados (art. 5º, II a V) ─────────────────────────────────

/** Campos do formulário — todos texto até a validação. */
type FormOrcamento = {
  tipo: TipoPrecoInformado;
  fornecedor: string;
  cnpj: string;
  marca: string;
  fabricante: string;
  valorUnitario: string;
  dataOrcamento: string;
  validade: string;
  documento: string;
  observacao: string;
  url: string;
  acessadoEm: string;
  chaveNfe: string;
};

const ORCAMENTO_VAZIO: FormOrcamento = {
  tipo: "IV",
  fornecedor: "",
  cnpj: "",
  marca: "",
  fabricante: "",
  valorUnitario: "",
  dataOrcamento: hoje(),
  validade: "",
  documento: "",
  observacao: "",
  url: "",
  acessadoEm: "",
  chaveNfe: "",
};

/** Rótulos que mudam com o tipo do preço informado. */
const CAMPOS_TIPO: Record<TipoPrecoInformado, { quem: string; data: string; ajuda: string }> = {
  IV: {
    quem: "Empresa / fornecedor",
    data: "Data da proposta",
    ajuda: "Proposta apresentada diretamente por fornecedor (mínimo de 3, art. 5º, IV) — vale por 6 meses.",
  },
  III: {
    quem: "Publicação / sítio eletrônico",
    data: "Data do preço publicado",
    ajuda: "Mídia especializada, tabela de referência ou sítio eletrônico (art. 5º, III): informe o endereço e a data e hora do acesso — vale por 6 meses.",
  },
  V: {
    quem: "Emitente da nota fiscal",
    data: "Data de emissão",
    ajuda: "Nota fiscal eletrônica (art. 5º, V): informe o número e a chave de acesso — vale por 1 ano.",
  },
  II: {
    quem: "Órgão contratante / fornecedor",
    data: "Data da contratação",
    ajuda: "Contratação similar fora das bases consultadas (art. 5º, II): informe o contrato, a ata ou o processo — vale por 1 ano.",
  },
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
  const rotulos = CAMPOS_TIPO[form.tipo];

  const adicionar = () => {
    const valor = Number(form.valorUnitario.replace(/\./g, "").replace(",", "."));
    if (form.fornecedor.trim().length < 2) {
      setErro(`Informe: ${rotulos.quem.toLowerCase()}.`);
      return;
    }
    if (!Number.isFinite(valor) || valor <= 0) {
      setErro(`Informe o valor por ${unidade}.`);
      return;
    }
    if (!form.dataOrcamento) {
      setErro(`Informe: ${rotulos.data.toLowerCase()}.`);
      return;
    }
    if (form.tipo === "III" && (!/^https?:\/\//i.test(form.url.trim()) || !form.acessadoEm)) {
      setErro("Mídia ou sítio eletrônico: informe o endereço (http…) e a data e hora do acesso.");
      return;
    }
    if (orcamentos.length >= MAX_ORCAMENTOS) {
      setErro(`Máximo de ${MAX_ORCAMENTOS} preços informados por item.`);
      return;
    }
    setErro(null);
    setOrcamentos((lista) => [
      ...lista,
      {
        // id local: o banco gera o definitivo ao gravar; aqui ele só precisa
        // ser estável dentro da sessão para casar exclusões e remoções.
        id: `novo-${Date.now()}-${lista.length}`,
        tipo: form.tipo,
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
        url: form.url.trim() || null,
        acessadoEm: form.acessadoEm ? new Date(form.acessadoEm).toISOString() : null,
        chaveNfe: form.chaveNfe.replace(/\D/g, "") || null,
        justificativaForaPeriodo: null,
      },
    ]);
    setForm({ ...ORCAMENTO_VAZIO, tipo: form.tipo, dataOrcamento: form.dataOrcamento });
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Preços que o responsável junta ao processo, fora das bases consultadas. Cada tipo é uma fonte
        própria no consolidado, sem a remoção automática de outliers, e só entra no cálculo dentro da
        janela do seu inciso — fora dela, exige justificativa. O valor deve ser por{" "}
        <strong>{unidade}</strong>, a unidade de fornecimento da pesquisa.
      </p>

      {orcamentos.length > 0 && (
        <div className="space-y-1.5">
          {orcamentos.map((o) => (
            <div key={o.id} className="rounded-md border bg-card p-2.5 text-xs space-y-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">
                    <Badge variant="outline" className="mr-1.5 h-4 text-[10px]">
                      {o.tipo}
                    </Badge>
                    {o.fornecedor}
                  </p>
                  <p className="text-muted-foreground">
                    {[o.cnpj, o.marca, o.fabricante, o.chaveNfe ? `NF-e ${o.chaveNfe}` : null].filter(Boolean).join(" · ") || "—"}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-2 text-muted-foreground">
                    <span className="font-semibold text-foreground">{fmt(o.valorUnitario)}</span>
                    <span>por {unidade}</span>
                    <span>{fmtData(o.dataOrcamento)}</span>
                    {o.validade && <span>validade {fmtData(o.validade)}</span>}
                    {o.documento && <span>{o.documento}</span>}
                    {o.url && (
                      <a href={o.url} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
                        link
                      </a>
                    )}
                    {o.acessadoEm && <span>acesso {new Date(o.acessadoEm).toLocaleString("pt-BR")}</span>}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label="Remover preço informado"
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
              <Input
                className="h-7 text-[11px]"
                placeholder="Justificativa para manter no cálculo se estiver fora do período do inciso (opcional)"
                value={o.justificativaForaPeriodo ?? ""}
                onChange={(e) =>
                  setOrcamentos((l) =>
                    l.map((x) => (x.id === o.id ? { ...x, justificativaForaPeriodo: e.target.value || null } : x))
                  )
                }
              />
            </div>
          ))}
        </div>
      )}

      <div className="rounded-md border bg-muted/30 p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium">Juntar preço informado</p>
          <select
            aria-label="Tipo do preço informado"
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            value={form.tipo}
            onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value as TipoPrecoInformado }))}
          >
            {ORDEM_TIPOS_INFORMADOS.map((t) => (
              <option key={t} value={t}>
                {TIPOS_PRECO_INFORMADO[t].rotulo}
              </option>
            ))}
          </select>
        </div>
        <p className="text-[11px] text-muted-foreground">{rotulos.ajuda}</p>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-[11px]">{rotulos.quem} *</Label>
            <Input className="h-8 text-xs" value={form.fornecedor} onChange={(e) => campo("fornecedor")(e.target.value)} />
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
            <Label className="text-[11px]">Marca</Label>
            <Input className="h-8 text-xs" value={form.marca} onChange={(e) => campo("marca")(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Fabricante</Label>
            <Input className="h-8 text-xs" value={form.fabricante} onChange={(e) => campo("fabricante")(e.target.value)} />
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
            <Label className="text-[11px]">{TIPOS_PRECO_INFORMADO[form.tipo].documento}</Label>
            <Input className="h-8 text-xs" value={form.documento} onChange={(e) => campo("documento")(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">{rotulos.data} *</Label>
            <Input type="date" className="h-8 text-xs" value={form.dataOrcamento} onChange={(e) => campo("dataOrcamento")(e.target.value)} />
          </div>
          {form.tipo === "IV" && (
            <div className="space-y-1">
              <Label className="text-[11px]">Validade da proposta</Label>
              <Input type="date" className="h-8 text-xs" value={form.validade} onChange={(e) => campo("validade")(e.target.value)} />
            </div>
          )}
          {(form.tipo === "III" || form.tipo === "II") && (
            <div className="space-y-1">
              <Label className="text-[11px]">Endereço (URL){form.tipo === "III" ? " *" : ""}</Label>
              <Input className="h-8 text-xs" placeholder="https://…" value={form.url} onChange={(e) => campo("url")(e.target.value)} />
            </div>
          )}
          {form.tipo === "III" && (
            <div className="space-y-1">
              <Label className="text-[11px]">Data e hora do acesso *</Label>
              <Input type="datetime-local" className="h-8 text-xs" value={form.acessadoEm} onChange={(e) => campo("acessadoEm")(e.target.value)} />
            </div>
          )}
          {form.tipo === "V" && (
            <div className="space-y-1">
              <Label className="text-[11px]">Chave de acesso da NF-e</Label>
              <Input
                className="h-8 text-xs"
                inputMode="numeric"
                placeholder="44 dígitos"
                value={form.chaveNfe}
                onChange={(e) => campo("chaveNfe")(e.target.value.replace(/\D/g, "").slice(0, 44))}
              />
            </div>
          )}
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
  /** Parâmetros para o recálculo no servidor (os mesmos da pesquisa: período e IPCA inclusive). */
  parametros: {
    codigo: string;
    unidade: string;
    uf: string | null;
    fornecedor?: string | null;
    fabricante?: string | null;
    cnpjComprador?: string | null;
    periodo?: { dataReferencia: string; mesesMercado: 12 | 24 | 36 | null; justificativaAmpliacao: string | null } | null;
    corrigirIpca?: boolean;
  } | null;
  exclusoesIniciais: ExclusaoRegistro[];
  orcamentosIniciais: OrcamentoFornecedor[];
  /** Prováveis duplicatas mantidas no conjunto único (P18). */
  duplicidadesIniciais?: string[];
  /** Rótulo do botão de confirmação (varia entre pesquisa e cesta). */
  rotuloConfirmar: string;
  onConfirmar: (dados: {
    exclusoes: ExclusaoRegistro[];
    orcamentos: OrcamentoFornecedor[];
    duplicidadesRevertidas: string[];
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
  duplicidadesIniciais,
  rotuloConfirmar,
  onConfirmar,
}: CuradoriaDialogProps) {
  const [exclusoes, setExclusoes] = useState<Map<string, string>>(new Map());
  const [orcamentos, setOrcamentos] = useState<OrcamentoFornecedor[]>([]);
  const [revertidas, setRevertidas] = useState<Set<string>>(new Set());
  const [previa, setPrevia] = useState<ResultadoPesquisa | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Reabrir o diálogo recomeça da curadoria gravada, não do rascunho anterior.
  useEffect(() => {
    if (!aberto) return;
    setExclusoes(new Map(exclusoesIniciais.map((e) => [`${e.fonte}:${e.id}`, e.motivo])));
    setOrcamentos(orcamentosIniciais);
    setRevertidas(new Set(duplicidadesIniciais ?? []));
    setPrevia(null);
    setErro(null);
  }, [aberto, exclusoesIniciais, orcamentosIniciais, duplicidadesIniciais]);
  const listaRevertidas = useMemo(() => Array.from(revertidas).sort(), [revertidas]);

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
    () => JSON.stringify({ e: listaExclusoes, o: orcamentos, d: listaRevertidas }),
    [listaExclusoes, orcamentos, listaRevertidas]
  );
  // Chave por VALOR, não por identidade: um chamador que monte `parametros`
  // como objeto literal criaria uma referência nova a cada render e o efeito
  // abaixo — que muda estado — entraria em laço.
  const chaveParametros = parametros ? JSON.stringify(parametros) : "";

  useEffect(() => {
    if (!aberto || !parametros) return;
    if (listaExclusoes.length === 0 && orcamentos.length === 0 && listaRevertidas.length === 0) {
      setPrevia(null);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setCalculando(true);
      setErro(null);
      try {
        const res = await fetch(apiPath("/api/precos/buscar"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...parametros,
            exclusoes: listaExclusoes,
            orcamentos,
            duplicidadesRevertidas: listaRevertidas,
          }),
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
      await onConfirmar({ exclusoes: listaExclusoes, orcamentos, duplicidadesRevertidas: listaRevertidas });
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
                Cada fonte pesa igual: o cálculo incide sobre as medianas apuradas em cada base
                consultada e em cada tipo de preço informado. No padrão do painel, o preço adotado é
                a mediana; o método e o teto podem ser escolhidos na emissão.
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
                  Preços informados
                  {orcamentos.length > 0 && (
                    <Badge variant="secondary" className="ml-1.5 h-4 px-1.5 text-[10px]">
                      {orcamentos.length}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="registros">
                <AbaRegistros
                  base={base}
                  exclusoes={exclusoes}
                  setExclusoes={setExclusoes}
                  revertidas={revertidas}
                  setRevertidas={setRevertidas}
                />
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
