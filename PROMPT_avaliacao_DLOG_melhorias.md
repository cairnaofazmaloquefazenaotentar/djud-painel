# PROMPT — Avaliação da DLOG (out/2026): Demandas, Dashboard, Relatórios e Pesquisa de Preços

> **Como usar:** cole este texto inteiro numa sessão nova do Claude Code aberta no repositório
> `djud-painel`, numa branch criada a partir da `main`. Antes de colar, revise o bloco
> **0. Parâmetros a confirmar**: é o único trecho que talvez você queira editar.
>
> **Origem:** e-mail da DLOG com 8 observações sobre as abas Demandas, Dashboard, Relatórios e
> Pesquisa de Preços, acompanhado da planilha de consolidação de preços que a DLOG usa hoje
> (`Mapa comparativo de Preços — 25000.114404/2026-58.xlsx`). A planilha **não** vai para o
> repositório: o layout dela está descrito na seção 8.1. Se precisar conferir valores, peça o
> arquivo ao usuário.
>
> **Rastreamento:** feito em 15/10/2026 sobre `main` @ `c7cf45d`. As referências `arquivo:linha`
> abaixo valem para esse commit; confira antes de editar. A DLOG pediu que se desconsidere o que já
> estiver em andamento, e a seção 2.3 lista o que já está em andamento.

---

## Sua tarefa

As observações da DLOG se dividem em cinco frentes. Cada frente vira **um PR separado**:

| Frente | Observações da DLOG | Resumo |
|--------|---------------------|--------|
| **A — Demandas** | 1, 2 e 3 | Filtros com seleção múltipla, exclusão e agrupamento; status "Cessar Atos"; busca por nome e por CATMAT; medicamento e apresentação visíveis; nº do processo judicial e do SEI; exportação com os tópicos escolhidos. |
| **B — Dashboard** | "Aba DASHBOARD" | Os dados do medicamento pesquisado aparecem direto na tela, com o mesmo recorte da lista e do relatório. |
| **C — Relatórios** | 4 | Panorama Executivo, Análise de Risco e Prazos e Dimensionamento para ARP. |
| **D — Pesquisa de Preços** | 5, 6, 7 e 8 | Período do art. 5º da IN 65/2021, atualização pelo IPCA, identificação da contratação de referência e link para o PNCP. |
| **E — Planilha da DLOG** | anexo | Levar para o painel o que a planilha faz hoje (memória de cálculo, justificativa por item, consolidação) e exportar no mesmo layout, sem reproduzir os erros dela (seção 8.5). |

Ordem: rode primeiro o **diagnóstico (seção 3)**. Vários pontos ("Cessar Atos", erro da busca,
Dashboard sem dados) dependem do que está no banco e não se resolvem só lendo o código. Depois siga
**A → B → D → E → C** (seção 10). Trabalhe em incrementos pequenos e verificáveis e não pule a
seção 9 (verificação).

No fim, redija a **nota de resposta à DLOG** (seção 12.2), dizendo para cada observação o que foi
corrigido, o que está em implementação, o que depende de decisão e o esclarecimento sobre
"Cessar Atos".

---

## 0. Parâmetros a confirmar (decisões de negócio já assumidas como padrão)

| # | Decisão | Padrão adotado neste prompt |
|---|---------|-----------------------------|
| P1 | Semântica dos filtros com seleção múltipla | Dentro de um campo: **OR** entre os valores incluídos e **NOT IN** para os excluídos. Entre campos diferentes: **AND**. "(não informado)" (`null`) é uma opção selecionável como qualquer outra. |
| P2 | Origem das opções dos filtros | **Valores reais do banco, com contagem**, em vez das listas fixas de hoje. Um status que não existe na base deixa de aparecer como opção, em vez de devolver uma lista vazia. |
| P3 | Grupos de status prontos | "Em análise (todos)" = status que começam com "Em Análise". "Encerrados" = `STATUS_RESOLVIDOS` de `lib/metrics.ts:82`. "Ativos" = o restante. **Confirmar a lista com o usuário depois do diagnóstico 3.1.** |
| P4 | Visões salvas | Usar o modelo `UserView` (`prisma/schema.prisma:241`), que já existe e não tem uso: uma visão é nome + querystring, por usuário. |
| P5 | Medicamento derivado (para demandas com `principioAtivo` vazio) | Extraído do título ou da descrição **somente quando casa com o dicionário de substâncias** (`CatmatItem` + `CmedRegistro.substancia`), com a origem marcada. Nunca gravar texto livre como se fosse o princípio ativo. |
| P6 | Apresentação (concentração e forma) da demanda | Prioridade: (1) **saída do SISMAT com o mesmo NUP SEI** (`SismatSaida.material`/`materialCodigo`); (2) concentração e forma **extraídas do texto** da demanda; (3) "apresentação não identificada". Se houver várias apresentações, guardar todas. |
| P7 | Links externos (SEI, consulta processual, Redmine) | Por padrão, **botão de copiar**. Link só quando houver URL-base configurada em variável de ambiente (`NEXT_PUBLIC_SEI_URL_TEMPLATE`, `NEXT_PUBLIC_REDMINE_URL`). Não inventar URL. |
| P8 | Busca sem acento e por trecho | Coluna normalizada `buscaNorm` + índice **GIN `pg_trgm`**. Exige `CREATE EXTENSION IF NOT EXISTS pg_trgm` no Neon: **confirmar com o usuário** antes de rodar. |
| P9 | Período da pesquisa de preços (art. 5º) | Data de referência = data da pesquisa (editável: data prevista de divulgação do edital). Janela de **12 meses** para BPS, SIASG e PNCP (incisos I e II) e para nota fiscal (V); **6 meses** para orçamento direto (IV) e mídia especializada (III). Sem ampliação automática: o usuário pode ampliar para 24 meses, 36 meses ou todo o período, **com justificativa obrigatória impressa no relatório**. |
| P10 | IPCA | **Ligado por padrão.** Mês-base = último mês com índice publicado, não posterior ao mês anterior à data de referência. Fator = `NI(mês-base) / NI(mês do preço)`, isto é, corrige a partir do mês seguinte ao do preço (a planilha da DLOG inclui o próprio mês; **confirmar a convenção**). O preço nominal aparece sempre ao lado do corrigido. O teto CMED **não** é corrigido, porque a lista vigente já é atual. |
| P11 | Método do preço adotado | Manter a **mediana das medianas por fonte** (`METODO_ADOTADO`) como padrão. Acrescentar a opção, **por item e com justificativa impressa**, do critério da DLOG: **"menor valor entre média e mediana do conjunto único de registros"** (equivale a usar `porRegistro`). |
| P12 | Qual PMVG serve de teto | Hoje o painel usa o **menor PMVG unitário** entre os registros do CATMAT, na coluna **sem impostos**. A DLOG usa o **PMVG 17% do medicamento de referência**, que é o **maior** teto da substância (planilha, Item 1: 4.094,06 ÷ 14 = R$ 292,43/comprimido, da marca Revolade). A **alíquota** depende do prompt CMED mensal, seção 7 (ver 2.3). Neste ciclo: exibir **os dois tetos**, menor e referência/maior, e deixar a regra de aplicação para o usuário decidir. |
| P13 | Preços informados pelo usuário | Generalizar o "Orçamento direto" num **"Preço informado"** com tipo: **IV** fornecedor (o que existe hoje), **III** mídia especializada ou sítio eletrônico (exige URL e data e hora de acesso), **V** nota fiscal eletrônica (nº, chave de acesso, data de emissão) e **II** contratação similar fora das bases (nº do pregão, contrato ou ata e UASG). Cada tipo é **uma fonte própria** no consolidado por fonte. |
| P14 | Relatórios ARP, Risco e Executivo | Ordem: **Panorama Executivo → Análise de Risco e Prazos → Dimensionamento para ARP**. As datas de previsão que vão na resposta à DLOG são do usuário: **não invente datas**. |
| P15 | Nova fonte Compras.gov.br (módulo Pesquisa de Preço da API de dados abertos) | **Fora deste ciclo.** Só registrar a avaliação (seção 7.5). Depende de rede liberada na Vercel e de aceite do usuário. |

Se algum item acima não valer, pare e pergunte antes de implementar a parte afetada.

---

## 1. Mapa: observação da DLOG → o que o código faz hoje

| Obs. | O que a DLOG viu | Causa provável no código (main @ c7cf45d) | Frente |
|------|------------------|-------------------------------------------|--------|
| 1 | Não dá para agrupar, selecionar vários ou excluir itens dos filtros (Status, Região, Grupo Temático…) nem escolher os tópicos do relatório | Os filtros são `FilterSelect` de valor único com listas fixas (`app/(auth)/demandas/page.tsx:87` `AREAS_TEMATICAS`, `:742` Status). A API compara por igualdade exata (`app/api/demandas/route.ts:51-56`) e não tem exclusão. CSV/XLSX têm colunas fixas e param em 10.000 linhas (`page.tsx:276`, `:359`). **"Exportar seleção" ignora a seleção:** monta `ids` em `page.tsx:847-850` e chama `handleExport()` (`:852`), que refaz a consulta só com os filtros. | A1, A2 |
| 1 | Nenhum processo com status "Cessar Atos" | **Não há exclusão no código.** A opção existe nas listas fixas da lista (`page.tsx:753`) e do Dashboard (`dashboard/page.tsx:444`), e o filtro é igualdade exata. Hipóteses, a confirmar no diagnóstico 3.1: (a) grafia diferente gravada no banco; (b) a exportação do Redmine usada na carga (`baseRedmine_20260827.xlsx`) saiu com o filtro padrão do Redmine, que traz só status **abertos**, e "Cessar Atos" é um status **fechado** no Redmine; (c) essas demandas não têm `principioAtivo` e somem quando há filtro por medicamento. | A3 |
| 2 | Pediu o medicamento ou substância no Título/Objeto | A coluna "Título / Princípio Ativo" já mostra `principioAtivo` sob o título. Mas cerca de 14 mil demandas citam o medicamento **só** no título ou na descrição (comentário em `lib/demandas-catmat.ts`) e aparecem com "—". | A5 |
| 2 | Erro na "Buscar" por nome do medicamento e por CATMAT | `page.tsx:730`: uma requisição **por tecla**, sem debounce e sem cancelamento, então respostas que chegam fora de ordem sobrescrevem a lista. São cinco `ILIKE '%…%'`, incluindo `descricao` (texto longo), sem índice (`route.ts:79-86`). A busca é **sensível a acento** ("eltrombopague" não acha "Eltrombopag"). Um **código CATMAT digitado na "Buscar" não é resolvido**: só o campo próprio "CATMAT / Registro ANVISA" resolve. A mensagem do Prisma volta crua com status 400. | A4 |
| 2 | Resultados sem separação por apresentação | `Demanda` não tem concentração nem forma. O filtro CATMAT vira o **radical da substância** (`lib/demandas-catmat.ts`), então o CATMAT **410019** (eltrombopague 25 mg) e o **410020** (50 mg) devolvem **exatamente as mesmas demandas**. O mesmo vale para **630389** e **630391** (momelotinibe 100 mg e 200 mg). | A5 |
| 3 | Sem vínculo com o processo judicial ou SEI | `numeroProcesso` existe e aparece na lista, no detalhe e no CSV/XLSX, mas **fica fora do PDF da demanda** (`app/api/demandas/[id]/export-pdf` / `lib/pdf-generator.ts`). O **NUP SEI não é importado para `Demanda`**: a coluna "NUP_SEI Principal" do Redmine só vai para `sismat.RedmineSeiAtributos` (`scripts/import-redmine-sei.ts`), usada nas Saídas. | A6 |
| Dash. | O dado do medicamento só aparece depois de gerar o relatório | (a) O filtro "Princípio Ativo" é um **Combobox que exige escolher uma opção**: texto digitado sem escolher não filtra. (b) As opções são as **combinações** gravadas ("A \| B"), com a contagem da combinação e não da substância (`app/api/demandas/principios-ativos/route.ts`). (c) Compara **só** `principioAtivo`, enquanto a lista procura também em título e descrição, então os números diferem. (d) A aba padrão "Demandas" mostra só séries e geografia: os dados do medicamento ficam espalhados em outras abas, e o relatório HTML junta tudo numa página. **Bugs:** o filtro CATMAT **não entra nas consultas de valor** (SIAFI), porque `sqlConditionsD` em `lib/metrics.ts:184` é montado sem `sqlDemandaPorCatmat`; a aba Autores ignora medicamento e CATMAT (`dashboard/page.tsx:282`); as contagens do ORM (`metrics.ts:149`) e do ranking anual (`lib/metrics-ranking-anual.ts:99`) **não excluem `deletedAt`**, ao contrário da lista; o ETag de `/api/demandas/metrics` declara só `["demanda"]`, mas a rota também lê `SiafiPagamento`. | B |
| 4 | Previsão dos relatórios de Ata, Riscos e Panorama Executivo | Os três cards são placeholders `status: "em-breve"` (`app/(auth)/relatorios/page.tsx:36,45,54`), sem rota nem biblioteca por trás. `RelatorioGerado.tipo` já prevê `ARP \| RISCO \| EXECUTIVO` (`schema.prisma:585`). | C |
| 5 | Usar os períodos do art. 5º e evitar bases antigas | `pesquisarPrecos` pega os **500 registros mais recentes** de cada base, **sem recorte de data** (`lib/pesquisa-preco.ts:82`, `:849`, `:872`, `:897`). Um item com poucas compras entra no cálculo com preços de anos atrás, sem aviso. | D1 |
| 6 | Atualizar preços históricos pelo IPCA | Não existe. | D2 |
| 7 | Identificar a contratação de referência | `RegistroMercado` (`lib/pesquisa-preco.ts:226`) não tem nº da compra, pregão, ata, contrato, UASG nem processo. `PrecoBps` e `PrecoSiasg` não guardam esses campos. `PrecoPncp.numeroControlePncp` existe (`schema.prisma:574`), mas **não é selecionado** em `pesquisarPrecos`: só a rota de listagem `/api/precos/pncp` o usa. | D3 |
| 8 | Link para a contratação no PNCP | Dá para derivar de `numeroControlePncp` (seção 7.4). | D4 |
| Anexo | Usar uma única ferramenta em vez da planilha | Estatística (média, mediana, menor, maior, desvio padrão, CV), curadoria e quadro-resumo com valor global **já existem**. Faltam a memória de cálculo por item no layout da DLOG, a justificativa textual por item, as fontes III e V, o IPCA, a identificação da compra e a exportação XLSX. | E |

---

## 2. Onde está o código hoje (leia estes arquivos primeiro)

### 2.1 Arquivos centrais

| Arquivo | Papel |
|---------|-------|
| `app/(auth)/demandas/page.tsx` | Lista de demandas: filtros, colunas, CSV/XLSX, ações em lote |
| `app/api/demandas/route.ts` | GET da lista (where montado à mão) e POST |
| `lib/schemas.ts` | `listDemandaSchema`, `filterMetricsSchema` |
| `lib/demandas-catmat.ts` | CATMAT/registro → radicais de substância → where ORM e SQL (as duas versões precisam casar) |
| `lib/principio-ativo.ts`, `app/api/demandas/principios-ativos/route.ts` | Normalização e opções do Combobox do Dashboard |
| `components/backoffice/filter-bar.tsx` | `FilterBar`, `FilterInput`, `FilterSelect` (valor único) |
| `app/(auth)/demandas/[id]/page.tsx`, `app/api/demandas/[id]/export-pdf/route.ts`, `lib/pdf-generator.ts` | Detalhe, PDF da demanda e relatório HTML de demandas |
| `scripts/import_redmine_base.py` | Carga **REPLACE** do Redmine em `Demanda`: apaga tudo e recria com **novos ids** (`COLUMNS` em `:67`) |
| `scripts/import-redmine-sei.ts` | Redmine → `sismat.RedmineSeiAtributos` (1 linha por NUP) |
| `lib/sismat-saidas-redmine-metrics.ts` | `SEI_PAT`/`SEI_LATERAL`: extração canônica do NUP de `SismatSaida.destinatario` |
| `app/(auth)/dashboard/page.tsx`, `hooks/useMetrics.ts` | Dashboard: filtros, abas e exportação |
| `lib/metrics.ts`, `lib/metrics-ranking-anual.ts`, `lib/metrics-export.ts`, `app/api/demandas/metrics/**` | Agregações (ORM, SQL bruto e SQL com alias `d.` para o JOIN do SIAFI), ranking anual e exportação CSV/HTML |
| `app/api/demandas/autores/metrics/route.ts` | Série de autores (só filtra por data) |
| `lib/data-version.ts` | ETag por versão do dado (`jsonComVersao`) |
| `app/(auth)/relatorios/page.tsx`, `app/api/relatorios/**` | Cards de relatórios; rotas de pesquisa de preço, cesta, e-mail e generate |
| `lib/pesquisa-preco.ts` | `resolverItem`, `mapearUnidades`, `pesquisarPrecos` (consultas por fonte em `:840-930`) |
| `lib/pesquisa-preco-filtros.ts`, `lib/pesquisa-preco-curadoria.ts` | Módulos **puros** (importados pela página client): filtros, estatística, IQR, exclusões, orçamentos |
| `lib/relatorio-pesquisa-preco.ts` | HTML do relatório IN 65 (tabelas de registros em `:205-225`, `conteudoBps/Siasg/Pncp` em `:308-340`) |
| `app/(auth)/pesquisa-preco/page.tsx` | Tela (`SourcePanel` em `:95`, `CmedPanel`, `RecomendacaoPanel`) |
| `components/pesquisa-preco/curadoria-dialog.tsx`, `components/pesquisa-preco/cesta-sheet.tsx` | Curadoria e cesta |
| `app/api/relatorios/cesta/route.ts` | Relatório da cesta: quadro-resumo, valor global, detalhamento por item |
| `prisma/schema.prisma` | `Demanda`, `UserView`, `PrecoBps`, `PrecoSiasg`, `PrecoPncp`, `CestaItem`, `CestaOrcamento`, `RelatorioGerado`, `SismatSaida` |

### 2.2 Convenções do projeto (obrigatórias)

- Leia `CLAUDE.md` e `AGENTS.md`. Esta versão do Next.js tem mudanças: consulte
  `node_modules/next/dist/docs/` antes de usar uma API do framework de que não tenha certeza.
- **Tabelas e colunas novas** são criadas por **scripts Python com a mesma DDL que o `prisma db
  push` geraria** (`ALTER TABLE … ADD COLUMN IF NOT EXISTS`), com `--dry-run`/`--confirm`, e o modelo
  Prisma é atualizado junto. `DATABASE_URL` vem de `.env.local` por `load_database_url()` de
  `scripts/import_redmine_base.py`. A máquina de trabalho do usuário **não tem node**: cargas e
  enriquecimentos rodam em Python.
- Tipos e helpers usados por página client ficam em **módulo puro**, sem Prisma, como
  `lib/pesquisa-preco-filtros.ts`. O servidor reexporta com `export *`.
- `normalizarTexto`/`normalizarUnidade` (TS) têm espelho em `scripts/precos_norm.py`. Se mexer
  numa, mexa nas duas e mantenha o autoteste.
- Design system: só tokens semânticos (`bg-primary`, `text-muted-foreground`…), **nunca hex
  novo**; cores em oklch em `design-system/tokens.ts`.
- Toda exportação ou relatório novo grava `AuditLog` (`action: "EXPORT"`) com os filtros, e os
  relatórios gravam também `RelatorioGerado`.
- Comentários, mensagens e textos de tela em português.
- O importador do Redmine é **REPLACE com ids novos**. Tudo o que for derivado de `Demanda`
  (medicamento, apresentação, `buscaNorm`) precisa ser **recalculado depois de cada carga**: por um
  script idempotente executado em seguida, ou dentro do próprio importador.

### 2.3 Trabalho em andamento: não duplicar

- `PROMPT_CMED_mensal_pesquisa_precos.md`, **seção 7** (filtros "Mês de Competência" e "Alíquota
  ICMS", teto vindo de `CmedPrecoVersao`): pendente. A tela ainda lê `PrecoCmed`. O ponto da DLOG
  sobre **PMVG 17%** (P12) depende dessa seção. Aqui só se exibem os dois tetos e a alíquota usada.
- Branch `claude/youthful-wright-j2b31e`: associador Registro ANVISA × CATMAT
  (`scripts/catmat_assoc/`), com um **parser de concentração** (`normaliza.doses()`) e de forma
  farmacêutica (`FORMA_CMED`). Se já estiver na `main`, **reaproveite-o** em A5. Se não estiver, use
  um extrator mínimo e deixe um `TODO` apontando para ele. Não copie o módulo inteiro.

---

## 3. Diagnóstico (rodar antes de codar; colar os resultados no PR)

O usuário testou **na Vercel e na instância interna**. Se as duas apontam para bancos diferentes,
rode as consultas **nos dois**.

### 3.1 Status "Cessar Atos"

```sql
SELECT status, count(*) FROM "Demanda" WHERE "deletedAt" IS NULL GROUP BY 1 ORDER BY 2 DESC;
SELECT status, length(status), count(*) FROM "Demanda" WHERE status ILIKE '%cessar%' GROUP BY 1, 2;
SELECT "statusRedmine", count(*) FROM sismat."RedmineSeiAtributos"
 WHERE "statusRedmine" ILIKE '%cessar%' GROUP BY 1;
SELECT count(*) FILTER (WHERE "principioAtivo" IS NULL) AS sem_pa, count(*)
  FROM "Demanda" WHERE status ILIKE '%cessar%';
```

Acrescente ao relatório do `scripts/import_redmine_base.py --dry-run` um **histograma da coluna
`status` da planilha**. Se "Cessar Atos" não estiver nem na planilha, a causa é a exportação do
Redmine: documente em `docs/ATUALIZACAO_DE_DADOS.md` que a exportação precisa sair com
"Status: todos" e peça uma nova base ao usuário. Não "corrija" isso no código.

### 3.2 Medicamento, processo e SEI

```sql
SELECT count(*) total,
       count("principioAtivo") com_pa,
       count("numeroProcesso") com_processo
  FROM "Demanda" WHERE "deletedAt" IS NULL;
```

Na planilha do Redmine: confirme o cabeçalho `NUP_SEI Principal`, o preenchimento dele e a
existência de colunas de **apresentação, concentração, quantidade, `due_date`** e qualquer outra
que identifique o medicamento. Liste **todos** os cabeçalhos no PR.

### 3.3 Busca

- `EXPLAIN (ANALYZE, BUFFERS)` da consulta atual (`OR` de cinco `ILIKE`) com `%eltrombopag%`.
- Logs da função `/api/demandas` na Vercel (respostas 4xx/5xx e tempo).
- Reproduzir na tela "eltrombopague", "Eltrombopag", "410020" e um nº CNJ na "Buscar". Anote o que
  aparece.

### 3.4 Dashboard

- Digitar "eltrombopag" no Combobox **sem escolher** uma opção: o painel muda?
- Para o mesmo medicamento, comparar o total da lista de Demandas, o total do Dashboard e o total do
  relatório HTML. Anote os três números.
- Filtrar por CATMAT 410020 na aba **Valores** e confirmar que os valores **não mudam** (bug de
  `sqlConditionsD`).

### 3.5 Bases de preço

```sql
SELECT 'bps' fonte, date_part('year', data) ano, count(*) FROM "PrecoBps" GROUP BY 1, 2
UNION ALL SELECT 'siasg', date_part('year', data), count(*) FROM "PrecoSiasg" GROUP BY 1, 2
UNION ALL SELECT 'pncp', date_part('year', data), count(*) FROM "PrecoPncp" GROUP BY 1, 2
ORDER BY 1, 2;
SELECT count(*), count("numeroControlePncp") FROM "PrecoPncp";
SELECT "numeroControlePncp" FROM "PrecoPncp" WHERE "numeroControlePncp" IS NOT NULL LIMIT 10;
-- idade dos registros para os itens da planilha da DLOG
SELECT 'bps', min(data), max(data), count(*) FROM "PrecoBps"
 WHERE "codigoCatmat" IN ('BR0410020', '410020');
```

(Repita a última consulta para SIASG e PNCP e para 410019, 630389, 630391, 640532 e 612063.)

### 3.6 Origem das bases BPS, SIASG e PNCP

Os carregadores dessas três tabelas **não estão no repositório**. Pergunte ao usuário de onde vêm
(arquivo ou consulta) e liste, para cada base, as colunas de identificação **disponíveis na
origem**: nº da compra ou pregão, UASG e nome, nº do item, processo, ata, contrato, modalidade,
critério de julgamento, situação (anulada/revogada) e nº de controle PNCP. A frente D3 depende
dessa lista.

---

## 4. Frente A — Demandas

### A1. Filtros com seleção múltipla, exclusão e agrupamento (obs. 1)

- **Módulo único de filtro**, usado por **todas** as rotas que filtram `Demanda`. Isso inclui a
  frente B:
  - `lib/demandas-filtro-tipos.ts` (**puro**, importável pela página): tipo `FiltroDemandas`
    `{ busca?, catmat?, campos: Partial<Record<CampoDemanda, { incluir: string[]; excluir: string[] }>>,
    dataEntradaDe?, dataEntradaAte?, criadoDe?, criadoAte? }`, mais `lerFiltroDemandas(URLSearchParams)`
    e `filtroParaQuery(f)`.
  - `lib/demandas-filtro.ts` (servidor): `whereDemandas(f): Prisma.DemandaWhereInput` e
    `sqlDemandas(f, alias?: string): Prisma.Sql`, com **a mesma semântica** e **sempre
    `deletedAt IS NULL`**. Inclui o filtro CATMAT (`whereDemandaPorCatmat`/`sqlDemandaPorCatmat`
    passam a aceitar alias).
- `CampoDemanda`: `status`, `prioridade`, `areaTematica` (Grupo Temático), `regiaoBrasil`,
  `trfRegiao`, `ufResidencia`, `objetoAcao`, `formaCumprimento`, `pontoControle`, `origemDemanda`
  (tracker), `responsavelId` e, depois de A5, `apresentacao`.
- Valor especial `__null__` = "(não informado)". `areaTematica` deixa de ser `contains` e passa a
  comparar por igualdade sobre os valores reais.
- **URL:** parâmetros repetidos, `?status=A&status=B&status_excluir=C`. O formato antigo
  `?status=X` continua funcionando, porque há links salvos e o Dashboard usa esse formato.
- **Opções dinâmicas:** `GET /api/demandas/opcoes` devolve, por campo, os valores distintos com
  contagem (com `jsonComVersao(request, ["demanda"])`). As listas fixas da página (`AREAS_TEMATICAS`,
  as opções de Status) saem.
- **Grupos (P3)**: aparecem no topo do seletor de Status como atalhos que marcam todos os valores do
  grupo.
- **Componente** `components/backoffice/filter-multi-select.tsx`: popover com busca, checkbox
  tri-estado por opção (incluir / excluir / neutro), "Selecionar todos", "Limpar", contagem ao lado
  de cada valor e um chip-resumo no gatilho ("Status: 3 incluídos, 1 excluído"). Use só tokens. O
  Dashboard reaproveita o mesmo componente.
- **Visões salvas (P4)**: `GET/POST/DELETE /api/demandas/visoes` sobre `UserView`, com o botão
  "Salvar visão" e uma lista de visões ao lado de "Limpar filtros".

### A2. Exportação com os tópicos escolhidos (obs. 1, final)

- Modal **"Exportar"** com:
  - escopo: filtro atual ou **seleção** (os `ids` marcados);
  - colunas: por padrão as visíveis na tabela, editáveis;
  - formato: CSV, XLSX ou relatório HTML imprimível;
  - **agrupar por** status, grupo temático, região, TRF, medicamento ou apresentação, com
    subtotais no XLSX e no HTML.
- Rota `GET /api/demandas/export?format=csv|xlsx|html&cols=…&ids=…&agrupar=…`, montada sobre
  `whereDemandas`. Paginada no servidor, **sem o teto silencioso de 10.000 linhas**: se houver um
  limite, informe-o na tela. Grava `AuditLog` EXPORT com filtros e colunas. O CSV segue as regras
  de `lib/metrics-export.ts` (`;`, vírgula decimal, BOM).
- Corrigir **"Exportar seleção"** (`page.tsx:847-852`): hoje exporta o filtro inteiro.

### A3. "Cessar Atos" (obs. 1)

- Aja conforme o diagnóstico 3.1. Com as opções dinâmicas (A1), a tela passa a mostrar o que existe
  de fato, e um status ausente deixa de parecer filtro quebrado.
- Se a grafia no banco divergir só por caixa ou espaços, normalize **no importador** (trim e
  colapso de espaços) e registre a contagem no relatório de carga. **Não renomeie status**
  silenciosamente.
- O texto do esclarecimento entra na nota à DLOG (12.2).

### A4. Busca por nome e por código (obs. 2)

- **Na tela:** debounce de 400 ms e cancelamento da requisição anterior. A forma preferida é migrar
  o `fetch` da página para TanStack Query com `signal` e `placeholderData: keepPreviousData`.
- **Código na "Buscar":**
  - `^\d{4,6}$` ou `^\d{13}$` que `resolverItem` reconhece: aplica o filtro CATMAT/registro e mostra
    a faixa "Interpretado como CATMAT 410020 — buscar como texto", com link que desfaz.
  - Nº CNJ (`NNNNNNN-DD.AAAA.J.TR.OOOO`, com ou sem pontuação): procura em `numeroProcesso` só pelos
    dígitos.
  - NUP SEI (`SEI_PAT`): procura em `nupSei` (A6).
- **Sem acento e rápido (P8):**
  - Coluna `buscaNorm` = `normalizarTexto` de `numero`, `numeroProcesso`, `nupSei`, `titulo`,
    `principioAtivo`, `medicamento` (A5) e `descricao`.
  - Índice GIN `gin_trgm_ops`.
  - A consulta passa a `buscaNorm LIKE '%' || termoNormalizado || '%'`.
  - Script `scripts/alter_demanda_busca.py`: extensão, coluna, backfill em lotes e
    `CREATE INDEX CONCURRENTLY`.
  - O importador e as rotas POST/PATCH de demanda mantêm a coluna atualizada.
- **Grafias de medicamento:** se o termo é uma palavra com 6 letras ou mais, procure também o
  radical (`radicalSubstancia` de `lib/demandas-catmat.ts`), para "eltrombopague" achar
  "Eltrombopag".
- **Erros:** a rota devolve mensagem amigável e registra o erro no servidor. Nada de mensagem do
  Prisma na tela.

### A5. Medicamento e apresentação na demanda (obs. 2)

- **Colunas novas em `Demanda`** (Python DDL + modelo Prisma):
  - `medicamento String?`: substância(s) canônica(s), por exemplo "ELTROMBOPAGUE OLAMINA".
  - `medicamentoOrigem String?`: `REDMINE | TITULO | DESCRICAO | SISMAT`.
  - `apresentacoes Json?`: lista de `{ texto, concentracao, forma, catmat?, origem }`.
  - `catmatsDerivados String[]`: só quando a apresentação identifica **um** CATMAT sem
    ambiguidade.
- **Script `scripts/enriquecer_demandas.py --dry-run|--confirm`** (idempotente, rodado depois de
  cada carga; ver 2.2):
  1. **Dicionário de substâncias** = substância principal do `CatmatItem` + `CmedRegistro.substancia`,
     com as mesmas regras de radical e sal de `lib/demandas-catmat.ts`. Espelhe em Python com um
     autoteste que compara TS e Python em casos fixos, como já se faz com `precos_norm.py`.
  2. `principioAtivo` preenchido → `medicamento` = forma canônica dele. Vazio → procurar no título,
     depois na descrição. **Só grava se casar com o dicionário (P5).**
  3. **Apresentação (P6):** primeiro as saídas do SISMAT do mesmo NUP (`SismatSaida.material`,
     `materialCodigo`, cruzando pelo NUP extraído com o padrão de `SEI_PAT`); depois a
     concentração e a forma no trecho do texto em volta da substância (reuse
     `catmat_assoc.normaliza.doses()` se estiver disponível; ver 2.3).
  4. Relatório de cobertura: quantas demandas por origem, quantas com apresentação e quantas
     ambíguas.
- **Tela:**
  - Coluna "Medicamento / Apresentação": a substância e as apresentações, com um badge discreto de
    origem ("extraído do título"), explicado no tooltip.
  - Filtro "Apresentação" (seleção múltipla), habilitado quando há medicamento ou CATMAT no
    recorte.
  - Opção **"Agrupar por apresentação"**: cabeçalho de seção com contagem, e um grupo
    "apresentação não identificada" no fim, **nunca descartado em silêncio**.
- **Filtro CATMAT mais preciso:** a faixa do código passa a mostrar dois grupos com contagem:
  "correspondência exata da apresentação" (o código está em `catmatsDerivados`) e "mesma
  substância, apresentação não identificada". Os dois são listados, separados. O Dashboard (B)
  faz o mesmo.
- **Aceite:** 410020 × 410019 e 630389 × 630391 passam a devolver conjuntos **diferentes** quando o
  texto ou o SISMAT trazem a concentração. As demandas sem concentração aparecem no grupo "não
  identificada" dos dois códigos.

### A6. Processo judicial e SEI (obs. 3)

- **Importar `NUP_SEI Principal` para `Demanda.nupSei`** no formato canônico
  `DDDDD.DDDDDD/AAAA-DD`, com a mesma regex de `SEI_PAT`:
  - acrescentar a coluna em `COLUMNS` e no `build_rows` do importador;
  - DDL `ADD COLUMN IF NOT EXISTS` e índice;
  - incluir a contagem no relatório de carga.
  - **Não é único:** um SEI pode ter várias linhas no Redmine.
- **Onde exibir:**
  - colunas "Nº Processo" e "Nº SEI" visíveis por padrão na lista;
  - detalhe da demanda;
  - CSV/XLSX/HTML (A2);
  - **PDF da demanda** (hoje não traz nem o nº do processo);
  - relatório de demandas;
  - tabela de processos do Dashboard (B3).
- **Ações:** botão "copiar" nos dois números. Links só com URL-base configurada (P7).
- **Opcional:** no detalhe da demanda, a seção "Entregas no SISMAT" pelo NUP (material, quantidade,
  valor, mês), para rastreabilidade.

---

## 5. Frente B — Dashboard

### B1. Mesmo recorte em todo lugar

`/api/demandas`, `getMetricsData` (ORM, SQL bruto e SQL com alias `d.` do JOIN do SIAFI),
`lib/metrics-ranking-anual.ts`, `/api/demandas/metrics/export`, `/api/demandas/autores/metrics`,
`/api/relatorios/generate` e as opções de filtro passam a usar `whereDemandas`/`sqlDemandas`
(A1). Acaba a montagem de where à mão em cinco lugares.

### B2. Bugs a corrigir junto

- Filtro CATMAT ausente nas consultas de valor (`lib/metrics.ts:184`): resolvido por B1.
- `deletedAt` fora das contagens do ORM e do ranking: resolvido por B1.
- Aba Autores ignorando medicamento e CATMAT.
- `jsonComVersao(request, ["demanda"], …)` em `app/api/demandas/metrics/route.ts` passa a declarar
  também `"siafiPagamento"`.

### B3. O medicamento direto na tela

- **Troque o Combobox** por um campo **"Medicamento"** de texto livre com sugestões:
  - as sugestões são **substâncias** canônicas (`Demanda.medicamento`, A5), com a contagem da
    substância e não da combinação;
  - o filtro aplica ao escolher, ao teclar Enter ou após 450 ms;
  - a semântica é a mesma da lista: `principioAtivo`, `medicamento` derivado, título e descrição.
- **Painel "Resumo do recorte"**, no topo de qualquer aba do Redmine, quando houver filtro de
  medicamento ou CATMAT:
  - processos: total, ativos e encerrados;
  - valor pago (SIAFI);
  - primeira e última entrada;
  - status, com o "Cessar Atos" explícito;
  - cinco principais UFs e TRFs;
  - apresentações (A5).
- Logo abaixo, a tabela **"Processos do recorte"**, com 20 por página: Nº DJUD, Nº Processo,
  Nº SEI, medicamento e apresentação, status, UF, entrada DJUD e link para a demanda. Ao lado, o
  botão "Abrir na lista de Demandas", com os mesmos filtros na URL.
- Status e Prioridade passam a usar o seletor múltiplo de A1. As opções vêm de `/api/demandas/opcoes`.
- **Aceite:**
  - digitar "eltrombopag" mostra os dados na hora, sem gerar relatório;
  - o total do resumo é **igual** ao total da lista de Demandas com o mesmo filtro;
  - o relatório HTML e o CSV mostram os mesmos números da tela.

---

## 6. Frente C — Relatórios (obs. 4)

Estado hoje: três cards "Em breve", sem código. O que cada um precisa:

| Relatório | Dados disponíveis | Lacunas | Proposta |
|-----------|-------------------|---------|----------|
| **Panorama Executivo** | Tudo de `getMetricsData` + ranking anual + SIAFI | Nenhuma relevante | Implementar já. Rota `GET /api/relatorios/executivo?format=html\|csv`, com os filtros de A1 e os blocos de `lib/metrics-export.ts`: KPIs, evolução mensal, os 15 medicamentos com mais processos e com maior valor, valor pago, passivo ativo por status e TRF, Cessar Atos. Grava `RelatorioGerado` (`EXECUTIVO`) e `AuditLog`. |
| **Análise de Risco e Prazos** | `dataEntradaDJUD`, `criadoEm`, `atualizadoEm`, status, prioridade; `statusAbastecimento` e `modalidadeTratamento` em `RedmineSeiAtributos` (pelo NUP, A6) | `dataVencimento` **não é importado** (falta em `COLUMNS`; verificar `due_date` no diagnóstico 3.2). **Não há histórico de status**, só a foto atual. | Envelhecimento das demandas ativas (0–30, 31–90, 91–180 e mais de 180 dias desde a entrada), críticas, desabastecidas, tratamento contínuo e Cessar Atos (risco de entrega ou pagamento indevido). **Declarar no relatório que "tempo no status" é aproximado** enquanto não houver histórico. |
| **Dimensionamento para ARP** | `SismatSaida` (`qtdEntregue` por mês e `materialCodigo`), demandas ativas por substância e apresentação (A5), tratamento contínuo | Depende de A5 e A6 para ligar demanda a apresentação e a consumo | Por CATMAT ou apresentação: consumo mensal histórico, projeção de 12 meses (tendência linear e média móvel, como diz o card), quantidade sugerida com intervalo, e o botão "Levar para a cesta" com a quantidade, ligando à Pesquisa de Preços. |

- Neste ciclo: **implementar o Panorama Executivo** e escrever `spec/relatorios-risco-arp.md` com
  as especificações dos outros dois, as lacunas e as consultas de diagnóstico.
- O card só troca "Em breve" por um link quando o relatório existir. Se o usuário fornecer datas
  (P14), o card mostra "Previsto para …".

---

## 7. Frente D — Pesquisa de Preços

### 7.0 Base legal (confirmar o texto no DOU antes de imprimir no relatório)

A IN SEGES/ME nº 65/2021, art. 5º, prevê cinco parâmetros, que podem ser combinados, e o §1º manda
**priorizar os incisos I e II**, justificando nos autos quando não for possível:

| Inciso | Parâmetro | Janela no texto da IN | Fonte no painel |
|--------|-----------|-----------------------|-----------------|
| I | Sistemas oficiais de governo (Painel de Preços, Banco de Preços em Saúde), "observado o índice de atualização de preços correspondente" | Sem prazo expresso no inciso. Padrão do painel: 12 meses (P9) | BPS, SIASG |
| II | Contratações similares da Administração, em execução ou concluídas no período de **1 ano** anterior à divulgação do edital, inclusive SRP, observado o índice de atualização | 1 ano | PNCP (e preço informado do tipo II, P13) |
| III | Mídia especializada, tabela de referência aprovada pelo Executivo federal, sítios eletrônicos especializados ou de domínio amplo, com **data e hora de acesso** | **6 meses** | Preço informado do tipo III (a "Mídia especializada" da DLOG) |
| IV | Pesquisa direta com no mínimo 3 fornecedores, com justificativa da escolha | **6 meses** | Orçamento direto (já existe) |
| V | Base nacional de notas fiscais eletrônicas | **1 ano** | Preço informado do tipo V (a "Nota Fiscal" da DLOG) |

### D1. Período da pesquisa (obs. 5)

- **Módulo puro** `lib/pesquisa-preco-periodo.ts`:
  - `PeriodoPesquisa { dataReferencia: string; mesesMercado: 12 | 24 | 36 | null; justificativaAmpliacao: string | null }`
    (`null` = todo o período);
  - `JANELA_POR_INCISO`;
  - `inicioJanela()`.
- **`pesquisarPrecos`:**
  - recebe `periodo` e aplica `data >= início AND data <= dataReferencia` às três bases;
  - conta também os registros **fora da janela**: quantos são e a data do mais recente;
  - em cada fonte, devolve `periodo: { inicio, fim, foraDoPeriodo, maisRecenteFora }`.
- **Preços informados (orçamento e tipos III e V):** fora da janela do inciso → alerta, e o preço sai
  do cálculo, a menos que o usuário marque "considerar mesmo assim" com justificativa.
- **Ampliação:** escolher 24 meses, 36 meses ou todo o período exige **justificativa de no mínimo 20
  caracteres**, impressa no relatório e gravada no `AuditLog`.
- **Tela:**
  - bloco "Parâmetros da apuração", junto aos filtros obrigatórios e **fora** de "Mais filtros" (não
    é filtro opcional; ver `FONTE_SEM_CAMPO`), com data de referência, período e IPCA (D2);
  - no `SourcePanel`: "12 meses (15/10/2025 – 15/10/2026) · n registros · fora do período: m (mais
    recente em dd/mm/aaaa)".
- **Relatório:**
  - a metodologia cita a janela por fonte e o inciso;
  - cada tabela de registros mostra a data;
  - observação automática quando uma fonte ficou vazia na janela e havia dado fora dela ("priorizar
    I e II, art. 5º, §1º").
- **Cesta:** `CestaItem` ganha `mesesMercado Int?` e `justificativaPeriodo String?`. No relatório da
  cesta, a data de referência é a **data de emissão**.

### D2. Atualização pelo IPCA (obs. 6)

- **Tabela `IndiceIpca`** (schema public):
  - `competencia Date @id` (1º dia do mês);
  - `numeroIndice Decimal(16,6)` (base dez/1993 = 100);
  - `variacaoMensal Decimal(8,4)`;
  - `fonte String`;
  - `importadoEm DateTime`.
- **Script `scripts/import_ipca.py --dry-run|--confirm`:**
  - fonte IBGE/SIDRA, tabela 1737 (variável 2266 = número-índice; 63 = variação mensal; **confirme
    os ids na API antes de usar**);
  - aceita também `--file` com o CSV ou XLSX baixado à mão, porque a máquina de trabalho pode não
    alcançar a API;
  - autoteste: o produto de `(1 + v/100)` entre dois meses tem de bater com a razão dos
    números-índices (tolerância relativa de 0,1%, porque as variações são publicadas com 2 casas).
- **Módulos:** `lib/ipca.ts` (servidor: carrega a série) e a função pura `fatorIpca(niBase, niPreco)`.
  Regra do mês-base em P10. Preço de mês sem índice publicado → fator 1, com sinalização.
- **`RegistroMercado`** ganha `precoNominal`, `fatorIpca` e `mesIndice`. Com o IPCA ligado,
  `preco` = corrigido, e **IQR, estatística, curadoria e consolidados usam o preço corrigido**.
  `RegistroDescartado` leva os dois preços.
- **Tela:** chave "Atualizar pelo IPCA até <mês/ano>", e cada registro mostra "R$ nominal × fator =
  R$ corrigido".
- **Relatório:** seção "Atualização monetária", com a fonte (IBGE), o mês-base, a convenção e uma
  tabela por registro (nominal, mês, fator, corrigido). O texto cita o "índice de atualização"
  dos incisos I e II.
- **Fontes e cache:** `lib/data-version.ts` e a página `/fontes` passam a mostrar o "IPCA — último
  mês carregado".
- **Armadilhas da planilha da DLOG que não podem ser reproduzidas** (ver 8.5):
  - acumulado calculado por **soma** das taxas mensais, quando deveria ser composição;
  - intervalos de soma desalinhados linha a linha;
  - busca do mês por texto que depende do idioma do Excel, o que deixou o arquivo inteiro em
    `#N/A`.

### D3. Identificação da contratação de referência (obs. 7)

- **`RegistroMercado`** ganha `contratacao`:
  - campos: `tipo` (`PREGAO | DISPENSA | INEXIGIBILIDADE | ATA_SRP | CONTRATO | NOTA_FISCAL |
    OUTRO | null`), `numero` (ex.: "90041/2026"), `uasg`, `nomeUasg`, `numeroItem`, `processo`,
    `criterioJulgamento`, `situacao` (anulada/revogada), `numeroControlePncp` e `url`;
  - `indisponivel: string | null` com o motivo quando a base não tem o dado.
- **Schema:** colunas anuláveis em `PrecoBps`, `PrecoSiasg` e `PrecoPncp` (DDL Python e modelo),
  **somente as que existirem na origem** segundo o diagnóstico 3.6. Ajustar os carregadores, que
  ficam onde o usuário indicar.
- **PNCP:** selecionar `numeroControlePncp` em `pesquisarPrecos` e derivar dele o CNPJ do órgão, o
  sequencial e o ano da compra (D4).
- **Tela:** linha "Contratação: Pregão 90041/2026 · UASG 120195 · item 122 · [PNCP ↗]" no
  `SourcePanel` e na curadoria (`LinhaRegistro`, `curadoria-dialog.tsx:130`).
- **Relatório:** coluna "Contratação de referência" nas tabelas de BPS, SIASG e PNCP, nos descartes
  e no XLSX (seção 8.4).
- Se a base não tem o identificador, imprimir "não disponível na base <X>". **Não inventar número.**

### D4. Link para o PNCP (obs. 8)

- Função pura `urlPncp(numeroControle)` em `lib/pncp.ts`. Formatos do Manual de Integração do PNCP:
  - contratação: `CNPJ-1-SEQUENCIAL/ANO` (ex.: `87297982000103-1-000233/2026`);
  - ata: o mesmo número + `-SEQATA`.
  - O CNPJ pode ser **alfanumérico** desde jul/2026: a regex aceita `[0-9A-Z]{12}\d{2}`.
- Página pública da contratação: `https://pncp.gov.br/app/editais/{cnpj}/{ano}/{sequencial sem
  zeros à esquerda}`. **Rota relatada por terceiros:** abra 5 registros reais antes de mergear e
  anote no PR.
- Para ata e contrato, só gerar link de rota **conferida**. Se não estiver conferida, use o link da
  contratação-mãe.
- Na tela, `target="_blank" rel="noopener noreferrer"` com o ícone `ExternalLink`. No relatório HTML,
  o link e o número impresso, para quem imprime em papel.

### D5. Fonte Compras.gov.br — fora deste ciclo (P15)

A coluna "I - Compras.gov" da planilha da DLOG traz **todas** as compras públicas (o SIASG do painel
só traz as judiciais), com nº da compra, item e UASG. Registre no PR uma avaliação: endpoint,
campos, se a rede da Vercel alcança, volume, e se substitui ou complementa o SIASG. Não implemente.

---

## 8. Frente E — A planilha da DLOG no painel

### 8.1 Layout da planilha (`Mapa comparativo de Preços`, 10 abas)

| Aba | Conteúdo |
|-----|----------|
| `Consolidação` | Uma linha por item: Item, Medicamento, CATMAT, Quantidade, Preço Adotado, Método Estatístico (Média / Mediana / Teto CMED), Valor Total (= qtd × preço), Status. Rodapé "TOTAL GERAL" e nota "IN SEGES/ME nº 65/2021". |
| `MEMÓRIA DE CÁLCULO` | Por item: Nº Preços, Menor, Maior, Média, Mediana, Coef. Variação, Método Escolhido, Preço Adotado. Bloco "JUSTIFICATIVA TÉCNICA": "adotou-se o menor valor entre a média e a mediana; se superior ao teto CMED (PMVG 17% do medicamento de referência), aplica-se o teto". |
| `Item 1` … `Item 6` | Cabeçalho: medicamento, CATMAT, descrição, unidade, quantidade. "RESUMO ESTATÍSTICO": menor, maior, média, mediana, desvio padrão, CV, nº de amostras. "PREÇO ADOTADO": unitário, total e **justificativa em texto**. "BASE DE PREÇOS COLETADOS", colunas A–X: Nº do Item da Pesquisa, **Fonte da Pesquisa (rotulada pelo inciso: "I - Compras.gov", "II - PNCP", "III - Mídia especializada", "Nota Fiscal")**, **Número da Compra**, Data/Hora da Compra, Data/Hora da Cotação, **Anulada/Revogada**, **Nº do Item da Compra**, Modalidade, **Critério de Julgamento**, Código do Item, Descrição, Unidade de Fornecimento, Quantidade Ofertada, Preço Unitário, CNPJ do Fornecedor, Nome do Fornecedor/Fonte, Órgão, **UASG**, Nome UASG, Referência, **Compõe a base de dados final**, Mês e Ano, **Índice IPCA acumulado**, **Preço corrigido pelo IPCA**. |
| `Índices IPCA` | IPCA mensal jan/2024–ago/2026 e "acumulado" por linha. |
| `CMED` | Por item, os registros da lista CMED publicada em 11/08/2026: substância, CNPJ, laboratório, registro, EAN, produto, apresentação, classe, tipo, regime, PMVG sem impostos, PMVG 0%, **PMVG 17%** e a coluna N = PMVG 17% ÷ unidades da embalagem. |

Itens da planilha, que servem de **casos de teste** daqui para frente:

| Item | CATMAT | Medicamento | Unid. | Qtd. | Fontes |
|------|--------|-------------|-------|------|--------|
| 1 | 410020 | Eltrombopague olamina 50 mg | comprimido | 15.450 | 33 compras Compras.gov |
| 2 | 410019 | Eltrombopague olamina 25 mg | comprimido | 5.892 | 32 compras Compras.gov |
| 3 | 630389 | Momelotinibe 100 mg | comprimido | 5.760 | 2 Compras.gov, 1 PNCP, 9 mídia especializada |
| 4 | 630391 | Momelotinibe 200 mg | comprimido | 1.800 | 6 Compras.gov, 5 PNCP (1 marcado "não compõe") |
| 5 | 640532 | Eplontersena 56,25 mg/mL (caneta 0,8 mL) | tubete | 48 | 2 notas fiscais |
| 6 | 612063 | Tremelimumabe 20 mg/mL | frasco | 48 | 4 Compras.gov, 4 mídia especializada |

### 8.2 Mapeamento coluna da DLOG → painel

| Coluna DLOG | No painel |
|-------------|-----------|
| Fonte da Pesquisa (inciso) | `NOME_FONTE_CURADA` + **inciso do art. 5º** por fonte (novo, ver 7.0) |
| Número da Compra, Nº do Item, UASG, Nome UASG, Critério de Julgamento, Anulada/Revogada | `contratacao` (D3) |
| Data/Hora da Compra | `RegistroMercado.data` |
| Data/Hora da Cotação | Data de emissão do relatório (já no cabeçalho). Para o tipo III: **data e hora de acesso** (P13) |
| Modalidade, Código, Descrição, Unidade, Quantidade, Preço Unitário, CNPJ, Fornecedor, Órgão | Já existem (`modalidade`, `descricao`, `unidade`, `qtd`, `preco`, `cnpjFornecedor`, `fornecedor`, `orgao`) |
| Referência | `contratacao.url` (PNCP) ou URL do tipo III |
| Compõe a base de dados final | Derivado: "Sim", ou "Não — <motivo>" (exclusão justificada, fora do IQR, fora do período, somente registro) |
| Mês e Ano, Índice IPCA, Preço corrigido | D2 |
| Resumo estatístico (menor, maior, média, mediana, DP, CV, n) | `Estatisticas` (já existe; o DP é amostral, n−1, como o `STDEV` da DLOG) |
| Preço adotado + Método | `recomendacao` + método por item (P11) |
| Justificativa | **Novo:** texto gerado por item (8.3) |
| Consolidação / TOTAL GERAL | Quadro-resumo e valor global do relatório da cesta (já existem) |
| Aba CMED | `CmedPanel` + os dois tetos (P12) + alíquota usada |

### 8.3 Diferenças de método (decisões em P11 e P12, não "correções")

1. **Conjunto da estatística:** a DLOG junta todos os registros num conjunto único, o que equivale
   ao `porRegistro`. O painel adota a mediana das medianas por fonte. Os dois aparecem no
   relatório e o método é escolhido por item.
2. **Critério:** a DLOG usa o menor valor entre média e mediana. O painel usa a mediana. Opção por
   item, com justificativa.
3. **Teto:** a DLOG usa o PMVG 17% do medicamento de referência (o maior). O painel usa o menor PMVG
   sem impostos. Exibir os dois (P12).
4. **Outliers:** a DLOG escolhe células à mão (Item 5: `AVERAGE(X18,X19)`; Item 6:
   `AVERAGE(X18,X19,X20,X26)`) sem registrar o motivo. O painel aplica o IQR e exige justificativa.
   Manter a regra do painel.
- **Justificativa automática** por item, no padrão textual da DLOG, gerada a partir dos números.
  Exemplo: "O menor valor apurado foi a mediana (R$ 99,53). Como R$ 99,53 não ultrapassa o teto
  CMED (R$ 146,20/unidade, PMVG <alíquota> do medicamento de referência), adota-se a mediana." Ela
  sai no painel, no relatório e no XLSX, e o usuário pode editá-la antes de emitir. O texto editado
  fica gravado no `CestaItem`.

### 8.4 Exportação XLSX "Mapa comparativo" (a partir da cesta)

- `POST /api/relatorios/cesta/xlsx`, com o mesmo corpo do relatório da cesta, refaz a pesquisa como
  o relatório HTML.
- Abas no layout de 8.1:
  - `Consolidação`;
  - `Memória de Cálculo`;
  - uma aba por item, com resumo e "Base de preços coletados" nas colunas da DLOG mais
    "Contratação de referência" e "Link PNCP";
  - `Índices IPCA` (só os meses usados, com número-índice e fator);
  - `CMED` (registros do teto, com a alíquota).
- Use SheetJS (`xlsx`, já é dependência) e importe a biblioteca **só no servidor**.
  - Grave **o valor calculado e também a fórmula** (`MIN`, `MAX`, `AVERAGE`, `MEDIAN`, `STDEV`)
    sobre as linhas "Compõe = Sim", para o analista poder auditar.
  - Os valores precisam bater com o painel. Teste abrindo o arquivo e comparando.
- Grava `AuditLog` EXPORT e `RelatorioGerado` (tipo `PESQUISA_PRECO`, `parametros.formato = "xlsx"`).

### 8.5 Erros encontrados na planilha atual (motivam a automação; não reproduzir)

1. **IPCA acumulado por soma simples** das taxas mensais (`=SUM(B6:B35)`), quando o correto é a
   composição `Π(1+i) − 1` ou a razão de números-índices.
2. **Intervalos de soma inconsistentes** entre linhas vizinhas (`B9:B37`, `B10:B36`, `B11:B39`,
   `B13:B41`, `B23:B30`, `B25:B30`…), o que gera um acumulado não monotônico (jun/2025 = 1,80;
   jul/2025 = 4,39).
3. **jun e jul/2026 com IPCA = 0**, embora esses índices já estivessem publicados na data da
   cotação (11/08/2026). Ago/2026 ainda não existia e também aparece como 0, em vez de "sem índice".
4. **`VLOOKUP` por "mês ano" em texto** (`TEXT(D18,"mmmm")`): o valor depende do idioma do Excel. No
   arquivo recebido, **todas** as colunas W e X e todos os resumos estatísticos estão em `#N/A`.
5. `MEMÓRIA DE CÁLCULO!G8` (média do Item 3) aponta para `'Item 4'!B8`.
6. `COUNT(X18:Y29)` inclui a coluna Y, e há intervalos que vão até a linha 59 em abas com 28 linhas.
7. Itens 5 e 6: média, mediana e DP sobre células escolhidas à mão, enquanto `MIN` e `MAX` usam o
   intervalo todo. A estatística fica inconsistente e o descarte não tem motivo registrado.
8. "Compõe a base de dados final = Não" (Item 4, linha 25) **não é respeitado** pelas fórmulas.
9. Preços adotados **digitados à mão** em vez de fórmula (`MEMÓRIA!K6` = 191,948…, `K8`, `K9`;
   `'Item 4'!B12` = 745,51).
10. A nota da `Consolidação` diz "Método estatístico: Mediana", mas os itens usam Média e Teto CMED.
11. Erros de digitação nos dados: quantidade 651.409 igual ao nº da UASG (Item 1, linha 42); compra
    "26/02026".

---

## 9. Verificação (antes de qualquer push)

- `npm run lint`, `npx tsc --noEmit`, `npm run build` e `npm run tokens:check`. Rode os autotestes
  Python (`python scripts/precos_norm.py`, `python scripts/cmed_layout.py` e os novos: espelho do
  dicionário de substâncias, `import_ipca.py`).
- Resultados do diagnóstico (seção 3) colados no PR da frente correspondente.
- **A:**
  - incluir e excluir no mesmo campo e combinar campos (P1);
  - `?status=X` antigo ainda funciona;
  - "Exportar seleção" exporta só os marcados;
  - export com mais de 10 mil linhas sai completo;
  - "eltrombopague", "Eltrombopag", "410020" e um nº CNJ na "Buscar" funcionam, e digitar rápido
    não deixa resultado velho na tela;
  - 410020 × 410019 diferem (A5);
  - Nº SEI aparece na lista, no detalhe, no PDF e no export.
- **B:**
  - mesmo filtro → mesmo total na lista, no Dashboard, no CSV e no HTML;
  - CATMAT muda os valores da aba Valores;
  - demandas na lixeira não entram em nenhuma contagem.
- **D:**
  - item 410020 com janela de 12 meses: conferir as contagens contra o diagnóstico 3.5;
  - ampliar sem justificativa é bloqueado;
  - IPCA: um preço de jan/2024 corrigido pela razão de números-índices bate com o produto das
    variações mensais (tolerância de 0,1%);
  - link PNCP abre a contratação certa nos 5 registros conferidos;
  - registro sem identificador mostra "não disponível".
- **E:**
  - os 6 itens da planilha montados numa cesta geram o XLSX;
  - as fórmulas recalculadas pelo Excel batem com os valores gravados e com o painel;
  - a justificativa automática sai coerente com o método e o teto.
- **C:** o Panorama Executivo bate com o Dashboard para o mesmo filtro.

---

## 10. Ordem de execução sugerida (um PR por linha)

1. Diagnóstico (seção 3), registrado num comentário ou num `docs/diagnostico-dlog-2026-10.md`.
2. **A1 + A2 + A3 + A4:** filtro único, seleção múltipla, export e busca. Inclui a DDL de
   `buscaNorm`.
3. **B:** Dashboard sobre o filtro único, bugs e painel do recorte.
4. **A6 + A5:** SEI na carga, enriquecimento de medicamento e apresentação (scripts Python e tela).
5. **D1 + D3 + D4:** período, identificação da contratação e link PNCP.
6. **D2:** IPCA (tabela, carga e cálculo).
7. **E:** justificativa, método por item, os dois tetos e o XLSX.
8. **C:** Panorama Executivo e spec de Risco e ARP.

Os passos 4 e 6 pedem que o usuário rode scripts localmente (`--dry-run`, revisar, `--confirm`).
Pare e peça, com os comandos prontos.

## 11. Não fazer

- Não commitar a planilha da DLOG, bases do Redmine nem dumps.
- Não renomear status nem gravar medicamento "adivinhado" fora do dicionário (P5).
- Não inventar nº de compra, UASG ou link. Se a base não tem o dado, imprima "não disponível".
- Não corrigir o teto CMED pelo IPCA. Não aplicar IPCA "para trás" (preço posterior ao mês-base).
- Não mudar o método adotado padrão nem a regra do teto sem a decisão de P11 e P12.
- Não ampliar o período automaticamente.
- Não duplicar a seção 7 do prompt CMED mensal (alíquota e competência).
- Não colocar Prisma em módulo importado por página client.

## 12. Entregáveis

### 12.1 Código e documentação

- `lib/demandas-filtro-tipos.ts`, `lib/demandas-filtro.ts`, `components/backoffice/filter-multi-select.tsx`,
  `/api/demandas/opcoes`, `/api/demandas/visoes`, `/api/demandas/export`.
- `scripts/alter_demanda_busca.py`, `scripts/enriquecer_demandas.py` (com o espelho e o autoteste) e
  `scripts/import_redmine_base.py` com `nupSei` e o histograma de status.
- Ajustes em `lib/metrics.ts`, `lib/metrics-ranking-anual.ts`, nas rotas de métricas, export e
  autores e no Dashboard (painel do recorte).
- `lib/pesquisa-preco-periodo.ts`, `lib/ipca.ts`, `lib/pncp.ts`, `scripts/import_ipca.py`, DDL das
  colunas novas (preços, `CestaItem`, `IndiceIpca`), e alterações em `pesquisarPrecos`, na tela, na
  curadoria, nos relatórios e na cesta.
- `/api/relatorios/cesta/xlsx`, `/api/relatorios/executivo` e `spec/relatorios-risco-arp.md`.
- `CLAUDE.md`, atualizado nas seções "Demandas", "Dashboard" e "Pesquisa de Preços" com as regras
  novas: filtro único, `buscaNorm`, medicamento e apresentação derivados, `nupSei`, período, IPCA,
  contratação, PNCP e XLSX. Também `docs/ATUALIZACAO_DE_DADOS.md` (ordem das cargas e
  enriquecimentos; exportação do Redmine com todos os status).

### 12.2 Nota de resposta à DLOG (rascunho para o usuário revisar)

Um parágrafo por observação, em linguagem não técnica, com o estado de cada uma: **corrigido**
(versão e data), **em implementação**, **depende de decisão** (citar P11/P12) ou **esclarecimento**.
Itens obrigatórios:

- **"Cessar Atos":** o status não foi excluído dos critérios de pesquisa. Diga, com base no
  diagnóstico 3.1, por que não apareceu: base sem o status, grafia diferente ou combinação com o
  filtro de medicamento.
- **Relatórios:** o Panorama Executivo está disponível (ou em homologação). Risco e Prazos e ARP
  ficam com as datas que o usuário informar. Não invente datas.
- **Planilha:** o que já foi incorporado, as diferenças de método que precisam de decisão (8.3) e,
  com tato, os pontos da 8.5 que a automação resolve.
