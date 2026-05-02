# PRODUCT REQUIREMENTS DOCUMENT (PRD)
**Versão:** 2.0  
**Data:** Maio/2026  
**Analisador:** Claude — Design Engineer / UX Specialist  
**Baseline comparativo:** PRD v1.0 (estado pré-Sprint 8 + pré-tema shadcn)

---

## ÍNDICE

1. [Visão Geral do Produto](#1-visão-geral-do-produto)
2. [Arquitetura de Informação](#2-arquitetura-de-informação)
3. [Páginas e Funcionalidades](#3-páginas-e-funcionalidades)
4. [Componentes Globais](#4-componentes-globais)
5. [Funcionalidades Interativas](#5-funcionalidades-interativas)
6. [Integrações e Tecnologias](#6-integrações-e-tecnologias)
7. [Gaps Identificados](#7-gaps-identificados)
8. [Considerações Finais e Resumo](#8-considerações-finais-e-resumo)
9. [Análise Heurística de Nielsen](#9-análise-heurística-de-nielsen)
10. [Scorecard Comparativo v1 × v2](#10-scorecard-comparativo-v1--v2)

---

## 1. VISÃO GERAL DO PRODUTO

**URL:** `https://djud-painel.vercel.app` (produção) / `http://localhost:3000` (dev)  
**Plataforma:** SaaS Backoffice — Painel de Gestão Governamental  
**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Prisma ORM · PostgreSQL (Neon) · Auth.js v5 · shadcn/ui new-york · Tailwind CSS v4 · Framer Motion · Recharts · TanStack Table · Vercel

### OBJETIVO DO SISTEMA

O DJUD Painel é um sistema de backoffice para gestão das **Demandas Judiciais em Saúde** do Ministério da Saúde (DJUD). Seu objetivo é centralizar, monitorar e analisar os processos judiciais que obrigam o Ministério a fornecer medicamentos, insumos e serviços de saúde por via judicial.

- **Objetivo 1 — Dimensionamento da Demanda:** Quantificar o passivo judicial ativo (51.501+ processos importados do Redmine), com segmentação por grupo temático, tipo de medicamento, princípio ativo e região geográfica.
- **Objetivo 2 — Análise de Tendências:** Monitorar a evolução temporal das demandas (timeline por mês/ano) para identificar sazonalidade e crescimento da judicialização.
- **Objetivo 3 — Gestão de Riscos Processuais:** Identificar gargalos de status, demandas críticas e passivo de alta prioridade para apoiar decisões de alocação de recursos.
- **Objetivo 4 — Operação do Ciclo CRUD:** Permitir que gestores e operadores criem, editem, classifiquem e arquivem demandas com rastreabilidade completa via audit log.
- **Objetivo 5 — Exportação e Relatórios:** Gerar CSVs filtrados e PDFs individuais de demandas para uso em processos internos e petições.

### PÚBLICO-ALVO

| Papel | Perfil | Nível de acesso |
|-------|--------|-----------------|
| **ADMIN** | Coordenadores de TI / Gestão DJUD | Total (CRUD + exclusão + export + import + logs) |
| **MANAGER** | Analistas jurídicos e gestores de área | Gerenciamento (CRUD demandas, leitura usuários, export) |
| **OPERATOR** | Servidores e consultores | Somente leitura (dashboard + demandas) |

---

## 2. ARQUITETURA DE INFORMAÇÃO

O sistema usa **navegação lateral fixa** com sidebar collapsível (recolhe a 49px / expande a 240px via hover com Framer Motion). A topbar exibe breadcrumb contextual e menu de usuário.

### ESTRUTURA DE NAVEGAÇÃO

```
DJUD Painel (sidebar)
│
├── 📊 DASHBOARD                  /dashboard
│   ├── Indicadores Gerais         (4 metric cards)
│   ├── Tendência de Judicialização (timeline mensal)
│   ├── Dimensionamento da Demanda  (top medicamentos, grupo temático, objeto ação)
│   ├── Gestão de Riscos            (status, prioridade, risk bars)
│   ├── Análise Geográfica          (região brasil, TRF, UF)
│   └── Visão Operacional           (top responsáveis, valor estimado)
│
├── 📁 DEMANDAS                   /demandas
│   ├── Lista com filtros           (10 colunas, 7 filtros, paginação)
│   ├── Criar nova demanda          /demandas/new
│   └── Editar demanda              /demandas/[id]/edit
│
├── 👥 USUÁRIOS                   /users
│   ├── Lista com filtros           (nome, email, role, organização)
│   ├── Criar usuário               /users/new
│   └── Editar usuário              /users/[id]/edit
│
├── 🏢 ORGANIZAÇÕES               /organizations
│   └── Lista com form inline       (criar/editar modal inline)
│
├── 📋 LOGS                       /logs
│   └── Audit log tabular           (filtros: ação, entidade, usuário, data)
│
└── ⚙️ CONFIGURAÇÕES              /settings/profile
    └── Perfil do usuário           (info, troca de senha)
```

---

## 3. PÁGINAS E FUNCIONALIDADES

### 3.1 AUTENTICAÇÃO (`/login`)

**Tipo:** Página pública dedicada

**A) Formulário de credenciais**
- Campo Email: `<Input type="email">` shadcn, autocomplete="email"
- Campo Senha: `<Input type="password">` shadcn, autocomplete="current-password"
- Botão "Entrar": `<Button>` shadcn primário, full width, loading state com spinner
- Mensagem de erro: banner destrutivo com `<AlertCircle>` para credenciais inválidas

**B) Login social**
- Separador visual com "ou"
- Botão "Entrar com Google": OAuth 2.0, ícone SVG Google, loading state
- Restrição de domínio configurável via Auth.js

**C) Branding**
- Logo: ícone `Scale` (balança) roxo em card quadrado arredondado
- Título "DJUD Painel" + subtítulo "Demandas Judiciais em Saúde"
- Rodapé: "Ministério da Saúde · Sistema DJUD · v0.1.0"

**Tecnologia:** Auth.js v5 (credentials + Google OAuth), `<Card>` shadcn

---

### 3.2 DASHBOARD (`/dashboard`)

**Tipo:** Página autenticada, client component com TanStack Query

#### A) Indicadores Gerais (4 metric cards)

| Métrica | Fonte de dados | Ícone |
|---------|---------------|-------|
| Total de Demandas | `COUNT(*)` | FileText |
| Passivo Ativo | `COUNT WHERE status NOT IN resolvidos` | Activity |
| Demandas Críticas | `COUNT WHERE prioridade IN (Alta, Crítica)` | AlertTriangle |
| Taxa de Resolução | `resolvidas/total * 100` | TrendingUp |

**Filtros globais:** DateRange (dataInicio/dataFim), Status, Prioridade — todos via query params

#### B) Tendência de Judicialização
- `<TimelineChart>`: LineChart Recharts, agrupado por mês (DATE_TRUNC), últimos 24 meses
- Tooltip com valor absoluto por mês

#### C) Dimensionamento da Demanda (3 gráficos)
- `<TopMedicamentosChart>`: BarChart horizontal, top 15 princípios ativos
- `<AreaTematicaChart>`: BarChart, Grupo Temático (6 categorias)
- `<ObjetoAcaoChart>`: BarChart horizontal, Objeto da Ação

#### D) Gestão de Riscos Processuais
- `<StatusChart>`: BarChart por status Redmine (15+ valores)
- `<PrioridadeChart>`: PieChart com 4 fatias (Baixa/Média/Alta/Crítica)
- RiskBadge: barras de progresso coloridas por severidade

#### E) Análise Geográfica
- `<RegiaoBrasilChart>`: BarChart (5 regiões)
- `<TRFChart>`: BarChart (TRFs 1-6)
- `<UFChart>`: BarChart horizontal, top 10 UFs

#### F) Visão Operacional
- `<TopResponsaveisChart>`: BarChart top 10 responsáveis por demandas

---

### 3.3 DEMANDAS (`/demandas`)

**Tipo:** Página autenticada, DataTable com paginação server-side

#### Colunas da tabela

| # | Coluna | Fonte | Formatação |
|---|--------|-------|-----------|
| 1 | Nº DJUD | `numero` | `font-mono text-xs` |
| 2 | Nº Processo | `numeroProcesso` | `font-mono text-xs text-muted` |
| 3 | Título / Objeto | `titulo` + `objetoAcao` | truncado com tooltip |
| 4 | Grupo Temático | `areaTematica` | badge `bg-accent` com borda |
| 5 | Status | `status` | `<StatusBadge>` colorido |
| 6 | Prior. | `prioridade` | `<StatusBadge>` |
| 7 | TRF | `trfRegiao` | "Xª Região" |
| 8 | Região | `regiaoBrasil` | texto simples |
| 9 | Entrada DJUD | `dataEntradaDJUD` | `pt-BR` date |
| 10 | Responsável | `responsavel.name` | texto simples |
| 11 | Ações | — | botões Edit / Delete |

#### Filtros disponíveis (FilterBar)

| Filtro | Tipo | Valores |
|--------|------|---------|
| Busca | Input text | numero, titulo, processo, medicamento |
| Status | Select shadcn | 11 valores Redmine + originais |
| Prioridade | Select shadcn | Baixa / Média / Alta / Crítica |
| Grupo Temático | Select shadcn | 6 categorias Redmine |
| TRF Região | Select shadcn | 1ª a 6ª Região |
| Região Brasil | Select shadcn | 5 regiões |

**Ações disponíveis por role:**
- ADMIN/MANAGER: Editar (`/demandas/[id]/edit`), Deletar (ConfirmDialog), Exportar CSV
- OPERATOR: somente leitura (botões com `<Lock>` desabilitados)

**Paginação:** server-side, `pageSize=10`, totalPages exibido, botões Anterior/Próxima

---

### 3.4 FORMULÁRIO DE DEMANDA (`/demandas/[id]/edit` e `/demandas/new`)

**Tipo:** Página autenticada, react-hook-form + Zod resolver

#### Campos do formulário

**Dados básicos:**
- `numero` (text, required, único — disabled em modo edit)
- `titulo` (text, required, min 3 chars)
- `descricao` (textarea, required, min 10 chars)
- `status` (select, 11 opções)
- `prioridade` (select: Baixa/Média/Alta/Crítica)

**Campos judiciais (Sprint 8):**
- `numeroProcesso` (text, padrão CNJ)
- `areaTematica` / Grupo Temático (select)
- `trfRegiao` (select 1-6)
- `regiaoBrasil` (select 5 regiões)
- `objetoAcao` (text)
- `principioAtivo` / Medicamento (text)
- `dataEntradaDJUD` (date)

**Relacionamentos:**
- `organizacaoId` (async select — fetch `/api/organizations`)
- `responsavelId` (async select — fetch `/api/users`)

**Validação:**
- Client-side: `zodResolver(createDemandaSchema / updateDemandaSchema)`
- Server-side: revalidado na API route
- Feedback: mensagens de erro abaixo de cada campo

---

### 3.5 USUÁRIOS (`/users`)

**Tipo:** DataTable similar a Demandas

**Colunas:** Nome, Email, Role (badge), Organização, Criado em, Ações  
**Filtros:** Busca (nome/email), Role (select)  
**Ações ADMIN:** Criar (`/users/new`), Editar (`/users/[id]/edit`), Deletar

**Formulário de usuário** (`/users/[id]/edit`):
- Nome, Email, Senha (opcional em edição), Role, Organização

---

### 3.6 ORGANIZAÇÕES (`/organizations`)

**Tipo:** DataTable + form inline (modal na própria página)

**Colunas:** Nome, Slug, Status (Ativo/Inativo), Usuários, Demandas, Ações  
**Form inline:** nome (text, required), slug (text, unique), ativo (checkbox)  
**Validação:** duplicidade de slug verificada via API  
**Permissões:** ADMIN apenas pode criar/editar/deletar

---

### 3.7 LOGS DE AUDITORIA (`/logs`)

**Tipo:** DataTable read-only, sem ações de modificação

**Colunas:** Data/hora, Usuário, Ação (badge colorido), Entidade, ID, Detalhes (expandível)  
**Filtros:** Busca, Ação (CREATE/READ/UPDATE/DELETE/LOGIN/EXPORT/IMPORT), Entidade, DateRange  
**Exportação CSV:** disponível para ADMIN  
**Cores das ações:**
- CREATE → verde (active)
- UPDATE → laranja (warning)
- DELETE → vermelho (error)
- LOGIN → verde (active)
- EXPORT/IMPORT → amarelo (pending)

---

### 3.8 CONFIGURAÇÕES — PERFIL (`/settings/profile`)

**Seções:**
- **Informações da conta:** nome, email, role (somente leitura), organização
- **Troca de senha:** senha atual, nova senha, confirmação — validação client-side
- **Descrição do papel:** card explicativo com permissões do role atual

---

## 4. COMPONENTES GLOBAIS

### 4.1 SIDEBAR (Navegação lateral)

**Tipo:** `position: fixed`, Framer Motion, `z-index: 40`

| Estado | Largura | Conteúdo |
|--------|---------|----------|
| Recolhido (padrão) | 49px (3.05rem) | Apenas ícones centralizados |
| Expandido (hover) | 240px (15rem) | Ícone + label + descrição |

**Animação:** `type: "tween"`, `ease: "easeOut"`, `duration: 0.2s`  
**Labels:** `x: -20 → 0` + `opacity: 0 → 1` (Framer Motion `variants`)  
**ScrollArea:** `@radix-ui/react-scroll-area` para o conteúdo central

**Header:** Logo DJUD (Scale icon roxo) + dropdown "Ministério da Saúde / v0.1.0"

**Navegação agrupada:**
1. Dashboard · Demandas
2. `<Separator>` · Usuários · Organizações
3. `<Separator>` · Logs

**Footer:** Link Configurações + Dropdown do usuário (nome, email, role, Meu Perfil, Sair)

**Active state:** `bg-sidebar-primary text-sidebar-primary-foreground` (oklch primary)  
**Hover state:** `bg-sidebar-accent/15`

---

### 4.2 TOPBAR

**Tipo:** `position: sticky top-0`, altura 64px

- **Esquerda:** Breadcrumb contextual ("DJUD > Demandas")
- **Direita:** Badge do papel do usuário + `<Avatar>` com iniciais + `<DropdownMenu>` (Meu Perfil, Configurações, Sair)
- **Background:** `bg-background border-b border-border`

---

### 4.3 LAYOUT AUTENTICADO

```
┌─ Sidebar (fixed, 49px/240px) ─────────────────────────────────────┐
│ Logo | Nav items | User footer                                      │
└────────────────────────────────────────────────────────────────────┘
┌─ Main content (ml-[3.05rem] md) ───────────────────────────────────┐
│ ┌─ Topbar (h-16) ──────────────────────────────────────────────┐   │
│ │ Breadcrumb                          Role badge | Avatar       │   │
│ └──────────────────────────────────────────────────────────────┘   │
│ ┌─ Page content (p-6, overflow-auto) ──────────────────────────┐   │
│ │ <PageHeader title description actions />                      │   │
│ │ <FilterBar> + <DataTable> / Charts                            │   │
│ └──────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────┘
```

---

### 4.4 PALETA DE CORES — TEMA DJUD (oklch, new-york)

**Modo claro (`:root`):**

| Token | oklch | Uso |
|-------|-------|-----|
| `--background` | `oklch(0.9842 0.0034 247.86)` | Fundo da aplicação |
| `--foreground` | `oklch(0.2795 0.0368 260.03)` | Texto principal |
| `--primary` | `oklch(0.5017 0.2796 265.45)` | Cor de ação principal (roxo) |
| `--primary-foreground` | `oklch(1.0000 0 0)` | Texto sobre primário (branco) |
| `--card` | `oklch(1.0000 0 0)` | Fundo dos cards |
| `--sidebar-primary` | `oklch(0.5854 0.2041 277.12)` | Item ativo sidebar |
| `--muted` | `oklch(0.9670 0.0029 264.54)` | Fundo secundário/muted |
| `--destructive` | `oklch(0.6280 0.2577 29.23)` | Vermelho (erros, deletar) |
| `--border` | `oklch(0.8717 0.0093 258.34)` | Bordas |

**Modo escuro (`.dark`):** versões invertidas com valores similares ajustados para contraste.

**Fontes:**
- Sans-serif: Inter (variável `--font-sans`)
- Serif: Merriweather (variável `--font-serif`)
- Mono: JetBrains Mono (variável `--font-mono`)
- Carregamento: `next/font/google` (zero layout shift)

**Border radius:** `--radius: 0.5rem` (8px base)

---

### 4.5 COMPONENTES UI INSTALADOS (shadcn/ui new-york)

| Componente | Caminho | Uso |
|-----------|---------|-----|
| `<Button>` | `ui/button` | Ações primárias e secundárias |
| `<Card>` | `ui/card` | Containers de conteúdo |
| `<Input>` | `ui/input` | Campos de texto (h-9, ring focus) |
| `<Label>` | `ui/label` | Rótulos de formulário |
| `<Select>` | `ui/select` | Dropdowns animados (Radix) |
| `<Badge>` | `ui/badge` | Tags de status e role |
| `<Table>` | `ui/table` | Tabelas com header muted |
| `<Skeleton>` | `ui/skeleton` | Loading states |
| `<Avatar>` | `ui/avatar` | Foto/iniciais de usuário |
| `<Dialog>` | `ui/dialog` | Modais |
| `<AlertDialog>` | `ui/alert-dialog` | ConfirmDialog (deletar) |
| `<DropdownMenu>` | `ui/dropdown-menu` | Menus contextuais |
| `<Separator>` | `ui/separator` | Divisores visuais |
| `<Tooltip>` | `ui/tooltip` | Hints informativos |
| `<Progress>` | `ui/progress` | Barras de progresso |
| `<Tabs>` | `ui/tabs` | Abas de conteúdo |
| `<Textarea>` | `ui/textarea` | Campos de texto longo |
| `<ScrollArea>` | `ui/scroll-area` | Área de scroll customizada |

---

## 5. FUNCIONALIDADES INTERATIVAS

### 5.1 Dashboard com Filtros Globais

**Plataforma:** TanStack Query (`useMetrics` hook), API `/api/demandas/metrics`  
**Localização:** `/dashboard` — persistido em query string  
**Funcionalidades:**
- Filtro por período (DateRange com 2 inputs date)
- Filtro por Status (select)
- Filtro por Prioridade (select)
- Botão "Atualizar" com RotateCcw + spinner Loader2
- Todos os 10 gráficos refrescam simultaneamente ao aplicar filtros

### 5.2 DataTable Paginada (Demandas, Usuários, Logs)

**Tipo:** TanStack Table v8 + paginação server-side  
**Campos buscáveis:** texto livre + selects múltiplos  
**Comportamento:**
- Skeleton loading (animação pulse) durante fetch
- EmptyState com CTA contextual se lista vazia
- Hover highlight nas linhas
- Paginação com botões: primeira, anterior, próxima, última

### 5.3 Formulário CRUD com Validação

**Tipo:** Page dedicada react-hook-form + Zod  
**Campos:**
- Campos básicos: text, textarea, date, select (native)
- Async selects: carregamento de organizações/usuários via fetch
- `numero`: disabled em modo edição (imutável)

**Comportamento:**
- Erros inline abaixo de cada campo
- Loading state no botão de submit durante `fetch PUT/POST`
- Redirect automático para lista após sucesso
- Botão "Cancelar" retorna sem salvar (`router.back()`)

### 5.4 Exportação CSV

**Plataforma:** Fetch client-side → Blob → `<a>` download  
**Localização:** Botão "Exportar CSV" na toolbar de Demandas e Logs  
**Funcionalidades:**
- Exporta até 5.000 registros com filtros ativos aplicados
- 13 colunas: Número DJUD, Processo, Título, Status, Prioridade, Grupo Temático, TRF, Região, Objeto, Princípio Ativo, Data Entrada, Responsável, Criado em
- Encoding UTF-8 com BOM para Excel
- Nomenclatura automática: `demandas_YYYY-MM-DD.csv`

### 5.5 Export PDF (por demanda)

**Plataforma:** `@react-pdf/renderer`  
**Endpoint:** `POST /api/demandas/[id]/export-pdf`  
**Funcionalidades:**
- Geração server-side de PDF individual por demanda
- Download via stream com `Content-Disposition: attachment`

### 5.6 Upload de Anexos (por demanda)

**Plataforma:** Multipart FormData → `@vercel/blob` (cloud) ou local fallback  
**Endpoints:** `POST/GET /api/demandas/[id]/attachments`, `DELETE /api/demandas/[id]/attachments/[id]`  
**Preview:** `/api/attachments/[id]/preview` — serve arquivo com headers de cache  
**Componente:** `<AttachmentsManager>` com `<FilePreviewModal>` (PDF viewer + Image lightbox)

### 5.7 Sidebar Animada

**Plataforma:** Framer Motion 12  
**Comportamento:**
- `onMouseEnter` → expand (240px)
- `onMouseLeave` → collapse (49px)
- Transição `easeOut` 200ms
- Labels: slide-in `x: -20→0` + fade `opacity: 0→1`
- Persiste estado em `useState(true)` (começa colapsada)

### 5.8 Controle de Acesso por Role (RBAC)

**Plataforma:** Next.js Middleware + `rolePermissions` map  
**Funcionalidades:**
- Permissões granulares: `demandas:read`, `demandas:write`, `demandas:delete`, `export:csv`, etc.
- Botões de ação condicionais: desabilitados com ícone `<Lock>` para roles sem permissão
- Rotas protegidas: redirect para `/login` se sem sessão
- Audit log automático em todas as operações write

---

## 6. INTEGRAÇÕES E TECNOLOGIAS

### 6.1 Framework e Runtime

| Tecnologia | Versão | Uso |
|-----------|--------|-----|
| **Next.js** | 16.2.4 | App Router, Server Components, API Routes |
| **React** | 19.2.4 | UI components, Suspense, RSC |
| **TypeScript** | ^5 | Tipagem estática |
| **Node.js** | ≥ 20 | Runtime server-side |

### 6.2 Banco de Dados e ORM

| Tecnologia | Versão | Uso |
|-----------|--------|-----|
| **Prisma** | ^5.13.0 | ORM, migrations, type-safe queries |
| **PostgreSQL (Neon)** | Serverless | Banco principal, connection pooling |
| **Neon** | — | PostgreSQL serverless, `DATABASE_URL` env |

### 6.3 Autenticação

| Tecnologia | Versão | Uso |
|-----------|--------|-----|
| **Auth.js (NextAuth)** | v5 beta | Credentials + Google OAuth |
| **bcryptjs** | ^3.0.3 | Hash de senhas |
| **@auth/prisma-adapter** | ^2.11.2 | Persistência de sessões no Prisma |

### 6.4 UI / Design System

| Tecnologia | Versão | Uso |
|-----------|--------|-----|
| **shadcn/ui** | new-york | Componentes de UI baseados em Radix |
| **Tailwind CSS** | v4 | Utility-first CSS |
| **radix-ui** | ^1.4.3 | Primitivos acessíveis (Select, Dialog, etc.) |
| **Framer Motion** | ^12.38.0 | Animações sidebar |
| **lucide-react** | ^1.14.0 | Ícones SVG |
| **class-variance-authority** | ^0.7.1 | Variantes de componentes |
| **tailwind-merge** | ^3.5.0 | Merge seguro de classes |

### 6.5 Dados e Tabelas

| Tecnologia | Versão | Uso |
|-----------|--------|-----|
| **@tanstack/react-table** | ^8.17.0 | DataTable client-side |
| **@tanstack/react-query** | ^5.45.0 | Cache e fetching de métricas |
| **Recharts** | ^2.12.0 | Gráficos do dashboard (10 tipos) |
| **zod** | ^3.22.0 | Validação client + server |
| **react-hook-form** | ^7.51.0 | Gerenciamento de formulários |
| **@hookform/resolvers** | ^5.2.2 | Integração Zod + react-hook-form |

### 6.6 Exportação e Arquivos

| Tecnologia | Versão | Uso |
|-----------|--------|-----|
| **@react-pdf/renderer** | ^4.5.1 | Geração de PDFs |
| **@vercel/blob** | ^2.3.3 | Armazenamento de anexos (cloud) |
| **pdfjs-dist** | ^5.7.284 | Preview de PDFs no browser |
| **yet-another-react-lightbox** | ^3.31.0 | Lightbox de imagens |
| **xlsx** | ^0.18.5 | Leitura de planilhas Excel (import) |

### 6.7 Comunicação

| Tecnologia | Versão | Uso |
|-----------|--------|-----|
| **Resend** | ^3.0.0 | Envio de emails com PDF anexado |
| **Sonner** | ^1.4.0 | Toast notifications |

### 6.8 Deploy e Infraestrutura

| Serviço | Uso |
|---------|-----|
| **Vercel** | Deploy serverless, CI/CD via GitHub Actions |
| **GitHub Actions** | CI (TypeScript + ESLint) + CD (deploy Vercel) |
| **Neon** | PostgreSQL serverless com branching |

---

## 7. GAPS IDENTIFICADOS

### 7.1 UX — Feedback Visual Incompleto

**Problemas:**
- Formulário de criação/edição não exibe toast de sucesso após salvar
- Erro de validação server-side (4xx) não é exibido ao usuário de forma amigável
- Ausência de breadcrumb dentro dos formulários (não há "Demandas > Editar #1234")
- Topbar breadcrumb não inclui o ID da demanda em `/demandas/[id]/edit`

**Implicações:** Usuário não tem confirmação visual de que a operação foi bem-sucedida; pode submeter o formulário várias vezes.

**Recomendação:** Integrar `sonner` toast em todos os submit handlers; adicionar segmento de ID no breadcrumb da Topbar.

---

### 7.2 Responsividade Mobile

**Problemas:**
- Sidebar: oculta completamente em `< md` (768px), sem menu hamburguer alternativo
- DataTable com 10+ colunas não scrollá bem em telas < 1024px
- FilterBar com grid `lg:grid-cols-3 xl:grid-cols-4` empilha incorretamente em tablet
- Dashboard com gráficos em grid 2-col pode causar overflow em 768px

**Implicações:** Sistema inacessível em smartphones e parcialmente inacessível em tablets.

**Recomendação:** Adicionar `<Sheet>` (drawer) shadcn como menu mobile; implementar colunas responsivas no DataTable.

---

### 7.3 Funcionalidades Incompletas / Stubs

**Problemas:**
- `lib/stripe.ts` — mantido por compatibilidade, retorna null; não integrado
- Configurações de perfil — troca de senha implementada, mas sem verificação de email
- Upload de imagem de avatar — campo `image` existe no schema, UI não permite upload
- Página `/organizations` — form inline funciona, mas sem paginação (carrega todos)
- Dashboard — botão "Relatório" referenciado no plano mas não implementado na UI atual

**Recomendação:** Remover `lib/stripe.ts`; implementar upload de avatar; adicionar paginação na lista de organizações.

---

### 7.4 Acessibilidade (a11y)

**Problemas:**
- Sidebar: `<button>` de trigger do usuário sem `aria-label`
- Imagens/ícones em botões sem texto alternativo em alguns locais
- Foco visual: `outline-ring/50` configurado, mas não testado com teclado
- DataTable: sem `role="table"` explícito além do element semântico
- Cores de status (verde/vermelho) usadas sem ícone de reforço para daltônicos

**Recomendação:** Auditar com `axe-core`; adicionar `aria-label` nos botões icon-only; reforçar estados com ícone + cor.

---

### 7.5 Performance com 51.501 Registros

**Problemas:**
- Paginação server-side implementada, mas `totalCount` faz `COUNT(*)` sem índice composto
- `groupBy` nas métricas sem `LIMIT` pode retornar tabelas completas em queries lentas
- `$queryRaw DATE_TRUNC` não usa índice em `criadoEm` se não indexado

**Recomendação:** Adicionar índice composto `(status, criadoEm)`; adicionar `LIMIT` nas queries de distribution.

---

## 8. CONSIDERAÇÕES FINAIS E RESUMO

### 8.1 RESUMO EXECUTIVO

O DJUD Painel v2.0 representa uma evolução significativa sobre o MVP v1.0. O sistema passou de uma aplicação funcional com HTML cru para um **design system coeso** baseado em shadcn/ui new-york, com tema oklch personalizado, fontes Inter/Merriweather/JetBrains Mono via `next/font`, e sidebar animada com Framer Motion.

A Sprint 8 adicionou importação de 51.501 demandas do Redmine (Excel), com 7 novos campos judiciais (grupo temático, TRF, região, princípio ativo, número do processo, etc.), e o dashboard foi completamente redesenhado orientado à tese de doutorado (dimensionamento, tendência, gestão de riscos).

### 8.2 MAPA DE PÁGINAS

**Páginas completas (11):**
1. `/login` — Autenticação com credenciais + Google OAuth
2. `/dashboard` — Painel analítico com 10 gráficos + 4 métricas
3. `/demandas` — Lista com 7 filtros, 10 colunas, paginação server-side
4. `/demandas/[id]/edit` — Formulário CRUD completo (22 campos)
5. `/demandas/new` — Mesmo formulário em modo criação
6. `/users` — Lista de usuários com filtros
7. `/users/[id]/edit` — Formulário de usuário
8. `/users/new` — Criar usuário
9. `/organizations` — Lista + form inline de organizações
10. `/logs` — Audit log com filtros e export
11. `/settings/profile` — Perfil + troca de senha

**Páginas ausentes / stub:**
1. `/reports` — Relatórios batch (planejado Sprint 6)
2. `/settings/team` — Gerenciar membros de organização (planejado)
3. `/settings/integrations` — Integrações externas (planejado)
4. `/demandas/[id]` — View page detalhada (apenas edit existe)

### 8.3 PONTOS FORTES

1. **Design System Consistente** — shadcn/ui new-york com CSS variables oklch, sem cores hardcoded, modo escuro pronto
2. **RBAC Granular** — 3 roles com 20+ permissões, botões desabilitados com feedback visual
3. **Audit Log Completo** — todas as operações write rastreadas com before/after
4. **Dados Reais** — 51.501 demandas importadas do Redmine com campos judiciais específicos
5. **Dashboard Orientado à Tese** — 10 gráficos alinhados com os 3 pilares da pesquisa
6. **Sidebar Animada** — UX moderna com Framer Motion, zero reflow, performance suave

### 8.4 OPORTUNIDADES DE MELHORIA PRIORITÁRIAS

1. **Mobile-first** — Menu hamburguer + Sheet para sidebar em telas < 768px
2. **Toasts de feedback** — Integrar Sonner em todos os formulários
3. **Detalhes da demanda** — Página `/demandas/[id]` (view mode com attachments)
4. **Filtros avançados** — Multi-select e combinação AND/OR para DataTable
5. **Dark mode toggle** — Botão visível na Topbar para alternar tema
6. **Testes E2E** — Playwright para fluxos críticos (login, CRUD demanda, export)

### 8.5 PRINCIPAIS FUNCIONALIDADES (v2.0)

✓ Autenticação (credenciais + Google OAuth)  
✓ Dashboard analítico com 10 gráficos e filtros globais  
✓ CRUD completo de Demandas (22 campos + validação Zod)  
✓ Importação de 51.501 demandas do Excel Redmine  
✓ CRUD de Usuários com RBAC (3 roles, 20+ permissões)  
✓ Gestão de Organizações  
✓ Audit Log completo com filtros e export CSV  
✓ Upload e preview de anexos (PDF + imagem)  
✓ Export PDF individual de demandas  
✓ Export CSV com filtros ativos  
✓ Sidebar animada (hover-to-expand, Framer Motion)  
✓ Tema shadcn/ui new-york com oklch, fontes Google via next/font  

### 8.6 STACK TECNOLÓGICO

- **Frontend:** Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui · Framer Motion
- **Backend:** Next.js API Routes · Prisma 5 · PostgreSQL (Neon serverless)
- **Auth:** Auth.js v5 · bcryptjs · Google OAuth
- **Charts:** Recharts 2 · TanStack Table 8 · TanStack Query 5
- **Forms:** react-hook-form 7 · Zod 3 · @hookform/resolvers
- **Files:** @vercel/blob · @react-pdf/renderer · pdfjs-dist · xlsx
- **Deploy:** Vercel · GitHub Actions (CI/CD)

---

## 9. ANÁLISE HEURÍSTICA DE NIELSEN

**Contexto:** Avaliação do DJUD Painel v2.0 (pós shadcn/ui theme + sidebar Framer Motion + Sprint 8) em comparação com v1.0 (MVP HTML cru, sem design system).  
**Método:** Inspeção heurística baseada em análise de código-fonte e arquitetura de componentes.  
**Base metodológica:** Jakob Nielsen — 10 Heurísticas de Usabilidade (1994)

### 9.1 VISÃO GERAL POR HEURÍSTICA

| Heurística (Nielsen) | v1.0 | v2.0 | Δ | Principais impactos de negócio |
|---|:---:|:---:|:---:|---|
| H1 — Visibilidade do status do sistema | 5 | 7 | +2 | Loading states, skeletons, badges de status |
| H2 — Compatibilidade com o mundo real | 7 | 8 | +1 | Terminologia judicial, status Redmine preservados |
| H3 — Controle e liberdade do usuário | 5 | 6 | +1 | Cancelar form, limpar filtros, ConfirmDialog |
| H4 — Consistência e padrões | 3 | 8 | +5 | Design system uniforme, shadcn em toda a UI |
| H5 — Prevenção de erros | 5 | 7 | +2 | Validação Zod client+server, ConfirmDialog |
| H6 — Reconhecimento em vez de memorização | 6 | 8 | +2 | Labels visíveis, badges de role, sidebar com labels |
| H7 — Flexibilidade e eficiência de uso | 4 | 6 | +2 | Export CSV, filtros múltiplos, sidebar compacta |
| H8 — Estética e design minimalista | 3 | 8 | +5 | shadcn new-york, oklch, hierarquia tipográfica |
| H9 — Diagnóstico e recuperação de erros | 5 | 6 | +1 | Mensagens Zod em PT-BR, AlertCircle no login |
| H10 — Ajuda e documentação | 2 | 3 | +1 | Descrições de role no perfil, tooltips parciais |
| **MÉDIA** | **4.5** | **6.7** | **+2.2** | |

> Escala: 1 (crítico) → 10 (excelente)

---

### 9.2 ACHADOS DETALHADOS POR HEURÍSTICA

#### H1 — Visibilidade do status do sistema

**Pontos fortes (v2.0)**
- `<Skeleton>` em todas as DataTables durante loading (antes: sem indicador)
- `<Loader2 animate-spin>` nos botões de submit durante fetch
- `<StatusBadge>` com cores semânticas em demandas (verde/laranja/vermelho)
- Badge de papel do usuário visível na Topbar (ADMIN/MANAGER/OPERATOR)
- Contador de registros no PageHeader ("1.234 demandas encontradas")

**Problemas / oportunidades**
- ❌ Ausência de toast de sucesso após salvar formulário (usuário não sabe se funcionou)
- ❌ Erro 500 server-side não exibido ao usuário (apenas console.error)
- ❌ Sem indicador de conexão offline ou timeout de API

---

#### H2 — Compatibilidade com o mundo real

**Pontos fortes (v2.0)**
- Terminologia judicial preservada: TRF, Princípio Ativo, NUP/SEI, DJUD, COAJUD, CONJUR
- Status Redmine reais: "Em Análise COAJUD", "Cessar Atos", "Entrega Pendente"
- Número de processo no padrão CNJ (NNNNNNN-DD.AAAA.J.TT.OOOO)
- Datas em `pt-BR` (`toLocaleDateString("pt-BR")`) em toda a UI
- Grupos temáticos alinhados à classificação real do Ministério

**Problemas / oportunidades**
- ⚠️ "Prioridade: Media" (sem acento) no código — inconsistência com "Média" exibido
- ⚠️ Tooltip "Excluir demanda" usa "Deletar" (anglicismo) — deveria ser "Excluir"

---

#### H3 — Controle e liberdade do usuário

**Pontos fortes (v2.0)**
- `<ConfirmDialog>` antes de qualquer exclusão destrutiva
- Botão "Cancelar" nos formulários retorna sem salvar
- Botão "Limpar filtros" com indicador de filtros ativos (`isActive`)
- Paginação com navegação completa (primeira/anterior/próxima/última)

**Problemas / oportunidades**
- ❌ Sem "desfazer" após exclusão (toast com ação Undo)
- ❌ Formulário longo sem auto-save de rascunho (perda de dados em F5)
- ❌ Filtros não persistem na URL (perda ao navegar para outra página e voltar)

---

#### H4 — Consistência e padrões

**Pontos fortes (v2.0)**
- **Design system unificado**: shadcn/ui new-york em 100% das páginas
- Cores semânticas via CSS variables oklch (zero hardcoded)
- Botões: primary/outline/ghost/destructive consistentes
- Typography: Inter (sans), `text-sm font-medium` para labels, `text-xs` para meta
- Active state sidebar único (roxo primary) em todos os itens
- `<PageHeader>` com `<Separator>` padronizado em todas as páginas

**Problemas / oportunidades**
- ⚠️ `settings/profile` usa `<input>` HTML em alguns campos (não migrado para shadcn Input)
- ⚠️ Cores ROLE_COLORS em `profile/page.tsx` usam Tailwind hardcoded (`bg-red-100`) ao invés de CSS vars

---

#### H5 — Prevenção de erros

**Pontos fortes (v2.0)**
- Validação client-side com Zod: campo obrigatório, mínimo de caracteres
- Campo `numero` desabilitado em modo edição (não pode ser alterado acidentalmente)
- `<ConfirmDialog>` com texto descritivo antes de exclusão ("Esta ação não pode ser desfeita")
- Validação de email no formulário de login (type="email")

**Problemas / oportunidades**
- ❌ Sem confirmação antes de sair de formulário com alterações não salvas
- ❌ Upload de arquivo sem validação de tamanho máximo exibida ao usuário
- ❌ Criar demanda com `numero` duplicado: erro da API, mas mensagem não associada ao campo correto

---

#### H6 — Reconhecimento em vez de memorização

**Pontos fortes (v2.0)**
- Sidebar com labels visíveis ao hover (não é necessário memorizar ícones)
- FilterBar com labels explícitos acima de cada campo
- Breadcrumb contextual na Topbar
- Badge de role do usuário sempre visível na Topbar
- Colunas da DataTable com cabeçalhos descritivos e sublinhados

**Problemas / oportunidades**
- ❌ Botões de ação na tabela (Edit/Delete) sem label — apenas ícone (Edit2, Trash2)
- ⚠️ Gráficos do dashboard sem legenda de unidade nos eixos Y (ex: "nº de processos")

---

#### H7 — Flexibilidade e eficiência de uso

**Pontos fortes (v2.0)**
- Export CSV com 13 colunas e filtros aplicados (atalho para análise externa)
- Sidebar colapsável permite mais espaço para conteúdo
- Paginação com 10 itens/página otimizada para densidade de informação
- Filtros combinados AND (busca + status + prioridade + grupo)

**Problemas / oportunidades**
- ❌ Sem atalhos de teclado (K key para comando, etc.)
- ❌ Sem opção de alterar pageSize (10/25/50/100 por página)
- ❌ Sem "visualizações salvas" (UserView está no schema mas sem UI)
- ❌ Sem busca global (`/demandas` e `/users` têm buscas separadas)

---

#### H8 — Estética e design minimalista

**Pontos fortes (v2.0)**
- Hierarquia visual clara: header azul/roxo → content → muted
- Espaçamento consistente (`p-6` em pages, `p-4` em cards, `px-4 py-3` em células)
- Tipografia: `text-2xl font-bold` (títulos) → `text-sm` (corpo) → `text-xs` (meta)
- Cards com sombra `shadow-sm` e borda `border-border` — sem excesso decorativo
- Sidebar minimalista com ícones precisos (Scale, FileText, Users, Building2, History, Settings)

**Problemas / oportunidades**
- ⚠️ Dashboard com 6 seções na mesma página pode parecer sobrecarregado; tabs ou accordion ajudaria
- ⚠️ `profile/page.tsx` mistura raw HTML com shadcn (inconsistência visual)

---

#### H9 — Diagnóstico e recuperação de erros

**Pontos fortes (v2.0)**
- Erros Zod em PT-BR: "Obrigatório", "Mínimo 3 caracteres", "Email inválido"
- Login: `<AlertCircle>` + mensagem específica (credenciais, domínio, OAuth)
- `<ConfirmDialog>` usa `setIsLoading(true/false)` com botão desabilitado durante processos

**Problemas / oportunidades**
- ❌ Erros de API (500, 403, 409) mostram apenas `console.error` — sem feedback visual
- ❌ Ausência de página 404/500 customizadas
- ❌ Timeout de API não tratado (request infinito se servidor cair)

---

#### H10 — Ajuda e documentação

**Pontos fortes (v2.0)**
- Página de Perfil: descrição textual de cada role com permissões
- Placeholders nos campos de filtro ("Número, título, processo, medicamento...")
- Tooltips nos botões icon-only de ação (`title="Editar demanda"`)

**Problemas / oportunidades**
- ❌ Sem onboarding ou tour de boas-vindas para novos usuários
- ❌ Sem documentação in-app dos campos judiciais (o que é TRF? O que é NUP?)
- ❌ Sem help center ou FAQ integrado
- ❌ Tooltips incompletos (nem todos os botões icon-only têm title)

---

### 9.3 RECOMENDAÇÕES PRIORITÁRIAS (BACKLOG UX)

#### Alta prioridade (curto prazo — Sprint imediata)

1. **Toast de sucesso/erro em todos os formulários** — Integrar `sonner` em submit handlers de Demandas, Usuários e Organizações. Impacto: elimina submissões duplicadas e reduz frustração.

2. **Toasts para erros de API** — Capturar `res.ok === false` e exibir toast destrutivo com mensagem da API. Impacto: usuários param de ficar em dúvida sobre o que falhou.

3. **Menu mobile (Sheet/Drawer)** — Adicionar `<Sheet>` shadcn como sidebar em telas < md. Impacto: sistema acessível em tablets e smartphones para operadores em campo.

4. **Persistência de filtros na URL** — `useSearchParams` + `router.push` ao aplicar filtros. Impacto: usuário pode compartilhar link filtrado e usar botão voltar do browser.

#### Média prioridade (médio prazo — próximas 2 sprints)

5. **Labels nos botões de ação da tabela** — Adicionar texto "Editar"/"Excluir" ou tooltip visível nos botões icon-only da DataTable.

6. **Confirmação de saída de formulário** — `useBeforeUnload` ou `router.beforePopState` para alertar sobre dados não salvos.

7. **Página de detalhes da demanda** — `/demandas/[id]` em modo view (read-only) com attachments, timeline de status e dados completos.

8. **Dark mode toggle** — Botão na Topbar para alternar `.dark` class no `<html>`. O tema está 100% preparado via CSS vars, falta apenas o toggle.

9. **Migrar profile/page.tsx para shadcn** — Campos de senha ainda usam `<input>` HTML; inconsistente com o restante do sistema.

#### Baixa prioridade (backlog)

10. **Atalhos de teclado** — `Ctrl+K` para busca global; `N` para nova demanda; `ESC` para fechar modais.
11. **Visualizações salvas (UserView)** — A model existe no banco, implementar UI para salvar/carregar filtros favoritos.
12. **Legendas e anotações nos gráficos** — Adicionar unidade nos eixos Y e botão de zoom/fullscreen.
13. **Testes E2E com Playwright** — Cobrir fluxos: login, criar demanda, filtrar, exportar CSV.

---

## 10. SCORECARD COMPARATIVO v1 × v2

> **Escala:** 1 (crítico/ausente) → 10 (excelente/completo)

### 10.1 UX / Heurísticas de Nielsen

| Heurística | v1.0 | v2.0 | Evolução |
|---|:---:|:---:|:---:|
| H1 Visibilidade do status | 5 | 7 | ↑ +2 |
| H2 Mundo real | 7 | 8 | ↑ +1 |
| H3 Controle do usuário | 5 | 6 | ↑ +1 |
| H4 Consistência | 3 | 8 | ↑ +5 ⭐ |
| H5 Prevenção de erros | 5 | 7 | ↑ +2 |
| H6 Reconhecimento | 6 | 8 | ↑ +2 |
| H7 Flexibilidade | 4 | 6 | ↑ +2 |
| H8 Estética minimalista | 3 | 8 | ↑ +5 ⭐ |
| H9 Diagnóstico de erros | 5 | 6 | ↑ +1 |
| H10 Ajuda/documentação | 2 | 3 | ↑ +1 |
| **MÉDIA GERAL** | **4.5** | **6.7** | **↑ +2.2** |

### 10.2 Funcionalidades

| Feature | v1.0 | v2.0 |
|---------|:----:|:----:|
| CRUD Demandas | ✅ | ✅ |
| CRUD Usuários | ✅ | ✅ |
| CRUD Organizações | ⚠️ | ✅ |
| Dashboard analítico | ⚠️ (básico) | ✅ (10 gráficos) |
| Filtros avançados | ⚠️ | ✅ |
| Export CSV | ✅ | ✅ |
| Export PDF | ❌ | ✅ |
| Upload de anexos | ❌ | ✅ |
| Preview de arquivos | ❌ | ✅ |
| Importação Excel 51k | ❌ | ✅ |
| Campos judiciais Redmine | ❌ | ✅ |
| Audit log | ✅ | ✅ |
| Design system coeso | ❌ | ✅ |
| Sidebar animada | ❌ | ✅ |
| Tema oklch / dark mode | ❌ | ✅ |
| Fontes Google (next/font) | ❌ | ✅ |
| Mobile responsivo | ❌ | ⚠️ |
| Toasts de feedback | ❌ | ⚠️ |
| Persistência de filtros URL | ❌ | ❌ |
| Atalhos de teclado | ❌ | ❌ |

> ✅ Completo · ⚠️ Parcial · ❌ Ausente

### 10.3 Técnico

| Indicador | v1.0 | v2.0 |
|-----------|:----:|:----:|
| TypeScript strict | ⚠️ | ⚠️ |
| ESLint sem erros bloqueantes | ❌ | ✅ |
| CI/CD GitHub Actions | ✅ | ✅ |
| Deploy automático Vercel | ✅ | ✅ |
| Validação Zod client+server | ⚠️ | ✅ |
| Índices DB para queries de filtro | ✅ | ✅ |
| RBAC granular | ✅ | ✅ |
| Audit log automático | ✅ | ✅ |
| Testes automatizados | ❌ | ❌ |

---

**FIM DO DOCUMENTO PRD v2.0**

---

*Data de análise: 02/Maio/2026*  
*Repositório: `cairnaofazmaloquefazenaotentar/djud-painel`*  
*Páginas mapeadas: 11 completas + 4 planejadas*  
*APIs documentadas: 15 endpoints*  
*Componentes UI: 18 shadcn + 9 backoffice + 10 dashboard*  
*Funcionalidades documentadas: 8 interativas + RBAC + Audit*
