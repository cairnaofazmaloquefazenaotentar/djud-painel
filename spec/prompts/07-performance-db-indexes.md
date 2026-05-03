# Engineering Prompt 07 — Índices de Performance no Banco (51.501 registros)
**Prioridade:** 🟡 Média  
**Heurística Nielsen:** H1 Visibilidade do status (respostas lentas são invisibilidade do progresso)  
**PRD v2.0 Ref:** §7.5 "Performance com 51.501 Registros"

---

## 1. SYSTEM CONTEXT

**Sistema:** DJUD Painel — Backoffice governamental  
**Stack:** Prisma 5 · PostgreSQL (Neon serverless) · Next.js 16 API Routes  
**Arquivo alvo:** `prisma/schema.prisma`  
**Problema:** Queries de `COUNT(*)`, `groupBy`, e `DATE_TRUNC` sem índices compostos causam full table scan em 51.501 registros — potencial lentidão nos filtros da DataTable e nos gráficos do Dashboard.

---

## 2. ARCHITECTURE RULES

- **ORM:** Prisma 5 — usar `@@index([campo1, campo2])` na model `Demanda`
- **Migration:** `npx prisma migrate dev --name add_performance_indexes` (ambiente dev) ou `npx prisma db push` (dev rápido)
- **Sem mudanças** nos modelos TypeScript nem nas queries — apenas adição de índices
- **Neon serverless:** aceita `CREATE INDEX CONCURRENTLY` — mas via Prisma o index é criado no migrate normalmente
- **Campos mais filtrados** (baseado nas queries de `/api/demandas/route.ts` e `/api/demandas/metrics/route.ts`):

---

## 3. MISSION

Adicionar índices compostos e simples ao modelo `Demanda` no `prisma/schema.prisma` para cobrir os padrões de query mais comuns:

1. Índice `(status, criadoEm)` — filtro de status + ordenação por data
2. Índice `(prioridade, criadoEm)` — filtro de prioridade + ordenação
3. Índice `(areaTematica)` — groupBy para gráfico "Grupo Temático"
4. Índice `(trfRegiao)` — groupBy para gráfico "TRF Região"
5. Índice `(regiaoBrasil)` — groupBy para gráfico "Região Brasil"
6. Índice `(dataEntradaDJUD)` — filtro e ordenação por data de entrada
7. Verificar se `(organizacaoId)` e `(responsavelId)` já têm índice (FK geralmente gera)

---

## 4. TASK CONSTRAINTS

### Adições no `prisma/schema.prisma` (model Demanda):
```prisma
model Demanda {
  // ... campos existentes ...

  @@index([status, criadoEm])
  @@index([prioridade, criadoEm])
  @@index([areaTematica])
  @@index([trfRegiao])
  @@index([regiaoBrasil])
  @@index([dataEntradaDJUD])
  @@index([organizacaoId])
  @@index([responsavelId])
  // Verificar se @@index([numeroExterno]) já existe (adicionado na Sprint 8)
  // Verificar se @@index([numeroProcesso]) já existe
}
```

### Verificar indexes existentes antes de adicionar:
```bash
# Listar indexes atuais no schema
grep -A 5 "@@index" prisma/schema.prisma
```

### Não duplicar indexes — se já existir `@@index([areaTematica])`, não adicionar novamente.

### Após adicionar ao schema:
```bash
npx prisma migrate dev --name add_performance_indexes
# ou em dev:
npx prisma db push
```

### Query de validação (executar via prisma studio ou psql):
```sql
EXPLAIN ANALYZE
SELECT status, COUNT(*) FROM "Demanda" GROUP BY status;
-- Verificar que usa "Index Scan" em vez de "Seq Scan"
```

---

## 5. EXPECTED OUTPUT

### Arquivos modificados:
- `prisma/schema.prisma` — novos `@@index` no model `Demanda`
- `prisma/migrations/[timestamp]_add_performance_indexes/` — migration gerada

### Verificação:
1. `npx prisma migrate dev` executa sem erros
2. `npx prisma studio` → tabela Demanda → índices visíveis
3. Dashboard carrega métricas em < 500ms com 51.501 registros
4. DataTable filtrando por status retorna em < 200ms

### Build check:
```bash
npm run build  # 0 erros (schema change não quebra TypeScript)
```
