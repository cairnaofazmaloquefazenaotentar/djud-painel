# PRODUCT REQUIREMENTS DOCUMENT (PRD)

**Versão:** 4.0
**Data:** Maio 2026
**Analisador:** Claude Sonnet 4.5 + Equipe DJUD
**Projeto:** DJUD Painel — Gestão de Demandas Judiciais em Saúde (Ministério da Saúde)
**Supersede:** PRD v3.0 (Maio 2026)

---

## ÍNDICE

1. VISÃO GERAL DO PRODUTO
2. ARQUITETURA DE INFORMAÇÃO
3. PÁGINAS E FUNCIONALIDADES
4. DETALHAMENTO DE COMPONENTES
5. FUNCIONALIDADES INTERATIVAS
6. INTEGRAÇÕES E TECNOLOGIAS
7. ESPECIFICAÇÕES TÉCNICAS DE API
8. OBSERVAÇÕES E GAPS IDENTIFICADOS
9. CONSIDERAÇÕES FINAIS E CHANGELOG

---

## 1. VISÃO GERAL DO PRODUTO

**URL:** https://djud-painel.vercel.app
**Plataforma:** SaaS Web Application Full-Stack — Backoffice Governamental
**Stack:** Next.js 16 + React 19 + TypeScript + Tailwind CSS 4 + Prisma ORM + PostgreSQL (Neon) + Framer Motion 12

### OBJETIVO DO SISTEMA:

Fornecer uma plataforma centralizada de **inteligência analítica e gestão operacional** para acompanhamento de **51.501 processos judiciais de saúde** do Ministério da Saúde, com capacidade de **dimensionamento, análise de tendência, gestão de riscos e suporte decisório** para a equipe DJUD/COAJUD.

- **Objetivo 1:** Centralizar 51.501 demandas judiciais importadas do Redmine numa plataforma moderna
- **Objetivo 2:** Prover painel de inteligência analítica com 10 gráficos interativos organizados em 5 dimensões (Tendência, Dimensionamento, Riscos, Geografia, Operacional)
- **Objetivo 3:** Gerenciar o ciclo completo das demandas — criação, edição, exclusão, upload de anexos, exportação PDF
- **Objetivo 4:** Controle granular de acesso (RBAC) com 3 níveis: ADMIN, MANAGER, OPERATOR
- **Objetivo 5:** Auditoria completa de todas as ações (CREATE, UPDATE, DELETE, VIEW)
- **Objetivo 6:** Facilitar exportação de dados para relatórios em CSV e PDF

### PÚBLICO-ALVO:

- **Administradores DJUD (ADMIN):** Gestão completa — usuários, permissões, dados, logs
- **Gestores COAJUD (MANAGER):** Análise, criação e edição de demandas, relatórios
- **Operadores (OPERATOR):** Visualização read-only, filtros, exportação de dados
- **Equipe Jurídica/Farmacêutica:** Análise por medicamento, TRF, região, princípio ativo
- **Gestores de Compras:** Dimensionamento para Atas de Registro de Preços (ARP)

---

## 2. ARQUITETURA DE INFORMAÇÃO

**Estrutura de Navegação:** Sidebar fixa (desktop, w-64) + Sheet hamburger (mobile) com breadcrumbs dinâmicas no Topbar

```
DJUD PAINEL v4.0
├── LOGIN (/login)
│   ├── Split-panel layout (branding esquerdo + form direito)
│   ├── Design Spells: magnetic cards, 3D tilt, shine, confetti
│   └── OAuth Google + Credenciais
│
├── PAINEL DE INTELIGÊNCIA (/dashboard) — NOVO em v4
│   ├── Filtros globais (data, status, prioridade)
│   ├── 4 MetricCards (Total, Passivo Ativo, Críticas, Taxa Resolução)
│   ├── Tab: Tendência → Série histórica (AreaChart)
│   ├── Tab: Dimensionamento → Top Medicamentos + Grupo Temático + Objeto da Ação
│   ├── Tab: Riscos → Status + Prioridade + RiskBadge indicators
│   ├── Tab: Geografia → Região Brasil + TRF + Top UFs
│   └── Tab: Operacional → Top Responsáveis + Valor Estimado
│
├── DEMANDAS (/demandas)
│   ├── Listagem DataTable (100 itens/página, 51.501 registros)
│   ├── Filtros avançados (Status, Prioridade, TRF, Região, Grupo Temático, Data, Busca)
│   ├── [new] — Criar demanda
│   ├── [id] — Detalhes (read-only, com anexos)
│   └── [id]/edit — Formulário edição com campos judiciais
│
├── USUÁRIOS (/users)
│   ├── DataTable com roles (ADMIN, MANAGER, OPERATOR)
│   └── [id]/edit — CRUD usuário
│
├── ORGANIZAÇÕES (/organizations)
│   └── DataTable + CRUD
│
├── LOGS (/logs)
│   ├── Auditoria completa (CREATE, UPDATE, DELETE)
│   └── Filtros por usuário, ação, entidade, data
│
└── CONFIGURAÇÕES (/settings/profile)
    └── Perfil do usuário logado
```

---

## 3. PÁGINAS E FUNCIONALIDADES

### 3.1 PÁGINA DE LOGIN (`/login`)

**URL:** https://djud-painel.vercel.app/login

#### LAYOUT SPLIT-PANEL:

**Painel Esquerdo (branding institucional — apenas desktop `md:`):**
- Gradiente primário com blobs SVG animados (Framer Motion)
- Logo `<Scale />` + "DJUD" + tagline "Ministério da Saúde"
- Grid 2×3 de cards institucionais:
  - `FileText` — "Demandas Judiciais" (bgClass: bg-blue-600)
  - Stat card — "51.501 Demandas" (valor numérico em âmbar)
  - `Building2` — "28 Regiões TRF" (bg-emerald-600)
  - Stat card — "98% Taxa Integração" (bg-red-600 com gradient)
  - `Users` — "Análise Especializada" (bg-indigo-600)
  - `CheckCircle2` — "RBAC Seguro" (bg-teal-600)
- Rodapé: `© 2026 DJUD / COAJUD · Ministério da Saúde`

**Painel Direito (form de autenticação):**
- Header: Logo `<Scale />` + "DJUD" + "Sistema Judicial de Demandas em Saúde"
- Campos:
  - `email` (label + input com focus glow backdrop-blur)
  - `password` (toggle eye icon com animação 90°)
- Botão "Entrar" (shimmer + ripple effect ao clicar)
- Divider: "ou continue com"
- Botão Google Sign-In (OAuth)
- Rodapé: Versão 0.3.0

#### ANIMAÇÕES (Framer Motion):

| Elemento | Animação | Duração |
|---------|----------|---------|
| Left panel | `x: -30 → 0, opacity 0→1` | spring 260/30 |
| Right panel | `x: 30 → 0, opacity 0→1` | spring 260/30 |
| Form items | `staggerChildren: 0.07, y: 18→0` | spring 380/28 |
| Grid cards | `delay: 0.15 + i*0.08, y: 20→0` | spring 300/25 |

#### DESIGN SPELLS:
- ✅ Magnetic Cards (seguem cursor 20% do deslocamento)
- ✅ 3D Tilt perspective ao hover dos cards
- ✅ Shine effect percorre card diagonal ao hover
- ✅ Focus Glow neon backdrop-blur nos inputs
- ✅ Ripple click effect no botão "Entrar"
- ✅ Password toggle com rotação 90°
- ✅ Confetti easter egg ao login bem-sucedido

---

### 3.2 PAINEL DE INTELIGÊNCIA (`/dashboard`) — **NOVO v4**

**URL:** https://djud-painel.vercel.app/dashboard
**Título:** "Painel de Inteligência DJUD"
**Subtitle:** "Dimensionamento, tendência e gestão de riscos das demandas judiciais de medicamentos — Ministério da Saúde"

#### FILTROS GLOBAIS (barra superior):

| Campo | Tipo | Valor padrão |
|-------|------|-------------|
| Data início | `<Input type="date">` | vazio |
| Data fim | `<Input type="date">` | vazio |
| Status | `<select>` nativo | "Todos os status" |
| Prioridade | `<select>` nativo | "Todas as prioridades" |
| Botão Reset | `<Button variant="outline">` | Visível se filtro ativo |

**Opções de Status disponíveis:** Em Análise COAJUD, Entrega Pendente, Cessar Atos, Concluída, Cancelada, Suspensa

**Opções de Prioridade:** Crítica, Alta, Normal, Baixa

#### METRIC CARDS (4 KPIs fixos, acima das tabs):

| Card | Label | Dado | Ícone |
|------|-------|------|-------|
| 1 | Total de Processos | `metrics.totalDemandas` | `<FileText />` |
| 2 | Passivo Ativo | `metrics.demandasAtivas` | `<Activity />` |
| 3 | Demandas Críticas | `metrics.demandasCriticas` | `<AlertTriangle />` |
| 4 | Taxa de Resolução | `metrics.taxaResolucao.toFixed(1)%` | `<TrendingUp />` |

#### TABS ANALÍTICAS (5 perspectivas):

---

**Tab 1 — TENDÊNCIA** (`<TrendingUp />`):
- **Seção:** "Série Histórica de Demandas"
- **Subtitle:** "Evolução mensal dos processos registrados — base para análise de tendência e previsibilidade da demanda"
- **Chart:** `<TimelineChart data={metrics.demandasTimeline} />`
- **Tipo:** AreaChart (Recharts) com gradiente azul + animação Framer Motion
- **Eixo X:** Mês/Ano formatado (pt-BR: "jan./24")
- **Eixo Y:** Contagem com formatação `k` para milhares
- **Pontos destacados:** Maior valor com r=6, outros r=4, max point highlighted
- **Tooltip glassmorphism:** `bg-background/95 backdrop-blur-md border border-primary/50`

---

**Tab 2 — DIMENSIONAMENTO** (`<Pill />`):

**Seção A:** "Top 15 Princípios Ativos Mais Demandados" (full width)
- Subtitle: "Ranking por volume de processos — subsidia o quantitativo para ARPs"
- Chart: `<TopMedicamentosChart data={metrics.topMedicamentosDistribution} />`
- Tipo: BarChart horizontal layout="vertical"
- Cores: array COLORS[10] (azul→ciano→verde→roxo→rosa→laranja→âmbar)
- Gradiente por barra: `linearGradient x1=0→1`, opacity 0.8→1.0
- Barra truncada se nome > 28 chars (adicionado "…")
- Tooltip glassmorphism com nome completo do medicamento

**Seção B:** Grid 2 colunas:
- "Por Grupo Temático": `<AreaTematicaChart data={metrics.areaTematicaDistribution} />`
- "Por Objeto da Ação": `<ObjetoAcaoChart data={metrics.objetoAcaoDistribution} />`

---

**Tab 3 — RISCOS** (`<ShieldAlert />`): Grid 3 colunas:

**Coluna 1:** "Gargalos por Status"
- `<StatusChart data={metrics.statusDistribution} />`
- BarChart vertical com cores semânticas por status
- Tooltip glassmorphism

**Coluna 2:** "Perfil de Risco"
- `<PrioridadeChart data={metrics.prioridadeDistribution} />`
- Pie chart ou BarChart de prioridades

**Coluna 3:** "Indicadores de Risco" — `<RiskBadge />` components:
- Barra horizontal com % do total
- Crítica: `#dc2626`, Alta: `#ea580c`, Normal: `#2563eb`, Baixa: `#16a34a`
- Totalizador: Passivo ativo + Criticidade (Alta + Crítica)

---

**Tab 4 — GEOGRAFIA** (`<MapPin />`): Grid 3 colunas:

- "Por Região do Brasil": `<RegiaoBrasilChart data={metrics.regiaoBrasilDistribution} />`
- "Por TRF Região": `<TRFChart data={metrics.trfRegiaoDistribution} />`
  - Formata como "TRF Xª Região"
  - Gradiente vertical por barra
- "Top 15 UFs de Residência": `<UFChart data={metrics.ufResidenciaDistribution} />`
  - Subtitle: "Unidade federativa do paciente autor da ação"

---

**Tab 5 — OPERACIONAL** (`<BarChart2 />`): Grid 2 colunas:

- "Top 10 Responsáveis": `<TopResponsaveisChart data={metrics.topResponsaveis} />`
  - BarChart horizontal com PALETTE_CATEGORICAL
  - Gradiente por barra: x1=0→1
- "Valor Estimado dos Processos" (condicional, se `totalValorEstimado > 0`):
  - Display: `R$ {valor/1M}M` em texto bold 4xl
  - Subtexto: média por processo

---

### 3.3 PÁGINA DEMANDAS (`/demandas`)

**URL:** https://djud-painel.vercel.app/demandas

#### HEADER:
- `<PageHeader title="Demandas" />` com contador dinâmico
- Botão "Nova Demanda" (se `canCreate`)
- Botão "Exportar CSV" (se `canExport`)

#### FILTERBAR (8 filtros):

| Filtro | Tipo | Parâmetro URL |
|--------|------|---------------|
| Busca | Input debounced | `busca` |
| Status | Select | `status` |
| Prioridade | Select | `prioridade` |
| Grupo Temático | Select | `areaTematica` |
| TRF Região | Select | `trfRegiao` |
| Região Brasil | Select | `regiaoBrasil` |
| Data Entrada DJUD (de) | Date | `dataEntradaDe` |
| Data Entrada DJUD (até) | Date | `dataEntradaAte` |

#### DATATABLE (100 itens/página):

| Coluna | Accessor | Sortável | Descrição |
|--------|----------|----------|-----------|
| Número | `numero` | ✓ | Identificador DJUD |
| Título | `titulo` | ✓ | Assunto/título truncado |
| Status | `status` | ✓ | Badge cor semântica |
| Prioridade | `prioridade` | ✓ | Badge cor semântica |
| TRF | `trfRegiao` | ✓ | "Xª Região" |
| Região | `regiaoBrasil` | ✓ | Macrorregião |
| Data Entrada | `dataEntradaDJUD` | ✓ | Formatada pt-BR |
| Responsável | `responsavel.name` | ✓ | Nome do servidor |
| Ações | — | — | Editar, Deletar |

**Status Badge — Mapeamento de cores:**

| Status | Cor |
|--------|-----|
| Concluída | green |
| Em Análise COAJUD | amber |
| Cancelada | red |
| Suspensa | orange |
| Entrega Pendente | blue |
| Cessar Atos | purple |

**Paginação:** URL-synced `?page=N`, botões ◀ Anterior / Próximo ▶

**Loading state:** 10 linhas skeleton `animate-pulse`

**Error state:** `<AlertCircle />` + mensagem + botão retry

---

### 3.4 DETALHES DEMANDA (`/demandas/[id]`)

**URL:** https://djud-painel.vercel.app/demandas/[id]

#### LAYOUT (seções com Framer Motion stagger):

**Seção: Identificação**
- Número (h2, destacado)
- Título
- Status badge + Prioridade badge

**Seção: Dados Judiciais**
- Número do Processo
- Grupo Temático
- TRF Região
- Região Brasil
- Objeto da Ação
- Princípio Ativo / Medicamento

**Seção: Responsabilidade**
- Organização (linked)
- Responsável (avatar initials + nome)
- Criado por
- Data Entrada DJUD

**Seção: Datas**
- Criado em / Atualizado em / Data Vencimento

**Seção: Descrição**
- Textarea read-only

**Seção: Anexos**
- Lista `<AttachmentsManager>` (componente completo)
- Botão "Visualizar" → `<FilePreviewModal>`
- Botão "Baixar" → download direto
- Botão "Deletar" (se permissão)

---

### 3.5 FORMULÁRIO DEMANDA (`/demandas/[id]/edit` | `/demandas/new`)

#### CAMPOS POR SEÇÃO:

**Dados Básicos:**
| Campo | Tipo | Validação |
|-------|------|-----------|
| `numero` | text, disabled em edit | required, unique |
| `titulo` | text | required, min: 3 |
| `descricao` | textarea | required, min: 10 |
| `status` | select | enum |
| `prioridade` | select | Baixa/Média/Alta/Crítica |

**Responsabilidade:**
| Campo | Tipo | API fonte |
|-------|------|-----------|
| `organizacaoId` | async select | `/api/organizations` |
| `responsavelId` | async select | `/api/users` |

**Datas:**
| Campo | Tipo |
|-------|------|
| `dataInicio` | date picker |
| `dataVencimento` | date picker |

**Dados Judiciais (novos em Sprint 8):**
| Campo | Tipo | Valores |
|-------|------|---------|
| `numeroProcesso` | text | — |
| `areaTematica` | select | 5 categorias |
| `regiaoBrasil` | select | Norte/Nordeste/CO/Sudeste/Sul |
| `trfRegiao` | select | 1–28 |
| `objetoAcao` | text | — |
| `principioAtivo` | text | — |
| `dataEntradaDJUD` | date | — |

**Metadados:**
| Campo | Tipo |
|-------|------|
| `tags` | array input |
| `metadados` | JSON editor (opcional) |
| `projeto` | text |
| `ano` | number |

**Validação:** react-hook-form + zodResolver + mensagens em português abaixo de cada campo

---

### 3.6 USUÁRIOS (`/users`)

#### DATATABLE:

| Coluna | Dados |
|--------|-------|
| Avatar | Initials coloridos |
| Nome | String |
| Email | String |
| Role | Badge (Admin=blue, Manager=amber, Operator=green) |
| Status | Active/Inactive badge |
| Criado em | Data pt-BR |
| Ações | Edit, Delete (confirm dialog) |

**Filtros:** Busca por nome/email, Select Role

**CRUD completo** com validação Zod + auditoria

---

### 3.7 ORGANIZAÇÕES (`/organizations`)

#### DATATABLE:

| Coluna | Dados |
|--------|-------|
| Nome | String |
| Tipo | Enum (MS, Judiciário, etc) |
| Região | Enum |
| Demandas | Counter (FK) |
| Ações | Edit, Desativar |

---

### 3.8 LOGS DE AUDITORIA (`/logs`)

#### FILTROS:
- Busca textual (usuário, entidade, ID)
- Select: Ação (CREATE, UPDATE, DELETE, VIEW)
- Select: Entidade (Demanda, User, Organization)
- DateRange picker

#### DATATABLE:

| Coluna | Dados |
|--------|-------|
| Timestamp | DateTime formatado |
| Usuário | Nome + Avatar |
| Ação | Badge semântico |
| Entidade | Tipo (badge) |
| ID Entidade | UUID truncado |
| Mudanças | Collapsible JSON details |

---

### 3.9 PERFIL (`/settings/profile`)

- Avatar com initials coloridas
- Nome / Email (read-only)
- Role badge
- Botão Logout

---

## 4. COMPONENTES GLOBAIS

### 4.1 TOPBAR (fixed top, h-16)

**Esquerda:**
- Logo `<Scale className="h-4 w-4 text-primary" />`
- "DJUD" text + breadcrumbs dinâmicas baseadas em `usePathname()`
- Separadores `<ChevronRight />`

**Direita:**
- Role badge (hidden sm:flex)

**Ausente em v4:** Avatar removido do topbar (estava duplicado com sidebar footer)

### 4.2 SIDEBAR (w-64, fixed desktop)

**Elementos:**
- Logo section (DJUD brand)
- Navigation items com `motion.span layoutId="active-indicator"`:
  - Dashboard, Demandas, Usuários, Organizações, Logs, Configurações
- **Footer** com Avatar (initials + nome + role badge + logout icon)

**Animações:** Active indicator com spring physics, hover states

### 4.3 MOBILE NAV (Sheet hamburger)

- Trigger: `<Menu />` icon no topbar
- Content: Same sidebar navigation em Sheet drawer
- `layoutId="mobile-active-bar"` para active state

### 4.4 COMPONENTES REUTILIZÁVEIS

**Layout:**
- `<PageHeader title description actions />` — cabeçalho padrão de página
- `<FilterBar isActive onReset />` — container de filtros com reset
- `<DataTable columns data />` — TanStack Table v8

**Formulários (sistema unificado — novo v4):**
- `<FormField />` — wrapper com label + error
- `<FormInput />` — input com react-hook-form register
- `<FormSelect />` — select com async options
- `<FormTextarea />` — textarea com contador
- `<FormFileInput />` — file upload com drag & drop

**Feedback:**
- `<MetricCard label value icon description />` — KPI card
- `<StatusBadge status />` — badge semântico por status
- `<ConfirmDialog title description actionLabel onConfirm />` — confirm destrutivo
- `<EmptyState title description action />` — estado vazio

**File Management (novo Sprint 5):**
- `<AttachmentsManager demandaId />` — gerenciador de arquivos completo
- `<FilePreviewModal fileId fileName mimeType onClose />` — modal de preview
- `<PDFViewer fileId />` — visualizador PDF com paginação + zoom
- `<ImageViewer fileId fileName />` — lightbox com zoom/pan
- `<DocumentPreview />` — fallback para tipos desconhecidos
- `<FileIcon mimeType />` — ícone por tipo de arquivo

**Export (novo Sprint 6):**
- `<DemandaExportModal demandaId />` — modal de exportação PDF

### 4.5 PALETA DE CORES

**CSS Variables (dark/light adaptativas):**

```css
/* Core */
--primary: hsl(217, 91%, 60%)          /* Azul institucional #3b82f6 */
--primary-foreground: hsl(0, 0%, 100%)
--secondary: hsl(180, 100%, 50%)       /* Cyan #00ffff */
--background: hsl(0, 0%, 96%)          /* Cinza claro (light) */
--foreground: hsl(0, 0%, 0%)           /* Preto */
--card: hsl(0, 0%, 100%)               /* Branco card */
--muted: hsl(240, 4%, 46%)             /* Cinza texto */
--muted-foreground: hsl(240, 5%, 65%)
--border: hsl(217, 33%, 90%)           /* Azul claro border */
--destructive: hsl(0, 84%, 60%)        /* Vermelho erro #ef4444 */
--ring: hsl(217, 91%, 60%)             /* Focus ring */
```

**Cores semânticas de Status:**
```
Concluída         → #10b981 (green-500)
Em Análise COAJUD → #f59e0b (amber-400)
Cancelada         → #ef4444 (red-500)
Suspensa          → #f97316 (orange-500)
Entrega Pendente  → #3b82f6 (blue-500)
Cessar Atos       → #8b5cf6 (violet-500)
```

**Cores de Risk (Indicadores de Risco):**
```
Crítica → #dc2626 (red-600)
Alta    → #ea580c (orange-600)
Normal  → #2563eb (blue-600)
Baixa   → #16a34a (green-600)
```

**Paleta gráficos (COLORS — TopMedicamentos):**
```
["#0ea5e9", "#06b6d4", "#10b981", "#14b8a6",
 "#8b5cf6", "#d946ef", "#ec4899", "#f43f5e",
 "#f97316", "#eab308"]
```

---

## 5. FUNCIONALIDADES INTERATIVAS

### 5.1 Autenticação (NextAuth v5)

**Provider:** Credentials (email/bcrypt) + Google OAuth 2.0
**JWT:** Roles embutidas no token (`user.role`)
**Session:** Cookies HttpOnly
**Proteção:** Middleware `auth.ts` intercepta rotas `/(auth)/*`
**RBAC:** Verificação de role em cada API route

---

### 5.2 DataTable (TanStack Table v8)

**Funcionalidades:**
- Sorting por click em header
- Paginação sincronizada com URL
- Row hover highlight
- Loading skeleton (10 linhas animate-pulse)
- Empty state configurável
- Horizontal scroll em mobile
- Row click navega para detalhe
- Checkbox selection (opcional)

---

### 5.3 Upload e Gestão de Arquivos

**Componente:** `<AttachmentsManager demandaId />`

**Upload:**
- Drag & Drop zone
- Click to select
- Validação: size ≤ 10MB, MIME types: PDF, JPG, PNG, DOC, DOCX
- Progress indicator
- Armazenamento: `public/uploads/demandas/{demandaId}/`

**Visualização (Sprint 5 — completo em v4):**
- `<FilePreviewModal>` com detecção automática de tipo
- PDFs: `<PDFViewer>` com navegação entre páginas + zoom in/out
- Imagens: `<ImageViewer>` lightbox com zoom/pan
- Outros: `<DocumentPreview>` com metadata + botão download

**Download:** GET `/api/attachments/[id]` — stream direto

**Deletar:** DELETE `/api/demandas/[id]/attachments/[attachmentId]`

---

### 5.4 Exportação PDF (Sprint 6 — completo em v4)

**Componente:** `<DemandaExportModal demandaId />`

**Opções:**
- ☐ Incluir gráficos
- ☐ Incluir anexos
- ◉ Apenas download | Download + Email

**APIs:**
- `POST /api/demandas/[id]/export-pdf` → stream PDF individual
- `POST /api/relatorios/generate` → PDF batch com filtros
- `POST /api/relatorios/email` → Gera + envia via Resend

---

### 5.5 Design Spells (Micro-interações)

**Login:**
| Spell | Implementação | Efeito |
|-------|--------------|--------|
| Magnetic Cards | `onMouseMove` → translate XY (20%) | Cards seguem cursor |
| 3D Tilt | CSS `perspective + rotateX/Y` | Perspectiva 3D ao hover |
| Shine Effect | `linear-gradient` animado | Brilho percorre card |
| Focus Glow | `backdrop-blur-sm + shadow neon` | Brilho neon ao focar input |
| Ripple Effect | `span absolute` escala 0→4 + fade | Onda ao clicar botão |
| Password Toggle | `rotate-90` Framer Motion | Ícone Eye roda 90° |
| Confetti | `canvas` + partículas aleatórias | Celebração pós-login |

**Dashboard Charts:**
| Chart | Animação |
|-------|---------|
| Timeline (AreaChart) | `opacity: 0, y: 20 → 1, 0` + dots r:0→4/6 |
| TopMedicamentos | `opacity: 0→1` + gradiente por barra |
| StatusChart | Vertical gradients + tooltip scale 0.95→1 |
| TRFChart | `opacity, y: 20→0` + gradiente vertical |
| TopResponsaveis | `opacity 0→1` + horizontal gradients |

---

### 5.6 Filtros e Busca

**Padrão URL State:**
- `useSearchParams()` lê filtros da URL
- `router.push()` atualiza URL sem reload
- Filtros são compartilháveis via link
- Reset limpa todos os params

**Debounce:** Input de busca: 300ms delay

**Combinação:** AND lógico entre todos os filtros ativos

---

## 6. INTEGRAÇÕES E TECNOLOGIAS

### 6.1 Frontend Stack

| Lib | Versão | Uso |
|-----|--------|-----|
| React | 19 | UI framework |
| Next.js | 16 | Full-stack framework (App Router) |
| TypeScript | 5.x | Type safety |
| Tailwind CSS | 4 | Utility-first styling |
| Framer Motion | 12 | Animações (spring physics) |
| shadcn/ui | latest (new-york) | Component library |
| Recharts | 2.x | Charts (AreaChart, BarChart, PieChart) |
| TanStack Table | v8 | DataTable |
| react-hook-form | 7.x | Form management |
| Zod | 3.x | Schema validation |
| Sonner | latest | Toast notifications |
| Lucide React | latest | Icons |
| TanStack Query | v5 | Server state + cache |

### 6.2 Backend Stack

| Lib | Versão | Uso |
|-----|--------|-----|
| Node.js | 20+ | Runtime |
| Next.js API Routes | 16 | REST endpoints |
| Prisma ORM | 5.22.0 | Database queries |
| PostgreSQL | 15 (Neon) | Database |
| NextAuth | v5 | Auth (JWT + OAuth) |
| bcrypt | — | Password hashing |
| Zod | 3.x | Server-side validation |
| XLSX | — | Excel import |

### 6.3 APIs disponíveis

#### Demandas:
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/demandas` | Listar com filtros e paginação |
| POST | `/api/demandas` | Criar nova demanda |
| GET | `/api/demandas/[id]` | Buscar por ID |
| PUT | `/api/demandas/[id]` | Atualizar |
| DELETE | `/api/demandas/[id]` | Deletar |
| GET | `/api/demandas/metrics` | Métricas analytics |
| POST | `/api/demandas/[id]/export-pdf` | Exportar PDF |

#### Attachments:
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/demandas/[id]/attachments` | Listar arquivos |
| POST | `/api/demandas/[id]/attachments` | Upload arquivo |
| DELETE | `/api/demandas/[id]/attachments/[attachmentId]` | Deletar arquivo |
| GET | `/api/attachments/[id]/preview` | Preview stream |

#### Relatórios:
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/relatorios/generate` | Gerar PDF batch |
| POST | `/api/relatorios/email` | Gerar + enviar email |

#### Demais:
| Método | Rota | Descrição |
|--------|------|-----------|
| GET/POST | `/api/users` | CRUD usuários |
| GET/PUT/DELETE | `/api/users/[id]` | Usuário por ID |
| GET/POST | `/api/organizations` | CRUD organizações |
| GET/PUT/DELETE | `/api/organizations/[id]` | Org por ID |
| GET | `/api/logs` | Logs de auditoria |
| ALL | `/api/auth/[...nextauth]` | NextAuth handlers |

### 6.4 Integrações Externas

1. **NextAuth v5 + Google OAuth**
   - Provider: Google (scope: email, profile)
   - Callback: `/api/auth/callback/google`
   - Session strategy: JWT

2. **Vercel (Hosting)**
   - URL: https://djud-painel.vercel.app
   - CI/CD: GitHub → auto-deploy
   - Edge Network global

3. **Neon (PostgreSQL Serverless)**
   - Connection pooling via Prisma
   - Auto-scale
   - Migrations: `prisma migrate`

4. **Resend (Email)**
   - Para: `POST /api/relatorios/email`
   - Template HTML profissional
   - Anexo PDF gerado
   - From: noreply@djud-painel.com

---

## 7. ESPECIFICAÇÕES TÉCNICAS

### 7.1 Prisma Schema (campos principais do modelo Demanda)

```prisma
model Demanda {
  id               String    @id @default(cuid())
  numero           String    @unique
  titulo           String
  descricao        String
  status           String    @default("Aberta")
  prioridade       String    @default("Média")
  
  // Campos judiciais (Sprint 8)
  numeroExterno    String?   // ID Redmine original
  numeroProcesso   String?   // Número CNJ do processo
  areaTematica     String?   // Grupo Temático
  regiaoBrasil     String?   // Macrorregião
  objetoAcao       String?   // Tipo de pedido
  principioAtivo   String?   // Medicamento/insumo
  dataEntradaDJUD  DateTime? // Data entrada no DJUD
  trfRegiao        Int?      // Número do TRF (1-28)
  
  // Relacionamentos
  organizacaoId    String?
  responsavelId    String?
  criadoPorId      String?
  
  // Metadados
  tags             String[]
  projeto          String?
  ano              Int?
  metadados        Json?
  
  // Datas
  dataInicio       DateTime?
  dataVencimento   DateTime?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
  
  // Relações
  organizacao      Organization? @relation(...)
  responsavel      User?         @relation("responsavel", ...)
  criadoPor        User?         @relation("criador", ...)
  attachments      Attachment[]
  auditLogs        AuditLog[]

  @@index([numeroExterno])
  @@index([areaTematica])
  @@index([numeroProcesso])
  @@index([trfRegiao])
  @@index([regiaoBrasil])
}
```

### 7.2 Performance

| Métrica | Valor | Nota |
|---------|-------|------|
| Registros no banco | 51.501 | Demandas importadas Redmine |
| Paginação | 100 itens/página | ~515 páginas |
| Timeline points | 2.476 | Meses com demandas |
| Medicamentos únicos | 2.225 | Princípios ativos |
| TRF regiões | 34 variações | Regiões mapeadas |
| Build time (Vercel) | ~35s | Production |
| Bundle size | Otimizado por Tailwind JIT | Zero CSS não usado |

### 7.3 Segurança

- **Autenticação:** JWT httpOnly cookies (NextAuth v5)
- **Senhas:** bcrypt hashing
- **Rotas:** Middleware protege todas as rotas `/(auth)`
- **RBAC:** Verificação de `session.user.role` em cada API endpoint
- **Validação:** Zod em 100% dos endpoints (input e output)
- **CORS:** Next.js default + config estrita

---

## 8. GAPS E FUNCIONALIDADES PLANEJADAS

### 8.1 Implementado em v4.0 (vs v3.0)

✅ **Novidades v4.0:**
- Dashboard "Painel de Inteligência DJUD" com 5 tabs analíticas
- 4 novos charts: AreaTematica, ObjetoAcao, RegiaoBrasil, UFResidencia
- 4 MetricCards com KPIs relevantes
- RiskBadge component para indicadores de risco
- File Preview Modal completo (PDF, imagem, documento)
- PDF Export individual (`/demandas/[id]/export-pdf`)
- Relatório batch PDF (`/api/relatorios/generate`)
- Email de relatório via Resend (`/api/relatorios/email`)
- Sistema de FormComponents unificado (FormField, FormInput, FormSelect, FormTextarea, FormFileInput)
- Design Spells modernizados com Framer Motion spring physics
- Charts todos refatorados com gradientes, glassmorphism, framer motion
- Sidebar limpa (avatar removido do topbar — eliminado duplicado)
- 51.501 registros verificados e sem duplicatas
- Error handling no dashboard com estado de erro visível

### 8.2 Gaps UX Críticos (Backlog v5.0)

**CRÍTICO — Alta prioridade:**
- [ ] Toast/Notificações globais (Sonner) — feedback de ações CRUD
- [ ] Atalhos de teclado (Ctrl+K busca, Ctrl+N criar, ESC fechar modal)
- [ ] Breadcrumbs explícitas nas páginas de detalhe/edit
- [ ] Confirmação de navegação com dados não salvos (`useBeforeUnload`)
- [ ] Rate limiting nas APIs (prevenção de abuso)

**IMPORTANTE — Média prioridade:**
- [ ] Help/documentação inline (tooltips, ? hover)
- [ ] Soft delete com recuperação (demandas deletadas ficam 30 dias em estado "ARQUIVADA")
- [ ] Batch operations (selecionar múltiplos + deletar/exportar)
- [ ] Glossário de termos jurídicos (inline tooltip)
- [ ] Auto-save de rascunho (localStorage para formulários)

**APRIMORAMENTO — Baixa prioridade:**
- [ ] Cloud Storage (Vercel Blob / S3) — Sprint 7
- [ ] Dashboard customizável por usuário
- [ ] Customização de colunas da DataTable
- [ ] Exportação em múltiplos formatos (XLSX, JSON)
- [ ] PWA (Progressive Web App)
- [ ] Integração com APIs externas (TRF, SINAN, CNJ)
- [ ] Webhooks para integrações externas

---

## 9. CONSIDERAÇÕES FINAIS

### 9.1 RESUMO EXECUTIVO

O **DJUD Painel v4.0** é uma plataforma SaaS **production-ready** para inteligência analítica e gestão operacional de **51.501 processos judiciais de saúde**. A versão 4.0 representa uma evolução significativa sobre a v3.0 com a implementação de:

1. **Painel de Inteligência Analítica** — 5 dimensões de análise (Tendência, Dimensionamento, Riscos, Geografia, Operacional) com 10 gráficos modernizados
2. **File Preview** completo (PDF viewer, lightbox imagens, fallback documentos)
3. **PDF Export** individual e em batch com envio por email
4. **Design System** unificado — form components, chart gradients, glassmorphism tooltips
5. **Data Integrity** — 51.501 registros verificados, zero duplicatas

### 9.2 PÁGINAS MAPEADAS (12 completas)

1. ✅ Login — `/login`
2. ✅ Painel de Inteligência — `/dashboard`
3. ✅ Demandas list — `/demandas`
4. ✅ Demanda detalhe — `/demandas/[id]`
5. ✅ Demanda edit — `/demandas/[id]/edit`
6. ✅ Demanda criar — `/demandas/new`
7. ✅ Usuários — `/users`
8. ✅ Usuário edit — `/users/[id]/edit`
9. ✅ Organizações — `/organizations`
10. ✅ Logs de Auditoria — `/logs`
11. ✅ Perfil — `/settings/profile`
12. ✅ Login simples (legado) — `/login-simple`

**Páginas planejadas (futuro):**
- [ ] Settings Admin — `/settings/admin`
- [ ] Help / FAQ — `/help`
- [ ] Report Builder — `/reports`
- [ ] Onboarding Tutorial

### 9.3 PONTOS FORTES

1. **Inteligência Analítica de Alta Qualidade**
   - 5 dimensões analíticas com 10 gráficos interativos
   - KPIs relevantes para gestão pública
   - Filtros globais aplicam a todos os gráficos

2. **Design System Sofisticado**
   - CSS variables dark/light mode
   - Framer Motion spring physics
   - Design Spells únicos (magnetic, tilt, shine, confetti)
   - Glassmorphism tooltips

3. **Dados em Escala com Integridade**
   - 51.501 demandas verificadas
   - Zero duplicatas após cleanup
   - Paginação eficiente (100 itens/página)

4. **Gestão de Arquivos Completa**
   - Upload + Preview + Download + Delete
   - PDF viewer com navegação
   - Image lightbox
   - Export PDF + email

5. **Segurança e Rastreabilidade**
   - RBAC (3 níveis)
   - Auditoria completa
   - bcrypt + JWT

### 9.4 OPORTUNIDADES DE MELHORIA (v5.0)

1. **UX Feedback** — Implementar Sonner toast notifications globais
2. **Eficiência** — Atalhos de teclado e batch operations
3. **Documentação** — Help inline, glossário, tooltips contextuais
4. **Cloud Storage** — Migrar para Vercel Blob para produção
5. **Mobile** — PWA + offline mode

### 9.5 PRINCIPAIS FUNCIONALIDADES (v4.0)

✓ Painel de Inteligência com 5 dimensões analíticas e 10 gráficos
✓ CRUD Demandas (51.501 registros) com campos judiciais
✓ CRUD Usuários com RBAC (Admin/Manager/Operator)
✓ CRUD Organizações
✓ Upload, Preview, Download e Delete de arquivos
✓ PDF Export individual e batch com email
✓ Filtros avançados + busca full-text (URL state)
✓ Paginação (100 itens/página, ~515 páginas)
✓ Exportação CSV
✓ Logs de auditoria completos
✓ NextAuth + Google OAuth
✓ Dark mode (CSS variables)
✓ Design Spells (micro-interações avançadas)
✓ Mobile responsive (hamburger navigation)
✓ Validação Zod client + server

### 9.6 STACK TECNOLÓGICO

**Frontend:** React 19 + Next.js 16 + TypeScript + Tailwind CSS 4 + Framer Motion 12 + shadcn/ui + Recharts + TanStack Table v8 + react-hook-form + Zod + Sonner + Lucide

**Backend:** Node.js + Next.js API Routes + Prisma 5.22.0 + PostgreSQL (Neon) + NextAuth v5 + bcrypt

**Infrastructure:** Vercel (deploy) + GitHub (CI/CD) + Neon (DB) + Resend (email)

---

## METADATA

**Data de análise:** Maio 2026
**URL analisada:** https://djud-painel.vercel.app
**Páginas mapeadas:** 12 completas
**Componentes documentados:** 25+
**Funcionalidades documentadas:** 35+
**APIs documentadas:** 20 endpoints
**Status:** Production Ready (v4.0)
**Comparação:** Evolução direta do PRD v3.0 — adicionados Sprint 5, 6, Dashboard Intelligence tabs

---

**FIM DO DOCUMENTO PRD v4.0**
