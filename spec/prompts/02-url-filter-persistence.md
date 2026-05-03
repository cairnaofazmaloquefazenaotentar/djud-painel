# Engineering Prompt 02 — Persistência de Filtros na URL
**Prioridade:** 🔴 Alta  
**Heurística Nielsen:** H3 Controle e liberdade do usuário  
**PRD v2.0 Ref:** §9.3 item 4, §3.3 (FilterBar), §3.7 (Logs)

---

## 1. SYSTEM CONTEXT

**Sistema:** DJUD Painel — Backoffice governamental  
**Stack:** Next.js 16 App Router · React 19 · TypeScript · `useRouter` + `useSearchParams` do `next/navigation`  
**Páginas afetadas:**
- `app/(auth)/demandas/page.tsx` — filtros: busca, status, prioridade, areaTematica, trfRegiao, regiaoBrasil
- `app/(auth)/users/page.tsx` — filtros: busca, role
- `app/(auth)/logs/page.tsx` — filtros: busca, acao, entidade, dataInicio, dataFim
- `app/(auth)/organizations/page.tsx` — sem filtros (sem alteração necessária)

---

## 2. ARCHITECTURE RULES

- **Pattern aprovado:** `router.replace(pathname + "?" + params.toString(), { scroll: false })` — não usa `router.push` (não polui o histórico)
- **Inicialização do estado:** sempre ler `searchParams.get("campo") ?? ""` como valor inicial dos `useState`
- **Debounce:** campo de busca livre usa `setTimeout` de 400ms antes de atualizar a URL (evita request a cada tecla)
- **Reset:** `handleReset` chama `router.replace(pathname)` (sem query params) + reseta todos os `useState`
- **Não usar** `next/router` (pages router) — apenas `next/navigation`
- **Paginação:** ao mudar filtros, resetar `page` para `"1"`
- **Sem biblioteca extra** — usar apenas `URLSearchParams` nativo

---

## 3. MISSION

Garantir que todos os filtros ativos das páginas Demandas, Usuários e Logs sejam refletidos na URL em tempo real, permitindo:

1. **Compartilhar link** com filtros aplicados (ex: `/demandas?status=Aberta&prioridade=Alta`)
2. **Voltar com browser back** e recuperar os filtros exatamente como estavam
3. **Reload de página** mantém os filtros (estado vem da URL, não de `useState` efêmero)

---

## 4. TASK CONSTRAINTS

### Padrão a implementar em cada página:

```typescript
// 1. Inicializar estado a partir da URL
const searchParams = useSearchParams();
const [busca, setBusca] = useState(searchParams.get("busca") ?? "");
const [status, setStatus] = useState(searchParams.get("status") ?? "");

// 2. Helper para atualizar URL
const updateUrl = useCallback((updates: Record<string, string>) => {
  const params = new URLSearchParams(searchParams.toString());
  Object.entries(updates).forEach(([key, value]) => {
    if (value) params.set(key, value);
    else params.delete(key);
  });
  params.set("page", "1"); // resetar paginação ao filtrar
  router.replace(`${pathname}?${params.toString()}`, { scroll: false });
}, [searchParams, pathname, router]);

// 3. Handlers chamam updateUrl junto com setState
const handleBusca = (value: string) => {
  setBusca(value);
  updateUrl({ busca: value });
};

// 4. Reset limpa tudo
const handleReset = () => {
  setBusca(""); setStatus(""); /* ... outros campos */
  router.replace(pathname, { scroll: false });
};
```

- **Página de Demandas** já tem `updateUrl` parcialmente implementada — verificar e completar para todos os filtros (areaTematica, trfRegiao, regiaoBrasil estão faltando)
- **Página de Usuários** — implementar do zero seguindo o padrão
- **Página de Logs** — implementar, incluindo filtro de datas (dataInicio/dataFim como string ISO)
- Debounce **apenas** no campo de busca livre — selects atualizam URL imediatamente

---

## 5. EXPECTED OUTPUT

### Arquivos modificados:
- `app/(auth)/demandas/page.tsx`
- `app/(auth)/users/page.tsx`
- `app/(auth)/logs/page.tsx`

### Verificação manual:
1. Abrir `/demandas`, aplicar filtro Status = "Aberta" → URL muda para `/demandas?status=Aberta&page=1`
2. Copiar URL → abrir nova aba → filtro Status = "Aberta" está pré-selecionado
3. Clicar "Limpar filtros" → URL volta para `/demandas` sem query params
4. Aplicar filtro → navegar para `/demandas/1/edit` → voltar (browser back) → filtro ainda ativo
5. Reload F5 com URL `/users?role=ADMIN` → filtro Role = ADMIN aparece selecionado

### TypeScript:
```bash
npx tsc --noEmit  # 0 erros
```
