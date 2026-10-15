# PROMPT — Avaliação da DLOG (out/2026): Demandas, Dashboard, Relatórios e Pesquisa de Preços

> **Como usar:** cole este texto inteiro numa sessão nova do Claude Code aberta no repositório
> `djud-painel`, numa branch criada a partir da `main`. Antes de colar, revise o bloco
> **0. Parâmetros a confirmar**: é o único trecho que talvez você queira editar.
>
> **Origem:** e-mail da DLOG com 8 observações sobre as abas Demandas, Dashboard, Relatórios e
> Pesquisa de Preços, acompanhado da planilha de consolidação de preços que a DLOG usa hoje
> (`Mapa comparativo de Preços — 25000.114404/2026-58.xlsx`). A planilha **não** vai para o
> repositório: o layout dela está descrito na seção 8.1. Peça o arquivo ao usuário para usar como
> **modelo de conferência** (seção 8.7).
>
> **Revisão 2 (15/10/2026), duas prioridades novas do usuário:**
> 1. **Gerar o relatório de pesquisa de preços no modelo do Excel da DLOG** (Frente E). É a
>    entrega mais importante deste ciclo.
> 2. **Usar a API de Dados Abertos do Compras.gov.br** como fonte
>    (Swagger: <https://dadosabertos.compras.gov.br/swagger-ui/index.html>; contrato OpenAPI:
>    `https://dadosabertos.compras.gov.br/v3/api-docs`). O usuário a chama de "API do PNCP" porque
>    os módulos de Contratações (Lei 14.133) e de Atas dessa API espelham o PNCP. É dela que vêm o
>    nº da compra, a UASG, o item e o nº de controle PNCP que a planilha da DLOG traz e o painel
>    não tem (Frente D, D0).
>
> **Rastreamento:** feito em 15/10/2026 sobre `main` @ `c7cf45d`. As referências `arquivo:linha`
> valem para esse commit; confira antes de editar. A DLOG pediu que se desconsidere o que já
> estiver em andamento, e a seção 2.3 lista o que já está em andamento. **A API não pôde ser
> chamada do ambiente onde este prompt foi escrito (rede bloqueada).** Os parâmetros da seção 7.1
> vêm do contrato de um cliente público da API, que foi conferido contra o `/v3/api-docs`, e estão
> marcados como **confirmado** ou **esperado**. O diagnóstico 3.7 confirma tudo antes de codar.

---

## Sua tarefa

As observações da DLOG e os dois pedidos da revisão 2 viram cinco frentes. Cada frente vira **um
ou mais PRs separados**:

| Frente | Prioridade | Observações | Resumo |
|--------|-----------|-------------|--------|
| **E — Relatório no modelo da DLOG (XLSX)** | **1** | anexo + revisão 2 | O painel gera o "Mapa comparativo de Preços" com as mesmas abas, colunas e blocos da planilha da DLOG, preenchido pelos dados da pesquisa, com fórmulas auditáveis e **sem os erros dela** (8.5). Vale para a pesquisa avulsa (1 item) e para a cesta (n itens). |
| **D — Pesquisa de Preços** | **1** | 5, 6, 7, 8 + revisão 2 | **D0:** fonte nova, a API de Dados Abertos do Compras.gov.br (Painel de Preços, contratações PNCP e atas). **D1:** período do art. 5º da IN 65/2021. **D2:** IPCA. **D3:** identificação da contratação. **D4:** link para o PNCP. |
| **A — Demandas** | 2 | 1, 2, 3 | Filtros com seleção múltipla, exclusão e agrupamento; status "Cessar Atos"; busca por nome e por CATMAT; medicamento e apresentação visíveis; nº do processo judicial e do SEI; exportação com os tópicos escolhidos. |
| **B — Dashboard** | 2 | "Aba DASHBOARD" | Os dados do medicamento pesquisado aparecem direto na tela, com o mesmo recorte da lista e do relatório. |
| **C — Relatórios** | 3 | 4 | Panorama Executivo, Análise de Risco e Prazos e Dimensionamento para ARP. |

Ordem (detalhada na seção 10):

1. **Diagnóstico (seção 3)**, incluindo o teste da API (3.7).
2. **E1**: o XLSX com os dados que o painel já tem.
3. **D0, D3 e D4**: API, identificação da contratação e link PNCP.
4. **D1 e D2**: período e IPCA.
5. **E2**: XLSX completo.
6. **A, B e C** (A e B podem andar em paralelo).

Trabalhe em incrementos pequenos e verificáveis e não pule a seção 9 (verificação). No fim,
redija a **nota de resposta à DLOG** (seção 12.2).

---

## 0. Parâmetros a confirmar (decisões de negócio já assumidas como padrão)

| # | Decisão | Padrão adotado neste prompt |
|---|---------|-----------------------------|
| P1 | Semântica dos filtros com seleção múltipla (Demandas e Dashboard) | Dentro de um campo: **OR** entre os incluídos e **NOT IN** para os excluídos. Entre campos: **AND**. "(não informado)" (`null`) é uma opção como qualquer outra. |
| P2 | Origem das opções dos filtros | **Valores reais do banco, com contagem**, em vez das listas fixas de hoje. |
| P3 | Grupos de status prontos | "Em análise (todos)" = status que começam com "Em Análise". "Encerrados" = `STATUS_RESOLVIDOS` (`lib/metrics.ts:82`). "Ativos" = o restante. **Confirmar com o usuário depois do diagnóstico 3.1.** |
| P4 | Visões salvas | Modelo `UserView` (`prisma/schema.prisma:241`), que já existe e não tem uso. |
| P5 | Medicamento derivado (demanda sem `principioAtivo`) | Extraído do título ou da descrição **só quando casa com o dicionário de substâncias** (`CatmatItem` + `CmedRegistro.substancia`), com a origem marcada. |
| P6 | Apresentação da demanda | Prioridade: (1) saída do SISMAT com o mesmo NUP SEI; (2) concentração e forma extraídas do texto; (3) "não identificada". |
| P7 | Links externos (SEI, consulta processual, Redmine) | Por padrão, botão de copiar. Link só com URL-base em variável de ambiente. Não inventar URL. |
| P8 | Busca sem acento | Coluna `buscaNorm` + índice GIN `pg_trgm` (`CREATE EXTENSION IF NOT EXISTS pg_trgm` no Neon: **confirmar com o usuário**). |
| P9 | Período da pesquisa de preços (art. 5º) | Data de referência = data da pesquisa (editável). **12 meses** para BPS, SIASG, Compras.gov.br, PNCP e atas (incisos I e II) e para nota fiscal (V). **6 meses** para orçamento direto (IV) e mídia especializada (III). Sem ampliação automática; ampliar para 24 meses, 36 meses ou todo o período exige justificativa, impressa no relatório. |
| P10 | IPCA | **Ligado por padrão.** Mês-base = último mês publicado, não posterior ao mês anterior à data de referência. Fator = `NI(mês-base) / NI(mês do preço)`, ou seja, a correção começa no mês seguinte ao do preço. A DLOG inclui o próprio mês: **confirmar a convenção.** O preço nominal aparece sempre ao lado. O teto CMED não é corrigido. |
| P11 | Método do preço adotado | Padrão = **mediana das medianas por fonte** (`METODO_ADOTADO`). Por item, com justificativa, também: o **critério da DLOG** ("menor valor entre média e mediana do conjunto único de registros"), média, mediana ou menor valor do conjunto único. **No XLSX, o método vem pré-selecionado conforme este parâmetro.** |
| P12 | Qual PMVG é teto | O painel usa o **menor PMVG unitário sem impostos**. A DLOG usa o **PMVG 17% do medicamento de referência**, que é o **maior** teto (Item 1: 4.094,06 ÷ 14 = R$ 292,43, Revolade). A alíquota depende do prompt CMED mensal, seção 7 (ver 2.3). Neste ciclo: **exibir os dois tetos** no painel e no XLSX, e o usuário escolhe a regra por item. Padrão no XLSX: **o critério da DLOG**, com a alíquota de 17%. |
| P13 | Preços informados pelo usuário | O "Orçamento direto" vira um **"Preço informado"** com tipo: **IV** fornecedor; **III** mídia especializada ou sítio (URL e data e hora de acesso); **V** nota fiscal eletrônica (nº, chave, emissão); **II** contratação similar fora das bases. Cada tipo é uma fonte própria. |
| P14 | Relatórios ARP, Risco e Executivo | Ordem: Panorama Executivo → Risco e Prazos → ARP. As datas de previsão são do usuário: **não invente datas.** |
| P15 | **Fonte Compras.gov.br (Painel de Preços), via `/modulo-pesquisa-preco/1_consultarMaterial`** | **Entra neste ciclo** como fonte própria ("I - Compras.gov.br"), com **todas** as compras públicas do CATMAT e não só as judiciais. O SIASG judicial continua como fonte separada. |
| P16 | Fonte PNCP | Os itens homologados do módulo 7 (`/modulo-contratacoes/2_consultarItensContratacoes_PNCP_14133`, que traz o nº de controle PNCP) **alimentam a fonte PNCP quando há coleta**. `PrecoPncp` continua como histórico até a validação. Remoção só em PR separado. |
| P17 | Atas de registro de preços (`/modulo-arp/2_consultarARPItem`) | **Fonte opcional** ("II - Ata de Registro de Preços"): atas com vigência iniciada nos últimos 12 meses. Ligada por padrão no XLSX e desligável na tela. |
| P18 | Duplicidade entre fontes (a mesma compra no Compras.gov.br, no PNCP e no BPS) | No **conjunto único** (aba do item no XLSX e `porRegistro`), um registro repetido (mesma UASG + nº da compra + nº do item + fornecedor) fica **só uma vez**: prevalece o Compras.gov.br, depois o PNCP, depois as demais. A cópia aparece com "Compõe = Não — duplicado de <fonte>". No consolidado **por fonte**, cada base conta uma vez. |
| P19 | Validade da coleta na API | Os dados coletados valem **7 dias** por CATMAT. Depois disso, a pesquisa oferece "Atualizar do Compras.gov.br". Nunca coleta em silêncio no meio da emissão de um relatório. |
| P20 | Biblioteca do XLSX | **`exceljs`**, dependência nova e **só no servidor**. O `xlsx` (SheetJS 0.18.5, já instalado) **não grava estilo** (cor, fonte, borda) na versão comunitária, e o modelo da DLOG depende de estilo. O `xlsx` continua onde já é usado. |

Se algum item acima não valer, pare e pergunte antes de implementar a parte afetada.

---

## 1. Mapa: observação da DLOG → o que o código faz hoje

| Obs. | O que a DLOG viu | Causa provável no código (main @ c7cf45d) | Frente |
|------|------------------|-------------------------------------------|--------|
| 1 | Não dá para agrupar, selecionar vários ou excluir itens dos filtros nem escolher os tópicos do relatório | Filtros `FilterSelect` de valor único com listas fixas (`app/(auth)/demandas/page.tsx:87`, `:742`). A API compara por igualdade exata (`app/api/demandas/route.ts:51-56`). CSV/XLSX têm colunas fixas e param em 10.000 linhas (`page.tsx:276`, `:359`). **"Exportar seleção" ignora a seleção**: monta `ids` (`page.tsx:847-850`) e chama `handleExport()` (`:852`), que refaz a consulta só com os filtros. | A1, A2 |
| 1 | Nenhum processo "Cessar Atos" | **Não há exclusão no código.** A opção existe na lista (`page.tsx:753`) e no Dashboard (`dashboard/page.tsx:444`), e o filtro é igualdade exata. Hipóteses: grafia diferente no banco; exportação do Redmine feita só com status abertos; ou demandas sem `principioAtivo` somem quando há filtro por medicamento. Quem decide é o diagnóstico 3.1. | A3 |
| 2 | Medicamento no Título/Objeto | A coluna "Título / Princípio Ativo" já mostra `principioAtivo`. Mas ~14 mil demandas citam o medicamento só no título ou na descrição e aparecem com "—". | A5 |
| 2 | Erro na "Buscar" por nome e por CATMAT | Uma requisição **por tecla**, sem debounce nem cancelamento (`page.tsx:730`). Cinco `ILIKE` sem índice (`route.ts:79-86`). Sensível a acento. **CATMAT digitado na "Buscar" não é resolvido.** O erro do Prisma volta cru. | A4 |
| 2 | Sem separação por apresentação | `Demanda` não tem concentração nem forma. O filtro CATMAT vira o radical da substância (`lib/demandas-catmat.ts`): **410019 (25 mg) e 410020 (50 mg) devolvem as mesmas demandas**, e o mesmo vale para 630389 e 630391. | A5 |
| 3 | Sem processo judicial ou SEI | `numeroProcesso` existe, mas **fica fora do PDF da demanda**. O **NUP SEI não é importado para `Demanda`**: só vai para `sismat.RedmineSeiAtributos`. | A6 |
| Dash. | O dado do medicamento só aparece depois do relatório | O Combobox exige escolher uma opção. As opções são combinações ("A \| B"). Compara só `principioAtivo`. A aba padrão não mostra os dados do medicamento. **Bugs:** o filtro CATMAT fica fora das consultas de valor SIAFI (`lib/metrics.ts:184`); a aba Autores ignora o filtro (`dashboard/page.tsx:282`); as contagens não excluem `deletedAt` (`metrics.ts:149`, `metrics-ranking-anual.ts:99`); o ETag da rota de métricas omite `SiafiPagamento`. | B |
| 4 | Previsão dos relatórios de Ata, Riscos e Executivo | Cards `"em-breve"` (`app/(auth)/relatorios/page.tsx:36,45,54`) sem código. `RelatorioGerado.tipo` já prevê `ARP \| RISCO \| EXECUTIVO`. | C |
| 5 | Períodos do art. 5º | `pesquisarPrecos` usa os **500 registros mais recentes sem recorte de data** (`lib/pesquisa-preco.ts:82`, `:849`, `:872`, `:897`). | D1 |
| 6 | IPCA | Não existe. | D2 |
| 7 | Identificação da contratação | `RegistroMercado` (`lib/pesquisa-preco.ts:226`) não tem nº da compra, ata, contrato, UASG nem processo. As bases atuais não guardam esses campos (os carregadores nem estão no repositório). **A API (D0) traz esses dados.** | D0, D3 |
| 8 | Link PNCP | `PrecoPncp.numeroControlePncp` existe (`schema.prisma:574`), mas não é lido em `pesquisarPrecos`. O módulo 7 da API traz o nº de controle de cada item. | D0, D4 |
| Anexo | Usar uma ferramenta só | Estatística, curadoria e quadro-resumo já existem. **Falta gerar o arquivo no modelo da DLOG** e os campos que só a API traz. | E |

---

## 2. Onde está o código hoje (leia estes arquivos primeiro)

### 2.1 Arquivos centrais

| Arquivo | Papel |
|---------|-------|
| `app/(auth)/demandas/page.tsx`, `app/api/demandas/route.ts`, `lib/schemas.ts` | Lista de demandas, filtros, export e where da API |
| `lib/demandas-catmat.ts` | CATMAT/registro → radicais → where ORM e SQL (as duas versões precisam casar) |
| `lib/principio-ativo.ts`, `app/api/demandas/principios-ativos/route.ts` | Normalização e opções do Combobox do Dashboard |
| `components/backoffice/filter-bar.tsx` | `FilterBar`, `FilterInput`, `FilterSelect` (valor único) |
| `app/(auth)/demandas/[id]/page.tsx`, `app/api/demandas/[id]/export-pdf/route.ts`, `lib/pdf-generator.ts` | Detalhe, PDF da demanda e relatório de demandas |
| `scripts/import_redmine_base.py` | Carga **REPLACE** do Redmine (apaga tudo e recria com novos ids; `COLUMNS` em `:67`) |
| `scripts/import-redmine-sei.ts`, `lib/sismat-saidas-redmine-metrics.ts` | NUP SEI (`SEI_PAT`/`SEI_LATERAL`) e cruzamento com as saídas do SISMAT |
| `app/(auth)/dashboard/page.tsx`, `hooks/useMetrics.ts`, `lib/metrics.ts`, `lib/metrics-ranking-anual.ts`, `lib/metrics-export.ts`, `app/api/demandas/metrics/**`, `app/api/demandas/autores/metrics/route.ts` | Dashboard e exportação |
| `lib/data-version.ts`, `app/api/fontes/route.ts` | ETag por versão do dado; página de fontes |
| `app/(auth)/relatorios/page.tsx`, `app/api/relatorios/**` | Cards de relatórios; rotas de pesquisa de preço (`pesquisa-preco`), cesta, e-mail e generate |
| `lib/pesquisa-preco.ts` | `resolverItem`, `mapearUnidades`, `pesquisarPrecos` (consultas por fonte em `:840-930`, `consolidar` em `:395`) |
| `lib/pesquisa-preco-filtros.ts`, `lib/pesquisa-preco-curadoria.ts` | Módulos **puros**: filtros, `FONTE_SEM_CAMPO`, estatística (DP amostral n−1), IQR, exclusões, orçamentos, `FonteCurada`/`NOME_FONTE_CURADA` |
| `lib/relatorio-pesquisa-preco.ts` | HTML do relatório IN 65 (tabelas de registros `:205-225`, `conteudoBps/Siasg/Pncp` `:308-340`, `MetaRelatorio` com `processo` `:559`) |
| `app/api/relatorios/pesquisa-preco/route.ts`, `app/api/relatorios/cesta/route.ts` | Relatório de um item e da cesta (`processarItens`, concorrência 4; quadro-resumo e valor global) |
| `app/(auth)/pesquisa-preco/page.tsx`, `components/pesquisa-preco/curadoria-dialog.tsx`, `components/pesquisa-preco/cesta-sheet.tsx`, `hooks/usePesquisaPreco.ts`, `hooks/useCesta.ts` | Tela, curadoria e cesta |
| `prisma/schema.prisma` | `Demanda`, `UserView`, `PrecoCmed` (tem `pmvg0`, `pmvg17`), `PrecoBps`, `PrecoSiasg`, `PrecoPncp`, `CmedCompetencia` (tem `dataPublicacao`), `CestaItem` (tem `quantidade`), `CestaOrcamento`, `RelatorioGerado`, `SismatSaida` |

### 2.2 Convenções do projeto (obrigatórias)

- Leia `CLAUDE.md` e `AGENTS.md`. Esta versão do Next.js tem mudanças: consulte
  `node_modules/next/dist/docs/` antes de usar uma API do framework de que não tenha certeza (route
  segment config, `preferredRegion`, `maxDuration`, `serverExternalPackages`).
- **Tabelas e colunas novas**: script **Python** com a mesma DDL que o `prisma db push` geraria
  (`ADD COLUMN IF NOT EXISTS`), com `--dry-run`/`--confirm`, e o modelo Prisma atualizado junto.
  `DATABASE_URL` vem de `.env.local` por `load_database_url()` de `scripts/import_redmine_base.py`.
  A máquina de trabalho **não tem node**.
- Tipos e helpers usados por página client ficam em **módulo puro**, sem Prisma e sem `exceljs`.
- `normalizarTexto`/`normalizarUnidade` têm espelho em `scripts/precos_norm.py`. Mexeu numa,
  mexa nas duas.
- Design system: só tokens nos componentes. **Exceção documentada:** o XLSX não lê CSS, então a
  paleta da DLOG fica em **um único módulo de constantes** (`lib/mapa-dlog/layout.ts`). O
  relatório HTML já faz o mesmo com `AZUL` em `lib/relatorio-pesquisa-preco.ts`.
- Toda exportação ou relatório grava `AuditLog` (`EXPORT`) e `RelatorioGerado`.
- Comentários, mensagens e textos em português.
- O importador do Redmine é REPLACE com ids novos. Tudo o que for derivado de `Demanda` precisa
  ser recalculado depois de cada carga.
- **Um cálculo só:** o XLSX, o HTML e a tela leem o mesmo `ResultadoPesquisa`. O gerador do XLSX
  **nunca recalcula preço por conta própria**. As fórmulas da planilha reproduzem o cálculo para
  auditoria, e a seção 8.7 confere que dão o mesmo número.

### 2.3 Trabalho em andamento: não duplicar

- `PROMPT_CMED_mensal_pesquisa_precos.md`, **seção 7** (filtros de competência e alíquota ICMS):
  pendente, e a tela ainda lê `PrecoCmed`. Enquanto ela não entrar, a aba CMED do XLSX usa
  `PrecoCmed.pmvgSemImpostos`, `pmvg0` e `pmvg17`. Quando entrar, passa a usar a competência e a
  alíquota escolhidas.
- Branch `claude/youthful-wright-j2b31e`: associador Registro × CATMAT, com o parser de concentração
  `scripts/catmat_assoc/normaliza.doses()`. Reaproveite em A5 se já estiver na `main`.

---

## 3. Diagnóstico (rodar antes de codar; colar os resultados no PR)

O usuário testou **na Vercel e na instância interna**. Se as duas usam bancos diferentes, rode nos
dois.

### 3.1 Status "Cessar Atos"

```sql
SELECT status, count(*) FROM "Demanda" WHERE "deletedAt" IS NULL GROUP BY 1 ORDER BY 2 DESC;
SELECT status, length(status), count(*) FROM "Demanda" WHERE status ILIKE '%cessar%' GROUP BY 1, 2;
SELECT "statusRedmine", count(*) FROM sismat."RedmineSeiAtributos"
 WHERE "statusRedmine" ILIKE '%cessar%' GROUP BY 1;
```

Acrescente ao `scripts/import_redmine_base.py --dry-run` um **histograma da coluna `status` da
planilha**. Se "Cessar Atos" não estiver nem na planilha, a causa é a exportação do Redmine:
documente em `docs/ATUALIZACAO_DE_DADOS.md` que ela precisa sair com "Status: todos".

### 3.2 Medicamento, processo e SEI

`count(*)`, `count("principioAtivo")` e `count("numeroProcesso")` em `Demanda`. Na planilha do
Redmine, confirme `NUP_SEI Principal` e liste **todos** os cabeçalhos (apresentação, concentração,
quantidade, `due_date`).

### 3.3 Busca

`EXPLAIN (ANALYZE, BUFFERS)` da consulta atual com `%eltrombopag%`, logs da Vercel de
`/api/demandas`, e reprodução de "eltrombopague", "Eltrombopag", "410020" e de um nº CNJ.

### 3.4 Dashboard

Combobox com texto digitado e sem escolher opção; totais da lista, do Dashboard e do relatório para
o mesmo medicamento; CATMAT 410020 na aba Valores (os valores não mudam).

### 3.5 Bases de preço atuais

Distribuição por ano de `PrecoBps`, `PrecoSiasg` e `PrecoPncp`. Preenchimento de
`numeroControlePncp`. Idade dos registros dos 6 itens da DLOG (410020, 410019, 630389, 630391,
640532, 612063) em cada base.

### 3.6 Origem das bases BPS, SIASG e PNCP

Os carregadores **não estão no repositório**. Pergunte ao usuário a origem e liste as colunas de
identificação disponíveis (nº da compra, UASG, item, processo, ata, contrato, modalidade, critério,
situação).

### 3.7 API de Dados Abertos do Compras.gov.br (obrigatório antes de D0 e E)

1. Baixe o contrato `GET https://dadosabertos.compras.gov.br/v3/api-docs` e salve um **resumo**
   dos endpoints usados (caminho, parâmetros e DTO de resposta) em
   `docs/api/compras-dadosabertos.md`. Não commite o JSON inteiro. Anote a data da consulta.
2. Chame cada endpoint da tabela 7.1 com o CATMAT **410020**, a janela de 12 meses e
   `tamanhoPagina=10`, e registre no PR:
   - status HTTP;
   - `totalRegistros`;
   - as **chaves reais** de um item de `resultado`;
   - a latência.
   **Confirme ou corrija** cada campo marcado como "esperado".
3. Rode as chamadas **de três lugares**: a máquina do usuário, uma função na Vercel e o servidor
   interno. Se a Vercel falhar e as outras duas não, teste `preferredRegion = "gru1"` (São Paulo)
   na rota de coleta antes de concluir que há bloqueio.
4. Para o Item 1 da DLOG (410020): compare as compras devolvidas por `1_consultarMaterial` com as
   33 linhas da aba "Item 1" da planilha. As compras 90041/2026 (UASG 120195, item 122, R$ 130,00)
   e 90007/2026 (UASG 160166, item 55, R$ 76,73) precisam aparecer. A comparação mostra se
   `1_consultarMaterial` é a origem do "I - Compras.gov" da DLOG e como o nº da compra é montado.

---

## 4. Frente A — Demandas

### A1. Filtros com seleção múltipla, exclusão e agrupamento (obs. 1)

- **Módulo único de filtro**, usado por todas as rotas que filtram `Demanda`. Isso inclui a
  frente B:
  - `lib/demandas-filtro-tipos.ts` (**puro**): tipo `FiltroDemandas`
    `{ busca?, catmat?, campos: Partial<Record<CampoDemanda, { incluir: string[]; excluir: string[] }>>,
    dataEntradaDe?, dataEntradaAte?, criadoDe?, criadoAte? }`, mais `lerFiltroDemandas()` e
    `filtroParaQuery()`.
  - `lib/demandas-filtro.ts` (servidor): `whereDemandas()` e `sqlDemandas(f, alias?)`, com **a
    mesma semântica** e **sempre `deletedAt IS NULL`**. Inclui o filtro CATMAT
    (`whereDemandaPorCatmat`/`sqlDemandaPorCatmat` passam a aceitar alias).
- `CampoDemanda`: `status`, `prioridade`, `areaTematica`, `regiaoBrasil`, `trfRegiao`,
  `ufResidencia`, `objetoAcao`, `formaCumprimento`, `pontoControle`, `origemDemanda`,
  `responsavelId` e, depois de A5, `apresentacao`. Valor especial `__null__` = "(não informado)".
- **URL:** parâmetros repetidos, `?status=A&status=B&status_excluir=C`. O formato `?status=X`
  continua funcionando.
- `GET /api/demandas/opcoes`: valores distintos com contagem, com `jsonComVersao`. As listas fixas
  da página saem. Os grupos de P3 aparecem como atalhos.
- **Componente** `components/backoffice/filter-multi-select.tsx`: busca, tri-estado
  (incluir/excluir/neutro), "Selecionar todos", contagem por valor e chip-resumo. Só tokens.
- **Visões salvas (P4):** `GET/POST/DELETE /api/demandas/visoes` sobre `UserView`.

### A2. Exportação com os tópicos escolhidos (obs. 1)

- **Modal "Exportar":**
  - escopo: filtro ou **seleção**;
  - colunas: as visíveis, editáveis;
  - formato: CSV, XLSX ou HTML;
  - **agrupar por** status, grupo temático, região, TRF, medicamento ou apresentação, com
    subtotais.
- Rota `GET /api/demandas/export`, sobre `whereDemandas`, **sem teto silencioso de 10.000
  linhas**. Grava `AuditLog`. CSV no padrão de `lib/metrics-export.ts`.
- Corrigir **"Exportar seleção"** (`page.tsx:847-852`).

### A3. "Cessar Atos" (obs. 1)

Aja conforme o diagnóstico 3.1. Grafia: normalize no importador (trim e espaços), sem renomear
status. Com as opções dinâmicas (A1), a tela passa a mostrar o que existe. O esclarecimento vai
para a nota à DLOG.

### A4. Busca por nome e por código (obs. 2)

- **Na tela:** debounce de 400 ms e cancelamento da requisição anterior (TanStack Query com
  `signal` e `placeholderData: keepPreviousData`).
- **Código na "Buscar":**
  - CATMAT (`^\d{4,6}$`) ou registro ANVISA (`^\d{13}$`) que `resolverItem` reconhece: aplica o
    filtro de código, com a faixa "Interpretado como CATMAT …".
  - Nº CNJ: compara só os dígitos de `numeroProcesso`.
  - NUP (`SEI_PAT`): procura em `nupSei`.
- **`buscaNorm` + GIN `pg_trgm`** (P8): `normalizarTexto` de `numero`, `numeroProcesso`, `nupSei`,
  `titulo`, `principioAtivo`, `medicamento` e `descricao`. Criada por
  `scripts/alter_demanda_busca.py`; o importador e as rotas POST/PATCH mantêm a coluna.
- **Radical** (`radicalSubstancia`) para palavras com 6 letras ou mais: "eltrombopague" acha
  "Eltrombopag".
- **Erros:** mensagem amigável na tela e log no servidor.

### A5. Medicamento e apresentação na demanda (obs. 2)

- **Colunas em `Demanda`:** `medicamento`, `medicamentoOrigem` (`REDMINE | TITULO | DESCRICAO |
  SISMAT`), `apresentacoes Json?` e `catmatsDerivados String[]`.
- **`scripts/enriquecer_demandas.py --dry-run|--confirm`** (idempotente, depois de cada carga):
  - dicionário de substâncias com espelho TS/Python e autoteste;
  - **P5** e **P6**: o SISMAT entra pelo NUP, e o parser de concentração vem da 2.3;
  - relatório de cobertura.
- **Tela:**
  - coluna "Medicamento / Apresentação", com badge de origem;
  - filtro "Apresentação";
  - "Agrupar por apresentação", com o grupo "não identificada" sempre visível.
- **Filtro CATMAT:** dois grupos com contagem, "apresentação exata" e "mesma substância,
  apresentação não identificada".
- **Aceite:** 410020 × 410019 e 630389 × 630391 passam a devolver conjuntos diferentes quando há
  concentração no texto ou no SISMAT.

### A6. Processo judicial e SEI (obs. 3)

- **Importar `NUP_SEI Principal` → `Demanda.nupSei`**: formato canônico de `SEI_PAT`, coluna,
  índice e contagem no relatório de carga. Não é único.
- **Onde exibir:**
  - colunas "Nº Processo" e "Nº SEI" visíveis por padrão;
  - detalhe da demanda;
  - exportações;
  - **PDF da demanda** (hoje sem nenhum dos dois números);
  - Dashboard (B3).
- **Ações:** botão "copiar" nos dois números; links conforme P7.
- **Opcional:** "Entregas no SISMAT" no detalhe da demanda.

---

## 5. Frente B — Dashboard

### B1. Mesmo recorte em todo lugar

`/api/demandas`, `getMetricsData` (ORM, SQL bruto e SQL com alias `d.`),
`lib/metrics-ranking-anual.ts`, `/api/demandas/metrics/export`, `/api/demandas/autores/metrics` e
`/api/relatorios/generate` passam a usar `whereDemandas`/`sqlDemandas`.

### B2. Bugs

- CATMAT fora das consultas SIAFI (`lib/metrics.ts:184`).
- `deletedAt` fora das contagens.
- Aba Autores ignorando o filtro de medicamento.
- `jsonComVersao` da rota de métricas sem `"siafiPagamento"`.

### B3. O medicamento direto na tela

- **Campo "Medicamento"** de texto livre:
  - sugestões por **substância** canônica, com contagem;
  - aplica ao escolher, ao teclar Enter ou após 450 ms;
  - mesma semântica da lista.
- **"Resumo do recorte"** no topo, quando há filtro de medicamento ou CATMAT:
  - processos: total, ativos e encerrados;
  - valor pago;
  - primeira e última entrada;
  - status, com Cessar Atos explícito;
  - cinco principais UFs e TRFs;
  - apresentações.
- **"Processos do recorte"**: 20 por página, com Nº DJUD, Nº Processo, Nº SEI, medicamento,
  apresentação, status, UF, entrada e link; botão "Abrir na lista de Demandas" com os mesmos
  filtros.
- Status e Prioridade com o seletor múltiplo de A1.
- **Aceite:**
  - digitar "eltrombopag" mostra os dados na hora;
  - os totais são iguais na lista, na tela, no CSV e no HTML.

---

## 6. Frente C — Relatórios (obs. 4)

| Relatório | Dados disponíveis | Lacunas | Proposta |
|-----------|-------------------|---------|----------|
| **Panorama Executivo** | `getMetricsData` + ranking anual + SIAFI | Nenhuma relevante | Implementar já: `GET /api/relatorios/executivo?format=html\|csv`, com os filtros de A1 e os blocos de `lib/metrics-export.ts`. Grava `RelatorioGerado` (`EXECUTIVO`). |
| **Análise de Risco e Prazos** | Datas, status, prioridade; `statusAbastecimento` e `modalidadeTratamento` por NUP | `dataVencimento` não é importado; **não há histórico de status** | Envelhecimento por faixa, críticas, desabastecidas, tratamento contínuo e Cessar Atos. Declarar que o "tempo no status" é aproximado. |
| **Dimensionamento para ARP** | `SismatSaida.qtdEntregue` por `materialCodigo`, demandas por apresentação (A5) | Depende de A5 e A6 | Consumo histórico, projeção de 12 meses, quantidade sugerida e o botão "Levar para a cesta", que liga ao relatório da Frente E. |

Neste ciclo: implementar o **Panorama Executivo** e escrever `spec/relatorios-risco-arp.md` com os
outros dois. O card só sai de "Em breve" quando o relatório existir. As datas são do usuário (P14).

---

## 7. Frente D — Pesquisa de Preços

### 7.0 Base legal (confirmar o texto no DOU antes de imprimir)

IN SEGES/ME nº 65/2021, art. 5º: os cinco parâmetros podem ser combinados, e o §1º manda priorizar
os incisos I e II.

| Inciso | Parâmetro | Janela | Fonte no painel (rótulo no XLSX) |
|--------|-----------|--------|-----------------------------------|
| I | Sistemas oficiais (Painel de Preços, BPS), "observado o índice de atualização de preços" | Sem prazo expresso → 12 meses (P9) | **"I - Compras.gov.br"** (D0), "I - BPS", "I - SIASG (judicial)" |
| II | Contratações similares, concluídas ou em execução, até **1 ano**, inclusive SRP, observado o índice de atualização | 1 ano | **"II - PNCP"** (módulo 7), **"II - Ata de Registro de Preços"** (P17), preço informado do tipo II |
| III | Mídia especializada, tabela de referência, sítios eletrônicos, com data e hora de acesso | **6 meses** | "III - Mídia especializada" (P13) |
| IV | Pesquisa direta com no mínimo 3 fornecedores | **6 meses** | "IV - Cotação com fornecedor" (orçamento direto) |
| V | Base nacional de notas fiscais eletrônicas | **1 ano** | "V - Nota fiscal eletrônica" (P13) |

### 7.1 D0 — API de Dados Abertos do Compras.gov.br (revisão 2)

**Base:** `https://dadosabertos.compras.gov.br`. Acesso público, sem chave.

**Envelope das respostas:** `{ resultado: [...], totalRegistros, totalPaginas, paginasRestantes }`.
Paginação por `pagina` (a partir de 1) e `tamanhoPagina` (**entre 10 e 500**; fora disso, 400).
Datas no formato `YYYY-MM-DD`.

| Uso | Endpoint | Parâmetros | Campos de resposta |
|-----|----------|------------|--------------------|
| **Preços praticados (inciso I)**, a origem provável do "I - Compras.gov" da DLOG | `GET /modulo-pesquisa-preco/1_consultarMaterial` | **confirmado:** `tipo=codigoItemCatalogo` + `codigo=<CATMAT>` (**mudou em ago/2026**; antes era `codigoItemCatalogo`), `dataCompraInicio`, `dataCompraFim`, `estado` (UF), `codigoMunicipio`, `codigoUasg`, `pagina`, `tamanhoPagina` | **confirmado:** `precoUnitario`, `quantidade`, `dataCompra`, `niFornecedor`, `nomeFornecedor`, UASG compradora. **Esperado** (confirmar em 3.7): `idCompra`, `idItemCompra`, `numeroItemCompra`, `modalidade`, `criterioJulgamento`, `codigoItemCatalogo`, `descricaoItem`, unidade de fornecimento (`siglaUnidadeFornecimento`/`nomeUnidadeFornecimento`/`capacidadeUnidadeFornecimento`), `marca`, `codigoUasg`, `nomeUasg`, `codigoOrgao`/`nomeOrgao`, `esfera`, `estado`, `municipio`, `dataResultado` |
| Descrição detalhada do item comprado (**sem preço**) | `GET /modulo-pesquisa-preco/2_consultarMaterialDetalhe` | `codigoItemCatalogo`, `dataCompraInicio`, `dataCompraFim` | **confirmado** (7 campos e nenhum é valor): `idCompra`, `idItemCompra`, `numeroItemCompra`, `codigoItemCatalogo`, `objetoCompra`, `descricaoDetalhadaItem`, `dataAtualizacaoFato` |
| **Itens de contratações PNCP (inciso II)**, com nº de controle | `GET /modulo-contratacoes/2_consultarItensContratacoes_PNCP_14133` | **obrigatórios:** `dataInclusaoPncpInicial`, `dataInclusaoPncpFinal`. **Filtros:** `codItemCatalogo` (com esse nome), `materialOuServico=M`, `temResultado=true` (**só existe o valor `true`**), `situacaoCompraItem` (`2` = homologado, `4` = cancelado), `orgaoEntidadeCnpj`, `unidadeOrgaoCodigoUnidade`, `codFornecedor` | **confirmado:** `codItemCatalogo`, `idCompraItem`. **Esperado:** valor unitário estimado e homologado, fornecedor, quantidade, `numeroControlePNCPCompra`/`numeroControlePNCP` |
| Cabeçalho da contratação (modalidade, nº, processo, objeto, UASG) | `GET /modulo-contratacoes/1.1_consultarContratacoes_PNCP_14133_Id` | `tipo=numeroControlePNCPCompra`, `codigo=<nº de controle>` | **confirmado:** `numeroControlePNCP`, `objetoCompra` |
| Resultado por contratação | `GET /modulo-contratacoes/3.1_consultarResultadoItensContratacoes_PNCP_14133_Id` | `tipo=numeroControlePNCPCompra`, `codigo` | `niFornecedor` e valores homologados. **Não use a rota `3_…` sem `_Id` para pesquisar por CATMAT: ela não filtra por item.** |
| **Atas de registro de preços (P17)** | `GET /modulo-arp/2_consultarARPItem` | **obrigatórios:** `dataVigenciaInicialMin` e `dataVigenciaInicialMax` (**janela de até 365 dias**). **Filtros:** `codigoItem`, `tipoItem`, `niFornecedor`, `codigoUnidadeGerenciadora` | **confirmado:** `numeroItem`, `valorUnitario`, `niFornecedor`. **Esperado:** `numeroControlePncpAta`, nº da ata, UASG gerenciadora, vigência |
| Cabeçalho da ata | `GET /modulo-arp/1.1_consultarARP_Id` | `numeroControlePncpAta` | Cabeçalho da ata |

**Armadilhas conhecidas da API.** Vêm do histórico de um cliente público e precisam ser conferidas
no 3.7:

- A rota responde **404, e não 400, quando falta um parâmetro obrigatório ou a assinatura muda**.
  Foi o que aconteceu em ago/2026 com `1_consultarMaterial`. Um 404 **não** significa "item sem
  preço": trate como "contrato da API mudou", com mensagem própria e alerta.
- `codItemCatalogo` (módulo de contratações) × `codigoItemCatalogo` (pesquisa de preço) ×
  `codigoItem` (atas): três nomes para o mesmo código.
- `temResultado=false` devolve sempre vazio: itens sem vencedor vêm com `null`. Filtre no cliente
  quando precisar.
- A latência é alta e variável. Nenhuma chamada à API pode ficar no caminho de uma requisição que
  já faz outra coisa pesada.

**Modelo de dados** (schema `public`; DDL em `scripts/create_dadosabertos_tables.py`). O nome não
pode colidir com `sismat.ComprasGovPreco`, que é outra base:

- `DadosAbertosPreco`:
  - `id`;
  - `origem` (`PESQUISA_PRECO | PNCP_ITEM | ARP_ITEM`) e `chaveOrigem` (`idCompra`+`idItemCompra`
    / `idCompraItem` / ata+item), com `@@unique([origem, chaveOrigem])`;
  - `codigoCatmat`, `descricao`, `descricaoDetalhada`, `unidade`, `unidadeNorm`
    (`normalizarUnidade`), `quantidade`, `precoUnitario`, `valorUnitarioEstimado`;
  - `dataCompra`, `dataResultado`;
  - `idCompra`, `numeroCompra` (formato "90041/2026"), `numeroItemCompra`, `modalidade`,
    `criterioJulgamento`, `situacao`;
  - `codigoUasg`, `nomeUasg`, `orgao`, `cnpjOrgao`, `esfera`, `uf`, `municipio`;
  - `niFornecedor`, `nomeFornecedor`, `marca`;
  - `numeroControlePncp`, `numeroControlePncpAta`;
  - `bruto Json` (o item como veio, para auditoria) e `coletadoEm`.
  - Índices em `(codigoCatmat, origem, dataCompra)`.
- `DadosAbertosColeta`: `origem`, `codigoCatmat`, `dataInicio`, `dataFim`, `status`
  (`OK | PARCIAL | ERRO | CONTRATO_ALTERADO`), `paginas`, `registros`, `erro`, `iniciadoEm`,
  `concluidoEm`, `usuarioId`. Governa a validade (P19).
- O **nº da compra** no formato da DLOG ("90041/2026") sai de `idCompra`. Confirme a regra de
  montagem no 3.7, item 4. A hipótese a confirmar é UASG (6) + modalidade (2) + número (5) + ano
  (4). Se a regra não fechar, grave o `idCompra` cru e mostre-o assim.

**Coleta**, sem estourar o tempo de função da Vercel:

- `lib/dados-abertos/cliente.ts` (servidor):
  - `fetch` com timeout de 25 s e 2 novas tentativas com espera crescente (só para 5xx e timeout);
  - `User-Agent` identificando o painel;
  - 404 → `CONTRATO_ALTERADO`.
- `lib/dados-abertos/mapear.ts`: item da API → linha de `DadosAbertosPreco`. É o **único lugar**
  que conhece os nomes de campo da API.
- `POST /api/precos/dados-abertos/coletar` `{ codigo, origem, pagina }`:
  - busca **uma** página (`tamanhoPagina=500`), faz upsert e devolve
    `{ pagina, totalPaginas, gravados }`;
  - a tela chama página a página e mostra o progresso;
  - permissão `precos:pesquisar`, com `lib/rate-limit.ts`;
  - `preferredRegion` conforme o 3.7.
- **Validade (P19):** a pesquisa lê `DadosAbertosColeta` e, se a última coleta OK tem mais de 7
  dias ou não existe, mostra "Atualizar do Compras.gov.br".
- **Os relatórios (HTML e XLSX) não coletam:** usam o que está gravado e imprimem a data e hora da
  coleta.
- `scripts/coletar_dados_abertos.py --catmat 410020,410019 | --arquivo lista.txt --dry-run|--confirm`:
  carga em lote com o mesmo mapeamento, em espelho Python, com autoteste sobre um JSON de exemplo
  salvo no 3.7.
- `scripts/probe_dados_abertos.py`: chama cada endpoint da tabela com parâmetros conhecidos e
  confere os campos esperados. Sai com código ≠ 0 se o contrato mudou. Documente em
  `docs/ATUALIZACAO_DE_DADOS.md` que ele roda antes de cada ciclo de pesquisa.

**Uso na pesquisa** (`pesquisarPrecos`):

- Fonte nova `comprasgov` em `FonteCurada`/`NOME_FONTE_CURADA` ("Compras.gov.br — Painel de
  Preços").
  - `FONTE_SEM_CAMPO`: fornecedor ✅ (`nomeFornecedor`), fabricante e CNPJ do comprador conforme o
    3.7.
  - Unidade casada por `unidadeNorm`, UF por `uf`, janela de D1 sobre `dataCompra`.
  - IQR e curadoria como nas outras fontes.
  - Atualizar a tabela de cobertura do `CLAUDE.md`.
- **PNCP (P16):** havendo coleta `PNCP_ITEM` válida, a fonte `pncp` lê `DadosAbertosPreco` (itens
  homologados, `situacao = 2`). Sem coleta, cai em `PrecoPncp` e avisa "dados PNCP de base
  histórica".
- **Atas (P17):** fonte `atas` ("Ata de Registro de Preços", inciso II).
- **Duplicidade (P18):** deduplicar no conjunto único, com o motivo visível.
- **Tela:** painel "Compras.gov.br" com "coletado em dd/mm/aaaa hh:mm · n registros ·
  [Atualizar]" e progresso da coleta. Mensagem específica para `CONTRATO_ALTERADO`.
- **Fontes e cache:** `lib/data-version.ts` e `/fontes` passam a mostrar a última coleta por
  origem.

### 7.2 D1 — Período da pesquisa (obs. 5)

- **Módulo puro** `lib/pesquisa-preco-periodo.ts`: `PeriodoPesquisa { dataReferencia; mesesMercado:
  12 | 24 | 36 | null; justificativaAmpliacao }`, `JANELA_POR_INCISO` e `inicioJanela()`.
- **`pesquisarPrecos`:** aplica a janela a **todas** as fontes datadas (BPS, SIASG, Compras.gov.br,
  PNCP, atas) e devolve, por fonte, `periodo: { inicio, fim, foraDoPeriodo, maisRecenteFora }`.
- **Preços informados** fora da janela do inciso: alerta, e o preço sai do cálculo, salvo
  "considerar mesmo assim" com justificativa.
- **Ampliação:** exige justificativa de no mínimo 20 caracteres, impressa no relatório e gravada no
  `AuditLog`.
- **Tela:**
  - bloco "Parâmetros da apuração" (data de referência, período, IPCA), fora de "Mais filtros";
  - no `SourcePanel`: "12 meses (…) · n registros · fora do período: m (mais recente em …)".
- **Relatórios:** a janela e o inciso de cada fonte; observação automática quando uma fonte ficou
  vazia na janela (art. 5º, §1º).
- **Cesta:** `CestaItem.mesesMercado` e `justificativaPeriodo`. A data de referência é a data de
  emissão.

### 7.3 D2 — IPCA (obs. 6)

- **Tabela `IndiceIpca`:** `competencia Date @id`, `numeroIndice` (dez/1993 = 100),
  `variacaoMensal`, `fonte` e `importadoEm`.
- **Script `scripts/import_ipca.py --dry-run|--confirm`:**
  - fonte IBGE/SIDRA, tabela 1737 (variável 2266 = número-índice; 63 = variação mensal; **confirme
    os ids**);
  - aceita também `--file` com o arquivo baixado à mão;
  - autoteste: o produto de `(1 + v/100)` bate com a razão dos números-índices (tolerância de
    0,1%).
- **Cálculo:** `lib/ipca.ts` + `fatorIpca()` puro, com a regra de P10. Mês sem índice → fator 1,
  com sinalização.
- **`RegistroMercado`:** ganha `precoNominal`, `fatorIpca` e `mesIndice`. Com o IPCA ligado,
  estatística, IQR, curadoria e consolidados usam o preço corrigido.
- **Tela:** chave "Atualizar pelo IPCA até <mês/ano>", e cada registro mostra nominal × fator =
  corrigido.
- **Relatórios:** seção "Atualização monetária" no HTML; aba "Índices IPCA" e colunas V–X no XLSX
  (8.2).

### 7.4 D3 — Identificação da contratação (obs. 7)

- **`RegistroMercado.contratacao`:**
  - campos: `tipo`, `numero`, `uasg`, `nomeUasg`, `numeroItem`, `processo`,
    `criterioJulgamento`, `situacao`, `numeroControlePncp`, `numeroControlePncpAta` e `url`;
  - `indisponivel: string | null` com o motivo quando não há o dado.
- **Fontes:**
  - **Compras.gov.br, PNCP e atas:** preenchidos pela API (D0).
  - **BPS e SIASG:** só o que existir na origem (3.6), com colunas anuláveis nas tabelas. O que
    faltar sai como "não disponível na base <X>".
- **Tela e relatórios:**
  - linha "Contratação: Pregão 90041/2026 · UASG 120195 · item 122 · [PNCP ↗]" no `SourcePanel` e
    na curadoria (`curadoria-dialog.tsx:130`);
  - coluna "Contratação de referência" no HTML;
  - colunas C, G, H, I, R e S do XLSX (8.2).

### 7.5 D4 — Link para o PNCP (obs. 8)

- Função pura `urlPncp(numeroControle)` em `lib/pncp.ts`. Formatos do Manual de Integração do
  PNCP:
  - contratação: `CNPJ-1-SEQUENCIAL/ANO`;
  - ata: `CNPJ-1-SEQUENCIAL/ANO-SEQATA`;
  - o CNPJ pode ser alfanumérico (`[0-9A-Z]{12}\d{2}`).
- Página da contratação: `https://pncp.gov.br/app/editais/{cnpj}/{ano}/{sequencial sem zeros}`.
  Rota relatada por terceiros: **abra 5 registros reais antes de mergear.** Para ata, só use uma
  rota conferida; se não houver, use o link da contratação-mãe.
- O link aparece na tela, no HTML e na coluna **T ("Referência")** do XLSX, como hiperlink.

---

## 8. Frente E — Relatório de Pesquisa de Preços no modelo da DLOG (XLSX)

**Objetivo:** o analista da DLOG clica em "Mapa comparativo (XLSX)" e recebe um arquivo que
**substitui a planilha que monta hoje à mão**:

- mesmas abas, na mesma ordem;
- mesmos títulos, cabeçalhos e colunas A–X;
- mesmos blocos (dados do medicamento, resumo estatístico, preço adotado, base de preços);
- mesma aparência;
- preenchido a partir da pesquisa do painel, com fórmulas que fecham com o painel e sem os erros
  da seção 8.5.

### 8.1 Layout da planilha original (referência)

| Aba | Conteúdo e formatação |
|-----|-----------------------|
| `Consolidação` | Painel congelado em `A6`. A1:H1 "CONSOLIDAÇÃO DE PESQUISA DE PREÇOS DE MEDICAMENTOS" (negrito 18, `#2E75B6`). A2:H2 "Relatório Executivo para Instrução Processual" (12, `#666666`). Linha 3: faixa `#2E75B6`, altura 3,75. Linha 5: cabeçalho branco negrito sobre `#1F4E79`, quebra de texto: Item \| Medicamento \| CATMAT \| Quantidade \| Preço Adotado (R$) \| Método Estatístico \| Valor Total (R$) \| Status. Linhas 6+ zebradas `#D6E3F8`/branco, fonte 10, borda fina. Total: A:F mesclado "TOTAL GERAL" à direita e G:H mesclado `=SUM(G6:G…)`, branco sobre `#1F4E79`. Nota em A:H mesclado (8, `#666666`). Larguras A 16,9 · B 103,7 · C 8,9 · D 14,9 · E 20 · F 19 · G 17,9 · H 9,4. |
| `MEMÓRIA DE CÁLCULO` | Painel congelado em `A6`. A1:K1 "MEMÓRIA DE CÁLCULO - PESQUISA DE PREÇOS" (negrito 18, `#1F4E79`). A2:K2 "Detalhamento Estatístico e Justificativa Técnica para Adoção de Preços" (`#2E75B6`). Linha 3: faixa `#1F4E79`. Linha 5: cabeçalho Item \| Medicamento \| CATMAT \| Nº Preços \| Menor Valor \| Maior Valor \| Média \| Mediana \| Coef. Variação \| Método Escolhido \| Preço Adotado. Linhas zebradas, fonte 9. Bloco "JUSTIFICATIVA TÉCNICA" (A:K mesclado) e o texto em A:K mesclado com altura grande. CV em `0.00%`. |
| `Item 1` … `Item N` | A1:F1 "DADOS DO MEDICAMENTO" (branco negrito 12 sobre `#1F4E79`). A2 "Medicamento:" e B2:F2. A3 "CATMAT:", B3 código, C3 descrição, D3 unidade, E3 "Quantidade:", F3 (`#,##0`). Rótulos em negrito 10 sobre `#D6E3F8`. A5:F5 "RESUMO ESTATÍSTICO": A6 Menor/B6, D6 Desvio Padrão/E6 (`#,##0.0000`), A7 Maior/B7, D7 Coef. Variação/E7 (`0.00%`), A8 Média/B8, D8 Nº Amostras/E8, A9 Mediana/B9. A11:F11 "PREÇO ADOTADO" (branco sobre **verde `#548235`**). Linhas 12–14 sobre `#C6EFCE`: A12 Preço Unitário/B12, A13 Valor Total Estimado/B13, A14 Justificativa/B14:F14 (quebra de texto). A16:X16 "BASE DE PREÇOS COLETADOS". **Linha 17, 24 cabeçalhos** (fonte 8, negrito, centralizados, quebra de texto, altura 68,25): Número do Item da Pesquisa \| Fonte da Pesquisa \| Número da Compra \| Data/Hora da Compra \| Data/Hora da Cotação \| Anulada/Revogada \| Número do Item da Compra \| Modalidade \| Critério Julgamento Item \| Código do Item \| Descrição do Item \| Unidade de Fornecimento \| Quantidade Ofertada \| Preço Unitário \| Identificação do Fornecedor \| Nome do Fornecedor / Identificação da Fonte \| Órgão \| UASG \| Nome UASG \| Referência \| Compõe a base de dados final \| Mês e Ano \| Índice de correção acumulado IPCA \| Preço unitário corrigido pelo IPCA. Dados a partir da linha 18, fonte 8, centralizados, com quebra de texto. |
| `Índices IPCA` | Aba com cor `#D8E8F6`. A1:C1 "TABELA DE ÍNDICES IPCA - CORREÇÃO MONETÁRIA" (negrito 16, `#1F4E79`). A2:C2 "Fonte: IBGE - Instituto Brasileiro de Geografia e Estatística". E1:F1 "◀ Voltar ao Dashboard". Linha 5: Mês/Ano \| IPCA Mensal (%) \| IPCA Acumulado (%). |
| `CMED` | A1 "Secretaria Executiva - CMED" (negrito 16). A2 "LISTA DE PREÇOS DE MEDICAMENTOS - PREÇOS FÁBRICA E MÁXIMOS DE VENDA AO GOVERNO". A3 "Publicada em 11/08/2026 19h30min.". Por item: "ITEM n" (A:B mesclado, negrito 14) e cabeçalho (altura 63,75, quebra de texto): SUBSTÂNCIA \| CNPJ \| LABORATÓRIO \| REGISTRO \| EAN 1 \| PRODUTO \| APRESENTAÇÃO \| CLASSE TERAPÊUTICA \| TIPO DE PRODUTO (STATUS DO PRODUTO) \| REGIME DE PREÇO \| PMVG Sem Impostos \| PMVG 0 % \| PMVG 17 %. Coluna N sem cabeçalho, com `=M/14` digitado. |

Itens da planilha, que são os **casos de teste** daqui para frente:

| Item | CATMAT | Medicamento | Unid. | Qtd. | Fontes na DLOG | Método e preço da DLOG |
|------|--------|-------------|-------|------|----------------|------------------------|
| 1 | 410020 | Eltrombopague olamina 50 mg | comprimido | 15.450 | 33 Compras.gov | Média R$ 191,95 (teto R$ 292,43) |
| 2 | 410019 | Eltrombopague olamina 25 mg | comprimido | 5.892 | 32 Compras.gov | Mediana R$ 99,53 (teto R$ 146,20) |
| 3 | 630389 | Momelotinibe 100 mg | comprimido | 5.760 | 2 Compras.gov, 1 PNCP, 9 mídia | Teto CMED R$ 441,13 |
| 4 | 630391 | Momelotinibe 200 mg | comprimido | 1.800 | 6 Compras.gov, 5 PNCP (1 "não compõe") | Mediana R$ 745,51 (teto R$ 882,27) |
| 5 | 640532 | Eplontersena 56,25 mg/mL (caneta 0,8 mL) | tubete | 48 | 2 notas fiscais | Teto CMED R$ 184.824,10 |
| 6 | 612063 | Tremelimumabe 20 mg/mL | frasco | 48 | 4 Compras.gov, 4 mídia | Teto CMED R$ 115.322,41 |

### 8.2 Especificação do arquivo gerado

Regra geral: **as abas, a ordem, os títulos, os cabeçalhos A–X e a posição dos blocos são os da
DLOG.** O que o painel acrescenta fica **à direita ou abaixo**, sem deslocar nada. Nome do arquivo:
`Mapa_comparativo_de_Precos_<NUP só dígitos, se informado>_<aaaa-mm-dd>.xlsx`.

**Aba `Consolidação`**

- Layout de 8.1. A4:H4 (novo, fonte 9, `#666666`): "Processo SEI: <processo> · Data de
  referência: dd/mm/aaaa · Gerado pelo Painel DJUD em dd/mm/aaaa hh:mm por <usuário>".
- **Uma linha por item, com referência às abas** (como a DLOG faz, mas **sem** os erros
  `'Item 5 '!B2:F2`):
  - B `='Item n'!B2`, C `='Item n'!B3`, D `='Item n'!F3`, E `='Item n'!B12`;
  - F `='Item n'!F12` (o método do item);
  - G `=D*E`;
  - H status: "Concluída" (há preço); "Menos de 3 preços — justificar" (n < 3); "Sem preço"; ou
    "Decisão pendente" (P11/P12 ainda não escolhidos para o item).
- Total `=SUM(G6:G<última>)`.
- Nota de rodapé **gerada a partir do que foi usado de fato**. Exemplo: "Valores calculados
  conforme IN SEGES/ME nº 65/2021. Métodos: mediana (2 itens), teto CMED (3 itens), critério DLOG
  (1 item)." Nada de "Método: Mediana" fixo.

**Aba `MEMÓRIA DE CÁLCULO`**

- Uma linha por item, com referências **à aba do próprio item**: D `=E8`, E `=B6`, F `=B7`,
  G `=B8`, H `=B9`, I `=E7`, J `=F12`, K `=B12` (todas prefixadas com `'Item n'!`).
- Abaixo da tabela, "JUSTIFICATIVA TÉCNICA" com o texto gerado (8.4) sobre as regras realmente
  aplicadas:
  - critério;
  - teto e alíquota;
  - período e incisos;
  - IPCA (mês-base e convenção);
  - IQR;
  - quantidade de exclusões justificadas;
  - duplicidades.

**Aba `Item n`**: uma por item, nome exato `Item 1`, `Item 2`… (sem espaço no fim).

- **Linhas 1–3:**
  - B2 = substância + concentração;
  - B3 = CATMAT (número);
  - C3 = descrição CATMAT do catálogo;
  - D3 = unidade de fornecimento;
  - F3 = quantidade (da cesta, ou informada no modal da pesquisa avulsa, padrão 1).
- **Linhas 5–9 (resumo estatístico):** calculado sobre a **coluna auxiliar AA** ("Preço
  considerado", `=IF(U18="Sim",X18,"")`).
  - B6 `=MIN(AA18:AA<fim>)`, B7 `=MAX(…)`, B8 `=AVERAGE(…)`, B9 `=MEDIAN(…)`;
  - E6 `=STDEV(…)`, E7 `=IF(B8>0,E6/B8,"")`, E8 `=COUNT(…)`.
  - Assim os registros "Compõe = Não" saem da conta **sempre**, e as fórmulas funcionam em
    qualquer Excel ou LibreOffice, sem fórmula matricial.
- **Linhas 11–14 (preço adotado):**
  - A12 "Preço Unitário:" e B12 com a fórmula do método do item:
    - critério DLOG `=MIN(B8,B9)`; média `=B8`; mediana `=B9`; menor `=B6`;
    - mediana das medianas `=<célula do bloco por fonte>`;
    - com teto aplicado, tudo dentro de `MIN(…; D12)`.
  - **C12 "Teto CMED (unid.):"** e **D12** com referência à aba `CMED` (o teto escolhido em P12).
  - **E12 "Método:"** e **F12** com o nome do método.
  - B13 `=F3*B12`.
  - B14:F14 com a justificativa (8.4), editável antes da emissão.
- **Bloco novo H5:M12, "CONSOLIDADO POR FONTE (método do painel)":** Fonte \| Inciso \| Nº \| Média
  \| Mediana \| Menor, uma linha por fonte com dado. A linha final "Mediana das medianas" usa
  `=MEDIAN(<medianas>)`. Cada fonte é calculada sobre a **sua** coluna auxiliar (AB, AC, … =
  `IF(AND(U18="Sim",B18="<rótulo>"),X18,"")`).
- **Linhas 16–17:** título e os **24 cabeçalhos da DLOG, com o texto idêntico**. À direita, colunas
  do painel com cabeçalho cinza: **Y** "Motivo (quando não compõe)", **Z** "Identificador do
  registro no painel", **AA** "Preço considerado (auxiliar)", **AB…** "Auxiliar — <fonte>". As
  colunas auxiliares ficam agrupadas e recolhidas (outline).
- **Linhas 18+:** um registro por linha, ordenados por inciso e depois por data, da mais recente
  para a mais antiga.

| Col. | Conteúdo |
|------|----------|
| A | Número do item na pesquisa (n) |
| B | Rótulo da fonte (tabela 7.0) |
| C | Nº da compra (D0/D3) ou "não disponível na base" |
| D | Data da compra (`dd/mm/aaaa`) |
| E | Data e hora da coleta ou consulta da base (`dd/mm/aaaa hh:mm`); no tipo III, a data e hora de acesso |
| F | Anulada/Revogada: Sim, Não ou "não informado" |
| G | Nº do item na compra |
| H | Modalidade |
| I | Critério de julgamento |
| J | Código CATMAT |
| K | Descrição do item como comprado |
| L | Unidade de fornecimento |
| M | Quantidade |
| N | Preço unitário **nominal** (`R$ #,##0.00##`) |
| O | CNPJ do fornecedor |
| P | Nome do fornecedor ou identificação da fonte |
| Q | Órgão |
| R | UASG |
| S | Nome da UASG |
| T | **Referência**: hiperlink do PNCP (D4), URL da mídia, nº e chave da nota fiscal, documento do orçamento |
| U | "Sim" ou "Não" |
| V | Mês de referência do preço, como **data** (1º dia do mês, formato `mmm/aaaa`). **Nunca texto** |
| W | `=IFERROR(INDEX('Índices IPCA'!$D:$D,MATCH(V18,'Índices IPCA'!$A:$A,0))-1,0)` com IPCA ligado, `0` com IPCA desligado (`0.00%`) |
| X | `=N18*(1+W18)` |
| Y | Motivo da exclusão: "exclusão justificada: <motivo>", "fora do IQR", "fora do período", "duplicado de <fonte>", "somente registro" |

- Registros que **não compõem** continuam listados, com U = "Não" e o motivo em Y. A rastreabilidade
  é do descarte.
- A amostra é a **lista completa** usada no cálculo, e não os 20 que a tela mostra.

**Aba `Índices IPCA`**

- Título e fonte como na DLOG. A2:C2 cita a fonte (IBGE/SIDRA), o mês-base e a convenção de P10.
- Hiperlink interno "◀ Voltar à Consolidação" em E1:F1.
- **Colunas:** A Mês/Ano (**data**, `mmm/aaaa`) \| B IPCA Mensal (%) \| C Número-índice \| D Fator
  até o mês-base (`=C$<base>/C<n>`) \| E IPCA acumulado até o mês-base (%) (`=D<n>-1`).
- Linhas do mês mais antigo usado nas abas de item até o mês-base. Valores vindos de `IndiceIpca`,
  **nunca digitados nem somados**.
- Com o IPCA desligado, a aba existe com a nota "Atualização monetária não aplicada nesta pesquisa".

**Aba `CMED`**

- Cabeçalho como na DLOG. A3 = "Publicada em <`CmedCompetencia.dataPublicacao`>" quando a seção 7
  do prompt CMED estiver ativa; senão, "Lista CMED vigente no painel (carga de dd/mm/aaaa)".
- Por item, o bloco "ITEM n" com as 13 colunas da DLOG mais:
  - **N** "Unidades por embalagem (Qt_Embal)";
  - **O** "PMVG <alíquota> por unidade" (`=M/N`);
  - **P** "Marcação" ("menor teto", "medicamento de referência", "desconsiderado: <motivo>").
- **Preços como número** (`R$ #,##0.00`), nunca texto.
- A alíquota da coluna M é a escolhida (P12; padrão 17% via `PrecoCmed.pmvg17`).

**Aba `Parâmetros`** (nova, por último; não altera o modelo)

- Data de referência; período por fonte e justificativa de ampliação.
- IPCA: ligado ou desligado, mês-base, convenção.
- Método e teto por item; alíquota; UF; filtros opcionais.
- Fontes consultadas, com data e hora (inclui as coletas da API e o status de cada uma).
- Versão dos dados (`getDataVersion`); responsável; processo SEI; data e hora da geração.
- **SHA-256 do arquivo**, também gravado no `AuditLog`.

**Formatos e estilos**

- Paleta da DLOG: `#1F4E79`, `#2E75B6`, `#D6E3F8`, `#548235`, `#C6EFCE`, `#666666`, `#D8E8F6`.
- Fontes, alturas, larguras, mesclagens e painéis congelados de 8.1, centralizados em
  `lib/mapa-dlog/layout.ts`.
- Datas em `dd/mm/aaaa` explícito. A DLOG usa `mm-dd-yy`, que depende do idioma do sistema.
- Moeda `_-"R$" * #,##0.00_-;-"R$" * #,##0.00_-;_-"R$" * "-"??_-;_-@_-`; preço unitário com até 4
  casas (`#,##0.00##`).
- **Toda fórmula é gravada com o resultado já calculado** (`{ formula, result }` no `exceljs`),
  para o arquivo abrir com os números certos mesmo em visualizador que não recalcula (e-mail,
  celular, SEI).

### 8.3 Mapeamento coluna DLOG → origem no painel

| Coluna DLOG | Compras.gov.br (D0) | PNCP (módulo 7) | Ata (ARP) | BPS / SIASG | Preço informado | CMED |
|-------------|---------------------|-----------------|-----------|-------------|-----------------|------|
| Nº da Compra | de `idCompra` | do cabeçalho `1.1_…_Id` | nº da ata | só se a origem tiver (3.6) | documento | — |
| Data/Hora da Compra | `dataCompra` | data do resultado ou homologação | início da vigência | `data` | data da proposta, emissão da NF ou acesso | — |
| Anulada/Revogada | situação, se houver | `situacaoCompraItem` | situação da ata | não informado | — | — |
| Nº do Item da Compra | `numeroItemCompra` | nº do item | `numeroItem` | só se a origem tiver | — | — |
| Modalidade / Critério | `modalidade` / `criterioJulgamento` | cabeçalho | "SRP" | `modalidade` | tipo (III, IV ou V) | — |
| Descrição / Unidade / Quantidade / Preço | `descricaoItem` (+ detalhe `2_…`) / unidade / `quantidade` / `precoUnitario` | idem / valor homologado | idem / `valorUnitario` | campos atuais | campos do formulário | `PrecoCmed` |
| Fornecedor (CNPJ e nome) | `niFornecedor` / `nomeFornecedor` | idem | `niFornecedor` | `cnpjFornecedor` / `fornecedor` | CNPJ e fornecedor | laboratório |
| Órgão / UASG / Nome UASG | `nomeOrgao` / `codigoUasg` / `nomeUasg` | idem | gerenciadora | `orgao` / instituição | — | — |
| Referência | link PNCP, quando houver nº de controle | **link PNCP** | link da ata, quando a rota estiver conferida | — | URL ou NF | — |

### 8.4 Justificativa automática e diferenças de método

- **`lib/mapa-dlog/justificativa.ts`** (puro) gera o texto no padrão da DLOG a partir dos números,
  do método e do teto. Ele vai para a tela, o HTML e o XLSX (B14 e "JUSTIFICATIVA TÉCNICA").
  Exemplos:
  - Critério DLOG, abaixo do teto: "O menor valor apurado na pesquisa foi a mediana (R$ 99,53).
    Como R$ 99,53 não ultrapassa o teto CMED (R$ 146,20/unidade, PMVG 17% do medicamento de
    referência), adota-se a mediana."
  - Teto aplicado: "O valor apurado (R$ 136.355,24) excede o teto CMED (R$ 115.322,41); adota-se o
    teto regulatório."
  - Acrescente: "n preços de m fontes, período dd/mm/aaaa–dd/mm/aaaa, corrigidos pelo IPCA até
    mmm/aaaa", e "Menos de 3 preços: justificar nos autos" quando for o caso.
- O usuário **pode editar** o texto antes de emitir. O texto editado é gravado em
  `CestaItem.justificativa` (nova coluna; DDL Python) ou vai no corpo da requisição na pesquisa
  avulsa. O `AuditLog` registra se houve edição.
- **Diferenças de método (P11/P12), escolha por item, com padrão:**
  1. Conjunto único (DLOG) × mediana das medianas por fonte (painel). O XLSX mostra os dois (o
     bloco H5:M12 é o do painel).
  2. Menor valor entre média e mediana (DLOG) × mediana (painel).
  3. Teto: PMVG 17% do medicamento de referência (DLOG) × menor PMVG sem impostos (painel).
  4. Outliers: escolha manual sem motivo (DLOG) × IQR mais exclusão justificada (painel). **Fica a
     regra do painel.**

### 8.5 Erros da planilha atual (motivam a automação; não reproduzir)

1. IPCA acumulado por **soma** das taxas mensais, em vez de composição.
2. Intervalos de soma desalinhados linha a linha (`B9:B37`, `B10:B36`, `B11:B39`…), o que gera um
   acumulado não monotônico (jun/2025 = 1,80; jul/2025 = 4,39).
3. Jun e jul/2026 com IPCA = 0, embora publicados na data da cotação (11/08/2026). Ago/2026 aparece
   como 0 em vez de "sem índice".
4. `VLOOKUP` por "mês ano" em **texto** (`TEXT(D18,"mmmm")`), que depende do idioma: **no arquivo
   recebido, todas as colunas W e X e todos os resumos estatísticos estão em `#N/A`.**
5. `MEMÓRIA DE CÁLCULO!G8` (média do Item 3) aponta para `'Item 4'!B8`.
6. `COUNT(X18:Y29)` inclui a coluna Y; há intervalos até a linha 59 em abas de 28 linhas.
7. Itens 5 e 6: estatística sobre células escolhidas à mão (`AVERAGE(X18,X19,X20,X26)`, sendo X26
   vazia) enquanto `MIN` e `MAX` usam o intervalo todo; descarte sem motivo.
8. "Compõe a base de dados final = Não" (Item 4, linha 25) **não é respeitado** pelas fórmulas.
9. Preços adotados digitados à mão (`MEMÓRIA!K6`, `K8`, `K9`; `'Item 4'!B12`).
10. A nota da `Consolidação` diz "Método: Mediana", mas os itens usam Média e Teto CMED.
11. Referências a intervalo numa célula (`='Item 5 '!B2:F2`) e nome de aba com espaço no fim
    (`"Item 5 "`).
12. Na aba `CMED`, preços gravados como **texto** ("3034,00") misturados com números, e o divisor
    da unidade digitado (`=M8/14`).
13. Erros de digitação nos dados: quantidade 651.409 igual ao nº da UASG; compra "26/02026"; datas
    em `mm-dd-yy`.

### 8.6 Implementação

- **Dependência:** `exceljs` (P20), importado **só** em código de servidor. Se o build reclamar,
  coloque-o em `serverExternalPackages`. Confira a doc do Next desta versão.
- **Módulos:**
  - `lib/mapa-dlog/layout.ts`: nomes de abas, os 24 cabeçalhos com o texto exato, larguras,
    alturas, formatos e paleta. É a fonte única.
  - `lib/mapa-dlog/dados.ts` (puro): `ResultadoPesquisa` + metadados do item → `MapaItem` (linhas
    A–Y, estatística, método, teto, justificativa, linhas CMED). É testável sem `exceljs`.
  - `lib/mapa-dlog/justificativa.ts` (puro).
  - `lib/mapa-dlog/gerar.ts` (servidor): `MapaItem[]` + parâmetros → `Buffer` com `exceljs`.
  - Extrair `processarItens` de `app/api/relatorios/cesta/route.ts` para `lib/` e usá-lo no HTML e
    no XLSX: **uma apuração só por emissão.**
- **Rotas:**
  - `POST /api/relatorios/pesquisa-preco/xlsx` (avulsa: mesmo corpo da rota HTML + `quantidade`);
  - `POST /api/relatorios/cesta/xlsx` (mesmo corpo do relatório da cesta).
  - Ambas exigem `relatorios:gerar` e gravam `RelatorioGerado` (`tipo: "PESQUISA_PRECO"`,
    `parametros.formato: "xlsx"`) e `AuditLog` com o SHA-256.
  - `Content-Disposition: attachment`.
- **Tela:**
  - botão **"Mapa comparativo (XLSX)"** ao lado do relatório HTML, na pesquisa avulsa e na modal
    da cesta;
  - na pesquisa avulsa, campo "Quantidade";
  - por item: método, regra do teto e justificativa (pré-preenchida, editável);
  - aviso quando a coleta da API está vencida, oferecendo "Atualizar antes de gerar".
- **Desempenho:** cesta com até 30 itens e concorrência 4, como o HTML. Gerar em memória e
  responder com o buffer.

### 8.7 Conferência automatizada do XLSX

`scripts/conferir_mapa_dlog.py --gerado <arquivo.xlsx> [--modelo "<planilha da DLOG>.xlsx"] [--painel resultado.json]`
(openpyxl, rodado pelo usuário):

1. **Estrutura:**
   - abas, na ordem;
   - textos dos títulos;
   - os **24 cabeçalhos da linha 17 iguais aos do modelo**;
   - mesclagens dos blocos;
   - painéis congelados.
2. **Fórmulas:**
   - nenhuma aponta para aba inexistente ou para **outra** aba de item;
   - nenhum `#N/A`, `#REF!` ou `#VALUE!` nos resultados gravados;
   - nenhuma referência a intervalo em célula única.
3. **Números:**
   - recalcula em Python MIN, MAX, AVERAGE, MEDIAN, STDEV (n−1), COUNT e a mediana das medianas
     sobre as linhas com U = "Sim";
   - confere com o resultado gravado de cada fórmula;
   - com `--painel`, confere com o JSON do `ResultadoPesquisa` (tolerância de R$ 0,01).
4. **Regras:**
   - toda linha com U = "Não" tem motivo em Y e AA vazio;
   - V é data;
   - preços da aba CMED são números.

Inclua no PR a saída do script para a cesta com os 6 itens da DLOG e um print do arquivo aberto no
Excel e no LibreOffice.

---

## 9. Verificação (antes de qualquer push)

- `npm run lint`, `npx tsc --noEmit`, `npm run build` e `npm run tokens:check`, mais os autotestes
  Python: `precos_norm.py`, `cmed_layout.py`, o dicionário de substâncias, `import_ipca.py` e
  `coletar_dados_abertos.py`.
- Diagnóstico (seção 3) no PR. `probe_dados_abertos.py` verde.
- **E:**
  - cesta com os 6 itens da DLOG gera o XLSX;
  - `conferir_mapa_dlog.py` sem erro;
  - o arquivo abre no Excel e no LibreOffice sem aviso de reparo;
  - preço adotado e total geral batem com o relatório HTML da mesma cesta;
  - um registro excluído com justificativa na curadoria aparece com U = "Não", o motivo em Y, e
    fica fora de todas as fórmulas.
- **D0:**
  - 410020 coletado em páginas sem estourar o tempo de função;
  - as compras 90041/2026 e 90007/2026 aparecem com UASG, item e preço;
  - um 404 simulado mostra "contrato da API alterado", e não "sem preços";
  - os relatórios não disparam coleta.
- **D1–D4:**
  - janela de 12 meses aplicada;
  - ampliar sem justificativa é bloqueado;
  - IPCA confere com o produto das variações (0,1%);
  - os links PNCP abrem a contratação certa nos 5 registros conferidos.
- **A:**
  - incluir e excluir no mesmo campo funciona;
  - `?status=X` antigo funciona;
  - "Exportar seleção" exporta só os marcados;
  - a busca acha "eltrombopague" e "410020";
  - 410020 × 410019 diferem;
  - o Nº SEI aparece na lista, no detalhe, no PDF e no export.
- **B:**
  - mesmo filtro → mesmo total na lista, no Dashboard, no CSV e no HTML;
  - o CATMAT muda a aba Valores;
  - a lixeira fica fora das contagens.
- **C:** o Panorama Executivo bate com o Dashboard.

---

## 10. Ordem de execução sugerida (um PR por linha)

1. **Diagnóstico** (3.1–3.7), em `docs/diagnostico-dlog-2026-10.md`, mais
   `docs/api/compras-dadosabertos.md`.
2. **E1: XLSX no modelo da DLOG com os dados atuais:**
   - BPS, SIASG, PNCP (`PrecoPncp`), CMED e orçamentos;
   - colunas sem dado = "não disponível na base";
   - IPCA desligado, com a aba `Índices IPCA` só com a nota;
   - critério e teto escolhíveis por item;
   - `conferir_mapa_dlog.py`.
   **É a entrega que a DLOG pode começar a usar.**
3. **D0 + D3 + D4:** tabelas, coleta e probe da API; fonte Compras.gov.br; PNCP com nº de controle;
   atas; identificação da contratação; links. O XLSX ganha as colunas C, F, G, H, I, R, S e T.
4. **D1 + D2:** período e IPCA. O XLSX ganha V–X reais e a aba `Índices IPCA`.
5. **E2:** justificativa editável e gravada; aba `Parâmetros`; dois tetos com a alíquota da seção 7
   do prompt CMED, se já estiver na `main`; duplicidades (P18).
6. **A1–A4** (filtro único, seleção múltipla, export e busca) e, em paralelo, **B**.
7. **A6 + A5** (SEI, medicamento e apresentação).
8. **C** (Panorama Executivo e spec de Risco e ARP).

Os passos 3, 4 e 7 pedem scripts rodados localmente pelo usuário (`--dry-run`, revisar,
`--confirm`). Pare e peça, com os comandos prontos.

## 11. Não fazer

- Não commitar a planilha da DLOG, bases do Redmine, dumps nem o JSON inteiro do `/v3/api-docs`.
- Não reproduzir no XLSX nenhum item da seção 8.5. Em especial: **nada de `VLOOKUP` por mês em
  texto, nada de IPCA somado, nada de valor adotado digitado.**
- Não recalcular preço no gerador do XLSX: ele lê o `ResultadoPesquisa`.
- Não chamar a API do Compras.gov.br dentro da emissão de relatório nem em requisição sem
  paginação; não tratar 404 da API como "sem preço".
- Não inventar nº de compra, UASG ou link; não renomear status; não gravar medicamento fora do
  dicionário.
- Não corrigir o teto CMED pelo IPCA nem aplicar IPCA "para trás"; não ampliar o período
  automaticamente.
- Não mudar o método adotado padrão nem a regra do teto sem a decisão de P11 e P12.
- Não duplicar a seção 7 do prompt CMED mensal. Não colocar Prisma nem `exceljs` em módulo
  importado por página client.

## 12. Entregáveis

### 12.1 Código e documentação

- **E:**
  - `lib/mapa-dlog/{layout,dados,justificativa,gerar}.ts`;
  - rotas `.../pesquisa-preco/xlsx` e `.../cesta/xlsx`;
  - `processarItens` extraído para `lib/`;
  - botões e campos na tela;
  - `CestaItem.justificativa` (DDL);
  - `scripts/conferir_mapa_dlog.py`.
- **D:**
  - `lib/dados-abertos/{cliente,mapear}.ts`;
  - rota `/api/precos/dados-abertos/coletar`;
  - `scripts/{create_dadosabertos_tables,coletar_dados_abertos,probe_dados_abertos}.py`;
  - fonte `comprasgov`, PNCP e atas em `pesquisarPrecos`;
  - `lib/pesquisa-preco-periodo.ts`, `lib/ipca.ts`, `lib/pncp.ts`, `scripts/import_ipca.py`;
  - `contratacao` em `RegistroMercado`;
  - `docs/api/compras-dadosabertos.md`.
- **A e B:**
  - `lib/demandas-filtro{,-tipos}.ts`, `filter-multi-select.tsx`;
  - `/api/demandas/{opcoes,visoes,export}`;
  - `scripts/{alter_demanda_busca,enriquecer_demandas}.py`;
  - `nupSei` no importador;
  - ajustes em métricas e Dashboard.
- **C:** `/api/relatorios/executivo` e `spec/relatorios-risco-arp.md`.
- **Documentação:**
  - `CLAUDE.md`: Pesquisa de Preços (fonte Compras.gov.br, cobertura, período, IPCA, XLSX modelo
    DLOG), Demandas e Dashboard;
  - `docs/ATUALIZACAO_DE_DADOS.md`: ordem das cargas e coletas, probe da API, exportação do
    Redmine com todos os status.

### 12.2 Nota de resposta à DLOG (rascunho para o usuário revisar)

Um parágrafo por observação, em linguagem não técnica, com o estado de cada uma: **corrigido**
(versão e data), **em implementação**, **depende de decisão** (citar P11/P12) ou
**esclarecimento**. Obrigatório:

- **Planilha:** o painel passa a gerar o "Mapa comparativo de Preços" **no mesmo modelo**, com a
  base do Compras.gov.br, nº da compra, UASG e link do PNCP. Diga o que já está disponível e quais
  colunas dependem da coleta pela API. Liste as decisões de método da seção 8.4. Com tato, cite os
  pontos da seção 8.5 que a automação resolve (em especial o `#N/A` do IPCA no arquivo enviado).
- **"Cessar Atos":** não foi excluído dos critérios; explique, pelo diagnóstico 3.1, por que não
  apareceu.
- **Relatórios:** Panorama Executivo disponível (ou em homologação); Risco e ARP com as datas que o
  usuário informar. Não invente datas.
