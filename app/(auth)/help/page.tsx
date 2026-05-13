"use client";

import { PageHeader } from "@/components/layout/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LEGAL_GLOSSARY } from "@/lib/legal-glossary";
import {
  BookOpen,
  HelpCircle,
  Shield,
  MessageCircle,
  Search,
} from "lucide-react";
import { useState } from "react";

// ── Matriz de permissões ──────────────────────────────────────────────────────

const PERMISSIONS_MATRIX = [
  { action: "Visualizar demandas",        admin: true,  manager: true,  operator: true  },
  { action: "Criar demandas",             admin: true,  manager: true,  operator: false },
  { action: "Editar demandas",            admin: true,  manager: true,  operator: false },
  { action: "Excluir demandas",           admin: true,  manager: false, operator: false },
  { action: "Restaurar da lixeira",       admin: true,  manager: true,  operator: false },
  { action: "Visualizar usuários",        admin: true,  manager: true,  operator: false },
  { action: "Criar / editar usuários",    admin: true,  manager: false, operator: false },
  { action: "Excluir usuários",           admin: true,  manager: false, operator: false },
  { action: "Exportar dados CSV/XLSX",    admin: true,  manager: true,  operator: false },
  { action: "Ver logs de auditoria",      admin: true,  manager: false, operator: false },
  { action: "Upload de anexos",           admin: true,  manager: true,  operator: false },
  { action: "Ver dashboard analítico",    admin: true,  manager: true,  operator: true  },
];

// ── FAQ ───────────────────────────────────────────────────────────────────────

const FAQ = [
  {
    q: "Como criar uma nova demanda?",
    a: "Acesse a página Demandas no menu lateral e clique em 'Nova Demanda'. Preencha os campos obrigatórios (marcados com *) e clique em 'Criar Demanda'.",
  },
  {
    q: "Excluí uma demanda por engano. Como recupero?",
    a: "As demandas excluídas ficam na Lixeira por 30 dias. Acesse Demandas → Lixeira (ícone de lixeira no menu) e clique em 'Restaurar'.",
  },
  {
    q: "Como filtrar demandas por medicamento?",
    a: "Na página Demandas, use o campo de busca para digitar o nome do princípio ativo. Você também pode usar o filtro 'Grupo Temático' para categorias específicas.",
  },
  {
    q: "O que é o TRF Região?",
    a: "Tribunal Regional Federal — instância judicial de 2º grau. O Brasil é dividido em 6 regiões, cada uma cobrindo determinados estados. Use este filtro para ver demandas de uma região judicial específica.",
  },
  {
    q: "Como exportar os dados para Excel?",
    a: "Na página Demandas, clique no botão 'XLSX' na barra de ações (canto superior direito). Para exportar apenas registros filtrados, aplique os filtros antes de exportar.",
  },
  {
    q: "Como alterar a minha senha?",
    a: "Acesse Configurações (ícone de engrenagem na sidebar) → seção 'Alterar Senha'. Informe a senha atual e a nova senha (mínimo 8 caracteres).",
  },
  {
    q: "Posso selecionar várias demandas e excluir de uma vez?",
    a: "Sim. Use as caixas de seleção na coluna esquerda da tabela. Após selecionar, aparece uma barra de ações com opções de exportar seleção ou excluir em lote.",
  },
  {
    q: "O que significa 'Ponto de Controle'?",
    a: "É o status jurídico-operacional atual da demanda. Indica em que etapa o processo se encontra (ex: 'Entrega Pendente' = aguardando entrega do medicamento; 'Cessar Atos' = liminar suspensa).",
  },
];

// ── Guia rápido ───────────────────────────────────────────────────────────────

const QUICK_GUIDE = [
  {
    step: "1",
    title: "Navegue pelo menu lateral",
    desc: "O menu à esquerda dá acesso a todas as seções: Dashboard (análises), Demandas (gestão), Usuários, Logs e esta Central de Ajuda. Passe o mouse para expandir.",
  },
  {
    step: "2",
    title: "Pesquise e filtre demandas",
    desc: "Na página Demandas, use a barra de filtros para buscar por número, título, medicamento, status, prioridade, TRF ou região. Os filtros se combinam automaticamente.",
  },
  {
    step: "3",
    title: "Crie e edite demandas",
    desc: "Clique em 'Nova Demanda' para criar. Para editar, clique no botão 'Editar' na linha da tabela. O formulário possui 4 seções: Básico, Classificação, Responsabilidades e Dados Judiciais.",
  },
  {
    step: "4",
    title: "Explore o Dashboard analítico",
    desc: "O Dashboard apresenta gráficos organizados em 5 abas: Tendência (evolução temporal), Dimensionamento (volume para ARPs), Riscos (gargalos), Geografia (distribuição regional) e Operacional (servidores).",
  },
  {
    step: "5",
    title: "Use atalhos de teclado",
    desc: "Ctrl+K: busca global | Ctrl+N: nova demanda | ?: ver todos os atalhos disponíveis | ESC: fechar modais.",
  },
];

// ── Componente principal ──────────────────────────────────────────────────────

export default function HelpPage() {
  const [glossarySearch, setGlossarySearch] = useState("");
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const filteredGlossary = LEGAL_GLOSSARY.filter(
    (term) =>
      term.term.toLowerCase().includes(glossarySearch.toLowerCase()) ||
      term.definition.toLowerCase().includes(glossarySearch.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Central de Ajuda"
        description="Guias, glossário, permissões e respostas às dúvidas mais frequentes."
      />

      <Tabs defaultValue="inicio">
        <TabsList className="mb-4">
          <TabsTrigger value="inicio" className="gap-1.5">
            <BookOpen className="h-3.5 w-3.5" />
            Primeiros Passos
          </TabsTrigger>
          <TabsTrigger value="faq" className="gap-1.5">
            <HelpCircle className="h-3.5 w-3.5" />
            FAQ
          </TabsTrigger>
          <TabsTrigger value="permissoes" className="gap-1.5">
            <Shield className="h-3.5 w-3.5" />
            Permissões
          </TabsTrigger>
          <TabsTrigger value="glossario" className="gap-1.5">
            <BookOpen className="h-3.5 w-3.5" />
            Glossário
          </TabsTrigger>
          <TabsTrigger value="contato" className="gap-1.5">
            <MessageCircle className="h-3.5 w-3.5" />
            Contato
          </TabsTrigger>
        </TabsList>

        {/* ── Primeiros Passos ──────────────────────────────────────────── */}
        <TabsContent value="inicio" className="space-y-4">
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-5">
            <h2 className="text-base font-semibold mb-1">Bem-vindo ao DJUD Painel</h2>
            <p className="text-sm text-muted-foreground">
              Este sistema é usado pela equipe DJUD/COAJUD do Ministério da Saúde para
              gestão, análise e acompanhamento das{" "}
              <span className="font-medium text-foreground">demandas judiciais de medicamentos</span>.
              Siga os passos abaixo para começar.
            </p>
          </div>

          <div className="space-y-3">
            {QUICK_GUIDE.map((item) => (
              <div
                key={item.step}
                className="flex gap-4 p-4 bg-card border border-border rounded-xl"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                  {item.step}
                </div>
                <div>
                  <p className="text-sm font-semibold mb-1">{item.title}</p>
                  <p className="text-sm text-muted-foreground">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* ── FAQ ───────────────────────────────────────────────────────── */}
        <TabsContent value="faq" className="space-y-2">
          <p className="text-sm text-muted-foreground mb-4">
            Respostas para as dúvidas mais comuns dos usuários do sistema.
          </p>
          {FAQ.map((item, i) => (
            <div key={i} className="border border-border rounded-xl overflow-hidden">
              <button
                className="w-full flex items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-muted/40 transition-colors"
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
              >
                <span className="text-sm font-medium">{item.q}</span>
                <span className="text-muted-foreground shrink-0 text-lg leading-none">
                  {openFaq === i ? "−" : "+"}
                </span>
              </button>
              {openFaq === i && (
                <div className="px-5 pb-4 pt-1 bg-muted/20">
                  <p className="text-sm text-muted-foreground">{item.a}</p>
                </div>
              )}
            </div>
          ))}
        </TabsContent>

        {/* ── Permissões ────────────────────────────────────────────────── */}
        <TabsContent value="permissoes" className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Matriz de permissões por função. Se uma ação não está disponível para você,
            entre em contato com um Administrador.
          </p>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Ação</th>
                  <th className="text-center px-4 py-3 font-medium text-destructive">Admin</th>
                  <th className="text-center px-4 py-3 font-medium text-amber-600 dark:text-amber-400">Gestor</th>
                  <th className="text-center px-4 py-3 font-medium text-primary">Operador</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {PERMISSIONS_MATRIX.map((row, i) => (
                  <tr key={i} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2.5 text-foreground">{row.action}</td>
                    <td className="px-4 py-2.5 text-center">{row.admin ? "✅" : "❌"}</td>
                    <td className="px-4 py-2.5 text-center">{row.manager ? "✅" : "❌"}</td>
                    <td className="px-4 py-2.5 text-center">{row.operator ? "✅" : "❌"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-sm text-amber-700 dark:text-amber-400">
            Para solicitar alteração de permissão, entre em contato com o Administrador do sistema
            ou abra um chamado na seção Contato.
          </div>
        </TabsContent>

        {/* ── Glossário ─────────────────────────────────────────────────── */}
        <TabsContent value="glossario" className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar termo..."
              value={glossarySearch}
              onChange={(e) => setGlossarySearch(e.target.value)}
              className="w-full pl-9 pr-3 h-9 rounded-md border border-input bg-transparent text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
            />
          </div>

          <div className="space-y-2">
            {filteredGlossary.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Nenhum termo encontrado para "{glossarySearch}".
              </p>
            ) : (
              filteredGlossary.map((term) => (
                <div
                  key={term.term}
                  className="p-4 bg-card border border-border rounded-xl space-y-1"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{term.term}</span>
                    {term.acronym && term.acronym !== term.term && (
                      <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20">
                        {term.acronym}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{term.definition}</p>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        {/* ── Contato ───────────────────────────────────────────────────── */}
        <TabsContent value="contato" className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-5 bg-card border border-border rounded-xl space-y-2">
              <p className="text-sm font-semibold">COAJUD — Coordenação de Ações Judiciais</p>
              <p className="text-xs text-muted-foreground">Dúvidas operacionais sobre demandas e processos.</p>
              <p className="text-sm font-medium text-primary">coajud@saude.gov.br</p>
            </div>
            <div className="p-5 bg-card border border-border rounded-xl space-y-2">
              <p className="text-sm font-semibold">CONJUR — Consultoria Jurídica</p>
              <p className="text-xs text-muted-foreground">Questões jurídicas e defesas processuais.</p>
              <p className="text-sm font-medium text-primary">conjur@saude.gov.br</p>
            </div>
            <div className="p-5 bg-card border border-border rounded-xl space-y-2 sm:col-span-2">
              <p className="text-sm font-semibold">Suporte Técnico do Sistema</p>
              <p className="text-xs text-muted-foreground">
                Problemas de acesso, erros no sistema ou solicitação de novas funcionalidades.
              </p>
              <p className="text-sm font-medium text-primary">suporte.djud@saude.gov.br</p>
            </div>
          </div>

          <div className="p-4 bg-muted/40 border border-border rounded-xl text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Informações do Sistema</p>
            <p>DJUD Painel v1.0.0 — Ministério da Saúde</p>
            <p>Base de dados: 51.401 demandas judiciais (Redmine — até março/2026)</p>
            <p>Tecnologia: Next.js + Prisma + PostgreSQL</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
