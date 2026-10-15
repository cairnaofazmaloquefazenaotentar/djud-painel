"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  AGRUPAMENTOS,
  COLUNAS_EXPORT,
  COLUNAS_PADRAO,
  type Agrupamento,
  type ColunaExport,
  type FormatoExport,
} from "@/lib/demandas-colunas";
import { FILTRO_VAZIO, filtroParaQuery, type FiltroDemandas } from "@/lib/demandas-filtro-tipos";
import { apiPath } from "@/lib/url";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Modal "Exportar" da lista de Demandas (A2): escopo (filtro ou seleção),
// colunas, formato e agrupamento com subtotais. O arquivo sai do servidor
// (/api/demandas/export) com o MESMO filtro da lista, sem teto de linhas.
// ─────────────────────────────────────────────────────────────────────────────

interface ExportarDialogProps {
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
  filtro: FiltroDemandas;
  /** Total do filtro, para o rótulo do escopo. */
  total: number;
  /** ids marcados na lista ("Exportar seleção"). */
  selecionados: string[];
  /** Abre já no escopo "seleção". */
  escopoInicial?: "filtro" | "selecao";
}

const FORMATOS: Array<{ id: FormatoExport; rotulo: string; icone: typeof Download }> = [
  { id: "xlsx", rotulo: "Planilha (XLSX)", icone: FileSpreadsheet },
  { id: "csv", rotulo: "CSV (Excel pt-BR)", icone: Download },
  { id: "html", rotulo: "Relatório (HTML/PDF)", icone: FileText },
];

export function ExportarDialog({
  aberto,
  onOpenChange,
  filtro,
  total,
  selecionados,
  escopoInicial = "filtro",
}: ExportarDialogProps) {
  // A tela monta a modal ao abrir: o escopo inicial é o de quem abriu (botão
  // do topo ou da seleção).
  const [escopo, setEscopo] = useState<"filtro" | "selecao">(
    selecionados.length && escopoInicial === "selecao" ? "selecao" : "filtro"
  );
  const [formato, setFormato] = useState<FormatoExport>("xlsx");
  const [colunas, setColunas] = useState<ColunaExport[]>(COLUNAS_PADRAO);
  const [agrupar, setAgrupar] = useState<Agrupamento | "">("");
  const [gerando, setGerando] = useState(false);

  const alternarColuna = (c: ColunaExport) =>
    setColunas((atual) =>
      atual.includes(c) ? atual.filter((x) => x !== c) : COLUNAS_EXPORT.map((x) => x.id).filter((x) => x === c || atual.includes(x))
    );

  const exportar = async () => {
    // Seleção = só os ids (já estão dentro do filtro da tela).
    const base: FiltroDemandas =
      escopo === "selecao"
        ? { ...FILTRO_VAZIO, ids: selecionados }
        : { ...filtro, ids: [] };
    const sp = filtroParaQuery(base);
    sp.set("formato", formato);
    sp.set("colunas", colunas.join(","));
    if (agrupar) sp.set("agrupar", agrupar);
    const url = apiPath(`/api/demandas/export?${sp.toString()}`);

    if (formato === "html") {
      window.open(url, "_blank", "noopener");
      onOpenChange(false);
      return;
    }
    setGerando(true);
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Erro ao exportar as demandas");
      }
      const nome =
        /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ??
        `demandas_${new Date().toISOString().slice(0, 10)}.${formato}`;
      const blob = await res.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = nome;
      link.click();
      URL.revokeObjectURL(link.href);
      toast.success(`${Number(res.headers.get("X-Total-Demandas") ?? 0).toLocaleString("pt-BR")} demanda(s) exportada(s).`);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao exportar as demandas");
    } finally {
      setGerando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Exportar demandas</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 px-6 py-4 text-sm">
          <fieldset className="space-y-1.5">
            <legend className="text-xs font-medium text-muted-foreground">O que exportar</legend>
            <label className="flex items-center gap-2">
              <input type="radio" name="escopo" checked={escopo === "filtro"} onChange={() => setEscopo("filtro")} className="accent-primary" />
              Todas as {total.toLocaleString("pt-BR")} demanda(s) do filtro atual
            </label>
            <label className={cn("flex items-center gap-2", !selecionados.length && "opacity-50")}>
              <input
                type="radio"
                name="escopo"
                disabled={!selecionados.length}
                checked={escopo === "selecao"}
                onChange={() => setEscopo("selecao")}
                className="accent-primary"
              />
              Só as {selecionados.length.toLocaleString("pt-BR")} marcada(s) na lista
            </label>
          </fieldset>

          <fieldset className="space-y-1.5">
            <legend className="text-xs font-medium text-muted-foreground">Formato</legend>
            <div className="flex flex-wrap gap-2">
              {FORMATOS.map((f) => (
                <Button
                  key={f.id}
                  type="button"
                  size="sm"
                  variant={formato === f.id ? "default" : "outline"}
                  onClick={() => setFormato(f.id)}
                  className="gap-1.5"
                >
                  <f.icone className="h-3.5 w-3.5" />
                  {f.rotulo}
                </Button>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-1.5">
            <legend className="flex w-full items-center justify-between text-xs font-medium text-muted-foreground">
              <span>Colunas ({colunas.length})</span>
              <span className="flex gap-3">
                <button type="button" className="hover:text-foreground" onClick={() => setColunas(COLUNAS_EXPORT.map((c) => c.id))}>
                  todas
                </button>
                <button type="button" className="hover:text-foreground" onClick={() => setColunas(COLUNAS_PADRAO)}>
                  padrão
                </button>
              </span>
            </legend>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
              {COLUNAS_EXPORT.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={colunas.includes(c.id)} onChange={() => alternarColuna(c.id)} className="accent-primary" />
                  {c.rotulo}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="agrupar" className="text-xs text-muted-foreground">
              Agrupar por (com subtotais)
            </Label>
            <select
              id="agrupar"
              value={agrupar}
              onChange={(e) => setAgrupar(e.target.value as Agrupamento | "")}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">Sem agrupamento</option>
              {AGRUPAMENTOS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.rotulo}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={gerando}>
            Cancelar
          </Button>
          <Button onClick={exportar} disabled={gerando || !colunas.length}>
            {gerando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Exportar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
