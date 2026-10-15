"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ORDEM_TIPOS_INFORMADOS,
  TIPOS_PRECO_INFORMADO,
  type OrcamentoFornecedor,
  type TipoPrecoInformado,
} from "@/lib/pesquisa-preco-curadoria";
import { formatarCnpj } from "@/lib/pesquisa-preco-filtros";

// ─────────────────────────────────────────────────────────────────────────────
// Formulário de preço informado pelo responsável (P13: IV cotação, III mídia,
// V nota fiscal, II contratação similar). Usado na curadoria de uma pesquisa e
// no botão "Incluir preço informado" ao lado da Cesta, que dispensa pesquisar
// o item antes.
// ─────────────────────────────────────────────────────────────────────────────

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

const hoje = () => new Date().toISOString().slice(0, 10);

const vazio = (): FormOrcamento => ({
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
});

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

export function FormularioPrecoInformado({
  unidade,
  onAdicionar,
  rotuloBotao = "Adicionar à pesquisa",
  desabilitado = false,
  titulo = "Juntar preço informado",
}: {
  /** Unidade de fornecimento do item: o valor é por ela. */
  unidade: string;
  /** Recebe o preço validado; pode ser assíncrono (gravar na cesta). Erro lançado aparece no formulário. */
  onAdicionar: (o: OrcamentoFornecedor) => void | Promise<void>;
  rotuloBotao?: string;
  desabilitado?: boolean;
  titulo?: string;
}) {
  const [form, setForm] = useState<FormOrcamento>(vazio);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const campo = (k: keyof FormOrcamento) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const rotulos = CAMPOS_TIPO[form.tipo];

  const adicionar = async () => {
    const valor = Number(form.valorUnitario.replace(/\./g, "").replace(",", "."));
    if (form.fornecedor.trim().length < 2) return setErro(`Informe: ${rotulos.quem.toLowerCase()}.`);
    if (!Number.isFinite(valor) || valor <= 0) return setErro(`Informe o valor por ${unidade}.`);
    if (!form.dataOrcamento) return setErro(`Informe: ${rotulos.data.toLowerCase()}.`);
    if (form.tipo === "III" && (!/^https?:\/\//i.test(form.url.trim()) || !form.acessadoEm)) {
      return setErro("Mídia ou sítio eletrônico: informe o endereço (http…) e a data e hora do acesso.");
    }
    setErro(null);
    setEnviando(true);
    try {
      await onAdicionar({
        // id local: o banco gera o definitivo ao gravar; aqui ele só precisa
        // ser estável dentro da sessão para casar exclusões e remoções.
        id: `novo-${Date.now()}`,
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
      });
      setForm({ ...vazio(), tipo: form.tipo, dataOrcamento: form.dataOrcamento });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível incluir o preço");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium">{titulo}</p>
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
      <Button type="button" size="sm" className="h-8" onClick={adicionar} disabled={desabilitado || enviando}>
        {enviando ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
        {rotuloBotao}
      </Button>
    </div>
  );
}
