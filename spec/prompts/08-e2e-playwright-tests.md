# Engineering Prompt 08 — Testes E2E com Playwright
**Prioridade:** 🟢 Baixa (mas crítico para confiabilidade)  
**PRD v2.0 Ref:** §9.3 item 13, §8.4 item 6

---

## 1. SYSTEM CONTEXT

**Sistema:** DJUD Painel — Backoffice governamental  
**Stack:** Next.js 16 · TypeScript · Playwright · GitHub Actions CI  
**Estado atual:** Zero testes E2E — apenas TypeScript estático (`tsc --noEmit`) no CI  
**Credenciais de teste:** Definir em `.env.test` — usuário admin de test seed

---

## 2. ARCHITECTURE RULES

- **Framework:** `@playwright/test` — instalar: `npm install -D @playwright/test`
- **Config:** `playwright.config.ts` na raiz do projeto
- **Base URL:** `http://localhost:3000` (local) — CI usa `http://localhost:3000` com `webServer`
- **Autenticação:** usar `storageState` para reutilizar sessão entre testes (login uma vez, salvar cookies)
- **Diretório:** `tests/e2e/` para arquivos `.spec.ts`
- **Sem dependência de banco real** em CI — usar banco SQLite em memória ou fixture JSON para mock
- **Paralelo:** `workers: 1` em CI (Neon serverless tem limite de conexões)

---

## 3. MISSION

Implementar 5 testes E2E cobrindo os fluxos críticos do sistema:

1. **Login** — credenciais válidas e inválidas
2. **Dashboard** — carrega sem erros, métricas aparecem
3. **CRUD Demanda** — criar, visualizar, editar, deletar
4. **Filtros DataTable** — aplicar filtro de status, verificar URL atualizada
5. **Export CSV** — click exportar, download ocorre

---

## 4. TASK CONSTRAINTS

### playwright.config.ts:
```typescript
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
  },
});
```

### tests/e2e/auth.setup.ts (fixture de login):
```typescript
import { test as setup } from "@playwright/test";
import path from "path";

const authFile = path.join(__dirname, "../.auth/user.json");

setup("authenticate", async ({ page }) => {
  await page.goto("/login");
  await page.fill('[name="email"]', process.env.TEST_EMAIL!);
  await page.fill('[name="password"]', process.env.TEST_PASSWORD!);
  await page.click('button[type="submit"]');
  await page.waitForURL("/dashboard");
  await page.context().storageState({ path: authFile });
});
```

### Testes obrigatórios:

**tests/e2e/dashboard.spec.ts:**
- Navegar para `/dashboard` → 4 metric cards visíveis
- Nenhum erro de console (sem 500)

**tests/e2e/demandas-crud.spec.ts:**
- Criar demanda via form em `/demandas/new`
- Verificar que aparece na lista `/demandas`
- Editar título em `/demandas/[id]/edit`
- Deletar com ConfirmDialog
- Verificar que sumiu da lista

**tests/e2e/demandas-filters.spec.ts:**
- Aplicar filtro Status = "Aberta" → URL contém `?status=Aberta`
- Limpar filtros → URL sem query params

### Adicionar ao `package.json`:
```json
"scripts": {
  "test:e2e": "playwright test",
  "test:e2e:ui": "playwright test --ui"
}
```

### Adicionar ao GitHub Actions CI (`.github/workflows/ci.yml`):
```yaml
- name: Install Playwright browsers
  run: npx playwright install --with-deps chromium
- name: Run E2E tests
  run: npm run test:e2e
  env:
    TEST_EMAIL: ${{ secrets.TEST_EMAIL }}
    TEST_PASSWORD: ${{ secrets.TEST_PASSWORD }}
```

---

## 5. EXPECTED OUTPUT

### Arquivos criados:
- `playwright.config.ts`
- `tests/e2e/auth.setup.ts`
- `tests/e2e/dashboard.spec.ts`
- `tests/e2e/demandas-crud.spec.ts`
- `tests/e2e/demandas-filters.spec.ts`
- `.github/workflows/ci.yml` (modificar existente)

### Verificação:
```bash
npx playwright install chromium
npm run test:e2e
# Deve mostrar: 5 passed (ou mais)
```
```bash
npx playwright show-report
# Relatório HTML com screenshots de cada passo
```
