# Engineering Prompt 01 — Mobile Sidebar (Sheet/Drawer)
**Prioridade:** 🔴 Alta  
**Heurística Nielsen:** H3 Controle do usuário / H7 Flexibilidade  
**PRD v2.0 Ref:** §7.2, §9.3 item 3

---

## 1. SYSTEM CONTEXT

**Sistema:** DJUD Painel — Backoffice governamental de gestão de Demandas Judiciais em Saúde (Ministério da Saúde)  
**URL prod:** `https://djud-painel.vercel.app`  
**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · shadcn/ui new-york · Tailwind CSS v4 · Framer Motion 12 · lucide-react  
**Usuários:** ADMIN (coordenadores), MANAGER (analistas jurídicos), OPERATOR (servidores em campo — provavelmente em tablet)  
**Arquivo alvo:** `components/layout/sidebar.tsx`

---

## 2. ARCHITECTURE RULES

- **Design tokens:** CSS variables oklch — usar `bg-sidebar`, `text-sidebar-foreground`, `border-sidebar-border`, `bg-sidebar-primary` (nunca cores Tailwind hardcoded)
- **Componentes permitidos:** `<Sheet>`, `<SheetContent>`, `<SheetTrigger>` de `@/components/ui/sheet` (já instalado via shadcn)
- **Ícone hamburguer:** `<Menu>` de `lucide-react`
- **Breakpoint mobile:** `< md` (768px) — usar `md:hidden` para o trigger mobile e `hidden md:block` para sidebar desktop
- **Sidebar desktop:** mantém comportamento atual (hover expand/collapse com Framer Motion, `width: 3.05rem → 15rem`)
- **Sidebar mobile:** `<Sheet side="left">` com largura `w-64` — mesmos itens de navegação da sidebar desktop
- **Sidebar deve permanecer `"use client"`** (usa hooks de estado)
- **Não quebrar** o layout `ml-[3.05rem]` do `app/(auth)/layout.tsx` no desktop

---

## 3. MISSION

Implementar menu hamburguer para telas `< md` (768px):

1. Adicionar botão `<Menu>` visível apenas em mobile (`md:hidden`) no topo esquerdo da área de conteúdo
2. Click abre `<Sheet side="left">` com os mesmos itens de navegação da sidebar desktop
3. A sidebar desktop existente permanece inalterada em `≥ md`
4. O Sheet mobile fecha automaticamente ao clicar em um link de navegação

---

## 4. TASK CONSTRAINTS

- **Não duplicar** os nav items — extrair arrays `primaryNav`, `secondaryNav`, `tertiaryNav` em variável compartilhada que ambas as versões consomem
- **Não alterar** animações Framer Motion da sidebar desktop
- **Fechar Sheet** após navegação: usar `usePathname()` + `useEffect` para detectar mudança de rota e chamar `setOpen(false)`
- **Sem novo arquivo** — manter tudo em `components/layout/sidebar.tsx` + adicionar o trigger no `app/(auth)/layout.tsx`
- **TypeScript:** zero erros — sem `as any` novos
- **Acessibilidade:** `<SheetTrigger>` deve ter `aria-label="Abrir menu de navegação"`

---

## 5. EXPECTED OUTPUT

### Arquivos modificados:
- `components/layout/sidebar.tsx` — exportar também `<MobileSidebarTrigger />` ou integrar Sheet interno
- `app/(auth)/layout.tsx` — adicionar trigger hamburguer na topbar (visível apenas `md:hidden`)

### Verificação manual:
1. Abrir browser em 375px (iPhone) — botão Menu visível no header
2. Click → Sheet abre com todos os nav items
3. Click em "Demandas" → navega para `/demandas` + Sheet fecha
4. Redimensionar para 1024px → Sheet desaparece, sidebar desktop aparece normalmente
5. Hover sidebar desktop → continua expandindo como antes

### TypeScript:
```bash
npx tsc --noEmit  # deve retornar 0 erros
```
