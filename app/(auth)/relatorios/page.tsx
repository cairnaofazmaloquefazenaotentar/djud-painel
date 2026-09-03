"use client";

import { useSession } from "next-auth/react";
import { hasPermission } from "@/lib/permissions";
import { BarChart3, FileText, ShieldCheck, Clock, Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

interface RelatorioCard {
  id: string;
  titulo: string;
  descricao: string;
  permission: string;
  status: "disponivel" | "em-breve";
  prazo?: string;
  icone: React.ElementType;
}

const relatorios: RelatorioCard[] = [
  {
    id: "pesquisa-preco",
    titulo: "Relatório de Pesquisa de Preços",
    descricao:
      "Documento padronizado conforme IN SEGES/ME nº 65/2021, com 10 seções: objeto, metodologia, fontes consultadas (CMED, BPS, SIASG, PNCP), análise estatística, remoção de outliers, preço de referência e assinaturas.",
    permission: "relatorios:gerar",
    status: "disponivel",
    icone: FileText,
  },
  {
    id: "arp",
    titulo: "Dimensionamento para ARP",
    descricao:
      "Estimativa de quantidades para Ata de Registro de Preços, com base no histórico de demandas judiciais e projeção por tendência linear.",
    permission: "relatorios:gerar",
    status: "em-breve",
    icone: BarChart3,
  },
  {
    id: "risco",
    titulo: "Análise de Risco e Prazos",
    descricao:
      "Mapeamento de demandas por risco de vencimento, prioridade e tempo médio de atendimento, com alertas para demandas críticas.",
    permission: "relatorios:executivo",
    status: "em-breve",
    icone: Clock,
  },
  {
    id: "executivo",
    titulo: "Panorama Executivo",
    descricao:
      "Visão consolidada de demandas ativas, orçamento comprometido, evolução mensal e indicadores-chave de desempenho (KPIs) para gestores.",
    permission: "relatorios:executivo",
    status: "em-breve",
    icone: BarChart3,
  },
];

export default function RelatoriosPage() {
  const { data: session } = useSession();

  const canAccess = hasPermission(session as any, "relatorios:gerar") ||
    hasPermission(session as any, "relatorios:executivo");

  if (!canAccess) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <ShieldCheck className="h-10 w-10" />
        <p className="text-sm">Você não tem permissão para acessar Relatórios.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Relatórios</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Geração de documentos analíticos para instrução de processos e tomada de decisão
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {relatorios.map((rel) => {
          const temPermissao = hasPermission(session as any, rel.permission);
          const Icon = rel.icone;

          return (
            <div
              key={rel.id}
              className="rounded-lg border bg-card p-5 space-y-3 flex flex-col"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="rounded-md bg-primary/10 p-2">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <h3 className="font-semibold text-sm">{rel.titulo}</h3>
                </div>
                <Badge
                  variant={rel.status === "disponivel" ? "default" : "secondary"}
                  className="shrink-0 text-xs"
                >
                  {rel.status === "disponivel" ? "Disponível" : "Em breve"}
                </Badge>
              </div>

              <p className="text-sm text-muted-foreground flex-1">{rel.descricao}</p>

              {rel.id === "pesquisa-preco" && rel.status === "disponivel" && temPermissao ? (
                <Button size="sm" className="w-full" asChild>
                  <Link href="/pesquisa-preco">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Ir para Pesquisa de Preço
                  </Link>
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="w-full"
                  disabled={rel.status === "em-breve" || !temPermissao}
                  title={!temPermissao ? "Sem permissão para este relatório" : undefined}
                >
                  <Download className="h-4 w-4 mr-2" />
                  {!temPermissao ? "Sem permissão" : "Gerar relatório"}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border bg-muted/30 p-4 text-xs text-muted-foreground">
        <p className="font-medium text-foreground mb-1">Nota</p>
        <p>
          Os relatórios de pesquisa de preços são gerados em PDF, conforme o modelo
          estabelecido pela IN SEGES/ME nº 65/2021. Os módulos de relatório serão
          disponibilizados nas próximas atualizações do sistema.
        </p>
      </div>
    </div>
  );
}
