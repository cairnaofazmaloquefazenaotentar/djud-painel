# CLAUDE.md — Convenções do Projeto DJUD Painel

## Stack Obrigatória

- **Frontend/Fullstack:** Next.js 14+ (App Router) + TypeScript strict
- **Styling:** Tailwind CSS 4 + shadcn/ui
- **Data layer:** Prisma 6 (PostgreSQL) + TanStack Query + Zod
- **Auth:** Auth.js v5 (Google OAuth)
- **Forms:** react-hook-form + Zod
- **Tables:** TanStack Table v8 + nuqs (URL state)
- **Gráficos:** Recharts (com tokens `--chart-1..5`)
- **Emails:** Resend
- **Design System:** `design-system/tokens.ts` (oklch + tweakcn) + Storybook 10

## Design System — Regras Invioláveis

1. **Nunca usar hex hardcoded nos componentes.** Sempre usar tokens semânticos Tailwind.
   - ✅ `bg-primary`, `text-foreground`, `bg-chart-1`
   - ❌ `bg-[#1a3a5c]`, `text-[#ffffff]`

2. **Fonte única de verdade é `design-system/tokens.ts`.**
   - Editar tokens.ts → rodar `npm run tokens` → reflete no produto E Storybook
   - CI/CD roda `npm run tokens:check` antes de mergear

3. **Cores em oklch(L C H), nunca hsl/rgb/hex.**
   - Formato: `oklch(0.5017 0.2796 265.4464)`
   - Ajustar via [tweakcn.com/editor/theme](https://tweakcn.com/editor/theme)

## Scripts Úteis

\`\`\`bash
npm run dev              # Dev server
npm run tokens           # Regenerar globals.css
npm run tokens:check     # Validar sync
npm run db:push          # Sync Prisma schema
npm run build            # Build production
npm run lint             # ESLint check
\`\`\`

## Variáveis de Ambiente

Copiar \`.env.example\` → \`.env.local\` e preencher:

\`\`\`
DATABASE_URL=              # Do Neon
AUTH_SECRET=               # openssl rand -base64 32
AUTH_GOOGLE_ID=            # Google Cloud
AUTH_GOOGLE_SECRET=        # Google Cloud
RESEND_API_KEY=            # Resend
NEXT_PUBLIC_APP_URL=       # http://localhost:3000
\`\`\`

---

**Criado em:** Abril/2026
**Base:** Boilerplate Manual v2 + PRDv2 Painel DJUD
