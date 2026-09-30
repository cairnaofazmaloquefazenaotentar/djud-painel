# CLAUDE.md — Convenções do Projeto DJUD Painel

## Stack Obrigatória

- **Frontend/Fullstack:** Next.js 16 (App Router) + TypeScript strict
- **Styling:** Tailwind CSS 4 + tokens oklch (design-system/tokens.ts)
- **Data layer:** Prisma 5.13 (PostgreSQL/Neon) + TanStack Query + Zod
- **Auth:** next-auth@4.24 (Auth.js) + Google OAuth
- **Forms:** react-hook-form + @hookform/resolvers + Zod
- **Tables:** TanStack Table v8 + nuqs (URL state)
- **Gráficos:** Recharts
- **Emails:** Resend
- **Design System:** `design-system/tokens.ts` (oklch + tweakcn)
- **CI/CD:** GitHub Actions → Vercel

## Estrutura de Pastas

```
app/
  (auth)/         # Rotas protegidas (layout valida sessão)
    dashboard/    # Home do painel
    demandas/     # Dashboard analítico com 11 gráficos
    logs/         # Auditoria com filtros + export CSV
    users/        # Gestão de usuários
  (public)/
    login/        # Página de login Google OAuth
  api/
    auth/         # Auth.js handler
    demandas/     # CRUD + metrics endpoint
    users/        # CRUD usuários
    logs/         # Logs de auditoria
    organizations/# Listar organizações

components/
  backoffice/     # 8 componentes reutilizáveis (DataTable, FilterBar…)
  layout/         # Sidebar, Topbar, PageHeader
  ui/             # Primitivos (Button, AlertDialog)

lib/
  auth.ts         # NextAuth config
  db.ts           # Prisma singleton
  permissions.ts  # RBAC: rolePermissions, hasPermission, hasRole
  audit.ts        # createAuditLog, getAuditLogs
  email.ts        # Resend: sendInviteEmail, sendNotificationEmail
  stripe.ts       # Lazy init (N/A para DJUD)
  schemas.ts      # Zod schemas: Demanda
  user-schemas.ts # Zod schemas: User

stories/          # Storybook 8 — 8 components × 2-6 stories cada
.github/workflows/
  ci.yml          # typecheck → lint → build → storybook-build
  deploy.yml      # push main → Vercel prod
```

## Design System — Regras Invioláveis

1. **Nunca usar hex hardcoded nos componentes.** Sempre usar tokens semânticos Tailwind.
   - ✅ `bg-primary`, `text-foreground`, `border-border`
   - ❌ `bg-[#1a3a5c]`, `text-[#ffffff]`

2. **Fonte única de verdade é `design-system/tokens.ts`.**
   - Editar tokens.ts → rodar `npm run tokens` → reflete no produto E Storybook
   - CI roda `npm run tokens:check` antes de mergear

3. **Cores em oklch(L C H), nunca hsl/rgb/hex.**

## RBAC — Roles e Permissões

| Role     | Pode fazer                                                    |
|----------|---------------------------------------------------------------|
| ADMIN    | Tudo — incluindo criar/deletar usuários e gerenciar roles     |
| MANAGER  | Ver logs, editar demandas, ler usuários                       |
| OPERATOR | Criar/ler demandas, sem acesso a usuários/logs                |

Definido em `lib/permissions.ts` via `rolePermissions`.

## Scripts

```bash
npm run dev              # Dev server (localhost:3000)
npm run tokens           # Regenerar globals.css a partir de tokens.ts
npm run tokens:check     # Validar sync (usado no CI)
npm run db:push          # Sync Prisma schema → banco
npm run build            # Build production
npm run lint             # ESLint check

# Pesquisa de Preços — bases de apoio (Python: openpyxl + psycopg; lê DATABASE_URL de .env.local)
python scripts/import_catmat_classes.py --file "Catmats - 16 Classes - DD.MM.AAAA.xlsx" --dry-run|--confirm
python scripts/import_cmed_registros.py --file "01. CMED - grande.padrão - ....xlsx" --dry-run|--confirm

# Cesta da Pesquisa de Preços — cria a tabela CestaItem (equivale ao db:push do model)
python scripts/create_cesta_table.py --dry-run|--confirm

# Curadoria da Pesquisa de Preços — cria CestaOrcamento e CestaItem.exclusoes
python scripts/create_orcamento_table.py --dry-run|--confirm
```

## Pesquisa de Preços (aba /pesquisa-preco)

- Três filtros obrigatórios: **Código do material** (CATMAT de até 6 dígitos ou Registro ANVISA de 13),
  **Descrição CATMAT** e **Unidade de fornecimento**. Lógica em `lib/pesquisa-preco.ts`.
- Tabelas de apoio (schema public): `CatmatItem` (catálogo das 16 classes da saúde) e `CmedRegistro`
  (registro ANVISA → CATMAT, unidade de fornecimento, `qtEmbalagem`). Carregadas pelos scripts acima
  (REPLACE; criam a tabela se ausente com a mesma DDL do `prisma db push`).
- Preço CMED é por embalagem (`PrecoCmed.pmvgSemImpostos`); a pesquisa divide por `qtEmbalagem` para
  refletir a menor unidade de fornecimento. Registros sem CATMAT só têm preço CMED.
- Fontes: CMED (teto), BPS, SIASG judicial, PNCP e **orçamento direto de fornecedor**
  (art. 5º, IV — informado pelo usuário, não consultado em base). Cruzamento por código:
  BPS/SIASG usam `"BR0" + CATMAT`, PNCP usa o código puro.
- A base ComprasGov (`sismat.ComprasGovPreco`) **não** entra na Pesquisa de Preços: não traz CATMAT e
  só poderia ser cruzada por nome do PDM, sem dosagem. Ela alimenta apenas a aba Preços.
- `normalizarTexto`/`normalizarUnidade` (TS) são espelhadas em `scripts/precos_norm.py` — alterar as duas.

### Filtros opcionais ("Mais filtros")

- Recolhidos sob **"Mais filtros +"**, abaixo dos obrigatórios: **Fornecedor**, **Fabricante** e
  **CNPJ Comprador**. Texto casa por trecho (`contains`, case-insensitive); o CNPJ aceita completo ou
  só a raiz, com ou sem pontuação (`variantesCnpj` casa por prefixo nas duas formas de gravação).
- Tipos e helpers puros ficam em `lib/pesquisa-preco-filtros.ts`, **não** em `lib/pesquisa-preco.ts`:
  a página é Client Component e importar de lá arrastaria o Prisma para o bundle do navegador.
  `lib/pesquisa-preco.ts` reexporta tudo (`export *`), então o servidor importa de um lugar só.
- Cobertura por base (`FONTE_SEM_CAMPO`) — a fonte que **não tem a coluna** é excluída da apuração
  enquanto o filtro estiver ativo, e o motivo aparece no painel, no relatório e nas observações.
  Misturar registros filtrados com não filtrados falsearia a mediana das medianas.

  | Filtro         | BPS | SIASG              | PNCP              | CMED            |
  |----------------|-----|--------------------|-------------------|-----------------|
  | Fornecedor     | ✅  | ✅                 | coluna vazia¹     | n/a             |
  | Fabricante     | ✅  | coluna vazia¹      | ❌ sem coluna     | ✅ laboratório  |
  | CNPJ Comprador | ✅ `cnpjInstituicao` | ❌ só `cnpjFornecedor` | coluna vazia¹ (`cnpjOrgao`) | n/a |

  ¹ A coluna existe no schema e é consultada normalmente; hoje a carga está vazia, então o filtro
  simplesmente não retorna nada. Não entra em `FONTE_SEM_CAMPO` de propósito — passa a filtrar
  sozinha quando os dados chegarem.
- Fabricante recorta **também o teto**: o PMVG passa a ser o do laboratório escolhido.
- A cesta guarda só `codigo`+`unidade`+`uf`; o relatório consolidado refaz a pesquisa **sem** os
  filtros opcionais. A tela avisa isso ao adicionar um item com filtro ativo.

### Estatística e curadoria (art. 6º da IN 65/2021)

- Cada fonte apura os **três métodos** admitidos pelo art. 6º — **média, mediana e menor
  valor** — mais o maior valor, o desvio padrão e o coeficiente de variação
  (`Estatisticas` em `lib/pesquisa-preco-curadoria.ts`). Painel e relatório exibem os três.
- Dois **consolidados**, porque respondem a perguntas diferentes e o relatório explica isso:
  - `porFonte` — cada base pesa igual; estatísticas sobre o vetor das medianas das fontes.
    É daqui que sai o preço adotado (**mediana das medianas**, `METODO_ADOTADO`).
  - `porRegistro` — cada compra pesa igual; todos os registros depurados num conjunto único.
    Contraprova da ordem de grandeza, nunca preço adotado: a base mais numerosa domina.
- **Exclusão justificada** de registros antes da emissão (art. 6º, §§ 1º e 2º): a
  justificativa é obrigatória (`MOTIVO_MIN`) e o registro descartado **continua impresso**
  no relatório, com o motivo — a rastreabilidade é do descarte, não só do que ficou. Também
  vai para o `AuditLog`. Ordem do cálculo: primeiro saem os descartes manuais, **depois** o
  IQR incide sobre o que sobrou.
- `REGISTROS_ANALISE` (150) por fonte = os mais recentes **mais todos os outliers do IQR**;
  sem a segunda parte, justamente os registros a desconsiderar ficariam fora da lista.
- **Orçamento direto de fornecedor** entra como uma fonte a mais (uma mediana no vetor
  consolidado) e **não** passa por IQR — as propostas foram escolhidas a dedo pelo
  responsável. `considerarNoCalculo: false` mantém a cotação no relatório, fora da conta.
- O relatório nomina **empresa vencedora, marca e fabricante** em cada registro
  (BPS: fabricante; SIASG: fabricante + marca; PNCP: só fornecedor).
- Tela de curadoria: `components/pesquisa-preco/curadoria-dialog.tsx`, usada tanto pela
  pesquisa avulsa (estado efêmero, enviado junto com o relatório) quanto por item da cesta
  (gravado). A prévia do impacto é recalculada **no servidor** (`POST /api/precos/buscar`),
  nunca no navegador: o número exibido tem de ser o mesmo que sai impresso.

### Cesta de itens (carrinho)

- Tabela `CestaItem` (schema public), **uma cesta por usuário** (`userId`) — fica no banco, não em
  localStorage, justamente para persistir entre sessões/máquinas. Quem sai sem gerar o relatório
  encontra os mesmos itens ao logar de novo.
- Chave lógica do item: `codigo` + `unidade` + `uf`. Adicionar de novo **soma a quantidade** em vez
  de duplicar a linha. Teto de `MAX_ITENS_CESTA` (30) itens em `lib/cesta-schemas.ts`.
- Os campos `precoReferencia`/`limitePmvg`/`precoFinal` são **snapshot** do momento em que o item
  entrou na cesta — servem só para o total exibido na tela. O relatório consolidado
  (`POST /api/relatorios/cesta`) **refaz `pesquisarPrecos` item a item na emissão** (concorrência 4)
  e é esse preço, datado, que instrui o processo.
- Curadoria por item fica no banco: `CestaItem.exclusoes` (JSONB) e a tabela
  `CestaOrcamento`. O relatório da cesta refaz `pesquisarPrecos` **reaplicando** as duas —
  são decisão do responsável, não resultado de consulta, e não caducam com ela. `exclusoes`
  e `orcamentos` no PATCH do item são **substituição total**, não incremento.
- Gerar o relatório esvazia a cesta por padrão (checkbox na modal permite manter).
- HTML dos relatórios: blocos compartilhados em `lib/relatorio-pesquisa-preco.ts`, usados tanto pelo
  relatório de um item quanto pelo da cesta.

## Demandas — filtro por CATMAT / Registro ANVISA

- `Demanda` **não tem coluna CATMAT**: o medicamento vem do Redmine como texto livre em
  `principioAtivo` ("Nusinersen", "Elexacaftor / Ivacaftor / Tezacaftor") e, em ~14 mil demandas,
  só em `titulo`/`descricao`. O filtro `?catmat=` da lista (`GET /api/demandas`) traduz o código
  para substância em `lib/demandas-catmat.ts`: `resolverItem()` (o mesmo da Pesquisa de Preços) →
  substância do `CatmatItem` + `substancia` dos `CmedRegistro` do código → radicais → `contains`
  em `principioAtivo`/`titulo`/`descricao`.
- Radical = palavra mais longa da substância, sem sal/veículo na frente ("SUCCINATO DE"), sem
  sufixo ("SÓDICA") e sem a vogal final: NUSINERSENA → NUSINERSEN casa "Nusinersen" e
  "Nusinersena"; procurado com e sem acento. Mínimo de 5 caracteres.
- **OR entre grupos, AND dentro**: o registro "CANABIDIOL;TETRAIDROCANABINOL" exige as duas
  substâncias (é aquele produto, não qualquer canabidiol). Marca comercial (`produto`) só entra
  na busca por registro ANVISA — pelo CATMAT seriam dezenas de marcas.
- Código não encontrado → a rota devolve lista vazia com `filtroCatmat.motivo`, e a tela mostra o
  motivo em vez de uma tabela vazia muda. Quando encontra, a tela mostra o código, a descrição e
  por quais substâncias está filtrando.
- O campo da tela aplica o valor com 450 ms de pausa (`catmatInput` → `catmat`): um código tem
  de 4 a 13 dígitos e cada tecla resolveria um código parcial.
- O dashboard também recebe o filtro: `getMetricsData` resolve o código e aplica
  `whereDemandaPorCatmat` (ORM) e `sqlDemandaPorCatmat` (`$queryRaw` das séries por mês e
  por ano). **As duas versões precisam casar exatamente** — números diferentes entre a lista
  e o painel para o mesmo código seriam impossíveis de explicar. Código não encontrado →
  painel zerado com o motivo na tela, não gráficos vazios sem explicação.

## Dashboard — ranking por ano e exportação

- **Ranking por ano** (`lib/metrics-ranking-anual.ts`, `GET /api/demandas/metrics/ranking-anual`):
  os sete principais rankings (princípios ativos por volume e por valor, grupo temático,
  objeto da ação, UF, TRF, fornecedor) abertos ano a ano. Rota separada de `/metrics` porque
  são sete agregações a mais — só rodam quando a aba "Ranking por Ano" está aberta.
- O corte do Top 15 é pelo **total do período**, não por ano: senão a composição da lista
  mudaria a cada coluna e a comparação perderia sentido. O ano é o de `criadoEm`, o mesmo
  eixo das séries mensais.
- O gráfico plota só as **5 primeiras** posições: a paleta categórica de
  `components/dashboard/charts/chart-utils.ts` é atribuída em ordem fixa e sem reciclagem.
  A tabela logo abaixo cobre as 15 sem depender de cor.
- **Exportação** (`lib/metrics-export.ts`, `GET /api/demandas/metrics/export?format=csv|html`):
  planilha CSV (separador `;`, decimal com vírgula e BOM UTF-8 — sem os três o Excel pt-BR
  estraga o arquivo) ou relatório HTML imprimível. A apuração é **refeita no servidor** com
  os mesmos filtros, então a planilha traz a série mensal inteira e não só os pontos que
  couberam no gráfico. Registrada no `AuditLog`.

## Variáveis de Ambiente

Copiar `.env.example` → `.env.local`:

```
DATABASE_URL=              # Neon PostgreSQL
AUTH_SECRET=               # openssl rand -base64 32
AUTH_GOOGLE_ID=            # Google Cloud Console
AUTH_GOOGLE_SECRET=        # Google Cloud Console
RESEND_API_KEY=            # Resend dashboard
NEXT_PUBLIC_APP_URL=       # http://localhost:3000
NEXTAUTH_URL=              # http://localhost:3000
```

Secrets GitHub Actions (para deploy):
```
VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID
```

---

**Criado em:** Abril/2026 | **Versão:** v0.1.0
**Base:** Boilerplate Manual v2 + PRDv2 Painel DJUD
**Etapas concluídas:** 1–11 (todas)
