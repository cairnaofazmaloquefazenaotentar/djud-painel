# APIs de dados abertos usadas pela Pesquisa de Preços

Resumo dos endpoints que o painel consome, conferido em **15/10/2026** contra o contrato
`GET https://dadosabertos.compras.gov.br/v3/api-docs` (API Compras.gov.br 1.0.0) e contra
chamadas reais com o CATMAT 410020 (eltrombopague 50 mg). O JSON completo do contrato **não** é
versionado: baixe de novo quando precisar e compare com esta página.

Amostras reais das respostas, usadas pelos autotestes dos espelhos TS/Python de `mapear`, ficam em
`scripts/fixtures/dados-abertos/`.

Legenda: **confirmado** = visto numa resposta real em 15/10/2026; **contrato** = consta do
`/v3/api-docs`, mas não foi exercitado.

## 1. Compras.gov.br — `https://dadosabertos.compras.gov.br`

Envelope de todas as listagens: `{ resultado: [...], totalRegistros, totalPaginas, paginasRestantes }`.
`tamanhoPagina` aceita de 10 a 500. Datas `YYYY-MM-DD`. Acesso público, sem autenticação.

### Cota (confirmado)

- 429 depois de ~100 requisições em ~20 s, somando todos os módulos (há um front door Azure na
  frente: cabeçalho `x-azure-ref`).
- O 429 traz **`Retry-After` no cabeçalho** (veio `4`, em segundos). Depois da espera, a chamada
  seguinte volta a dar 200.
- O painel fica abaixo de 90 por minuto por usuário e, num 429, devolve `{ aguardarMs }` para a
  tela esperar (P24). A função do servidor nunca dorme esperando.

### 1.1 Preços praticados — `GET /modulo-pesquisa-preco/1_consultarMaterial`

Parâmetros (contrato):

| Parâmetro | Obrigatório | Observação |
|-----------|-------------|------------|
| `tipo` | sim | `codigoItemCatalogo` ou `codigoPdm` |
| `codigo` | sim | o CATMAT ou o PDM |
| `dataCompraInicio`, `dataCompraFim` | não | `YYYY-MM-DD` |
| `estado`, `codigoUasg`, `codigoMunicipio`, `codigoClasse`, `poder`, `esfera`, `idCompra` | não | filtros |
| `dataResultado` | não | booleano |
| `pagina`, `tamanhoPagina` | não | 10 a 500 |

Campos de cada item de `resultado` (confirmado; a lista é maior que a prevista no prompt):

`idCompra` (número, 16 ou 17 dígitos), `idItemCompra`, `idCompraItem` (**texto com os 22 dígitos
já montados**: `idCompra` com 17 dígitos + `numeroItemCompra` com 5), `dataCompra`, `forma`
(`SISRP`/`SISPP`), `modalidade` (código: 5 = Pregão, 6 = Dispensa…), `criterioJulgamento`
(`"V"`, `"1"`, `"0"` ou vazio), `numeroItemCompra`, `descricaoItem`, `descricaoDetalhadaItem`,
`objetoCompra`, `codigoItemCatalogo`, `codigoPdm`, `nomePdm`, `codigoClasse`, `nomeClasse`,
`siglaUnidadeFornecimento`, `nomeUnidadeFornecimento`, `capacidadeUnidadeFornecimento`,
`siglaUnidadeMedida`, `nomeUnidadeMedida`, `quantidade`, `precoUnitario`,
`percentualMaiorDesconto`, `niFornecedor`, `nomeFornecedor`, `marca`, `codigoUasg`, `nomeUasg`,
`codigoOrgao`, `nomeOrgao`, `estado`, `codigoMunicipio`, `municipio`, `poder`, `esfera`,
`dataResultado`, `dataHoraAtualizacaoCompra`, `dataHoraAtualizacaoItem`,
`dataHoraAtualizacaoUasg`, `dataAtualizacaoFato`.

Notas:

- `idCompra` = UASG (6) + modalidade (2) + número (5) + ano (4). UASG de 5 dígitos gera um número de
  16 dígitos (`9020105901632024` → UASG 090201, Pregão, compra 90163/2024). O painel normaliza com
  `padStart(17, "0")`.
- Com `tipo`+`codigo` a assinatura nova funcionou (HTTP 200). A assinatura antiga
  (`codigoItemCatalogo=<n>`) fica só como recuo em 400/404, como no Extrator-CATMAT-DA.
- 410020, de 01/01/2025 a 15/10/2026: 61 registros em 1 página de 500 (0,29 s).

### 1.2 Descrição detalhada — `GET /modulo-pesquisa-preco/2_consultarMaterialDetalhe`

`codigoItemCatalogo` (obrigatório), `dataCompraInicio`, `dataCompraFim`. Devolve `idCompra`,
`idItemCompra`, `numeroItemCompra`, `objetoCompra`, `descricaoDetalhadaItem`. **Desnecessário**:
o 1.1 já traz `descricaoDetalhadaItem` e `objetoCompra`.

### 1.3 Vínculo compra → contratação no PNCP — `GET /modulo-contratacoes/1.1_consultarContratacoes_PNCP_14133_Id`

| Parâmetro | Valores |
|-----------|---------|
| `tipo` | `idCompra` ou `numeroControlePNCPCompra` (enum no contrato) |
| `codigo` | o `idCompra` **com 17 dígitos** |

Confirmado:

- `12019505900412026` (90041/2026, UASG 120195) → `numeroControlePNCP` `00394429000100-1-000617/2026`.
- `16016605900072026` (90007/2026, UASG 160166) → `00394452000103-1-012358/2026`.
- UASG de 5 dígitos (90254/2026, UASG 090201): com 17 dígitos (`09020105902542026`) →
  `46374500000194-1-003611/2026`; **com 16 dígitos (`9020105902542026`) → lista vazia**. Por isso a
  normalização para 17 dígitos é obrigatória antes da chamada.
- Compra sem registro no PNCP: **HTTP 200 com `totalRegistros: 0`** (não é 404 nem 500).
- Campos úteis: `numeroControlePNCP`, `numeroCompra` (sem zeros: `"29"` para 00029), `processo`,
  `modalidadeNome`, `srp`, `situacaoCompraNomePncp` ("Divulgada no PNCP"), `existeResultado`,
  `contratacaoExcluida`, `orgaoEntidadeCnpj`, `orgaoEntidadeRazaoSocial`,
  `unidadeOrgaoCodigoUnidade`, `unidadeOrgaoNomeUnidade`, `objetoCompra`, `valorTotalEstimado`,
  `valorTotalHomologado`, `dataPublicacaoPncp`, `anoCompraPncp`, `sequencialCompraPncp`.

### 1.4 Itens e resultado da contratação

- `GET /modulo-contratacoes/2.1_consultarItensContratacoes_PNCP_14133_Id` (`tipo`, `codigo`,
  opcional `idCompraItem` com os 22 dígitos). Confirmado: `numeroItemCompra` = `numeroItemPncp` =
  122 para o item 122; `situacaoCompraItemNome` "Homologado"; `criterioJulgamentoNome` "Menor
  preço"; `valorUnitarioEstimado` 290,00; `valorUnitarioResultado` 130,00 (igual ao
  `precoUnitario` do 1.1); `nomeFornecedor`; `numeroControlePNCPCompra`. É daqui que sai a coluna F
  ("Anulada/Revogada") do mapa da DLOG.
- `GET /modulo-contratacoes/3.1_consultarResultadoItensContratacoes_PNCP_14133_Id`: resultado
  homologado por fornecedor (`valorUnitarioHomologado`, `situacaoCompraItemResultadoNome`,
  `motivoCancelamento`, `dataCancelamentoPncp`).

### 1.5 Listagem de contratações (índice em lote) — `GET /modulo-contratacoes/1_consultarContratacoes_PNCP_14133`

Obrigatórios: `dataPublicacaoPncpInicial`, `dataPublicacaoPncpFinal` e **`codigoModalidade`**.
Devolve `idCompra` + `numeroControlePNCP`, então o índice `idCompra → nº de controle` pode ser
montado mês a mês e modalidade a modalidade (caminho do extrator para classes inteiras, seção 13
do prompt).

### 1.6 Itens de contratações por CATMAT — `GET /modulo-contratacoes/2_consultarItensContratacoes_PNCP_14133`

Obrigatórios: `dataInclusaoPncpInicial`, `dataInclusaoPncpFinal`. Filtros: `codItemCatalogo`,
`materialOuServico`, `situacaoCompraItem`, `temResultado`, `codFornecedor`, `codigoPdm`. Mesmos
campos do 1.4, com `idCompraItem` (22 dígitos) e `numeroControlePNCPCompra`.

### 1.7 Atas de registro de preços

- `GET /modulo-arp/2_consultarARPItem`: obrigatórios `dataVigenciaInicialMin`/`Max`; filtro
  `codigoItem` (CATMAT). Confirmado com 410020: 20 itens de ata com vigência iniciada nos últimos 12
  meses. Uma janela de 653 dias **não** deu erro, mas o painel usa no máximo 365 dias. Campos:
  `numeroAtaRegistroPreco`, `codigoUnidadeGerenciadora`, `nomeUnidadeGerenciadora`, `numeroCompra`,
  `anoCompra`, `numeroItem` ("00122"), `valorUnitario`, `niFornecedor`,
  `nomeRazaoSocialFornecedor`, `dataAssinatura`, `dataVigenciaInicial`/`Final`, `idCompra`,
  `numeroControlePncpCompra`, **`numeroControlePncpAta`**, `itemExcluido`.
  O preço da ata pode diferir do preço do Painel de Preços para a mesma compra (ex.: 90262/2026
  item 3: R$ 179,21 na ata e R$ 225,00 no 1.1).
- `GET /modulo-arp/1.1_consultarARP_Id?numeroControlePncpAta=…`: cabeçalho da ata, **com os links
  oficiais** `linkAtaPNCP` (`https://pncp.gov.br/app/atas/00394429000100/2026/617/14`) e
  `linkCompraPNCP` (`https://pncp.gov.br/app/editais/00394429000100/2026/000617`), `statusAta`,
  `ataExcluido`.

### 1.8 Contratos — `GET /modulo-contratos/1.1_consultarContratos_Id`

`tipo` = `idCompra` ou `numeroControlePncpContrato`. Para 90041/2026, `totalRegistros: 0` em 18,5 s
(endpoint lento). Fica opcional.

### 1.9 Catálogo — `GET /modulo-material/4_consultarItemMaterial?codigoItem=<CATMAT>`

Resolve CATMAT ausente do catálogo local. Ex.: **640532 (eplontersena) não está em `CatmatItem`**,
mas o catálogo oficial o devolve (PDM 30458, ativo).

## 2. BPS — `https://apidadosabertos.saude.gov.br/economia-da-saude/bps`

- Caminho **sem** `/v1` (com `/v1` → 404 em HTML).
- `codigoCatmat` **sem zeros à esquerda** (`0410020` → `{"bps": []}`).
- `dataCompraInicio`/`dataCompraFim` em `YYYY-MM-DD`; outro formato → 400 com
  `{"message": {"dataCompraInicio": "time data '11/08/2025' does not match format '%Y-%m-%d'"}}`.
- `pagina`, `tamanhoPagina` (até 500). Resposta `{ "bps": [...] }`, **sem total**: paginar até a
  página curta.
- Campos (confirmado): `anoCompra`, `nomeInstituicao`, `cnpjInstituicao`, `municipio`, `estado`,
  `dataCompra`, `dataInsercao`, `codigoCatmat`, `descricaoItem`, `unidadeFornecimento`, `generico`,
  `registroAnvisa`, `modalidade` (nome: "Pregão", "Registro de Preços", "Dispensa de Licitação"),
  `tipoCompra` ("ADMINISTRATIVA"/"JUDICIAL"), `capacidade`, `unidadeMedidaCapacidade`,
  `cnpjFornecedor`, `nomeFornecedor`, `cnpjFabricante`, `nomeFabricante`, `quantidade`,
  `precoUnitario`, `precoTotal`, `siglaUnidadeMedida`, `codigoClasse`, `nomeClasse`, `codigoGrupo`,
  `nomeGrupo`, `numeroProcessoCompra`, `esfera`, `numeroAta`, `validadeCompra` (meses),
  `codigoPdm`, `nomePdm`, `observacoes`.
- `numeroProcessoCompra` e `numeroAta` são texto livre de cada instituição ("2025/3852",
  "90001/2025", "01987122025007826755"; ata "208/2025", "SIM", "188").

## 3. PNCP — página pública

O site `https://pncp.gov.br/app/...` é uma SPA: qualquer rota devolve a mesma página e só o
JavaScript sabe se o registro existe. Os formatos abaixo vêm dos próprios links que a API devolve
(`linkCompraPNCP`, `linkAtaPNCP`) e a API do PNCP aceita o sequencial com ou sem zeros
(`/api/consulta/v1/orgaos/{cnpj}/compras/2026/617` e `/000617` → 200):

- Contratação: `https://pncp.gov.br/app/editais/{cnpj}/{ano}/{sequencial}`
- Ata: `https://pncp.gov.br/app/atas/{cnpj}/{ano}/{sequencial}/{sequencialAta}`

**Pendente de conferência manual no navegador** (abrir 5 links antes do merge do D4).

## 4. IBGE/SIDRA — IPCA

`GET https://apisidra.ibge.gov.br/values/t/1737/n1/all/v/2266/p/<AAAAMM>` respondeu 200. Os ids da
tabela 1737 (2266 = número-índice; 63 = variação mensal) são confirmados pelo
`scripts/import_ipca.py` na primeira carga.
