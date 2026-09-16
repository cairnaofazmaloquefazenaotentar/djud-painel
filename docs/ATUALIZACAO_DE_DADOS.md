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
