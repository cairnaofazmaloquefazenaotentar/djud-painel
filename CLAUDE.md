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

# Avaliação da DLOG (out/2026) — uma vez por ambiente, ANTES do deploy que lê as colunas/tabelas
python scripts/create_dadosabertos_tables.py --dry-run|--confirm   # DadosAbertosPreco/Coleta, PncpVinculo
python scripts/alter_cesta_dlog.py --dry-run|--confirm             # colunas de D1/D2/P11–P13/P18 na cesta
python scripts/import_ipca.py --dry-run|--confirm                  # IndiceIpca (SIDRA 1737); mensal, UPSERT
python scripts/alter_demanda_busca.py --dry-run|--confirm [--redmine base.xlsx]  # Demanda: buscaNorm (pg_trgm), nupSei, colunas da A5
python scripts/enriquecer_demandas.py --dry-run|--confirm [--relatorio cob.csv]   # A5, depois de cada carga do Redmine

# Autotestes e conferências (sem banco, exceto o mapa gerado)
npx tsx scripts/autoteste-pesquisa-preco.ts       # período, IPCA, duplicidade, escolha gravada (roda no CI)
npx tsx scripts/autoteste-demandas.ts             # filtro único, busca, buscaNorm/NUP × Python (roda no CI)
python scripts/demandas_busca.py && python scripts/substancia.py   # espelhos Python × casos_busca.json
npx tsx scripts/conferir-mapear-dados-abertos.ts  # mapear.ts × esperado_mapear.json (roda no CI)
python scripts/conferir_mapa_dlog.py --gerado Mapa.xlsx [--modelo DLOG.xlsx] [--painel r.json]
```

## Pesquisa de Preços (aba /pesquisa-preco)

- Três filtros obrigatórios: **Código do material** (CATMAT de até 6 dígitos ou Registro ANVISA de 13),
  **Descrição CATMAT** e **Unidade de fornecimento**. Lógica em `lib/pesquisa-preco.ts`.
- Tabelas de apoio (schema public): `CatmatItem` (catálogo das 16 classes da saúde) e `CmedRegistro`
  (registro ANVISA → CATMAT, unidade de fornecimento, `qtEmbalagem`). Carregadas pelos scripts acima
  (REPLACE; criam a tabela se ausente com a mesma DDL do `prisma db push`).
- Preço CMED é por embalagem (`PrecoCmed.pmvgSemImpostos`); a pesquisa divide por `qtEmbalagem` para
  refletir a menor unidade de fornecimento. Registros sem CATMAT só têm preço CMED.
- Fontes: CMED (teto), **Compras.gov.br — Painel de Preços** (API de dados abertos), BPS (API do
  Ministério da Saúde ou, sem coleta, a base histórica `PrecoBps`), SIASG judicial, PNCP, **atas de
  registro de preços** (API) e os **preços informados pelo responsável** (P13: II contratação similar,
  III mídia/sítio, IV cotação com fornecedor, V nota fiscal — cada tipo é uma fonte). Cruzamento por
  código: BPS/SIASG locais usam `"BR0" + CATMAT`, PNCP local o código puro; as fontes de dados
  abertos gravam o CATMAT sem zeros.
- A base ComprasGov (`sismat.ComprasGovPreco`) **não** entra na Pesquisa de Preços: não traz CATMAT e
  só poderia ser cruzada por nome do PDM, sem dosagem. Ela alimenta apenas a aba Preços. Não confundir
  com a fonte "Compras.gov.br" (tabela `DadosAbertosPreco`, origem `COMPRASGOV`).
- Ordem e rótulos das fontes (incisos do art. 5º) em `lib/pesquisa-preco-fontes.ts` — a tela, o HTML
  e o mapa XLSX usam a mesma lista.

### Dados abertos (Compras.gov.br, BPS, atas) e vínculo com o PNCP

- `lib/dados-abertos/`: `cliente.ts` (timeout, 5xx, 429 → `aguardarMs`, 404 = contrato alterado,
  200 sem JSON = erro, cota de 90/min por processo), `comprasgov.ts`, `bps.ts`, `pncp-vinculo.ts`,
  `coleta.ts`, `pesquisa.ts` e `mapear.ts` — o ÚNICO que conhece os nomes de campo das APIs, com
  espelho em `scripts/dados_abertos_mapear.py` (os dois conferidos contra
  `scripts/fixtures/dados-abertos/esperado_mapear.json`).
- Coleta **uma página por chamada** (`POST /api/precos/dados-abertos/coletar`); a tela repete, espaça
  700 ms e obedece `aguardarMs` — a função nunca dorme esperando a cota. Janela: 36 meses
  (Compras.gov.br e BPS), 365 dias (atas). Coleta completa remove da janela o que a API não devolve mais.
  Relatórios nunca coletam.
- **Ids estáveis**: `COMPRASGOV:<idCompra(17)+item(5)>`, `BPS:<sha1 do conteúdo>`,
  `ARP:<nº de controle da ata>:<item>`. Nunca `cuid()` — a curadoria grava exclusões pelo id.
- `idCompra` tem 16 ou 17 dígitos e vem da API como inteiro acima de 2^53: leia com
  `parseJsonSeguro` e normalize para 17 dígitos (o PNCP não acha a compra com 16).
- Vínculo PNCP (`PncpVinculo`, `POST /api/precos/dados-abertos/vincular-pncp`): 1.1 (contratação) +
  2.1 (itens) por `idCompra`; encontrado = permanente, não encontrado = 30 dias. Dá a coluna
  "Anulada/Revogada" (situação), o processo e o link (`lib/pncp.ts`).
- Fonte BPS (P21): com coleta pela API, lê `DadosAbertosPreco` (processo, ata, registro ANVISA,
  fabricante); sem coleta, `PrecoBps` com aviso de base histórica. Itens de ata herdam a unidade de
  fornecimento da compra com a mesma chave de 22 dígitos.
- Carga em lote: `scripts/import_extrator_da.py` (saída do Extrator-CATMAT-DA, mesmas chaves).
  `scripts/probe_dados_abertos.py` confere o contrato das APIs. Resumo da API em
  `docs/api/compras-dadosabertos.md`.
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

  | Filtro         | Compras.gov.br | BPS | SIASG              | PNCP              | Atas          | CMED            |
  |----------------|----------------|-----|--------------------|-------------------|---------------|-----------------|
  | Fornecedor     | ✅ | ✅  | ✅                 | coluna vazia¹     | ✅            | n/a             |
  | Fabricante     | ✅ `marca` | ✅ (API: `nomeFabricante`) | coluna vazia¹ | ❌ sem coluna | ❌ sem coluna | ✅ laboratório  |
  | CNPJ Comprador | ❌ só UASG/órgão | ✅ `cnpjInstituicao` | ❌ só `cnpjFornecedor` | coluna vazia¹ (`cnpjOrgao`) | ❌ sem coluna | n/a |

  ¹ A coluna existe no schema e é consultada normalmente; hoje a carga está vazia, então o filtro
  simplesmente não retorna nada. Não entra em `FONTE_SEM_CAMPO` de propósito — passa a filtrar
  sozinha quando os dados chegarem.
- Fabricante recorta **também o teto**: o PMVG passa a ser o do laboratório escolhido.
- A cesta guarda `codigo`+`unidade`+`uf`, a curadoria e as escolhas do item, mas **não** os filtros
  opcionais: o relatório consolidado refaz a pesquisa sem eles. A tela avisa isso ao adicionar um
  item com filtro ativo.

### Estatística e curadoria (art. 6º da IN 65/2021)

- Cada fonte apura os **três métodos** admitidos pelo art. 6º — **média, mediana e menor
  valor** — mais o maior valor, o desvio padrão e o coeficiente de variação
  (`Estatisticas` em `lib/pesquisa-preco-curadoria.ts`). Painel e relatório exibem os três.
- Dois **consolidados**, porque respondem a perguntas diferentes e o relatório explica isso:
  - `porFonte` — cada base pesa igual; estatísticas sobre o vetor das medianas das fontes.
    É daqui que sai o preço adotado no padrão do painel (**mediana das medianas**).
  - `porRegistro` — cada compra pesa igual; todos os registros depurados num conjunto único.
    Contraprova da ordem de grandeza, nunca preço adotado: a base mais numerosa domina.
- **Exclusão justificada** de registros antes da emissão (art. 6º, §§ 1º e 2º): a
  justificativa é obrigatória (`MOTIVO_MIN`) e o registro descartado **continua impresso**
  no relatório, com o motivo — a rastreabilidade é do descarte, não só do que ficou. Também
  vai para o `AuditLog`. Ordem do cálculo: primeiro saem os descartes manuais, **depois** o
  IQR incide sobre o que sobrou.
- `REGISTROS_ANALISE` (150) por fonte = os mais recentes **mais todos os outliers do IQR**;
  sem a segunda parte, justamente os registros a desconsiderar ficariam fora da lista.
- **Preços informados** (P13; `TIPOS_PRECO_INFORMADO` em `lib/pesquisa-preco-curadoria.ts`):
  IV cotação com fornecedor, III mídia especializada ou sítio (URL e data/hora de acesso), V nota
  fiscal (nº e chave da NF-e), II contratação similar fora das bases. Gravados em `CestaOrcamento`
  (`tipo`, `url`, `acessadoEm`, `chaveNfe`, `justificativaForaPeriodo`). Cada tipo é uma fonte a mais
  (uma mediana no vetor consolidado) e **não** passa por IQR — foram escolhidos a dedo.
  `considerarNoCalculo: false` e "fora da janela do inciso sem justificativa" viram exclusão com
  motivo declarado: o preço continua no relatório, fora da conta.
- **A mesma compra em mais de uma base** (P18, `lib/pesquisa-preco-duplicidade.ts`, puro): mesma
  chave de 22 dígitos → prevalece a primeira fonte de `ORDEM_FONTES`; BPS × Compras.gov.br por regra
  (mesmo CNPJ, preço em 2 casas e UF; mesma quantidade até 15 dias, sem quantidade até 3) = provável
  duplicata, reversível na curadoria (`duplicidadesRevertidas`). A cópia sai **só do conjunto
  único** (`porRegistro`, aba do item: "Compõe = Não — duplicado de …"); cada base mantém a sua
  estatística no consolidado por fonte.
- O relatório nomina **empresa vencedora, marca e fabricante** em cada registro
  (BPS: fabricante; SIASG: fabricante + marca; PNCP: só fornecedor).
- Tela de curadoria: `components/pesquisa-preco/curadoria-dialog.tsx`, usada tanto pela
  pesquisa avulsa (estado efêmero, enviado junto com o relatório) quanto por item da cesta
  (gravado). A prévia do impacto é recalculada **no servidor** (`POST /api/precos/buscar`),
  nunca no navegador: o número exibido tem de ser o mesmo que sai impresso.

### Método do preço adotado e teto CMED (P11/P12 da avaliação da DLOG)

- `lib/pesquisa-preco-metodo.ts` (módulo puro): `adotarPreco`/`camposDoPreco` montam a
  recomendação a partir do consolidado que a pesquisa já apurou — o servidor
  (`pesquisarPrecos`, parâmetro `escolha`) e a prévia da tela usam a MESMA função.
- Métodos: mediana das medianas (padrão), **critério DLOG** (menor entre média e mediana do
  conjunto único), média, mediana ou menor valor do conjunto único.
- Tetos (os dois aparecem na tela, no HTML e no mapa): menor PMVG sem impostos por unidade
  (padrão do painel) ou **PMVG da alíquota (padrão 17%) do medicamento de referência**
  (critério DLOG = maior teto). Referência = `tipoProduto` "Novo" ou "Biológico"; havendo
  vários, o de maior PMVG; nenhum, o maior PMVG da lista.
- A modal de emissão pré-seleciona `ESCOLHA_PADRAO_MAPA` (método do painel + teto da DLOG) e
  manda a mesma escolha para o HTML e para o XLSX: os dois documentos trazem o mesmo preço.
  Sem escolha no pedido, o HTML usa `ESCOLHA_PADRAO` (padrão do painel).
- Justificativa do preço (`lib/mapa-dlog/justificativa.ts`, pura) gerada dos números; editável
  na modal (o `AuditLog` registra a edição).

### Período do art. 5º e IPCA (D1/D2 da avaliação da DLOG)

- `lib/pesquisa-preco-periodo.ts` (puro): data de referência (padrão = hoje em Brasília; na cesta,
  a da emissão; nunca no futuro), `mesesMercado` 12 (padrão) | 24 | 36 | null = todo o período.
  Ampliar exige justificativa (≥ 20 caracteres): a rota **recusa com 400**, não corrige em silêncio;
  a justificativa sai no relatório, na aba Parâmetros e no `AuditLog`. Sem ampliação automática.
- Janela por fonte (`janelaDaFonte`): bases e atas (I e II) seguem o período escolhido; preços
  informados ficam na janela do seu inciso (II e V: 12 meses; III e IV: 6), mesmo com as bases
  ampliadas. Cada fonte devolve `periodo { inicio, fim, foraDoPeriodo, maisRecenteFora }`; fonte
  vazia na janela com registros mais antigos gera a observação do art. 5º, §1º.
- `lib/ipca.ts` (puro): mês-base = último índice publicado não posterior ao mês anterior à data de
  referência; fator = NI(mês-base) ÷ NI(mês do preço) — composto, começa no mês **seguinte** ao do
  preço (a DLOG inclui o próprio mês: convenção a confirmar, P10). Sem índice → fator 1, sinalizado.
  Corrige só os incisos I e II (`corrigidoPeloIpca`: bases, atas e contratação similar); mídia,
  cotação, nota fiscal e o **teto CMED nunca**. `RegistroMercado.precoNominal` guarda o publicado,
  `preco` é o corrigido (estatística, IQR, curadoria e consolidados usam o corrigido).
- Tabela `IndiceIpca` (`scripts/import_ipca.py`, SIDRA 1737: 2266 número-índice, 63 variação, ids
  conferidos pelo nome; autoteste produto × razão). Sem a tabela, a pesquisa sai nominal com aviso.
- HTML: seção "Período da Pesquisa e Atualização Monetária" (fontes corrigidas, fatores, mês do
  preço mais antigo) e o nominal × fator ao lado de cada preço. XLSX: W = `INDEX/MATCH` na aba
  "Índices IPCA" (fator = razão dos índices), X = N × (1 + W); `conferir_mapa_dlog.py` confere os dois.

### Mapa comparativo no modelo da DLOG (XLSX)

- Rotas `POST /api/relatorios/pesquisa-preco/xlsx` (avulsa, + `quantidade`) e
  `POST /api/relatorios/cesta/xlsx` (cesta; **não** esvazia a cesta). Gravam `AuditLog`
  (com o SHA-256 do arquivo) e `RelatorioGerado` (`lib/relatorio-registro.ts`), como as
  rotas HTML agora também gravam.
- `lib/mapa-dlog/`: `layout.ts` (abas, os 24 cabeçalhos A–X com o texto da DLOG, larguras,
  formatos e a **paleta da DLOG — única exceção aos tokens**, o XLSX não lê CSS), `dados.ts`
  (puro: ResultadoPesquisa → linhas A–Y), `gerar.ts` (servidor, `exceljs`), `meta.ts`.
  `exceljs` nunca em módulo importado por página client.
- **Um cálculo só**: o gerador lê o `ResultadoPesquisa` (modo `registrosCompletos`, a amostra
  inteira) e nunca recalcula preço. As fórmulas (sobre a coluna auxiliar AA = X quando
  "Compõe = Sim") reproduzem o cálculo para auditoria e são gravadas com o resultado.
  `scripts/conferir_mapa_dlog.py --gerado X.xlsx [--modelo DLOG.xlsx] [--painel r.json]` confere
  estrutura, fórmulas e números (sai com 1 se houver erro).
- Abas: Consolidação · MEMÓRIA DE CÁLCULO · Item n · Índices IPCA · CMED · Parâmetros. O que o
  painel acrescenta fica à direita (Y em diante) ou abaixo; colunas auxiliares agrupadas e
  recolhidas.
- `processarItens` (concorrência 4) fica em `lib/pesquisa-preco-processar.ts`: o HTML e o
  XLSX da cesta fazem uma apuração só por emissão.

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
- Escolhas gravadas no item (`scripts/alter_cesta_dlog.py`): `periodoMeses` (12/24/36; 0 = todo o
  período) e `justificativaPeriodo` (D1), `corrigirIpca` (D2), `duplicidadesRevertidas` (P18),
  `metodoPreco`/`regraTeto`/`aliquotaTeto` e `justificativa` (E2 — gravados pela modal a cada
  emissão; a próxima emissão parte deles). `parametrosDoItem` monta a pesquisa do item com a **data
  de referência da emissão**. PATCH que muda curadoria, período, IPCA, duplicatas ou método
  **refaz o snapshot** de preço; quantidade, observação e o texto da justificativa, não.
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

## Demandas — filtro único (A1–A4 e B da avaliação da DLOG)

- **Um filtro só** para a lista, o Dashboard (ORM, SQL e SQL com alias `d` do JOIN com o SIAFI),
  o ranking anual, a aba Autores, as exportações e os relatórios: `FiltroDemandas` em
  `lib/demandas-filtro-tipos.ts` (**puro**: tipos, URL, rótulos, atalhos, busca) e
  `whereDemandas`/`sqlDemandas(a, alias?)` em `lib/demandas-filtro.ts` (servidor), com a
  **mesma semântica** e **sempre `deletedAt IS NULL`**. `aplicarFiltro` resolve antes o que
  depende do banco (código CATMAT do campo ou da busca, radicais do medicamento). Mexeu numa
  das duas formas, rode a paridade (mesmos totais no ORM, no SQL e no SQL com alias).
- Semântica (P1): OR entre os incluídos e NOT IN para os excluídos dentro do campo; AND entre
  campos; `__null__` = "(não informado)". Excluir um valor **mantém** as linhas nulas (NOT
  (NULL) não é verdadeiro no SQL — a condição as inclui de propósito). `pontoControle` e
  `objetoAcao` são listas "A | B": casam **por item** (igual, início, fim ou meio da lista).
- URL: parâmetros repetidos (`?status=A&status=B&status_excluir=C`); `?status=X` antigo vale, e
  os nomes antigos do Dashboard (`startDate`, `endDate`, `principioAtivo`) são lidos como
  `criadoDe`, `criadoAte`, `medicamento`. Datas `AAAA-MM-DD`, inclusive nas duas pontas.
- Opções dos filtros = valores do banco com contagem (`GET /api/demandas/opcoes`, P2); seletor
  `components/backoffice/filter-multi-select.tsx` (tri-estado, busca, "Selecionar todos",
  atalhos).
- **"Status" na aba Demandas = Ponto de Controle** (coluna BZ do Redmine), em dois níveis (pedido
  da DLOG): **Status** (`pontoControle`, cada item em qualquer posição — "Cessar Atos" casa
  "Arquivado | Cessar Atos") e **Sub-status** (`subStatus`, a combinação exata, sem a ordem:
  `comboCanonico`; o servidor expande a chave para as grafias do banco em `aplicarFiltro`). O
  status do fluxo do Redmine virou **"Situação no Redmine"** (`status`, em "Mais filtros", com os
  atalhos de P3 — "Em análise (todos)", "Encerrados", "Ativos"; a confirmar).
- Filtros principais da lista: CATMAT/Registro e Descrição (o `MaterialSearch` da Pesquisa de
  Preços, com sugestões; `components/demandas/filtro-material.tsx`), Unidade de fornecimento (as do
  item), Status, Sub-status e Processo SEI (`nupSei`: NUP completo casa exato; trecho, pelo texto
  ou pelos dígitos). O resto fica em "Mais filtros".
- Paginação da lista é do servidor: `DataTable paginacaoInterna={false}` + `Paginacao` acima da
  tabela (itens por página, primeira/última). A interna contava só a página carregada.
- Visões salvas (P4): `GET/POST/DELETE /api/demandas/visoes` sobre `UserView`, com a
  querystring canônica.
- Exportação (A2): `GET /api/demandas/export?formato=csv|xlsx|html&colunas=…&agrupar=…` +
  filtro (ou `ids` = seleção). **Sem teto de linhas** e em **streaming** (o arquivo inteiro passa
  do limite de 4,5 MB de resposta da Vercel). Colunas e agrupamentos em
  `lib/demandas-colunas.ts` (puro); autor e descrição completa não saem. Grava `AuditLog` e
  `RelatorioGerado` (`DEMANDAS`).
- Busca (A4): `interpretarBusca` — CATMAT (4–6 dígitos) ou registro (13) reconhecido aplica o
  filtro por substância **OU** o número no texto (um nº DJUD não some); só dígitos e
  separadores com 8+ dígitos (nº CNJ, NUP SEI) compara os dígitos; texto: termos de
  `normalizarTexto`, palavras de 6+ letras pelo radical. Tudo sobre `Demanda.buscaNorm`
  (`montarBuscaNorm`, espelho `scripts/demandas_busca.py`; índice GIN pg_trgm, P8). A tela
  aplica com 400 ms de pausa e cancela a requisição anterior (`signal` + `keepPreviousData`).
- **`buscaNorm` precisa acompanhar a demanda**: o importador do Redmine, `POST /api/demandas`,
  o `PUT /api/demandas/[id]` e `scripts/alter_demanda_busca.py` (carga inicial e recálculo)
  gravam a coluna. Campo novo na busca → `montarBuscaNorm` + espelho Python + rodar
  `alter_demanda_busca.py --confirm --somente-busca`.
- **Apresentação (A5)** — `scripts/enriquecer_demandas.py` (depois de cada carga): `medicamento` +
  `medicamentoOrigem` (REDMINE → TITULO → DESCRICAO → SISMAT; dicionário = CatmatItem classe 6505
  + CmedRegistro.substancia, pelo radical, com `PALAVRAS_GENERICAS` de fora),
  `apresentacoes`/`catmatsDerivados` (1º SISMAT pelo NUP — `materialCodigo` "BR0410020" → 410020;
  2º concentração no texto igual à do CATMAT; senão não identificada) e `unidadesDerivadas` (CMED).
  Filtro por código = **apresentação exata** (`catmatsDerivados` tem o CATMAT; a unidade refina)
  **ou mesma substância com apresentação não identificada**; outra apresentação da mesma
  substância fica de fora (410020 × 410019 diferem). `catmatGrupo` restringe a um dos dois; a
  lista devolve as duas contagens (`contarGruposCatmat`).
- **Medicamento do Redmine = colunas CC + CB unidas** ("Princípio_Ativo" e "Princípio
  Ativo_JEF/TRF4", `principio_ativo_redmine` no importador). `alter_demanda_busca.py --redmine`
  só ACRESCENTA os itens de CB à base já carregada (a planilha pode ser mais antiga que a carga).
- A6: Nº SEI na lista, no detalhe (copiar; link só com `NEXT_PUBLIC_URL_SEI`/`_PROCESSO`/`_REDMINE`
  — modelo com `{valor}`, `lib/links-externos.ts`, P7), nas exportações e no PDF da demanda;
  "Entregas no SISMAT" no detalhe (`/api/demandas/[id]/sismat`, pelo NUP do destinatário).
- Dashboard (B3): campo "Medicamento" (sugestões por substância canônica com contagem,
  `/api/demandas/principios-ativos`; aplica ao escolher, com Enter ou após 450 ms), "Resumo do
  recorte" e "Processos do recorte" (a mesma rota da lista, 20 por página, botão "Abrir na
  lista de Demandas"). `jsonComVersao` das métricas inclui `siafiPagamento`.

## Demandas — filtro por CATMAT / Registro ANVISA

- `Demanda` **não tem coluna CATMAT**: o medicamento vem do Redmine como texto livre em
  `principioAtivo` ("Nusinersen", "Elexacaftor / Ivacaftor / Tezacaftor") e, em ~14 mil demandas,
  só em `titulo`/`descricao`. O filtro `?catmat=` da lista (`GET /api/demandas`) traduz o código
  para substância em `lib/demandas-catmat.ts`: `resolverItem()` (o mesmo da Pesquisa de Preços) →
  substância do `CatmatItem` + `substancia` dos `CmedRegistro` do código → radicais → `contains`
  em `principioAtivo`/`medicamento`/`titulo`/`descricao` (`whereTermos`/`sqlTermos`).
- Radical (`lib/substancia.ts`, puro; espelho `scripts/substancia.py`) = palavra mais longa da
  substância, sem sal/veículo na frente ("SUCCINATO DE"), sem sufixo ("SÓDICA") e sem a
  terminação portuguesa — vogal final, ou o "UE" de "-GUE": NUSINERSENA → NUSINERSEN,
  ELTROMBOPAGUE → ELTROMBOPAG (casa "Eltrombopag"); procurado com e sem acento. Mínimo de 5
  caracteres.
- **OR entre grupos, AND dentro**: o registro "CANABIDIOL;TETRAIDROCANABINOL" exige as duas
  substâncias (é aquele produto, não qualquer canabidiol). Marca comercial (`produto`) só entra
  na busca por registro ANVISA — pelo CATMAT seriam dezenas de marcas.
- Código não encontrado → a rota devolve lista vazia com `filtroCatmat.motivo`, e a tela mostra o
  motivo em vez de uma tabela vazia muda. Quando encontra, a tela mostra o código, a descrição e
  por quais substâncias está filtrando.
- O campo da tela aplica o valor com 450 ms de pausa (`catmatInput` → `catmat`): um código tem
  de 4 a 13 dígitos e cada tecla resolveria um código parcial.
- O dashboard recebe o filtro pelo filtro único (acima): ORM e SQL (com e sem alias) casam
  exatamente — números diferentes entre a lista e o painel para o mesmo código seriam
  impossíveis de explicar. Código não encontrado → painel zerado com o motivo na tela, não
  gráficos vazios sem explicação.

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
