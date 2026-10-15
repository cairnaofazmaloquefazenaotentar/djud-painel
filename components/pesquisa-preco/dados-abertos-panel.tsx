"use client";

import { AlertTriangle, CloudDownload, Link2, Loader2, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  NOME_ORIGEM,
  useColetaDadosAbertos,
  useSituacaoDadosAbertos,
  type OrigemColetaTela,
} from "@/hooks/useDadosAbertos";

// ─────────────────────────────────────────────────────────────────────────────
// Painel "Dados abertos" do item pesquisado: quando cada origem foi coletada,
// se a coleta ainda vale (7 dias — P19), e os botões de coleta e de vínculo
// com o PNCP. A coleta nunca acontece sozinha: nem ao pesquisar, nem ao emitir
// relatório.
// ─────────────────────────────────────────────────────────────────────────────

const ORIGENS: OrigemColetaTela[] = ["COMPRASGOV", "BPS", "ARP_ITEM"];

const fmtDataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function DadosAbertosPanel({ codigo }: { codigo: string }) {
  const { data, isLoading, error } = useSituacaoDadosAbertos(codigo);
  const { estado, coletar, vincularPncp, cancelar } = useColetaDadosAbertos();

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">Consultando os dados abertos do item…</p>;
  }
  if (error) {
    return <p className="text-xs text-destructive">{(error as Error).message}</p>;
  }
  if (!data?.catmat || !data.porOrigem) {
    return (
      <p className="text-xs text-muted-foreground">
        Registro ANVISA sem CATMAT: as APIs de dados abertos são consultadas por CATMAT.
      </p>
    );
  }
  if (data.indisponivel) {
    return (
      <p className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        A base de dados abertos ainda não foi criada neste ambiente (scripts/create_dadosabertos_tables.py).
      </p>
    );
  }

  const porOrigem = data.porOrigem;
  const nuncaColetado = ORIGENS.every((o) => !porOrigem[o].coletadoEm && !porOrigem[o].registros);
  const vencida = ORIGENS.some((o) => porOrigem[o].coletadoEm && !porOrigem[o].valida);
  const pendentes = data.vinculosPendentes.length;

  return (
    <div className="rounded-md border bg-muted/20 p-3 space-y-2 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">Dados abertos — CATMAT {data.catmat}</span>
        <div className="flex flex-wrap gap-2">
          {estado.executando ? (
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={cancelar}>
              <Square className="mr-1.5 h-3 w-3" /> Interromper
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant={nuncaColetado || vencida ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => coletar(codigo)}
              >
                <CloudDownload className="mr-1.5 h-3.5 w-3.5" />
                {nuncaColetado ? "Coletar dados abertos" : "Atualizar dos dados abertos"}
              </Button>
              {pendentes > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => vincularPncp(codigo, data.vinculosPendentes)}
                >
                  <Link2 className="mr-1.5 h-3.5 w-3.5" />
                  Vincular ao PNCP ({pendentes} compra{pendentes === 1 ? "" : "s"})
                </Button>
              )}
            </>
          )}
        </div>
      </div>
      <div className="grid gap-1 sm:grid-cols-3">
        {ORIGENS.map((o) => {
          const s = porOrigem[o];
          return (
            <div key={o} className="rounded border bg-card px-2 py-1.5">
              <p className="font-medium">{NOME_ORIGEM[o]}</p>
              {s.coletadoEm || s.registros ? (
                <p className="text-muted-foreground">
                  {s.registros} registro(s)
                  {s.coletadoEm ? ` · ${s.origemCarga === "EXTRATOR" ? "carga do extrator" : "coletado"} em ${fmtDataHora(s.coletadoEm)}` : ""}
                  {s.coletadoEm && !s.valida && (
                    <Badge variant="secondary" className="ml-1 h-4 text-[10px]">
                      mais de 7 dias
                    </Badge>
                  )}
                  {s.status === "PARCIAL" && (
                    <Badge variant="secondary" className="ml-1 h-4 text-[10px]">
                      parcial
                    </Badge>
                  )}
                </p>
              ) : (
                <p className="text-muted-foreground">não coletado</p>
              )}
            </div>
          );
        })}
      </div>
      {(estado.mensagem || estado.executando) && (
        <p className="flex items-center gap-1.5 text-muted-foreground">
          {estado.executando && <Loader2 className="h-3 w-3 animate-spin" />}
          {estado.mensagem}
        </p>
      )}
      {estado.erro && <p className="text-destructive">{estado.erro}</p>}
      <p className="text-[11px] text-muted-foreground">
        Compras.gov.br (Painel de Preços) e BPS: compras dos últimos 36 meses; atas: vigência iniciada nos últimos 12
        meses. A coleta respeita o limite de ~100 consultas por minuto da API e pode levar alguns minutos em itens com
        muitas compras.
      </p>
    </div>
  );
}
