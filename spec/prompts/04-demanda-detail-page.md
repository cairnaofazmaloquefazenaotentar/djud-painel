# Engineering Prompt 04 — Página de Detalhes da Demanda (/demandas/[id])
**Prioridade:** 🟡 Média  
**Heurística Nielsen:** H7 Flexibilidade e eficiência / H6 Reconhecimento  
**PRD v2.0 Ref:** §8.2 "Páginas ausentes — /demandas/[id]", §9.3 item 7

---

## 1. SYSTEM CONTEXT

**Sistema:** DJUD Painel — Backoffice governamental de Demandas Judiciais em Saúde  
**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · shadcn/ui new-york · Tailwind CSS v4 · lucide-react  
**Arquivo a criar:** `app/(auth)/demandas/[id]/page.tsx`  
**API disponível:** `GET /api/demandas/[id]` — retorna objeto Demanda completo (todos os 22 campos)  
**Endpoint de anexos:** `GET /api/demandas/[id]/attachments` — lista arquivos da demanda  

---

## 2. ARCHITECTURE RULES

- **Página client component:** `"use client"` — usa `useEffect + fetch` para carregar dados
- **Sem react-hook-form** — é página de visualização (read-only), não formulário
- **Componentes layout:** `<PageHeader>`, `<Separator>` de `@/components/backoffice` e `@/components/ui`
- **Cards:** `<Card>`, `<CardHeader>`, `<CardTitle>`, `<CardContent>` de `@/components/ui/card`
- **Badges:** `<StatusBadge>` de `@/components/backoffice` para status, prioridade, role
- **Skeleton loading:** `<Skeleton>` de `@/components/ui/skeleton` durante fetch
- **Cores:** CSS variables oklch exclusivamente — `text-muted-foreground`, `bg-muted/40`, `border-border`
- **Ícones:** lucide-react — `FileText`, `Scale`, `MapPin`, `User`, `Calendar`, `Tag`, `Paperclip`
- **Permissões:** `rolePermissions` de `@/lib/permissions` para mostrar/ocultar botão Editar

---

## 3. MISSION

Criar a página `/demandas/[id]` em modo **view only** (leitura), exibindo todos os campos da demanda organizados em seções, com:

1. **Header:** número DJUD + título + badges de Status e Prioridade + botão "Editar" (se permissão)
2. **Seção Dados Básicos:** número, título, descrição, status, prioridade, datas
3. **Seção Dados Judiciais:** numeroProcesso, areaTematica, trfRegiao, regiaoBrasil, objetoAcao, principioAtivo, dataEntradaDJUD
4. **Seção Relacionamentos:** organização, responsável, criado por, criado em, atualizado em
5. **Seção Anexos:** lista de arquivos com nome, tamanho, data upload, botão download

---

## 4. TASK CONSTRAINTS

### Estrutura de layout:
```tsx
<div className="space-y-6">
  <PageHeader
    title={`${demanda.numero} — ${demanda.titulo}`}
    description={`Status: ${demanda.status} · Prioridade: ${demanda.prioridade}`}
    actions={
      canEdit && (
        <Button onClick={() => router.push(`/demandas/${id}/edit`)}>
          <Edit2 className="h-4 w-4 mr-2" />
          Editar
        </Button>
      )
    }
  />

  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
    {/* Card Dados Básicos */}
    {/* Card Dados Judiciais */}
  </div>

  {/* Card Relacionamentos - full width */}
  {/* Card Anexos - full width */}
</div>
```

### InfoField component (inline, não criar arquivo separado):
```tsx
function InfoField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</span>
      <span className="text-sm">{value ?? <span className="text-muted-foreground/50 italic">—</span>}</span>
    </div>
  );
}
```

### Navegação:
- Botão "← Voltar" usa `router.back()` no PageHeader ou como link
- Link "Editar" leva para `/demandas/${id}/edit`
- Adicionar link "Ver detalhes" na coluna Título da DataTable em `/demandas/page.tsx`

### Skeleton loading:
- Enquanto `loading === true`: mostrar `<Skeleton>` de `h-8 w-48` no header + grid de `<Skeleton h-4>` no lugar dos campos

### Tratamento de erro:
- Se `res.ok === false`: exibir `<EmptyState>` com mensagem "Demanda não encontrada" + botão voltar

---

## 5. EXPECTED OUTPUT

### Arquivos criados:
- `app/(auth)/demandas/[id]/page.tsx` — view page completa

### Arquivos modificados:
- `app/(auth)/demandas/page.tsx` — adicionar link "Ver" ou tornar o título clicável levando para `/demandas/${id}`

### Verificação manual:
1. Abrir `/demandas` → click no título de qualquer demanda → abre `/demandas/[id]`
2. Todos os 22 campos aparecem (campos vazios mostram `—`)
3. Badges de Status e Prioridade com cores corretas
4. Botão "Editar" visível para ADMIN/MANAGER, oculto para OPERATOR
5. Click "Editar" → redireciona para `/demandas/[id]/edit` com form pré-preenchido
6. F5 na URL `/demandas/abc123` → página recarrega com dados corretos
7. URL inválida → EmptyState "não encontrada"

### TypeScript:
```bash
npx tsc --noEmit  # 0 erros
```
