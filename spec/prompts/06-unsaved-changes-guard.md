# Engineering Prompt 06 — Confirmação ao Sair com Alterações Não Salvas
**Prioridade:** 🟡 Média  
**Heurística Nielsen:** H5 Prevenção de erros  
**PRD v2.0 Ref:** §9.2 H5 "Sem confirmação antes de sair de formulário com alterações não salvas"

---

## 1. SYSTEM CONTEXT

**Sistema:** DJUD Painel — Backoffice governamental  
**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · react-hook-form 7  
**Páginas afetadas:**
- `app/(auth)/demandas/[id]/edit/page.tsx` — formulário de 22 campos
- `app/(auth)/users/[id]/edit/page.tsx` — formulário de usuário
- `app/(auth)/users/new/page.tsx` — criar usuário

---

## 2. ARCHITECTURE RULES

- **Hook:** `react-hook-form` já instalado — usar `formState.isDirty` (true quando algum campo foi alterado)
- **Sem biblioteca extra** — usar `window.addEventListener("beforeunload")` para fechar aba/recarregar
- **Navegação interna:** usar `useRouter` do Next.js — interceptar cliques em links não é simples no App Router; solução: mostrar `<AlertDialog>` ao clicar em "Cancelar"
- **Componente:** `<AlertDialog>` de `@/components/ui/alert-dialog` (já instalado)
- **Não bloquear** navegação programática após submit bem-sucedido

---

## 3. MISSION

Proteger o usuário contra perda de dados em formulários com alterações não salvas:

1. **Fechar aba / F5:** `beforeunload` event mostra diálogo nativo do browser ("Tem certeza que deseja sair?")
2. **Botão Cancelar:** se `isDirty === true`, mostra `<AlertDialog>` de confirmação antes de voltar
3. **Após submit com sucesso:** limpar o guard (não mostrar diálogo na navegação pós-save)

---

## 4. TASK CONSTRAINTS

### Hook reutilizável (criar em `hooks/use-unsaved-changes.ts`):
```typescript
"use client";
import { useEffect } from "react";

export function useUnsavedChanges(isDirty: boolean) {
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = ""; // Chrome requer string vazia
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);
}
```

### Uso no formulário:
```tsx
const form = useForm({ ... });
const { isDirty } = form.formState;
const [showCancelDialog, setShowCancelDialog] = useState(false);

useUnsavedChanges(isDirty);  // protege F5/fechar aba

// Botão cancelar:
<Button
  type="button"
  variant="outline"
  onClick={() => isDirty ? setShowCancelDialog(true) : router.back()}
>
  Cancelar
</Button>

// Dialog:
<AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Descartar alterações?</AlertDialogTitle>
      <AlertDialogDescription>
        Você tem alterações não salvas. Se sair agora, elas serão perdidas.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Continuar editando</AlertDialogCancel>
      <AlertDialogAction onClick={() => router.back()}>
        Descartar e sair
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

### Após submit com sucesso:
```tsx
// No onSubmit, após res.ok === true, ANTES do router.push:
form.reset(dataDoServidor); // isDirty vira false → guard desativado
router.push("/demandas");
```

---

## 5. EXPECTED OUTPUT

### Arquivos criados:
- `hooks/use-unsaved-changes.ts`

### Arquivos modificados:
- `app/(auth)/demandas/[id]/edit/page.tsx`
- `app/(auth)/users/[id]/edit/page.tsx`
- `app/(auth)/users/new/page.tsx`

### Verificação manual:
1. Abrir `/demandas/1/edit` → alterar o título → pressionar F5 → browser mostra diálogo nativo "Tem certeza?"
2. Abrir `/demandas/1/edit` → alterar campo → click "Cancelar" → AlertDialog aparece
3. Click "Continuar editando" → fecha dialog, permanece no formulário com dados intactos
4. Click "Descartar e sair" → volta para `/demandas`
5. Abrir formulário → **não alterar nada** → click "Cancelar" → volta direto sem dialog
6. Preencher formulário → submit com sucesso → redirect automático sem dialog (isDirty = false)

### TypeScript:
```bash
npx tsc --noEmit  # 0 erros
```
