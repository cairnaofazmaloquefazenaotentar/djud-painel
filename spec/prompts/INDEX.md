# Design Handoff — Engineering Prompts
**Gerado em:** 2026-05-02  
**SPEC base:** `spec/prdv2.md` — DJUD Painel v2.0  
**Método:** design-handoff skill (5-section template)  
**Stack:** Next.js 16 · React 19 · TypeScript · shadcn/ui new-york · Prisma 5 · PostgreSQL

---

## Resumo de Prioridades

| # | Prompt | Prioridade | Heurística | Esforço estimado |
|---|--------|-----------|-----------|-----------------|
| 01 | [Mobile Sidebar (Sheet/Drawer)](./01-mobile-sidebar-sheet.md) | 🔴 Alta | H3, H7 | ~2h |
| 02 | [Persistência de Filtros na URL](./02-url-filter-persistence.md) | 🔴 Alta | H3 | ~1.5h |
| 03 | [Labels nos Botões de Ação](./03-datatable-action-labels.md) | 🟡 Média | H6 | ~30min |
| 04 | [Página Detalhes da Demanda](./04-demanda-detail-page.md) | 🟡 Média | H6, H7 | ~3h |
| 05 | [Dark Mode Toggle](./05-dark-mode-toggle.md) | 🟡 Média | H7 | ~1h |
| 06 | [Guard de Alterações Não Salvas](./06-unsaved-changes-guard.md) | 🟡 Média | H5 | ~1.5h |
| 07 | [Índices de Performance no DB](./07-performance-db-indexes.md) | 🟡 Média | H1 | ~30min |
| 08 | [Testes E2E com Playwright](./08-e2e-playwright-tests.md) | 🟢 Baixa | — | ~4h |

**Total estimado:** ~14h

---

## Sequência de Execução Recomendada

**Sprint A — Quick wins (3h):**
1. `03` Labels botões — 30min, zero risco
2. `07` Índices DB — 30min, só schema
3. `02` URL filtros — 1.5h, padrão já parcialmente implementado

**Sprint B — Features principais (6h):**
4. `01` Mobile sidebar — 2h, precisa testar em mobile
5. `05` Dark mode — 1h, tema já pronto
6. `06` Unsaved changes guard — 1.5h

**Sprint C — Features complexas (5h):**
7. `04` Página detalhes demanda — 3h
8. `08` Testes E2E Playwright — 4h (pode rodar em paralelo)

---

## Design Tokens de Referência

Todos os prompts seguem estes tokens (não usar cores hardcoded):

```css
/* Cores principais */
--primary: oklch(0.5017 0.2796 265.45)      /* roxo — ações primárias */
--destructive: oklch(0.6280 0.2577 29.23)   /* vermelho — deletar */
--muted: oklch(0.9670 0.0029 264.54)        /* cinza claro — backgrounds */
--border: oklch(0.8717 0.0093 258.34)       /* cinza borda */
--sidebar-primary: oklch(0.5854 0.2041 277.12)  /* item ativo sidebar */

/* Tipografia */
--font-sans: Inter Variable
--font-mono: JetBrains Mono Variable

/* Espaçamento padrão */
p-6 (pages) · p-4 (cards) · gap-4 (grids) · h-9 (inputs)
```

---

## Arquitetura de Referência

```
app/
├── (auth)/
│   ├── layout.tsx              — Layout autenticado (sidebar + topbar)
│   ├── dashboard/page.tsx      — Dashboard analytics
│   ├── demandas/
│   │   ├── page.tsx            — DataTable paginada
│   │   ├── new/page.tsx        — Criar demanda
│   │   └── [id]/
│   │       ├── page.tsx        — [CRIAR] View detalhes (prompt 04)
│   │       └── edit/page.tsx   — Editar demanda
│   ├── users/
│   ├── organizations/
│   ├── logs/
│   └── settings/profile/
├── not-found.tsx               — 404 customizada
└── error.tsx                   — 500 customizada

components/
├── layout/
│   ├── sidebar.tsx             — Sidebar animada (modificar: prompt 01)
│   └── topbar.tsx              — Topbar (modificar: prompt 05)
├── backoffice/                 — DataTable, FilterBar, EmptyState, etc.
└── ui/                         — shadcn/ui components

hooks/
└── use-unsaved-changes.ts      — [CRIAR] prompt 06

lib/
├── permissions.ts              — rolePermissions map
└── schemas.ts                  — Zod schemas

prisma/
└── schema.prisma               — Modificar: prompt 07
```
