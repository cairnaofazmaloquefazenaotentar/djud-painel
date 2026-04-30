# DJUD Painel — Painel de Saúde Demandas Judiciais

Backoffice analítico-operacional construído com **Next.js 14+ | TypeScript | Tailwind CSS 4 | Prisma 6 | PostgreSQL (Neon)**.

Migração do protótipo Flask para arquitetura escalável, com autenticação SSO, design system tokenizado, auditoria completa e conformidade LGPD.

## Stack

- **Frontend:** Next.js 14 (App Router) + TypeScript strict + Tailwind CSS 4
- **UI:** shadcn/ui + lucide-react
- **Data:** Prisma 6 + PostgreSQL (Neon) + TanStack Query/Table
- **Auth:** Auth.js v5 (Google OAuth)
- **Forms:** react-hook-form + Zod
- **Charts:** Recharts (com tokens do design system)
- **Design System:** `design-system/tokens.ts` (oklch) + Storybook 10
- **Emails:** Resend (convites, notificações)
- **Hosting:** Vercel + Neon + Resend

## Início rápido

### Pré-requisitos

```bash
node --version    # v18.14.0+
npm --version     # v9+
```

### Setup local

1. Clone o repo:
```bash
git clone https://github.com/cairnaofazmaloquefazenaotentar/djud-painel.git
cd djud-painel
```

2. Instale dependências:
```bash
npm install
```

3. Configure `.env.local`:
```bash
cp .env.example .env.local
# Edite .env.local com seus valores (DATABASE_URL, AUTH_GOOGLE_ID, etc)
```

4. Sync Prisma schema:
```bash
npx prisma db push
```

5. Rode dev server:
```bash
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000)

## Scripts

```bash
npm run dev              # Dev server com hot reload
npm run build            # Build production
npm run start            # Start production server
npm run tokens           # Regenerar globals.css a partir de tokens.ts
npm run tokens:check     # Validar sync tokens ↔ CSS
npm run db:push          # Sync Prisma schema com banco
npm run lint             # ESLint check
```

## Estrutura

```
src/
├── app/                 # Next.js App Router
│   ├── (auth)/          # Rotas protegidas
│   └── (public)/        # Login page
├── design-system/       # 🔴 Single source of truth
│   ├── tokens.ts        # Paleta CNJ em oklch
│   └── generate-css.ts  # Script gerador
├── components/          # shadcn/ui + custom
├── lib/                 # Auth, DB, permissions, audit
├── hooks/               # React hooks (TanStack Query)
├── prisma/              # Schema + migrations
└── types/               # TypeScript types
```

## Variáveis de ambiente

| Variável | Descrição | Obrigatória |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection (Neon) | ✅ |
| `AUTH_SECRET` | `openssl rand -base64 32` | ✅ |
| `AUTH_GOOGLE_ID` | Google Cloud Console | ✅ |
| `AUTH_GOOGLE_SECRET` | Google Cloud Console | ✅ |
| `RESEND_API_KEY` | Resend email API | ✅ |
| `NEXT_PUBLIC_APP_URL` | App URL (localhost:3000) | ✅ |

## Design System

**Regra inviolável:** nunca usar hex hardcoded.

```tsx
// ✅ Correto
<div className="bg-primary text-foreground">

// ❌ Errado
<div className="bg-[#1a3a5c] text-[#ffffff]">
```

Editar `design-system/tokens.ts` → `npm run tokens` → reflete no produto E Storybook simultaneamente.

## Autenticação

- **Provider:** Google OAuth (Google Workspace MS)
- **Roles:** ADMIN, MANAGER, OPERATOR
- **Middleware:** Auth + URL state protection
- **Whitelist:** `AUTH_ALLOWED_DOMAINS=saude.gov.br,globalsys.com.br`

## Banco de dados

Prisma 6 + PostgreSQL (Neon free tier).

```bash
# Ver schema
cat prisma/schema.prisma

# Criar migration
npx prisma migrate dev --name nome_da_migration

# Seed (opcional)
npm run db:seed
```

## Auditoria (AuditLog)

Toda mutação (create/update/delete) é registrada automaticamente.

```typescript
await createAuditLog({
  userId,
  action: 'create',
  entity: 'demanda',
  entityId: demanda.id,
  metadata: { ... }
});
```

## Conformidade

- ✅ **LGPD:** AuditLog obrigatório, access logging de PII, retenção configurável
- ✅ **WCAG 2.1 AA:** Contraste auditado, foco visível, aria-labels
- ✅ **Segurança:** TypeScript strict, Zod validation, permissões por role

## Roadmap (Etapas 0-11)

- [x] **Etapa 0:** Infraestrutura (GitHub, Vercel, Neon)
- [x] **Etapa 1:** Design System + Prisma (agora)
- [ ] **Etapa 2:** Auth.js v5 + Google OAuth
- [ ] **Etapa 3:** Layout base (Sidebar, Topbar, PageHeader)
- [ ] **Etapa 4:** Componentes de backoffice
- [ ] **Etapa 5:** CRUD base (Demanda)
- [ ] **Etapa 6:** Dashboard `/dashboard` + 11 charts
- [ ] **Etapa 7:** Gestão de usuários + permissões
- [ ] **Etapa 8:** Logs de auditoria
- [ ] **Etapa 9:** Stripe (lazy init apenas)
- [ ] **Etapa 10:** Storybook 10
- [ ] **Etapa 11:** Configuração final + CI/CD

## Deployment

```bash
# Vercel
vercel deploy

# CI/CD checks antes de mergear
npm run tokens:check
tsc --noEmit
npm run lint
```

## Documentação

- [CLAUDE.md](./CLAUDE.md) — Convenções do projeto
- [Boilerplate Manual v2](../../../Base_Locoust5000/Boilerplate-manual-backoffice_v2.md) — Spec completa
- [PRDv2](../../../Base_Locoust5000/PRD_v2_Painel_DJUD_Com_Prompt_Breno.docx) — Product Requirements

## Contato / Suporte

- **GitHub Issues:** [djud-painel/issues](https://github.com/cairnaofazmaloquefazenaotentar/djud-painel/issues)
- **PR Reviews:** [djud-painel/pulls](https://github.com/cairnaofazmaloquefazenaotentar/djud-painel/pulls)

---

**Versão:** 0.1.0 (Alpha)  
**Status:** 🟡 Em desenvolvimento (Etapa 1)  
**Última atualização:** Abril/2026  
**Base:** Boilerplate Manual v2 + PRDv2 Painel DJUD
