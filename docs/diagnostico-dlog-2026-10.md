# Diagnóstico — avaliação da DLOG (out/2026)

Seção 3 do `PROMPT_avaliacao_DLOG_melhorias.md`, rodada em **15/10/2026** sobre `main` @ `c7cf45d`,
contra o banco Neon de produção (só consultas de leitura) e contra as APIs públicas. Resumo da
API em `docs/api/compras-dadosabertos.md`.

**Não rodado:** banco da instância interna (só o Neon estava acessível daqui), chamadas a partir
de uma função na Vercel e do servidor interno (3.7.3), logs da Vercel de `/api/demandas` (3.3),
planilha do Redmine de 27/08/2026 (só a de 17/03/2026 está nesta máquina) e a planilha da DLOG
(não foi fornecida; a conferência das 33 linhas do Item 1 fica para quando ela chegar).

## Achados que mudam o plano

1. **"Cessar Atos" não é status.** É valor do campo **Ponto de Controle** do Redmine. O painel o
   oferece na lista de **Status** (`app/(auth)/demandas/page.tsx:753`,
   `app/(auth)/dashboard/page.tsx:444`), e o filtro por igualdade nunca casa. No banco,
   **8.716 demandas** têm "Cessar Atos" em `pontoControle`. Nada foi excluído dos critérios.
2. **As bases locais não têm nenhum preço dos últimos 12 meses** para os 6 itens da DLOG.
   `PrecoBps` vai até 2024 (53 linhas em 2025), `PrecoSiasg` judicial até 2021 e `PrecoPncp` até
   jun/2025. Com o período do art. 5º (D1), a pesquisa desses itens ficaria vazia sem as APIs (D0).
3. **`PrecoPncp.numeroControlePncp` está vazio nas 195.913 linhas**, assim como `fornecedor` e
   `cnpjOrgao`. O link PNCP (D4) só pode vir da API.
4. **640532 (eplontersena) não existe em `CatmatItem` nem em `CmedRegistro`.** O catálogo oficial
   o tem (`/modulo-material/4_consultarItemMaterial`). Hoje o painel responde "código não
   encontrado" para o Item 5 da DLOG.
5. **Duplicidade BPS × Compras.gov.br é a regra, não a exceção.** Dos 7 registros do BPS para o
   410020 desde 2025, 5 são a mesma compra do Compras.gov.br (mesmo CNPJ do fornecedor, preço,
   quantidade e UF), com diferença de data de 0, 0, 0, 4 e **5 dias**. A regra "até 3 dias" da P18
   perderia 2 deles. Ver a regra adotada no fim deste documento.
6. **A quantidade 651.409 não é erro de digitação da DLOG** (item 13 da seção 8.5 do prompt). É o
   dado publicado da compra 90020/2026 da UASG 090201 (SES/SP), tanto no Compras.gov.br quanto no
   BPS. A nota à DLOG **não** deve apontá-la como erro.
7. **Os tetos da DLOG são o PMVG 17% do produto "Novo" (Revolade/Ojjaara), não o menor PMVG.**
   Conferido nos 4 itens com CMED: 4.094,06 ÷ 14 = 292,43; 2.046,82 ÷ 14 = 146,20;
   13.233,98 ÷ 30 = 441,13; 26.467,95 ÷ 30 = 882,27; Imjudo 300 mg/15 mL = 115.322,41.
   Na CMED, o "medicamento de referência" aparece como `tipoProduto` = "Novo" ou "Biológico".
8. **`RelatorioGerado` está vazio.** As rotas de relatório de pesquisa de preços gravam só o
   `AuditLog`.
9. **`CmedCompetencia.dataPublicacao` é nulo nas 80 competências.** A linha "Publicada em …" da
   aba CMED usa o texto alternativo ("Lista CMED vigente no painel").

## 3.1 Status "Cessar Atos"

Banco (sem lixeira; a lixeira tem 0 linhas):

| status | n |
|--------|---|
| Em Análise COAJUD | 25.640 |
| Tramitado | 9.119 |
| Cadastro Demanda Judicial | 7.286 |
| Concluída | 6.332 |
| Depósito Efetivado | 3.889 |
| Solicitada Autorização | 3.807 |
| Solicitado Cumprimento | 1.521 |
| Solicitado Parecer COMFAD | 491 |
| Pendente | 452 |
| Recebido | 170 |
| Deposito Cancelado | 97 |
| Analisado pela COMFAD | 76 |
| Cadastrado | 28 |
| Retorno Divergência | 15 |
| Em Análise | 13 |
| Respondido | 9 |
| Em Diligência | 1 |

- `status ILIKE '%cessar%'` em `Demanda`: **0 linhas**. Em `sismat.RedmineSeiAtributos.statusRedmine`:
  **0 linhas**.
- Planilha do Redmine de 17/03/2026 (51.501 linhas, 120 colunas): os mesmos 17 status, nenhum
  "Cessar Atos". O termo aparece em **Ponto de Controle** (6.342 linhas: "Cessar Atos",
  "Cessar Atos | Óbito", "Óbito | Cessar Atos"…), em **Situação Gestão** (2.332, texto livre:
  "Cessar atos", "cessar atos - óbito"…), em **Detalhamento do Objeto** (483) e em 12 títulos.
- No banco, `pontoControle` com "Cessar Atos": **8.716 demandas**, das quais 4.642 "Concluída",
  2.642 "Em Análise COAJUD", 682 "Cadastro Demanda Judicial" e 370 "Tramitado".
- Campos multivalorados com " | ": `pontoControle` e `objetoAcao` ("Material … | Medicamento - Outros").
  O filtro de A1 precisa casar **por item da lista**, não pelo texto inteiro.

**Conclusão:** a exportação do Redmine está completa (todos os status). O problema é o painel
oferecer "Cessar Atos" como status. Correção em A1/A3: a opção sai de Status e entra em
**Ponto de Controle**, com as opções vindas do banco e o casamento por item.

## 3.2 Medicamento, processo e SEI

| Campo | Preenchidas | De |
|-------|-------------|----|
| total (sem lixeira) | 58.946 | |
| `principioAtivo` | 44.822 | 58.946 (14.124 sem) |
| `numeroProcesso` | 57.529 | 58.946 |
| `dataEntradaDJUD` | 50.898 | 58.946 |
| `dataVencimento` | **0** | 58.946 (não é importado) |
| `metadados` | 0 chaves | |

`sismat.RedmineSeiAtributos`: 44.629 NUPs. Cabeçalhos da planilha do Redmine relevantes para A5/A6:
`NUP_SEI Principal`, `NUP_SEI Depósito Judicial`, `due_date`, `Prazo de Resposta`, `Novo Prazo`,
`Ação Judicial Originário`, `Princípio_Ativo`, `Princípio Ativo_JEF/TRF4`, `Outro Princípio
Ativo`, `Detalhamento do Objeto`, `Ponto de Controle`, `Situação Gestão`, `Status do
Abastecimento`, `Modalidade de Tratamento`. **Não há coluna de apresentação, concentração nem
quantidade**: a apresentação (A5) tem de vir do texto ou do SISMAT, como previsto em P6.

## 3.3 Busca

`EXPLAIN (ANALYZE, BUFFERS)` da busca atual por `%eltrombopag%`: **Seq Scan** sobre as 58.946
linhas, 7.211 buffers, **84 ms** no banco. Isolada, a consulta não é lenta; o erro relatado vem
do conjunto: uma requisição **por tecla** sem cancelamento (`page.tsx:730`), cada uma com
`findMany` + `count` sobre o Seq Scan e o cold start do Neon (a primeira conexão do diagnóstico
falhou com "Can't reach database server" até o banco acordar).

| Busca | Resultado |
|-------|-----------|
| "eltrombopag" | 103 demandas (todas por `principioAtivo`) |
| "eltrombopague" | 103 (o texto gravado é "Eltrombopague") |
| "410020" | **0**: o CATMAT digitado na "Buscar" não é resolvido |

Extensões disponíveis no Neon e **não instaladas**: `pg_trgm` 1.6 e `unaccent` 1.1. O índice GIN
(P8) depende de `CREATE EXTENSION IF NOT EXISTS pg_trgm`: **confirmar com o usuário**.
Índices atuais de `Demanda`: só btree (status, prioridade, numeroProcesso, deletedAt…).

## 3.4 Dashboard (lido no código)

Confirmados em `lib/metrics.ts`:

- `where` (ORM) e `whereRaw` **não filtram `deletedAt`** (`metrics.ts:149-170`). Sem efeito hoje
  (lixeira vazia), mas erra assim que houver exclusão.
- `sqlConditionsD` (consultas de valor SIAFI com alias `d.`) **não recebe o filtro CATMAT**
  (`metrics.ts:175-182`): com CATMAT, a aba Valores mostra o valor da base inteira.
- O Combobox de medicamento compara só `principioAtivo` por `contains`.

## 3.5 Bases de preço atuais

| Base | Anos | Observação |
|------|------|------------|
| `PrecoBps` | 2020–2024 (+53 em 2025) | 186.350 linhas |
| `PrecoSiasg` | 2002–2021 | todas `acaoJudicial` |
| `PrecoPncp` | 2024 (164.125) e 2025 (31.788) | `numeroControlePncp`, `fornecedor` e `cnpjOrgao` **vazios** |

Itens da DLOG (registros nas bases locais; "12m" = desde 15/10/2025):

| CATMAT | BPS (12m) | SIASG jud. (12m) | PNCP (12m) | CMED | Catálogo |
|--------|-----------|------------------|------------|------|----------|
| 410020 | 12 (0), 2020–2023 | 51 (0), 2013–2021 | 14 (0), até jun/2025 | 3 registros | sim |
| 410019 | 12 (0), 2020–2023 | 15 (0), 2013–2020 | 10 (0), até jun/2025 | 3 | sim |
| 630389 | 0 | 0 | 0 | 1 | sim |
| 630391 | 0 | 0 | 0 | 1 | sim |
| 640532 | 0 | 0 | 0 | **0** | **não** |
| 612063 | 0 | 0 | 2 (0), abr/2024 | 2 | sim |

Pelas APIs, desde 15/10/2025:

| CATMAT | Compras.gov.br | BPS | Itens de ata |
|--------|----------------|-----|--------------|
| 410020 | 37 | 2 | 20 |
| 410019 | 29 | 1 | 20 |
| 630389 | 2 | 1 | 1 |
| 630391 | 6 | 2 | 1 |
| 640532 | 0 | 0 | 0 |
| 612063 | 8 | 0 | 7 |

Os números de 630389 (2) e 630391 (6) batem com as linhas "Compras.gov" da DLOG.

CMED (`PrecoCmed`, vigência 30/07/2026, 25.700 linhas): 410020 tem Natcofarma e Teva (Genérico,
PMVG s/ imp. 1.971,39 e 1.972,10) e Revolade (Novo, 3.034,00; PMVG 17% 4.094,06). O menor PMVG sem
impostos por unidade (o teto do painel) é 140,81; o da DLOG é 292,43.

## 3.6 Origem das bases BPS, SIASG e PNCP

Os carregadores não estão no repositório. Colunas de identificação disponíveis hoje:

- `PrecoBps`: instituição, CNPJ da instituição, fornecedor, fabricante, modalidade. **Sem processo
  nem ata** (a API traz os dois).
- `PrecoSiasg`: órgão, órgão superior, esfera, fornecedor, marca, fabricante. **Sem a chave de 22
  dígitos** (`Identif Item Compra`). Sem ela, o SIASG fica sem nº da compra, UASG e vínculo PNCP.
- `PrecoPncp`: `numeroControlePncp` existe e está vazio.

**Pergunta ao usuário:** a origem do SIASG judicial é a exportação do DW? Se for, a coluna
`Identif Item Compra` pode ser acrescentada a `PrecoSiasg` na próxima carga.

Outros: `UserView` 0 linhas; `CestaItem` sem `justificativa`/`mesesMercado`; nenhuma tabela
`DadosAbertos*`, `PncpVinculo` ou `IndiceIpca`.

## 3.7 APIs (detalhes em `docs/api/compras-dadosabertos.md`)

| Chamada | HTTP | Latência | Resultado |
|---------|------|----------|-----------|
| `/v3/api-docs` | 200 | 1,7 s | 148 KB |
| `1_consultarMaterial` 410020, 10/página | 200 | 0,31 s | 31 registros de 01/08/2025 a 11/08/2026 |
| `1_consultarMaterial` 410020, 500/página | 200 | 0,29 s | 61 registros desde 01/01/2025 |
| `1.1_…_Id` 12019505900412026 | 200 | 0,21 s | `00394429000100-1-000617/2026` |
| `1.1_…_Id` 16016605900072026 | 200 | 0,32 s | `00394452000103-1-012358/2026` |
| `1.1_…_Id` 09020105902542026 (UASG 5 díg., 17) | 200 | 0,27 s | `46374500000194-1-003611/2026` |
| `1.1_…_Id` 9020105902542026 (16 dígitos) | 200 | 0,30 s | **vazio** |
| `2.1_…_Id` item 122 | 200 | 0,83 s | Homologado, Menor preço, R$ 130,00 |
| `1.1_consultarContratos_Id` | 200 | **18,5 s** | vazio |
| `2_consultarARPItem` 410020 | 200 | 0,39 s | 20 itens de ata |
| BPS 410020 | 200 | 0,30 s | ok; `/v1` → 404; `0410020` → vazio |

- As compras **90041/2026 (UASG 120195, item 122, R$ 130,00)** e **90007/2026 (UASG 160166,
  item 55, R$ 76,73)** aparecem no `1_consultarMaterial`. O nº da compra é montado do `idCompra`
  (posições 9–13 + ano). A data da compra 90007/2026 na API é 24/09/2026, posterior à cotação da
  DLOG (11/08/2026): a API atualiza `dataCompra` depois do resultado, e a comparação linha a linha
  com as 33 linhas da DLOG depende da planilha.
- Cota: 429 na 98ª requisição em 20 s, `Retry-After: 4` no cabeçalho.
- A API devolve `idCompraItem` (22 dígitos) pronto: é a chave do registro.

## Regra de duplicidade adotada (P18)

Dados do 410020 (BPS × Compras.gov.br): mesma compra com até 5 dias de diferença entre as datas.
A regra implementada para o BPS (que não tem a chave de 22 dígitos) é:

- mesmo CATMAT, mesmo CNPJ do fornecedor (14 dígitos), mesmo preço com 2 casas e mesma UF; **e**
- mesma quantidade com até **15 dias** de diferença, **ou** quantidade diferente/ausente com até
  **3 dias**.

A linha sai com "Compõe = Não — provável duplicata de Compras.gov.br" e pode ser revertida na
curadoria.
