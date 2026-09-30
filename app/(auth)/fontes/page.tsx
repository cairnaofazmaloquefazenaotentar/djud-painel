"use client";

import { PageHeader } from "@/components/layout/page-header";
import { useFontes, fmtDataFonte } from "@/hooks/useFontes";
import type { FontesData } from "@/app/api/fontes/route";
import { ExternalLink, Loader2, Database, RefreshCw } from "lucide-react";

interface Fonte {
  nome:        string;
  sistema:     string;
  sistemaUrl?: string;
  dataKey:     keyof FontesData;
  descricao:   string;
}

const FONTES: Fonte[] = [
  {
    nome:      "Redmine",
    sistema:   "Tabela interna",
    dataKey:   "redmine",
    descricao: "Demandas judiciais de medicamentos registradas e acompanhadas pela COAJUD/DJUD.",
  },
  {
    nome:      "SISMAT Entradas",
    sistema:   "MicroStrategy",
    dataKey:   "sismatEntradas",
    descricao: "Movimentações de entrada (aquisição) de medicamentos no SISMAT.",
  },
  {
    nome:      "SISMAT Saídas",
    sistema:   "MicroStrategy",
    dataKey:   "sismatSaidas",
    descricao: "Baixas e entregas de medicamentos registradas no SISMAT.",
  },
  {
    nome:       "FNS",
    sistema:    "Painel FNS",
    sistemaUrl: "https://investsuspaineis.saude.gov.br/extensions/CGIN_PGTO_JUDICIAIS/CGIN_PGTO_JUDICIAIS.html",
    dataKey:    "fns",
    descricao:  "Pagamentos realizados via Ordem Bancária (SIAFI) para autores de ações judiciais.",
  },
];

export default function FontesPage() {
  const { data, isLoading, error, refetch, isFetching } = useFontes();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fontes de Dados"
        description="Origem, sistema e data da última atualização de cada base utilizada no Painel DJUD."
      />

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {/* Cabeçalho da tabela */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Database className="h-4 w-4" />
            <span>4 fontes cadastradas</span>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            {isFetching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Atualizar datas
          </button>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="text-left px-6 py-3 font-medium text-muted-foreground w-1/4">Nome</th>
              <th className="text-left px-6 py-3 font-medium text-muted-foreground w-1/4">Fonte</th>
              <th className="text-left px-6 py-3 font-medium text-muted-foreground w-1/2">Descrição</th>
              <th className="text-right px-6 py-3 font-medium text-muted-foreground whitespace-nowrap">Última atualização</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {FONTES.map((f) => (
              <tr key={f.nome} className="hover:bg-muted/20 transition-colors">
                <td className="px-6 py-4 font-medium">{f.nome}</td>
                <td className="px-6 py-4">
                  {f.sistemaUrl ? (
                    <a
                      href={f.sistemaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      {f.sistema}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="text-muted-foreground">{f.sistema}</span>
                  )}
                </td>
                <td className="px-6 py-4 text-muted-foreground">{f.descricao}</td>
                <td className="px-6 py-4 text-right tabular-nums">
                  {isLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground inline" />
                  ) : error ? (
                    <span className="text-destructive text-xs">Erro</span>
                  ) : (
                    <span className={data?.[f.dataKey] ? "font-medium" : "text-muted-foreground"}>
                      {fmtDataFonte(data?.[f.dataKey])}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="px-6 py-3 border-t border-border bg-muted/20 text-xs text-muted-foreground">
          A data exibida é a mais recente encontrada na base local.
        </div>
      </div>
    </div>
  );
}
