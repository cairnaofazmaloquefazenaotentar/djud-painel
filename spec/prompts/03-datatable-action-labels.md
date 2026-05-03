# Engineering Prompt 03 — Labels nos Botões de Ação da DataTable
**Prioridade:** 🟡 Média  
**Heurística Nielsen:** H6 Reconhecimento em vez de memorização  
**PRD v2.0 Ref:** §9.2 H6 "Botões de ação sem label", §9.3 item 5

---

## 1. SYSTEM CONTEXT

**Sistema:** DJUD Painel — Backoffice governamental  
**Stack:** Next.js 16 · React 19 · TypeScript · shadcn/ui new-york · lucide-react · TanStack Table v8  
**Páginas afetadas:**
- `app/(auth)/demandas/page.tsx` — colunas de ações: Edit, Delete
- `app/(auth)/users/page.tsx` — colunas de ações: Edit, Delete
- `app/(auth)/logs/page.tsx` — coluna de ações: Export CSV (verificar)

---

## 2. ARCHITECTURE RULES

- **Componentes:** `<Button variant="ghost" size="sm">` de `@/components/ui/button`
- **Ícones:** `<Edit2>`, `<Trash2>`, `<Lock>` de `lucide-react` (já importados)
- **Layout dos botões:** `className="h-8 px-2 gap-1.5"` com ícone `h-3.5 w-3.5` + `<span>`
- **Responsividade:** label visível apenas em `sm:` e acima — `<span className="text-xs hidden sm:inline">`
- **Botões desabilitados** (sem permissão): mantêm ícone `<Lock>` sem label (intencionalmente)
- **Destructive:** botão Delete usa `text-destructive hover:text-destructive/90 hover:bg-destructive/10` (sem `variant="destructive"` — para não chamar atenção excessiva)
- **Sem tooltip extra** — o atributo `title` existente já serve como fallback para mobile/screen readers

---

## 3. MISSION

Adicionar texto descritivo curto ao lado dos ícones nos botões de ação das DataTables para que usuários reconheçam a ação sem precisar memorizar o ícone.

**Antes:**
```tsx
<Button variant="ghost" size="sm">
  <Edit2 className="h-3.5 w-3.5" />
</Button>
```

**Depois:**
```tsx
<Button variant="ghost" size="sm" className="h-8 px-2 gap-1.5" title="Editar demanda">
  <Edit2 className="h-3.5 w-3.5" />
  <span className="text-xs hidden sm:inline">Editar</span>
</Button>
```

---

## 4. TASK CONSTRAINTS

### Textos dos botões (em português, sem anglicismos):
- Editar: `"Editar"` (não "Edit", não "Modificar")
- Deletar: `"Excluir"` (não "Deletar", não "Remover")
- Exportar: `"Exportar CSV"` se existir

### Regras:
- Manter `title` atributo existente — complementar, não substituir
- `<span className="hidden sm:inline text-xs">` — oculto em mobile (< 640px), visível em sm+
- Botões com `<Lock>` (sem permissão) **não recebem label** — ícone Lock comunica "bloqueado" suficientemente
- Verificar se `app/(auth)/users/page.tsx` já tem o padrão implementado (pode estar feito em sessão anterior)
- **Não alterar** largura ou padding de outras colunas da tabela

### Padrão de coluna de ações:
```tsx
{
  id: "actions",
  header: "Ações",
  cell: ({ row }) => (
    <div className="flex gap-1">
      {canEdit ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/demandas/${row.original.id}/edit`)}
          className="h-8 px-2 gap-1.5"
          title="Editar demanda"
        >
          <Edit2 className="h-3.5 w-3.5" />
          <span className="text-xs hidden sm:inline">Editar</span>
        </Button>
      ) : (
        <Button variant="ghost" size="sm" disabled className="h-8 px-2 opacity-40" title="Sem permissão">
          <Lock className="h-3.5 w-3.5" />
        </Button>
      )}
      {canDelete ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDeleteDialog({ open: true, ... })}
          className="h-8 px-2 gap-1.5 text-destructive hover:text-destructive/90 hover:bg-destructive/10"
          title="Excluir demanda"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span className="text-xs hidden sm:inline">Excluir</span>
        </Button>
      ) : (
        <Button variant="ghost" size="sm" disabled className="h-8 px-2 opacity-40" title="Sem permissão">
          <Lock className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  ),
}
```

---

## 5. EXPECTED OUTPUT

### Arquivos modificados:
- `app/(auth)/demandas/page.tsx` — coluna `actions`
- `app/(auth)/users/page.tsx` — coluna `actions` (verificar se já feito)

### Verificação manual:
1. Abrir `/demandas` em 1280px → botões mostram "Editar" e "Excluir" ao lado dos ícones
2. Redimensionar para 375px → labels somem, apenas ícones visíveis (mais compacto)
3. Hover sobre botão Excluir → cor destructive aplicada
4. Usuário OPERATOR → botões com Lock sem label (apenas ícone)

### TypeScript:
```bash
npx tsc --noEmit  # 0 erros
```
