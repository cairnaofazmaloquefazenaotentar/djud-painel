# Atualizacao de Dados do DJUD Painel

## Entrega pela equipe

Os arquivos devem ser enviados ao SFTPGo para `compartilhado/djud-painel/entrada/<tipo>/`, sempre junto de um `manifest.json`. Cada entrega representa uma competencia ou lote completo e deve usar UTF-8, CSV separado por virgula, datas em `YYYY-MM-DD` e decimais com ponto.

Os tres conjuntos aceitos sao:

| Tipo | Arquivo | Finalidade |
| --- | --- | --- |
| Demandas | `demandas.csv` | Atualiza processos, autores, status e atributos judiciais. |
| Saidas SISMAT | `sismat-saidas.csv` | Atualiza movimentacoes e o cruzamento com Redmine pelo numero SEI no destinatario. |
| Precos | `precos.csv` | Atualiza referencias de preco, identificando a fonte em cada linha. |

Modelos completos estao em `docs/modelos-carga/`.

## Regras obrigatorias

- Nao substituir arquivos de uma carga ja enviada; envie um novo diretorio com data e versao.
- O `manifest.json` deve informar origem, periodo de referencia, quantidade de linhas e SHA-256 de cada arquivo.
- Chaves naturais devem ser estaveis: `numero` em demandas, combinacao de identificadores de origem no SISMAT e codigo/origem para precos.
- Campos ausentes devem ficar vazios. Nao usar `0`, `N/A` ou `Nao informado` em campos textuais sem orientacao do dicionario.
- Dados pessoais devem ficar apenas no SFTPGo e no banco interno; nunca no GitHub.

## Publicacao da carga

O upload nao publica dados diretamente no painel. O importador deve validar colunas, tipos, totais e duplicidades em banco temporario. A publicacao ocorre somente depois de backup e validacao, com registro de data, arquivo, usuario e quantidade de linhas.

Enquanto o importador automatizado nao estiver instalado, a equipe responsavel deve avisar que a carga foi enviada para que a validacao e a importacao controlada sejam executadas.

## Exportacao do Redmine

- Exportar sempre com **Status: todos** (abertos e fechados). A planilha de 17/03/2026 trazia os 17 status em uso.
- "Cessar Atos" **nao e status** do Redmine: e valor do campo **Ponto de Controle** (e aparece tambem em "Situacao Gestao"). No painel ele e filtrado como ponto de controle, nao como status (diagnostico em `docs/diagnostico-dlog-2026-10.md`).

## Pesquisa de Precos — bases, coletas e ordem

Tabelas novas (uma vez por ambiente, revisar o `--dry-run` antes do `--confirm`):

```bash
python scripts/create_dadosabertos_tables.py --dry-run
python scripts/create_dadosabertos_tables.py --confirm   # DadosAbertosPreco, DadosAbertosColeta, PncpVinculo
```

Ordem de atualizacao:

1. Catalogo e registros: `import_catmat_classes.py` e `import_cmed_registros.py` (REPLACE). CATMAT novo que ainda nao esta na planilha pode ser buscado na tela ("Buscar o CATMAT no catalogo oficial").
2. Listas CMED mensais: `import_cmed_mensal.py`.
3. Dados abertos, um CATMAT por vez: botao "Coletar dados abertos" na Pesquisa de Precos (Compras.gov.br, BPS e atas, nessa ordem) e depois "Vincular ao PNCP". A coleta vale 7 dias; os relatorios nunca coletam.
4. Classes inteiras: rodar o Extrator-CATMAT-DA na maquina do usuario **com `--sem-descricao-bps`** (a descricao do relatorio tem de ser a do proprio registro) e carregar:

```bash
python scripts/import_extrator_da.py --arquivo dados_completos_extraidos_part1.xlsx --integridade Relatorio_Integridade.xlsx --dry-run
python scripts/import_extrator_da.py --arquivo dados_completos_extraidos_part1.xlsx --integridade Relatorio_Integridade.xlsx --confirm
```

A coleta pelo painel e a carga do extrator gravam as mesmas chaves (`COMPRASGOV:<chave de 22 digitos>`, `BPS:<sha1>`): recarregar atualiza a linha sem mudar o id, e as exclusoes da curadoria continuam valendo.

Antes de mexer em `lib/dados-abertos/` ou quando a coleta acusar "contrato da API alterado":

```bash
python scripts/probe_dados_abertos.py          # sai com 1 se algum campo da API mudou
python scripts/dados_abertos_mapear.py --autoteste
npx tsx scripts/conferir-mapear-dados-abertos.ts
```

Limite do Compras.gov.br: ~100 consultas por minuto por IP de saida, somando todos os modulos e todos os usuarios. O painel fica abaixo de 90/min por instancia e, num 429, a tela espera o `Retry-After`. Coletas simultaneas de varios usuarios dividem a mesma cota.
