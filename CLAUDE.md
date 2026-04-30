# CLAUDE.md — Convenções do Projeto DJUD Painel

## Stack Obrigatória

- **Frontend/Fullstack:** Next.js 16 (App Router) + TypeScript strict
- **Styling:** Tailwind CSS 4 + tokens oklch (design-system/tokens.ts)
- **Data layer:** Prisma 5.13 (PostgreSQL/Neon) + TanStack Query + Zod
- **Auth:** next-auth@4.24 (Auth.js) + Google OAuth
- **Forms:** react-hook-form + @hookform/resolvers + Zod
- **Tables:** TanStack Table v8 + nuqs (URL state)
- **Gráficos:** Recharts
- **Emails:** Resend
- **Design System:** `design-system/tokens.ts` (oklch + tweakcn)
- **CI/CD:** GitHub Actions → Vercel

## Estrutura de Pastas

```
app/
  (auth)/         # Rotas protegidas (layout valida sessão)
    dashboard/    # Home do painel
    demandas/     # Dashboard analítico com 11 gráficos
    logs/         # Auditoria com filtros + export CSV
    users/        # Gestão de usuários
  (public)/
    login/        # Página de login Google OAuth
  api/
    auth/         # Auth.js handler
    demandas/     # CRUD + metrics endpoint
    users/        # CRUD usuários
    logs/         # Logs de auditoria
    organizations/# Listar organizações

components/
  backoffice/     # 8 componentes reutilizáveis (DataTable, FilterBar…)
  layout/         # Sidebar, Topbar, PageHeader
  ui/             # Primitivos (Button, AlertDialog)

lib/
  auth.ts         # NextAuth config
  db.ts           # Prisma singleton
  permissions.ts  # RBAC: rolePermissions, hasPermission, hasRole
  audit.ts        # createAuditLog, getAuditLogs
  email.ts        # Resend: sendInviteEmail, sendNotificationEmail
  stripe.ts       # Lazy init (N/A para DJUD)
  schemas.ts      # Zod schemas: Demanda
  user-schemas.ts # Zod schemas: User

stories/          # Storybook 8 — 8 components × 2-6 stories cada
.github/workflows/
  ci.yml          # typecheck → lint → build → storybook-build
  deploy.yml      # push main → Vercel prod
```

## Design System — Regras Invioláveis

1. **Nunca usar hex hardcoded nos componentes.** Sempre usar tokens semânticos Tailwind.
   - ✅ `bg-primary`, `text-foreground`, `border-border`
   - ❌ `bg-[#1a3a5c]`, `text-[#ffffff]`

2. **Fonte única de verdade é `design-system/tokens.ts`.**
   - Editar tokens.ts → rodar `npm run tokens` → reflete no produto E Storybook
   - CI roda `npm run tokens:check` antes de mergear

3. **Cores em oklch(L C H), nunca hsl/rgb/hex.**

## RBAC — Roles e Permissões

| Role     | Pode fazer                                                    |
|----------|---------------------------------------------------------------|
| ADMIN    | Tudo — incluindo criar/deletar usuários e gerenciar roles     |
| MANAGER  | Ver logs, editar demandas, ler usuários                       |
| OPERATOR | Criar/ler demandas, sem acesso a usuários/logs                |

Definido em `lib/permissions.ts` via `rolePermissions`.

## Scripts

```bash
npm run dev              # Dev server (localhost:3000)
npm run tokens           # Regenerar globals.css a partir de tokens.ts
npm run tokens:check     # Validar sync (usado no CI)
npm run db:push          # Sync Prisma schema → banco
npm run build            # Build production
npm run lint             # ESLint check
```

## Variáveis de Ambiente

Copiar `.env.example` → `.env.local`:

```
DATABASE_URL=              # Neon PostgreSQL
AUTH_SECRET=               # openssl rand -base64 32
AUTH_GOOGLE_ID=            # Google Cloud Console
AUTH_GOOGLE_SECRET=        # Google Cloud Console
RESEND_API_KEY=            # Resend dashboard
NEXT_PUBLIC_APP_URL=       # http://localhost:3000
NEXTAUTH_URL=              # http://localhost:3000
```

Secrets GitHub Actions (para deploy):
```
VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID
```

---

**Criado em:** Abril/2026 | **Versão:** v0.1.0
**Base:** Boilerplate Manual v2 + PRDv2 Painel DJUD
**Etapas concluídas:** 1–11 (todas)
