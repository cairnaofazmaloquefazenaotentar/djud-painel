"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  FileText,
  Loader2,
  Minus,
  Plus,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  useAtualizarItemCesta,
  useCesta,
  useEsvaziarCesta,
  useRemoverItemCesta,
} from "@/hooks/useCesta";
import { MAX_ITENS_CESTA } from "@/lib/cesta-schemas";
import type { CestaItemDTO } from "@/lib/cesta";

// ─────────────────────────────────────────────────────────────────────────────
// Cesta da Pesquisa de Preços — painel lateral com os itens que o usuário
// guardou para gerar um relatório único. A cesta vive no banco (por usuário),
// então sobrevive ao logout: quem sai sem gerar o relatório encontra os mesmos
// itens no próximo acesso.
// ─────────────────────────────────────────────────────────────────────────────

const fmt = (v: number | null | undefined, decimals = 4) => {
  if (v == null) return "—";
  const [int, dec] = v.toFixed(decimals).split(".");
  const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${intFmt},${dec}`;
};

const fmtInt = (n: number) => n.toLocaleString("pt-BR");

// ── Linha da cesta ────────────────────────────────────────────────────────────

function LinhaItem({ item }: { item: CestaItemDTO }) {
  const atualizar = useAtualizarItemCesta();
  const remover = useRemoverItemCesta();

  const [qtd, setQtd] = useState(String(item.quantidade));
  const [obs, setObs] = useState(item.observacao ?? "");

  // Reflete mudanças vindas do servidor (ex.: item adicionado de novo somou qtd).
  useEffect(() => setQtd(String(item.quantidade)), [item.quantidade]);
  useEffect(() => setObs(item.observacao ?? ""), [item.observacao]);

  const comitarQtd = useCallback(
    (valor: number) => {
      const n = Math.max(1, Math.trunc(valor) || 1);
      setQtd(String(n));
      if (n !== item.quantidade) atualizar.mutate({ id: item.id, quantidade: n });
    },
    [atualizar, item.id, item.quantidade]
  );

  const comitarObs = useCallback(() => {
    const texto = obs.trim();
    if (texto !== (item.observacao ?? "")) {
      atualizar.mutate({ id: item.id, observacao: texto || null });
    }
  }, [atualizar, item.id, item.observacao, obs]);

  const ocupado = atualizar.isPending || remover.isPending;

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug">{item.descricao}</p>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
          aria-label="Remover item da cesta"
          disabled={ocupado}
          onClick={() => remover.mutate(item.id)}
        >
          {remover.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={item.tipo === "CATMAT" ? "default" : "secondary"} className="text-[10px]">
          {item.tipo === "CATMAT" ? `CATMAT ${item.codigo}` : `Reg. ${item.codigo}`}
        </Badge>
        {item.tipo === "REGISTRO" && item.catmat && (
          <Badge variant="outline" className="text-[10px]">CATMAT {item.catmat}</Badge>
        )}
        <Badge variant="outline" className="text-[10px]">{item.unidade}</Badge>
        {item.uf && <Badge variant="outline" className="text-[10px]">{item.uf}</Badge>}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Quantidade</Label>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              aria-label="Diminuir quantidade"
              disabled={ocupado || item.quantidade <= 1}
              onClick={() => comitarQtd(item.quantidade - 1)}
            >
              <Minus className="h-3 w-3" />
            </Button>
            <Input
              value={qtd}
              inputMode="numeric"
              aria-label="Quantidade"
              disabled={ocupado}
              className="h-7 w-20 text-center text-sm"
              onChange={(e) => setQtd(e.target.value.replace(/\D/g, ""))}
              onBlur={() => comitarQtd(Number(qtd))}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              aria-label="Aumentar quantidade"
              disabled={ocupado}
              onClick={() => comitarQtd(item.quantidade + 1)}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>

        <div className="text-right">
          <p className="text-[10px] text-muted-foreground">
            Unitário {fmt(item.precoFinal)}
          </p>
          <p className="text-sm font-bold text-primary">
            {item.valorTotal === null ? "sem preço apurado" : fmt(item.valorTotal, 2)}
          </p>
        </div>
      </div>

      <Input
        value={obs}
        placeholder="Observação para o relatório (opcional)"
        maxLength={500}
        disabled={ocupado}
        className="h-7 text-xs"
        onChange={(e) => setObs(e.target.value)}
        onBlur={comitarObs}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />

      {atualizar.isError && (
        <p className="text-[11px] text-destructive">{atualizar.error.message}</p>
      )}
      {remover.isError && (
        <p className="text-[11px] text-destructive">{remover.error.message}</p>
      )}
    </div>
  );
}

// ── Painel ────────────────────────────────────────────────────────────────────

export function CestaSheet({ podeGerarRelatorio }: { podeGerarRelatorio: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [confirmarLimpeza, setConfirmarLimpeza] = useState(false);
  const [modalRelatorio, setModalRelatorio] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [erroRelatorio, setErroRelatorio] = useState<string | null>(null);
  const [meta, setMeta] = useState({
    responsavel: "",
    cargo: "",
    orgao: "",
    processo: "",
    limparCesta: true,
  });

  const { data: cesta, isLoading, error } = useCesta();
  const esvaziar = useEsvaziarCesta();

  const itens = cesta?.itens ?? [];
  const total = cesta?.total ?? 0;

  const gerarRelatorio = useCallback(async () => {
    // Abre a janela antes do await para o bloqueador de pop-up não interferir.
    const novaJanela = window.open("", "_blank");
    setGerando(true);
    setErroRelatorio(null);
    try {
      const res = await fetch("/api/relatorios/cesta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(meta),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        if (novaJanela) novaJanela.close();
        throw new Error(d.error || "Erro ao gerar o relatório da cesta");
      }
      const html = await res.text();
      if (novaJanela) {
        novaJanela.document.open();
        novaJanela.document.write(html);
        novaJanela.document.close();
      }
      setModalRelatorio(false);
      if (meta.limparCesta) setAberto(false);
    } catch (e) {
      setErroRelatorio(e instanceof Error ? e.message : "Erro ao gerar o relatório");
    } finally {
      setGerando(false);
    }
  }, [meta]);

  return (
    <>
      <Sheet open={aberto} onOpenChange={setAberto}>
        <SheetTrigger asChild>
          <Button variant="outline" className="relative">
            <ShoppingCart className="h-4 w-4 mr-2" />
            Cesta
            {total > 0 && (
              <Badge className="ml-2 h-5 min-w-5 px-1.5 tabular-nums">{total}</Badge>
            )}
          </Button>
        </SheetTrigger>

        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              Cesta de itens
            </SheetTitle>
            <SheetDescription>
              Itens guardados para um relatório único de pesquisa de preços. A cesta fica
              salva na sua conta — se você sair sem gerar o relatório, ela continua aqui no
              próximo acesso.
            </SheetDescription>
          </SheetHeader>

          <div className="px-4 pb-4 space-y-3">
            {isLoading && (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando cesta…
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                {(error as Error).message}
              </div>
            )}

            {!isLoading && !error && itens.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
                <ShoppingCart className="h-8 w-8" />
                <p className="text-sm">Sua cesta está vazia.</p>
                <p className="text-xs">
                  Faça uma pesquisa e use <strong>Adicionar à cesta</strong> para juntar
                  vários itens em um só relatório.
                </p>
              </div>
            )}

            {itens.map((item) => (
              <LinhaItem key={item.id} item={item} />
            ))}

            {itens.length > 0 && (
              <>
                <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {fmtInt(total)} item(ns) · máx. {MAX_ITENS_CESTA}
                    </span>
                    <span className="text-lg font-bold text-primary">
                      {fmt(cesta?.valorTotal ?? 0, 2)}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Valor global estimado com os preços apurados quando cada item entrou na
                    cesta. O relatório refaz a pesquisa e usa os preços da data de emissão.
                  </p>
                  {(cesta?.itensSemPreco ?? 0) > 0 && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 flex items-start gap-1">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
                      {cesta?.itensSemPreco} item(ns) sem preço apurado não entram no total.
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  {podeGerarRelatorio ? (
                    <Button onClick={() => setModalRelatorio(true)}>
                      <FileText className="h-4 w-4 mr-2" />
                      Gerar relatório da cesta
                    </Button>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center">
                      Você não tem permissão para gerar relatórios.
                    </p>
                  )}
                  <Button
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    disabled={esvaziar.isPending}
                    onClick={() => setConfirmarLimpeza(true)}
                  >
                    {esvaziar.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 mr-2" />
                    )}
                    Esvaziar cesta
                  </Button>
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Confirmação — esvaziar */}
      <AlertDialog open={confirmarLimpeza} onOpenChange={setConfirmarLimpeza}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Esvaziar a cesta?</AlertDialogTitle>
            <AlertDialogDescription>
              Os {fmtInt(total)} item(ns) serão removidos da sua cesta. Esta ação não pode ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                esvaziar.mutate();
                setConfirmarLimpeza(false);
              }}
            >
              Esvaziar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Metadados do relatório consolidado */}
      <Dialog open={modalRelatorio} onOpenChange={setModalRelatorio}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Relatório consolidado da cesta</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-2">
            {fmtInt(total)} item(ns) serão pesquisados novamente para que o documento traga os
            preços da data de emissão. Os campos institucionais são opcionais.
          </p>
          <div className="grid gap-3 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Responsável pela pesquisa</Label>
                <Input
                  placeholder="Nome completo"
                  value={meta.responsavel}
                  onChange={(e) => setMeta((m) => ({ ...m, responsavel: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Cargo / Matrícula</Label>
                <Input
                  placeholder="Ex: Farmacêutico — Mat. 12345"
                  value={meta.cargo}
                  onChange={(e) => setMeta((m) => ({ ...m, cargo: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Órgão / Unidade</Label>
              <Input
                placeholder="Ex: Secretaria de Saúde — DIAF"
                value={meta.orgao}
                onChange={(e) => setMeta((m) => ({ ...m, orgao: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Nº do Processo / SEI</Label>
              <Input
                placeholder="Ex: 25000.123456/2025-01"
                value={meta.processo}
                onChange={(e) => setMeta((m) => ({ ...m, processo: e.target.value }))}
              />
            </div>
            <label className="flex items-start gap-2 rounded-md border bg-muted/30 p-2.5 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-primary"
                checked={meta.limparCesta}
                onChange={(e) => setMeta((m) => ({ ...m, limparCesta: e.target.checked }))}
              />
              <span className="text-xs">
                <span className="font-medium">Esvaziar a cesta depois de gerar</span>
                <span className="block text-muted-foreground">
                  Desmarque para manter os itens e gerar o relatório outra vez mais tarde.
                </span>
              </span>
            </label>
          </div>

          {erroRelatorio && (
            <p className="text-sm text-destructive flex items-start gap-1.5">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              {erroRelatorio}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setModalRelatorio(false)} disabled={gerando}>
              Cancelar
            </Button>
            <Button onClick={gerarRelatorio} disabled={gerando || total === 0}>
              {gerando ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Gerando…
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4 mr-2" />
                  Gerar e abrir PDF
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
