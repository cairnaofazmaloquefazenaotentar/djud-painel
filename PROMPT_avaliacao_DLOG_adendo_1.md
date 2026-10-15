# ADENDO 1 ao PROMPT "Avaliação da DLOG — melhorias" (reunião de validação, out/2026)

> **Como usar:** este adendo **complementa e, onde conflitar, substitui** o
> `PROMPT_avaliacao_DLOG_melhorias.md` (revisão 3). Ele vale para uma sessão que **já está no
> meio** da execução do prompt principal.
>
> 1. Retome a mesma conversa (`claude --continue` ou `/resume`), para não perder o contexto do
>    prompt principal.
> 2. **Termine o passo em andamento**, rode a verificação dele e faça commit. Não abandone
>    trabalho pela metade.
> 3. Leia este adendo inteiro e responda com um **replanejamento**: o que já foi feito e continua
>    valendo, o que já foi feito e precisa de ajuste (seção 4), e a nova ordem dos próximos passos
>    (seção 5).
> 4. Só então continue.
>
> Rastreamento feito sobre `main` @ `c7cf45d`. As referências `arquivo:linha` valem para esse
> commit; se o passo anterior já mexeu no arquivo, localize pelo nome da função.

---

## 0. Decisões novas (Q1–Q13)

| # | Decisão | Padrão adotado |
|---|---------|----------------|
| Q1 | **Status = Ponto de Controle** (coluna BZ do Redmine) | Os filtros "Status" e "Sub-status" passam a ler `Demanda.pontoControle`, **não** `Demanda.status`. O valor é normalizado como lista (mesma regra de `normalizar_lista`: desempacota JSON e une com " \| ") e quebrado em segmentos. **Status** = o **1º segmento** ("Cessar Atos \| Conversão em Renda" → "Cessar Atos"). **Sub-status** = o valor completo, listado sob o seu status e exibido pelo restante ("Conversão em Renda"). As duas listas aceitam seleção múltipla. Uma caixa "incluir quando o status aparece depois do 1º segmento" vem **desligada**: com ela ligada, "Cessar Atos" também traz "Arquivado \| Cessar Atos". **Confirmar com o usuário depois do diagnóstico 2.1** (a ordem dos segmentos pode não ter significado). |
| Q2 | Alcance de Q1 | Vale para a lista de Demandas, os exports, os relatórios **e o Dashboard**, pelo filtro único (A1/B1 do prompt principal). O `Demanda.status` (situação do fluxo no Redmine) vira o filtro **"Situação no Redmine (tramitação)"**, dentro de "Mais filtros". O **funil de Tramitação** e a **taxa de resolução** (`FLUXO_DJUD`, `STATUS_RESOLVIDOS` em `lib/metrics.ts`) continuam em `status`, porque medem o fluxo. |
| Q3 | Medicamento = **colunas CB + CC** do Redmine | `principioAtivo` = união das duas colunas, desempacotadas, sem lixo e sem repetição, nesta ordem. **Hipótese a confirmar (2.2):** CB é a lista de escolha e traz "==> Outro..." quando o medicamento não está na lista; o nome real vai para CC. Hoje o importador descarta "==> Outro..." (`_lixo`, `scripts/import_redmine_base.py:128`) e **nunca lê CC**, então essas demandas ficam sem medicamento e a busca não as encontra. Gravar a origem (`CB`, `CC`, `CB+CC`). |
| Q4 | Filtros principais da aba Demandas | Visíveis: **CATMAT/Registro ANVISA** (autocomplete), **Descrição** (autocomplete), **Unidade de Fornecimento**, **Status**, **Sub-status**, **Processo SEI**. O resto (Buscar, Grupo Temático, Região, TRF, Prioridade, Situação no Redmine, datas, apresentação…) fica atrás do botão **"Mais filtros"**, com um contador dos filtros ativos. |
| Q5 | CATMAT, Descrição e Unidade na aba Demandas | O mesmo trio da Pesquisa de Preços: o componente `MaterialSearch` é reaproveitado (código e descrição preenchem um ao outro) e a unidade vem das unidades do item escolhido. **A rota de sugestões precisa aceitar `demandas:read`**: hoje `/api/precos/catmat` exige `precos:pesquisar`, que o perfil OPERATOR não tem (`lib/permissions.ts:66-75`). |
| Q6 | Unidade de Fornecimento na aba Demandas | Depende da apresentação derivada (A5 do prompt principal). Casa com a forma e a unidade das `apresentacoes` da demanda. Demandas sem apresentação identificada **aparecem num grupo próprio**, nunca somem em silêncio. Até A5 existir, o filtro fica visível e desabilitado, com a explicação. |
| Q7 | Fonte **"ComprasGov"** = Compras.gov.br + SIASG | Na Pesquisa de Preços, **SIASG e Compras.gov.br viram uma fonte só, "ComprasGov"** (inciso I). Um registro por **chave de 22 dígitos** do item da compra (7.1.1 do prompt principal), **fundindo os campos**: identificação, UASG e link do lado Compras.gov.br; fabricante e marca do lado SIASG/DW. A marca "compra judicial" (`PrecoSiasg.acaoJudicial`) fica como coluna e como chave **"Somente compras judiciais"** dentro da fonte. **Substitui P15 e a fonte separada "SIASG (judicial)".** |
| Q8 | **PNCP deixa de ser fonte de preço** | O painel "PNCP" vira **"Contratações no PNCP"**: explica que cada registro do ComprasGov tem o link para a contratação de origem no PNCP (vínculo 7.1.3), com as contagens "vinculados / sem registro no PNCP". **Substitui P16.** **Consequência a comunicar ao usuário:** compras publicadas no PNCP por órgãos que **não** usam o Compras.gov.br (parte dos estados e municípios) deixam de entrar no cálculo. O painel mostra quantas são ("n contratações PNCP fora do ComprasGov não consideradas"). `PrecoPncp` não é apagado. |
| Q9 | Atas (P17) | **Desligadas por padrão** neste ciclo, sem tela própria. Só entram se o usuário pedir. |
| Q10 | **Filtro de intervalo de datas** na Pesquisa de Preços | "Data inicial" e "Data final" explícitas (padrão: os últimos 12 meses até hoje), com atalhos 12, 24 e 36 meses. O intervalo vale para todas as fontes datadas. Se o intervalo exceder a janela do art. 5º de alguma fonte (seção 7.0 do prompt principal), a pesquisa exige a **justificativa**, impressa no relatório e no XLSX. **Substitui a forma de escolha de D1/P9** (presets); a regra legal continua. |
| Q11 | **Janelas fecham ao clicar fora e com Esc** | Correção **global** do `components/ui/dialog.tsx` (Q11, seção 3.7 deste adendo). Janela com dado não salvo (curadoria, orçamento) pede confirmação antes de fechar. |
| Q12 | **Orçamento externo sem pesquisa prévia** | Botão **"Orçamento externo"** ao lado do botão da Cesta. Escolhe o item (CATMAT/registro + unidade), lança uma ou mais cotações e grava **na cesta**: cria o item se ainda não existir, ou acrescenta ao existente. Os tipos de preço informado de P13 (III mídia especializada, IV fornecedor, V nota fiscal) entram pelo mesmo botão. |
| Q13 | Autocomplete | **Mais filtros** (Fornecedor, Fabricante, CNPJ Comprador): sugestões com os **valores que existem nas fontes para o item, a unidade e o período escolhidos**, com contagem. **CATMAT/Registro e Descrição:** o autocomplete **já existe** (`MaterialSearch`, a partir de 2 caracteres); o diagnóstico 2.4 descobre por que não funcionou na validação, e ele é levado também para a aba Demandas (Q5). |

---

## 1. Mapa: pontos da reunião → código → o que muda no prompt principal

| Ponto | O que o código faz hoje | Causa ou lacuna | Prompt principal |
|-------|-------------------------|-----------------|------------------|
| **Dem. 1**: Status → Ponto de Controle, múltiplo, status e sub-status | O filtro "Status" usa `Demanda.status` com lista fixa (`app/(auth)/demandas/page.tsx:742`); a API compara por igualdade (`app/api/demandas/route.ts:51`). `pontoControle` é importado cru (`txt()`, `scripts/import_redmine_base.py:442`), **sem** a normalização de listas usada no princípio ativo. Só aparece no detalhe e na edição. | O **glossário e a ajuda do painel já definem "Ponto de Controle" como o status jurídico-operacional, com "Cessar Atos" de exemplo** (`lib/legal-glossary.ts:37`; `app/(auth)/help/page.tsx:64`), mas o filtro olha outra coluna. **Explicação provável da obs. 1 da DLOG** ("Cessar Atos" não aparece): confirmar em 2.1. | Substitui P3; altera A1, A3 e B. |
| **Dem. 2**: busca por medicamento sem resultado; CATMAT; unir CB e CC | Busca e CATMAT procuram em `principioAtivo`, `titulo` e `descricao`. `principioAtivo` vem só da coluna "Princípio_Ativo", e valores "==> Outro..." são descartados. | Hipótese Q3. Os demais motivos (sem debounce, sensível a acento, CATMAT não resolvido na "Buscar") já estão em A4. | Altera A4 e A5; acrescenta Q3 à carga. |
| **Dem. 3**: Unidade de Fornecimento | Não existe; `Demanda` não tem unidade nem apresentação. | Depende de A5. | Q6. |
| **Dem. 4**: filtros principais e "Mais filtros" | `FilterBar` com 7 campos no mesmo nível. | — | Q4 e Q5; altera A1. |
| **PP 1**: orçamento externo ao lado da cesta | O orçamento só existe dentro da curadoria (`AbaOrcamentos`, `components/pesquisa-preco/curadoria-dialog.tsx:360`), que só abre depois de uma pesquisa. `POST /api/precos/cesta` **já aceita `orcamentos`** junto com `codigo` e `unidade` (`app/api/precos/cesta/route.ts:56`). | Falta só a entrada na tela. | Q12; integra P13. |
| **PP 2**: autocomplete nos filtros adicionais | Fornecedor, Fabricante e CNPJ são `Input` de texto livre (`app/(auth)/pesquisa-preco/page.tsx:~830-860`). | — | Q13. |
| **PP 3**: PNCP → ComprasGov (com SIASG); PNCP como link | Fontes BPS, SIASG (judicial) e PNCP separadas (`lib/pesquisa-preco.ts:840-930`). | Mudança de modelo de fontes. | Substitui P15, P16 e P17; ajusta P18, 7.0, 7.1.6, 8.2 e 8.3 (seção 4). |
| **PP 4**: intervalo de datas | Não existe; o prompt principal previa presets (D1). | — | Q10 (ajusta D1). |
| **PP 5**: janela não fecha ao clicar fora | `components/ui/dialog.tsx` é um componente próprio que **não chama `onOpenChange` nunca**: não há clique no fundo nem Esc. Também usa `bg-white` fixo (fora dos tokens; quebra o tema escuro). Usado em `pesquisa-preco/page.tsx`, `cesta-sheet.tsx`, `curadoria-dialog.tsx`, `demanda-export-modal.tsx` e `file-preview-modal.tsx`. | Bug de componente. | Q11 (novo). |
| **PP 6**: autocomplete em Descrição e CATMAT/Registro | **Já existe** (`components/pesquisa-preco/material-search.tsx`: 2 caracteres, 300 ms; `GET /api/precos/catmat` → `sugerirMateriais`). Descrição: `contains` por palavra em `descricaoNorm` sem índice; registro ANVISA: prefixo com 4 dígitos ou mais. | Funcionou em produção? Ver 2.4. | Q13. |

---

## 2. Diagnóstico adicional (antes de codar; resultados no PR)

### 2.1 Ponto de Controle

```sql
SELECT "pontoControle", count(*) FROM "Demanda" WHERE "deletedAt" IS NULL
 GROUP BY 1 ORDER BY 2 DESC LIMIT 80;
-- segmentos, por posição
SELECT split_part("pontoControle", ' | ', 1) AS seg1, count(*) FROM "Demanda"
 WHERE "deletedAt" IS NULL GROUP BY 1 ORDER BY 2 DESC;
SELECT count(*) FILTER (WHERE "pontoControle" ILIKE '%cessar atos%') AS com_cessar,
       count(*) FILTER (WHERE status ILIKE '%cessar atos%') AS status_cessar
  FROM "Demanda" WHERE "deletedAt" IS NULL;
-- formato cru: JSON? " | "? ", "?
SELECT "pontoControle" FROM "Demanda" WHERE "pontoControle" LIKE '[%' LIMIT 5;
```

Mostre ao usuário a lista de segmentos e as combinações invertidas (por exemplo, "A | B" e
"B | A"), para ele confirmar Q1 (1º segmento = status, ou status em qualquer posição).

### 2.2 Colunas BZ, CB e CC da planilha do Redmine

O importador lê por **nome** de cabeçalho. Imprima o cabeçalho com a **letra** da coluna para
mapear o que o usuário vê no Excel. Índices base 0 em `iter_rows`: **BZ = 77, CA = 78, CB = 79,
CC = 80**.

```python
# dentro de scripts/import_redmine_base.py (modo --dry-run), após ler o cabeçalho
for letra, i in (("BZ", 77), ("CA", 78), ("CB", 79), ("CC", 80)):
    print(letra, repr(header[i] if i < len(header) else None))
```

Para CB e CC, informe:

- quantas linhas têm valor;
- quantas têm "==> Outro..." em CB **e** valor em CC;
- 20 exemplos de pares (CB, CC).

Confirme ou refute a hipótese Q3 antes de alterar a carga. Confirme também que BZ é "Ponto de
Controle".

### 2.3 Busca por medicamento (reprodução da reunião)

Com a base atual e **depois** da carga com Q3, rode a busca pelos medicamentos testados na reunião
(peça a lista ao usuário) e pelo CATMAT de cada um. Anote o total antes e depois.

### 2.4 Autocomplete de CATMAT e Descrição (Pesquisa de Preços)

- Em produção, `GET /api/precos/catmat?q=eltromb` e `?q=4100`: status, tempo e quantidade de
  itens.
- `SELECT count(*) FROM "CatmatItem"` (a tabela está carregada na Vercel?) e `EXPLAIN ANALYZE` da
  consulta por palavras em `descricaoNorm`.
- Pergunte ao usuário o que exatamente não funcionou: não abriu, demorou, não achou ou achou
  errado. Isso decide entre corrigir dado, índice ou interface.

---

## 3. Especificação por ponto

### 3.1 Demandas — Status e Sub-status (Q1, Q2)

- **Carga:**
  - `scripts/import_redmine_base.py` grava `pontoControle` com `normalizar_lista` (a mesma do
    princípio ativo; valor canônico "A | B");
  - colunas novas `pontoControleStatus` (1º segmento) e `pontoControleSegmentos String[]` (todos,
    na ordem), com índice B-tree em `pontoControleStatus` e índice GIN em `pontoControleSegmentos`;
  - DDL em script Python (`ADD COLUMN IF NOT EXISTS` + backfill), conforme as convenções do prompt
    principal;
  - a edição da demanda (`app/(auth)/demandas/[id]/edit/page.tsx`) recalcula os dois campos ao
    salvar.
- **Filtro único (A1):** `CampoDemanda` ganha `pontoControleStatus` (incluir/excluir) e
  `pontoControle` (sub-status: valor completo, incluir/excluir).
  - Com a caixa "qualquer posição" ligada, o status casa por `pontoControleSegmentos` com
    `hasSome`.
  - `?status=` passa a significar Ponto de Controle. Links antigos com valores do `status` do
    Redmine que **não** existem como segmento são redirecionados para `situacaoRedmine=` (sem
    quebrar favoritos).
- **Opções:** `GET /api/demandas/opcoes` devolve, para o Ponto de Controle, a árvore
  `{ status, total, subStatus: [{ valor, restante, total }] }`. O seletor de sub-status mostra só
  os sub-status dos status marcados (se nenhum estiver marcado, mostra todos, agrupados).
- **Exibição:**
  - a coluna "Status" da tabela mostra o Ponto de Controle (status em destaque e o restante em
    texto menor);
  - a cor do badge (`statusColors`) passa a ser por status do Ponto de Controle;
  - "Situação no Redmine" é uma coluna opcional no seletor de colunas.
- **Dashboard (Q2):**
  - o filtro "Status" do Dashboard vira Status + Sub-status do Ponto de Controle;
  - acrescentar o gráfico "Demandas por Ponto de Controle" (status, ou sub-status quando um único
    status estiver selecionado);
  - o funil de Tramitação continua em `status`.
- **Resposta à DLOG ("Cessar Atos"):** se 2.1 confirmar, o status existe, mas está no Ponto de
  Controle, e o filtro olhava a situação do fluxo no Redmine. Corrigido por Q1.

### 3.2 Demandas — medicamento pelas colunas CB + CC (Q3)

- **Importador:**
  - lê as duas colunas **pelo nome** confirmado em 2.2, nunca pela letra;
  - aplica `normalizar_lista` em cada uma;
  - se CB é lixo ("==> Outro…", "N/A"), usa CC;
  - se as duas têm valor, faz a união sem repetição;
  - grava em `principioAtivo` e a origem em `principioAtivoOrigem`;
  - acrescenta a contagem por origem ao relatório de carga.
- `lib/principio-ativo.ts` e `/api/demandas/principios-ativos` continuam valendo (o valor gravado
  já vem limpo).
- **Recarregar a base** (`--dry-run`, revisar, `--confirm`) e rodar em seguida o enriquecimento
  (A5) e o backfill de `buscaNorm` (A4). **A carga é REPLACE:** avise o usuário antes de pedir o
  `--confirm`.
- O filtro de CATMAT continua como **filtro próprio**, nos filtros principais (Q4). O CATMAT
  digitado na "Buscar" segue a regra de A4.

### 3.3 Demandas — leiaute dos filtros (Q4, Q5, Q6)

- **Linha principal:**
  - `MaterialSearch` em modo código e em modo descrição (mesma seleção);
  - "Unidade de Fornecimento" (opções do item escolhido, via `/api/precos/catmat/[codigo]`, ou a
    rota equivalente com permissão de demandas);
  - Status (multi) e Sub-status (multi), de 3.1;
  - "Processo SEI": aceita o NUP com ou sem pontuação e casa com `nupSei` (A6). Enquanto A6 não
    existir, o campo fica desabilitado, com a explicação.
- **"Mais filtros"** (recolhido, com contador): Buscar (texto livre), Grupo Temático, Região, TRF,
  Prioridade, Situação no Redmine, Data de entrada, Apresentação, Nº do processo judicial. O
  estado aberto/fechado fica na URL.
- **Permissão:** criar `GET /api/catalogo/sugestoes` (e `/api/catalogo/[codigo]/unidades`), com
  `demandas:read` **ou** `precos:pesquisar`, chamando `sugerirMateriais`/`mapearUnidades`. A
  Pesquisa de Preços pode continuar nas rotas atuais.
- **Semântica do filtro de código com unidade:** CATMAT/Registro → substância (como hoje) e,
  quando houver unidade escolhida, também a forma/unidade das `apresentacoes` (A5). A faixa de
  resultado mostra três grupos: "apresentação exata", "mesma substância, unidade diferente" e
  "apresentação não identificada".

### 3.4 Pesquisa de Preços — fonte ComprasGov e PNCP como link (Q7, Q8, Q9)

- **Fontes que entram no cálculo:** BPS, **ComprasGov** e preços informados (orçamento IV, mídia
  III, nota fiscal V). A CMED continua como teto.
- **`comprasgov`:**
  - lê `DadosAbertosPreco` (origem `COMPRASGOV`, pela API ou pelo extrator) **mais** `PrecoSiasg`;
  - deduplica pela chave de 22 dígitos e **funde** os campos;
  - registros SIASG **sem** chave entram como estão, marcados "sem identificação da compra";
  - o rótulo no relatório e no XLSX é **"I - ComprasGov"**;
  - a chave "Somente compras judiciais" vale dentro da fonte.
- **Painel "Contratações no PNCP"** (no lugar do painel PNCP):
  - texto curto: "Cada compra do ComprasGov é ligada à contratação publicada no PNCP. O link abre o
    edital/contratação de origem.";
  - contagens "n vinculados · m sem registro no PNCP · k sem identificação";
  - botão "Vincular ao PNCP" (7.1.3 do prompt principal);
  - linha informativa com quantas contratações PNCP de **outros portais** existem para o item e
    estão fora do cálculo (Q8).
- **Duplicidade (P18):** com SIASG e Compras.gov.br na mesma fonte, a regra de P18 vale **dentro**
  do ComprasGov e entre ComprasGov e BPS (provável duplicata).
- **Estatística por fonte:** o vetor de medianas passa a ter BPS, ComprasGov e preços informados.
  Atualize `METODO_ADOTADO`, a tabela de cobertura de `FONTE_SEM_CAMPO` e a seção do `CLAUDE.md`.
- **Exclusões já gravadas na curadoria** apontando para ids de `PrecoSiasg`/`PrecoPncp`: mesma
  regra de "ids estáveis" (7.1.4). As que não casarem são listadas como "registro não encontrado
  na base atual", nunca descartadas em silêncio.

### 3.5 Pesquisa de Preços — intervalo de datas (Q10)

- **Linha "Período":** dois `Input type="date"` ("De", "Até") e os atalhos 12, 24 e 36 meses;
  padrão de hoje − 12 meses até hoje.
- **Na URL e na API:** `dataInicio` e `dataFim` vão para a URL, para `ParametrosPesquisa` e para
  `CestaItem` (no lugar de `mesesMercado`; se o passo D1 já gravou `mesesMercado`, converta).
- **Fora da janela de uma fonte:** se o intervalo exceder a janela do art. 5º de alguma fonte,
  aparece o campo de justificativa obrigatório. A janela de 6 meses dos preços informados III e IV
  continua sendo **verificada por registro**.
- **Relatórios:** HTML e XLSX imprimem o intervalo usado e a justificativa.

### 3.6 Pesquisa de Preços — orçamento externo sem pesquisa prévia (Q12)

- **Botão "Orçamento externo"** ao lado do botão da Cesta (onde `<CestaSheet />` é montado,
  `app/(auth)/pesquisa-preco/page.tsx:723`).
- **A janela:**
  1. escolha do item com `MaterialSearch` (código/descrição), unidade e UF opcional;
  2. o formulário de cotações **extraído** de `AbaOrcamentos` para um componente próprio
     (`components/pesquisa-preco/orcamentos-form.tsx`), usado pela curadoria e pela janela nova;
  3. tipo do preço informado (P13), com os campos obrigatórios de cada tipo.
- **Gravar:** se o item já está na cesta (mesma chave código + unidade + UF), acrescenta as
  cotações ao item, usando o PATCH, que é **substituição total**: leia as existentes e envie a
  lista somada. Se não está, `POST /api/precos/cesta` com `codigo`, `unidade`, `uf`, `quantidade`
  (campo da janela) e `orcamentos`.
- A janela usa o `Dialog` corrigido (Q11) e confirma antes de fechar com dado não salvo.
- **Aceite:** sem pesquisar nada, lançar 3 cotações para o CATMAT 640532 (eplontersena, tubete),
  abrir a cesta e gerar o relatório e o XLSX com as cotações como fonte.

### 3.7 Janelas: fechar ao clicar fora e com Esc (Q11)

- **Trocar a implementação de `components/ui/dialog.tsx` pelo Radix Dialog**
  (`@radix-ui/react-dialog`; o projeto já usa `@radix-ui/react-alert-dialog`), mantendo os nomes
  exportados (`Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogClose`) e a
  assinatura `open`/`onOpenChange`. Os cinco usos atuais não precisam mudar.
- Isso dá clique no fundo, Esc, foco preso e acessibilidade (`aria-modal`, título). Troque também
  `bg-white` por `bg-background`/`bg-card` (tokens).
- **Proteção de dado:** `CuradoriaDialog` e a janela de orçamento recebem `temAlteracoes`. Se a
  janela vai fechar com alterações não salvas, aparece o `AlertDialog` "Descartar alterações?".
  Fechar durante `salvando` fica bloqueado.
- Revise também `Sheet` (`components/ui/sheet.tsx`, usado pela Cesta) e `AlertDialog`: o
  comportamento esperado é o mesmo.

### 3.8 Autocomplete nos filtros adicionais (Q13)

- **Rota** `GET /api/precos/sugestoes-filtro?campo=fornecedor|fabricante|cnpjComprador&codigo=…&unidade=…&uf=…&dataInicio=…&dataFim=…&q=…`:
  - devolve até 20 valores distintos com contagem, das fontes que têm o campo (respeitando
    `FONTE_SEM_CAMPO`), já com o recorte do item;
  - texto casa sem acento; o CNPJ casa por prefixo com e sem pontuação (`variantesCnpj`).
- **Componente:** um combobox de texto livre (o usuário pode digitar algo que não está na lista)
  para os três campos de "Mais filtros", com debounce de 300 ms e lista aberta ao focar quando já
  há item escolhido.
- **CATMAT/Descrição (já existente):** corrigir conforme o diagnóstico 2.4. Por exemplo, índice
  trigram em `CatmatItem.descricaoNorm`, ou carregar `CatmatItem` na Vercel se estiver vazio.

---

## 4. O que este adendo muda no prompt principal

| Item do prompt principal | Mudança |
|--------------------------|---------|
| P3 (grupos de status) | Substituído por Q1 (status e sub-status do Ponto de Controle). Os grupos prontos passam a ser atalhos sobre os status do Ponto de Controle. |
| A1 (`CampoDemanda`) | `status` passa a ser o Ponto de Controle; o antigo vira `situacaoRedmine`; entram `pontoControleStatus`/`pontoControle` e o leiaute de Q4. |
| A3 ("Cessar Atos") | A causa provável passa a ser a coluna errada (3.1); o diagnóstico 2.1 confirma. |
| A4 e A5 | Acrescentar Q3 (CB + CC) na carga; filtro de unidade (Q6); componente `MaterialSearch` e rota com `demandas:read` (Q5). |
| B (Dashboard) | Status do Dashboard = Ponto de Controle (Q2); gráfico novo; Tramitação continua em `status`. |
| P15, P16, P17 | Substituídos por Q7, Q8 e Q9. |
| P18 | Vale dentro do ComprasGov e entre ComprasGov e BPS. |
| 7.0 (tabela de incisos) | Inciso I: "I - BPS" e **"I - ComprasGov"**. Inciso II: sem fonte automática neste ciclo (atas desligadas; PNCP é link); preço informado do tipo II continua possível. |
| 7.1.6 | Fontes `comprasgov` (Compras.gov.br + SIASG fundidos) e `bps`; PNCP só como vínculo. |
| D1 (período) | Intervalo de datas explícito (Q10); `mesesMercado` vira `dataInicio`/`dataFim`. |
| 8.2 e 8.3 (XLSX) | Coluna B "Fonte da Pesquisa": "I - ComprasGov", "I - BPS", "III - Mídia especializada", "IV - Cotação com fornecedor", "V - Nota fiscal eletrônica". Coluna T: link PNCP do registro ComprasGov. Bloco "Consolidado por fonte": BPS, ComprasGov e informados. |
| 12.1 e `CLAUDE.md` | Documentar Ponto de Controle (status/sub-status), CB + CC, ComprasGov, PNCP como link, intervalo de datas e `Dialog` com Radix. |

**Se o passo já executado entrou em conflito** (por exemplo, a fonte `siasg` separada já existe,
ou D1 já gravou `mesesMercado`): **ajuste, não descarte**. Faça a migração do que já está gravado
(cestas, exclusões, parâmetros) e registre no PR o que mudou.

---

## 5. Ordem dos próximos passos (replanejar a partir do ponto atual)

Comece pelo que é **independente e de alto impacto visível**, e só depois volte à fila do prompt
principal, já com as mudanças da seção 4:

1. **Q11:** `Dialog` com Radix (PR pequeno; destrava a usabilidade de todas as janelas).
2. **Diagnóstico 2.1–2.4** (mostrar os resultados ao usuário e confirmar Q1 e Q3).
3. **Q1 + Q2 + Q3:** carga (Ponto de Controle normalizado, CB + CC) e filtro de status/sub-status
   na lista e no Dashboard. Pede recarga da base (o usuário roda o `--confirm`).
4. **Q12 + Q13:** orçamento externo ao lado da cesta e autocomplete dos filtros adicionais.
5. **Q7 + Q8 + Q10:** fonte ComprasGov, PNCP como link e intervalo de datas, integrados a D0/D1
   (se D0 ainda não começou, já nasce assim).
6. **Q4 + Q5 + Q6:** leiaute de filtros da aba Demandas (Q6 depende de A5).
7. Restante do prompt principal, na ordem dele, aplicando a seção 4.

## 6. Verificação adicional

- **Q1:**
  - "Cessar Atos" como status devolve as demandas do diagnóstico 2.1;
  - selecionar dois sub-status combina por OR;
  - o total da lista é igual ao do Dashboard;
  - `?status=` antigo com valor da situação do Redmine cai em `situacaoRedmine`.
- **Q3:** os medicamentos testados na reunião passam a ter resultado; o relatório de carga mostra
  as contagens por origem (CB, CC, CB+CC).
- **Q5:** um usuário OPERATOR usa o autocomplete na aba Demandas sem 403.
- **Q7 e Q8:**
  - nenhum registro duplicado entre SIASG e Compras.gov.br no ComprasGov (mesma chave de 22
    dígitos);
  - o painel "Contratações no PNCP" mostra as contagens;
  - o XLSX traz "I - ComprasGov" e o link na coluna T.
- **Q10:** intervalo fora da janela sem justificativa é bloqueado; o intervalo aparece no HTML e no
  XLSX.
- **Q11:**
  - clicar fora e Esc fecham as cinco janelas;
  - a curadoria com alteração pede confirmação;
  - o tema escuro está correto.
- **Q12:** o cenário de aceite de 3.6.
- **Q13:** as sugestões de fornecedor respeitam o item, a unidade e o período, e mostram a
  contagem.
