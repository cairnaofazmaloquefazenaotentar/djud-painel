# Pendências — DJUD Painel

Atualizado em 15/10/2026. O que falta decidir, configurar, conferir ou construir. Os itens
resolvidos vão para o histórico, no fim.

---

## 1. Decisões em aberto

### Dimensionamento para ARP (decisões A1 a A5 da `spec/relatorios-risco-arp.md`)

São as decisões do relatório de **Ata de Registro de Preços**. Não confundir com os itens A1–A6 da
Frente A do prompt da DLOG, que tratam de filtros. O relatório só começa depois delas.

| Id | Pergunta | Sugestão |
|----|----------|----------|
| A1 | A "Qtd Entregue" do SISMAT está na unidade de fornecimento do CATMAT (comprimido, frasco-ampola)? Se não estiver, converte-se pela quantidade da embalagem do registro ANVISA. | Conferir uma entrega de item conhecido. |
| A2 | Saídas do SISMAT sem código de material (22,5%) | Decidida na spec: ficam fora da conta, e a cobertura vai impressa. |
| A3 | Abater as devoluções ("DEMANDA JUDICIAL - Devolução") do consumo? | Sim, no mês da devolução, mostrando as duas séries. |
| A4 | Método da projeção de 12 meses: (a) média dos últimos 12 meses × 12; (b) tendência linear sobre 24 meses; (c) por paciente (demandas ativas contínuas × consumo médio por paciente). | Mostrar os três e escolher um, com justificativa. |
| A5 | Margem de segurança sobre a quantidade projetada (%) | Informada pelo responsável, padrão 0%, sempre impressa. |

### Com a DLOG

- **P10 — mês da compra na correção pelo IPCA.** Decidido: o IPCA atualiza o **valor do registro
  de compra**, da data da compra até o último índice publicado, e **nunca o PMVG**. Falta confirmar
  um detalhe: se a variação do próprio mês da compra entra na conta. A planilha da DLOG inclui esse
  mês; o painel começa no mês seguinte, com fator = índice do mês-base ÷ índice do mês da compra.
- **P11 — método do preço adotado.** Mediana das medianas por fonte (padrão do painel) ou o
  critério da DLOG (menor entre a média e a mediana do conjunto único). Hoje a escolha é por item.
- **P12 — regra do teto.** Menor PMVG (padrão do painel) ou PMVG do medicamento de referência
  (critério da DLOG). A alíquota já está decidida: filtro da pesquisa, padrão 17%.

---

## 2. A construir

- **PMVG na data da compra em cada registro da busca** (pedido de out/2026; **ainda não existe**).
  Hoje a tela mostra só o teto da lista CMED escolhida. A ideia é que cada registro de compra
  (Compras.gov.br, BPS e atas) mostre ao lado o PMVG unitário do item na lista CMED vigente na data
  da compra, na mesma alíquota do teto. Assim dá para ver se o preço pago estava acima do teto da
  época.
  - **Como:** a competência de cada registro é o mês da compra. Uma consulta por mês distinto da
    amostra em `CmedVigencia` × `CmedPrecoVersao`, pelos registros ANVISA do item. O PMVG unitário
    usa a mesma regra do teto (menor ou referência) e o Qt_Embal.
  - **Atenção:** esse PMVG é só informativo e não entra no cálculo. O IPCA continua sem tocar no
    PMVG. As listas mensais começam em jan/2020; compra anterior fica "sem lista CMED da época".
- **Relatório de Análise de Risco e Prazos**: especificado (seção 2 da spec), com R1–R4 decididos.
- **Relatório de Dimensionamento para ARP**: depois de A1–A5.
- **Resto da seção 7 do prompt CMED mensal**:
  - P7: registros com preço "Liberado" listados, fora do teto;
  - P8: alerta de Qt_Embal suspeito no registro que forma o teto;
  - P9: regra do catálogo CATMAT;
  - remover a tabela `PrecoCmed` e a rota legada depois de validar as listas mensais em produção.

---

## 3. Configuração — variáveis de URL dos links externos

Os números (Nº SEI, Nº do processo e Nº DJUD) têm sempre o botão de copiar. O link aparece quando
há um modelo de URL, em que `{valor}` é trocado pelo número.

| Variável | Situação | Modelo |
|----------|----------|--------|
| `NEXT_PUBLIC_URL_SEI` | **Já configurado no código** com o padrão do Ministério; a variável só serve para trocar. | `https://sei.saude.gov.br/sei/#{valor}` (ex.: `…/sei/#25000.155049/2026-77`) |
| `NEXT_PUBLIC_URL_PROCESSO` | Falta definir. A consulta processual muda por tribunal; sem a variável, só o botão de copiar. | ex.: `https://<consulta>/…?numero={valor}` |
| `NEXT_PUBLIC_URL_REDMINE` | Falta definir. O Redmine é temporário e será substituído. | `https://<servidor-redmine>/issues/{valor}` |

Onde configurar: Vercel → projeto → Settings → Environment Variables (Production), e depois um
novo deploy. As variáveis `NEXT_PUBLIC_*` entram no build.

---

## 4. Conferências

- **Depois do deploy:** abrir 5 links "contratação no PNCP" da pesquisa do 410020 e confirmar que
  cada um abre a compra certa (mesmo número, UASG e item).
- **Depois do deploy:** abrir um mapa XLSX no Excel e no LibreOffice e confirmar que não aparece
  aviso de reparo.
- **Feito em 15/10/2026:** mapa gerado × planilha original da DLOG (`conferir_mapa_dlog.py
  --modelo`). Estrutura, cabeçalhos e fórmulas sem erro. Diferenças intencionais: método e preço
  adotado por fórmula (no original, digitados), preços da CMED como número e Qt_Embal em coluna
  própria. Larguras de coluna e a posição do bloco da aba CMED (uma linha acima) diferem do
  original.

---

## 5. Antes do deploy em produção (o merge na `main` publica)

Da raiz do repositório, com o ambiente Python ativo (ver `docs/ATUALIZACAO_DE_DADOS.md`):

```bash
cd ~/Desktop/djud-painel
source ~/.venvs/djud-painel/bin/activate
python scripts/create_dadosabertos_tables.py --dry-run
python scripts/create_dadosabertos_tables.py --confirm
python scripts/alter_cesta_dlog.py --dry-run
python scripts/alter_cesta_dlog.py --confirm
python scripts/import_ipca.py --dry-run
python scripts/import_ipca.py --confirm
python scripts/alter_demanda_busca.py --dry-run --redmine baseRedmine_20260827.xlsx
python scripts/alter_demanda_busca.py --confirm --redmine baseRedmine_20260827.xlsx
python scripts/enriquecer_demandas.py --dry-run --relatorio cobertura.csv
python scripts/enriquecer_demandas.py --confirm
```

Não usar `prisma db push` em produção. Ele também aplicaria diferenças antigas do schema
(`sismat.SiafiPagamento` e um índice de `SismatEntrada`), que não fazem parte desta entrega.

---

## 6. Problemas que já existem no `main` (CI)

- `npm run lint`: 9 erros em arquivos não alterados (`demandas/[id]/edit`, `demandas/lixeira`,
  `help`, `login`, `autores-timeline-chart`).
- `npm run tokens:check`: o `globals.css` está fora de sincronia com `design-system/tokens.ts`.

---

## Histórico (decidido)

- **Lista CMED do relatório:** a última publicada até a data de referência; na tela, outra lista
  serve só para consulta.
- **Alíquota ICMS do teto:** filtro da pesquisa, padrão 17%, nas duas regras do teto. Produto isento
  de ICMS entra com o PMVG a 0%.
- **IPCA:** atualiza o valor do registro de compra, nunca o PMVG. Só falta o detalhe do mês da
  compra (P10).
- **Links do SEI:** `https://sei.saude.gov.br/sei/#{NUP}`.
- **Risco e Prazos:**
  - R1: o prazo é o `Novo Prazo` quando preenchido; senão, o `Prazo de Resposta`.
  - R2: sem retrato diário (o Redmine é temporário); o tempo na situação continua aproximado.
  - R3: as prioridades ficam como estão no Redmine, sem faixas novas, e o indicador do Dashboard
    não muda.
  - R4: rodar o `alter_demanda_busca.py --redmine` (seção 5).
