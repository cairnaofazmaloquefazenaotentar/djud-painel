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

# Listas mensais CMED (todas as competências e alíquotas) — REPLACE por competência; pula o que já
# está gravado com o mesmo sha256 (--recarregar força). Opções: --somente 037-048, --vigencia, --textos,
# --limpar-orfas, --saida relatorio.csv
python scripts/import_cmed_mensal.py --dir cmed_originais_arr --dry-run|--confirm
python scripts/cmed_layout.py            # autoteste: ALIQUOTAS_ICMS do TS == Python, cabeçalhos e valores

# Associação Registro ANVISA × CATMAT na Grande Padrão (só openpyxl; não toca banco). Saídas em
# saida_catmat/ (fora do git). --backtest = 6.1; --backtest-cego = 6.2 (~10 min); --revisar-nao-tem = P3
python scripts/associar_catmat.py --gp "01. CMED - grande.padrão - ....xlsx" --catalogo "Catmats 11-07.CSV" \
  --unidades "Extração Unidades de Fornecimento 29-09.csv" --lista 08.26.xlsx --dry-run|--confirm \
  [--backtest] [--backtest-cego] [--revisar-nao-tem] [--somente-vigentes]
python -m pytest scripts/catmat_assoc/testes -q   # parser da apresentação/catálogo e guardas
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

### Listas mensais da CMED (todas as competências)

- Tabelas `CmedCompetencia` (uma linha por lista), `CmedPrecoVersao` (versões de preço deduplicadas
  por sha1 do conteúdo) e `CmedVigencia` (competência × versão), carregadas por
  `scripts/import_cmed_mensal.py` das planilhas `NNN.mmm.aa.xlsx` (001 = jan/2017; a pasta
  `cmed_originais_arr/` fica fora do git). **Carregado: jan/2020 → ago/2026 (037–116).**
- **A tela ainda lê `PrecoCmed`.** Os filtros Mês de Competência / Alíquota ICMS e o uso destas tabelas
  no teto são o passo seguinte de `PROMPT_CMED_mensal_pesquisa_precos.md` (seção 7).
- `pf`/`pmvg` = arrays JSON alinhados a `ALIQUOTAS_ICMS` (`lib/cmed-aliquotas.ts`, espelho
  `scripts/cmed_layout.py`). **Append-only**: nunca reordenar; alíquota nova entra no fim dos dois
  arquivos (o hash usa código → valor, então acrescentar não muda versões gravadas; arrays antigos
  ficam mais curtos, posição ausente = null). Valor sempre o publicado, nunca derivado por fórmula.
- Leitura **dirigida pelo cabeçalho**: cabeçalho na linha 4 ou 5, "PRINCÍPIO ATIVO" → "SUBSTÂNCIA"
  (out/2023), "PMVG Sem Imposto(s)", "PF 12 %  ALC", "PF 20,5%2" (nota no cabeçalho); preço como
  número, "1383,38" ou "2504.84". Coluna desconhecida vai para `extras` e sai no relatório; alíquota
  fora da lista **aborta** o arquivo.
- Notas da CMED: preço com asterisco ("3079.55*", produtos CONFAZ 87/ICMS 0% desde dez/2023) grava o
  número e `extras.notaPf`/`notaPmvg = "*"`. ANÁLISE RECURSAL: "(AR)"/Sim = `true`; nota "(n)" fica
  em `extras.analiseRecursal` com o booleano `null` (em fev/2024 quase todas as linhas trazem "(3)").
- Nas listas 2020+ "Liberado" só aparece em REGIME DE PREÇO, com preço publicado; `precoLiberado`
  (texto "Liberado" na célula de preço, padrão de 2017) fica `false`.
- Duplicata no mesmo mês (registro + GGREM): idêntica → descarta; só texto/booleano diferente →
  mescla; preço diferente → **conflito**, as duas versões ficam vigentes (jan/2020: 33, da CIMED).
- Deduplicação real ~2,7× (779.595 versões para 2.127.976 pares): a TARJA muda de formato quase todo
  mês ("Tarja Vermelha(*)" / "- (*)" / "Tarja -(*)") e qualquer campo diferente gera versão nova.

### Associação Registro × CATMAT (Grande Padrão)

- `scripts/associar_catmat.py` + pacote `scripts/catmat_assoc/` propõem, para cada registro da GP sem
  CATMAT (e para cada registro novo da lista mensal), **CATMAT + Descrição + Unidade de fornecimento +
  Qt_Embal**, com nível, aderência (R14) e evidência. Nunca sobrescreve a GP: grava uma **cópia**
  (`saida_catmat/grande.padrao.AAAA-MM.proposta.xlsx`, fórmulas das linhas 1–3 intactas, colunas novas
  a partir de R) e a planilha `revisao_catmat_AAAA-MM.xlsx` (Resumo, Nível A–D, Fora, "Não tem →
  possível CATMAT", Conflitos, Suspeitas na GP, Pontes aprendidas, Backtest).
- Entradas lidas **pelo cabeçalho**: GP (linha com Registro/CATMAT/Qt_Embal), lista mensal (REGISTRO +
  PF/PMVG, linha 4/5/54…), catálogo e extração de unidades (CSV `@`, cp1252). O catálogo de 11/07 é a
  única fonte de código; item só da extração (criado depois) aparece como opção, nunca como proposta.
- **Níveis**: **A** = precedente da GP unânime (irmão = mesma raiz + assinatura + acessórios, ou gêmeos
  de ≥ 2 raízes), CATMAT Ativo, guardas G1–G7 ok → única coisa gravada em H–K, e só onde H estava
  vazio. **B** = precedente fraco/divergente, CATMAT inativo, guarda reprovada ou escolha não
  inequívoca (com opções). **C** = sem precedente, candidato do catálogo **adjudicado pelo agente**
  (exato/equivalente/aproximado). **D** = "Não tem" no fim da escada R14, com a busca feita, os itens
  ativos mais próximos e o rascunho do pedido de CATMAT (`xxx = planilhar`). **Fora** = teste ANVISA.
- Assinatura (gêmeos) = ingredientes ordenados + apresentação até o 1º marcador de embalagem; acessórios
  (DIL, SIST FECH, SER, CAN, INAL, APLIC, EQP…) entram na chave — meropenem com bolsa (288298) ≠ sem
  bolsa (268488). Líquidos/injetáveis têm chave com volume (adalimumabe 0,4 mL × 0,8 mL).
- **Guardas** (`guardas.py`): G1 catálogo/Ativo/sem flag de insumo-veterinário-manipulado; G2
  ingredientes (associação × monodroga, sal/éster diferente, componente de vacina a mais); G3 dose nas
  leituras por unidade, por mL e total por recipiente (R3), kit só com CATMAT de kit (R6), sal × base
  só com razão aprendida da GP (senão "conferir massa molar"); G4 via, comprimido × cápsula (forma dos
  itens antigos vem da unidade oficial), liberação/orodispersível… só diferencia quando há item
  próprio (R4); G5 acessório; G6 classe terapêutica (só impede o A); G7 unidade oficial compatível.
  As guardas também correm sobre os vínculos existentes → aba "Suspeitas na GP" (só lista).
- **Pontes aprendidas da GP** (`pontes.py`): ingrediente → PDM (com filtro de ruído: um vínculo errado
  não vira sinônimo), conjunto → CATMAT, CATMAT → unidade, PDM → classe; mais sinônimos DCB/INN fixos
  e a regra "-ATO de sódio ↔ ÁCIDO -ICO".
- **Fluxo mensal**: rodar com a lista nova → nível A entra sozinho; os pacotes `saida_catmat/pacotes/
  <registro>.json` (C/D) são adjudicados **um a um** e gravados em `saida_catmat/decisoes_catmat.csv`
  (`registro;decisao;catmat;justificativa;regras;autor;data`, decisao = CATMAT | NAO_TEM | B). A rodada
  seguinte relê as decisões; decisão com autor diferente de "agente" (confirmada) e a GP já corrigida
  viram precedente.
- Medido em 01/10/2026 (GP jan/17–ago/26): backtest por raiz → nível A cobre 65% dos vínculos com
  99,7% de acerto (irmãos, deixa-um-de-fora: 66% / 99,7%); Qt_Embal reproduz 97,5% da GP e a unidade
  96,9%. Backlog de 715: A 454 · B 125 · C 87 · D 49. Teste às cegas (6.2, 200 substâncias, pontes
  reaprendidas sem a substância): certo em 1º 85%, entre os 3 primeiros 92,5%, entre os candidatos
  95,5% — **abaixo** da meta de 90%/98%, por isso o ranqueador só sugere (nível C/D, nunca A).
  Revisão dos "Não tem": 364 de 1.461 têm candidato ativo aprovado nas guardas (aba própria, nunca
  aplicado); 2.871 vínculos existentes reprovam nas guardas (aba `Suspeitas na GP`, não corrigidos).

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
