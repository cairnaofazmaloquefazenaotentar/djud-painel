# Engineering Prompt 05 — Dark Mode Toggle na Topbar
**Prioridade:** 🟡 Média  
**Heurística Nielsen:** H7 Flexibilidade e eficiência de uso  
**PRD v2.0 Ref:** §9.3 item 8, §4.2 Topbar, §4.4 Paleta oklch (tema escuro já definido)

---

## 1. SYSTEM CONTEXT

**Sistema:** DJUD Painel — Backoffice governamental  
**Stack:** Next.js 16 App Router · React 19 · TypeScript · shadcn/ui new-york · Tailwind CSS v4 · `next-themes`  
**Arquivo alvo:** `components/layout/topbar.tsx`  
**Estado do tema:** CSS variables oklch para modo claro (`:root`) e escuro (`.dark`) já definidos em `app/globals.css` — **o tema escuro está 100% implementado**, falta apenas o toggle.

---

## 2. ARCHITECTURE RULES

- **Biblioteca:** `next-themes` — instalar se não existir: `npm install next-themes`
- **Provider:** `<ThemeProvider>` de `next-themes` deve envolver o layout em `app/layout.tsx` (dentro de `<body>`, antes do `{children}`)
- **Hook:** `const { theme, setTheme } = useTheme()` de `next-themes`
- **Ícones:** `<Sun>` e `<Moon>` de `lucide-react` — alternar baseado no tema atual
- **Botão:** `<Button variant="ghost" size="icon">` de `@/components/ui/button`
- **Sem flash:** `ThemeProvider` com `attribute="class"` e `defaultTheme="system"` e `enableSystem`
- **Posição:** canto direito da Topbar, antes do badge de role do usuário

---

## 3. MISSION

Adicionar botão de alternância de tema (claro/escuro) visível na Topbar:

1. Instalar `next-themes` (se não instalado)
2. Adicionar `<ThemeProvider>` em `app/layout.tsx`
3. Criar componente `<ThemeToggle>` com ícones Sun/Moon
4. Inserir `<ThemeToggle>` na Topbar ao lado do badge de role

---

## 4. TASK CONSTRAINTS

### ThemeProvider em app/layout.tsx:
```tsx
import { ThemeProvider } from "next-themes";

// Dentro do <body>:
<ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
  {children}
</ThemeProvider>
```

### Componente ThemeToggle (inline na topbar ou arquivo separado):
```tsx
"use client";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label="Alternar tema"
      className="h-9 w-9"
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
    </Button>
  );
}
```

### Verificar se `next-themes` já está instalado:
```bash
cat package.json | grep next-themes
```
Se não estiver: `npm install next-themes`

### Posição na Topbar:
```tsx
<div className="flex items-center gap-2">
  <ThemeToggle />          {/* novo */}
  <RoleBadge />           {/* existente */}
  <UserDropdown />        {/* existente */}
</div>
```

---

## 5. EXPECTED OUTPUT

### Arquivos criados:
- `components/ui/theme-toggle.tsx` (opcional — pode ser inline na topbar)

### Arquivos modificados:
- `app/layout.tsx` — adicionar `<ThemeProvider>`
- `components/layout/topbar.tsx` — adicionar `<ThemeToggle>`

### Verificação manual:
1. Click no botão Sun/Moon → tema alterna entre claro e escuro
2. Reload da página → tema persiste (next-themes usa localStorage)
3. Preferência do sistema: se OS está em dark mode, app inicia em dark
4. Sidebar, cards, badges, inputs — todos mudam de cor corretamente (CSS vars oklch)
5. Sem flash branco no carregamento

### TypeScript:
```bash
npx tsc --noEmit  # 0 erros
npm run build     # sem warnings de SSR
```
