# Relatórios de Risco e Prazos e de Dimensionamento para ARP — especificação

**Frente C da avaliação da DLOG (out/2026).** Ordem de entrega (P14): Panorama Executivo
(entregue) → **Análise de Risco e Prazos** → **Dimensionamento para ARP**. As datas de entrega
são do usuário e ficam em branco na seção 5 — esta especificação não estima prazos.

Números de produção citados abaixo: consulta somente leitura de 15/10/2026 (58.946 demandas fora
da lixeira).

---

## 1. Regras comuns (as mesmas do Panorama Executivo)

- **Mesmo recorte da lista e do Dashboard:** `lerFiltroDemandas` → `aplicarFiltro` →
  `whereDemandas`/`sqlDemandas(a, "d")`, lixeira fora. Os totais de cada relatório têm de bater
  com os do Dashboard sob os mesmos filtros (critério de aceite de cada um).
- **Rota** `GET /api/relatorios/<risco|arp>?format=html|csv&<filtros>`, HTML imprimível e CSV
  pt-BR (`;`, vírgula decimal, BOM) com a moldura de `lib/metrics-export.ts`
  (`documentoHTML`, `tabelaRecorte`, `csvDeBlocos`).
- **Trilha:** `AuditLog` (EXPORT, com o SHA-256 do arquivo) e `RelatorioGerado` com os tipos
  `RISCO` e `ARP`, já previstos em `TipoRelatorio` e no schema.
- **Montagem pura** (`lib/relatorio-risco.ts`, `lib/relatorio-arp.ts`) separada das consultas,
  como em `lib/relatorio-executivo.ts`: o cálculo fica testável sem banco.
- Toda aproximação vai **escrita no próprio documento**, ao lado do número que ela afeta.
- O card da página Relatórios só sai de "Em breve" quando a rota existir.

---

## 2. Análise de Risco e Prazos

### 2.1 A pergunta

Quais demandas do passivo ativo estão envelhecendo, paradas, desabastecidas ou com risco de
pagamento/entrega indevidos, e onde estão (situação, prioridade, medicamento, UF)?

### 2.2 Dados disponíveis

| Dado | Origem | Cobertura em produção |
|------|--------|-----------------------|
| Entrada no DJUD | `Demanda.dataEntradaDJUD` | 50.898 de 58.946; no passivo ativo, 8.043 de 52.614 sem a data |
| Criação / última atualização | `criadoEm` (`created_on`), `atualizadoEm` (`updated_on`) do Redmine | todas |
| Situação no Redmine | `Demanda.status` | todas |
| Ponto de Controle (Cessar Atos) | `Demanda.pontoControle` | 8.716 com "Cessar Atos" (diagnóstico 3.1) |
| Prioridade | `Demanda.prioridade` | todas — ver R3 |
| Abastecimento | `sismat.RedmineSeiAtributos.statusAbastecimento`, por NUP | 44.629 NUPs: Desabastecido 3.491 · Abastecido 4.820 · Não Informado 26.452 · vazio 9.866 |
| Modalidade de tratamento | `RedmineSeiAtributos.modalidadeTratamento`, por NUP | Contínuo 13.951 · Único 2.094 · vazio 28.584 |
| Prazo | `Demanda.dataVencimento` | **0** — não é importado (R1) |
| Histórico de situação | — | **não existe** (R2) |

### 2.3 Lacunas e decisões do usuário

- **R1 — Prazo.** A planilha do Redmine tem `due_date`, `Prazo de Resposta` e `Novo Prazo`;
  nenhuma é importada. Decidir qual é o prazo a controlar e se `Novo Prazo`, quando preenchido,
  prevalece. Implementação: o importador grava em `dataVencimento` (a coluna já existe) e o
  relatório ganha a seção 8 (vencidas e a vencer). **Sem essa decisão, o relatório sai sem prazos**
  — mostra envelhecimento, não vencimento.
- **R2 — Tempo na situação.** Sem histórico, a única medida é *hoje − `atualizadoEm`*. Como o
  `updated_on` do Redmine muda com qualquer edição (comentário, anexo), o número é um **piso**: a
  demanda está na situação atual há *pelo menos* esse tempo. O relatório diz isso com essas
  palavras. Para medir de verdade, duas opções (decisão):
  (a) o importador grava um retrato diário `(demandaId, status, pontoControle, data)` — mede dali
  em diante; (b) importar o histórico de alterações das issues pela API do Redmine
  (`include=journals`) — mede o passado, depende de acesso à API.
- **R3 — Prioridade.** O vocabulário do Redmine é de rito e prazo, não de criticidade: "Alta"
  cobre **56.828 das 58.946** demandas (96,4%); o resto é "Intimação Pessoal (DJUD)" 1.167,
  "(SE)" 281, "(Outro Órgão)" 48, "Ministro(a)" 27, "Administrativas com Prazo" 232, "sem Prazo"
  184, "Urgente (Até 5 dias)" 94, "Urgente Procuradoria da União" 46 e "Imediato (Até 48 Horas)"
  39. O critério atual de "Demandas críticas" do Dashboard (Alta + Crítica) abrange quase a base
  inteira. Proposta de faixas para este relatório: **Imediato/Urgente** (48 h e 5 dias, AGU) →
  **Intimação pessoal** → **Administrativa com prazo** → **Alta** → **Administrativa sem prazo**.
  Mudar o KPI do Dashboard e do Panorama é decisão à parte (mudaria números já emitidos).
- **R4 — Cruzamento por NUP.** Abastecimento e modalidade vêm por NUP. A Demanda passa a ter
  `nupSei` com `scripts/alter_demanda_busca.py --redmine` (ainda **não rodado em produção**). Sem
  NUP, a demanda entra como "não cruzada", contada à parte — nunca somada a "Não Informado".

### 2.4 Conteúdo

1. **Recorte e emissão** (como no Panorama).
2. **Envelhecimento do passivo ativo** (não concluídas, `STATUS_RESOLVIDOS`): idade desde a
   entrada no DJUD — 0–30 dias, 31–90, 91–180, 181–365, 1–2 anos, mais de 2 anos — por situação
   no Redmine. Sem `dataEntradaDJUD`, usa `criadoEm` e marca a linha ("idade pela criação").
3. **Sem atualização** (R2): as mesmas faixas sobre *hoje − `atualizadoEm`*, por situação, e as
   50 demandas há mais tempo sem atualização.
4. **Prioridade × idade**: matriz com as faixas de R3 nas linhas e as de idade nas colunas.
5. **Desabastecidas**: passivo ativo com "Desabastecido", por princípio ativo e UF; total de
   "não cruzadas" ao lado.
6. **Tratamento contínuo**: passivo ativo com modalidade "Contínuo" por princípio ativo e
   apresentação (A5) — é a base do Dimensionamento para ARP.
7. **Cessar Atos ainda não concluídas**: Ponto de Controle com "Cessar Atos" × situação ≠
   Concluída — risco de entrega ou depósito depois da ordem de cessar.
8. **Prazos** (só depois de R1): vencidas, a vencer em 7, 15 e 30 dias, por situação.
9. **Lista de ação** — as demandas que caem em 3, 5, 7 ou 8: Nº DJUD, Nº SEI, medicamento,
   situação, prioridade, idade, última atualização, abastecimento. CSV completo; HTML com as 50
   primeiras por idade.
10. **Notas**: as aproximações de R2 e o cruzamento por NUP (R4).

### 2.5 Aceite

- Soma das faixas de idade = passivo ativo do Dashboard (mesmo recorte).
- Desabastecido + Abastecido + Não Informado + vazio + não cruzadas = passivo ativo.
- Cessar Atos (todas as situações) = KPI "Cessar Atos" do Dashboard.
- O texto de R2 aparece junto da seção 3 e nas notas.

---

## 3. Dimensionamento para ARP

### 3.1 A pergunta

Que quantidade registrar em ata para os próximos 12 meses, por apresentação (CATMAT), e quanto
isso custa ao preço de referência da Pesquisa de Preços?

### 3.2 Dados disponíveis

| Dado | Origem | Observação |
|------|--------|------------|
| Entregas | `sismat.SismatSaida`: `qtdEntregue`, `materialCodigo` ("BR0" + CATMAT), `dtBaixa` (mensal) | 43.550 linhas, 77,5% com código, nov/2018 → jun/2026. Aquisição: 42.010 linhas, 5.953.539 unidades; Devolução: 1.540 linhas, 224.026 unidades |
| Pacientes atendidos | `destinatario` da saída (autor + NUP) | contagem de destinatários distintos por mês, sem expor nome |
| Demandas da apresentação | `Demanda.catmatsDerivados` (A5) e a substância (grupos de `lib/demandas-filtro.ts`) | apresentação exata × mesma substância sem apresentação identificada |
| Modalidade | `RedmineSeiAtributos.modalidadeTratamento` por NUP | Contínuo × Único (R4 vale aqui também) |
| Preço | Pesquisa de Preços (`pesquisarPrecos`) | o preço adotado do item; nunca inventado |

### 3.3 Lacunas e decisões do usuário

- **A1 — Unidade.** `qtdEntregue` está na unidade do SISMAT. Confirmar que é a unidade de
  fornecimento do CATMAT (comprimido, frasco-ampola…); se não for, converter por `qtEmbalagem`
  do registro ANVISA, com a conversão impressa.
- **A2 — Saídas sem código** (22,5%). Na v1, só o código exato entra na conta e a cobertura é
  impressa ("x% das saídas da substância não têm código e ficaram fora"). Cruzar por nome e
  concentração fica para depois, se a cobertura incomodar.
- **A3 — Devoluções.** Abater as devoluções ("DEMANDA JUDICIAL - Devolução") do consumo? Proposta:
  abater no mês da devolução e mostrar as duas séries.
- **A4 — Método de projeção** (decisão; a tela de hoje promete "tendência linear"). A v1 mostra
  três lado a lado, com a fórmula: (a) **média dos últimos 12 meses × 12**; (b) **tendência
  linear** por mínimos quadrados sobre 24 meses, com piso zero; (c) **por paciente**: demandas
  ativas contínuas × consumo mensal médio por paciente × 12. O usuário escolhe um, e a escolha vai
  para o documento com a justificativa.
- **A5 — Margem de segurança**: parâmetro informado pelo usuário (padrão 0%), sempre impresso.
- **A6 — Saldo de ata vigente**: a API de atas não informa saldo — fora do escopo; o relatório
  lista as atas encontradas na Pesquisa de Preços só como referência.

### 3.4 Conteúdo

1. **Recorte**: CATMAT (ou registro ANVISA), unidade, UF opcional e período de consumo (24 ou 36
   meses).
2. **Consumo histórico mensal**: quantidade entregue, devolvida e líquida; destinatários
   distintos; cobertura de código (A2).
3. **Demandas da apresentação**: ativas exatas, ativas da mesma substância sem apresentação
   identificada, contínuas × únicas.
4. **Projeção para 12 meses**: os três métodos de A4, com fórmula, parâmetros e o resultado.
5. **Quantidade sugerida** = projeção escolhida × (1 + margem), arredondada para cima.
6. **Valor estimado** = quantidade × preço adotado da Pesquisa de Preços na data da emissão;
   sem preço, a linha fica "a pesquisar".
7. **"Levar para a cesta"**: inclui o item na cesta (`codigo` + `unidade`, UF nula) com a
   quantidade sugerida (`POST /api/precos/cesta`); o mapa comparativo XLSX (Frente E) sai com essa
   quantidade.

### 3.5 Aceite

- Soma do consumo = soma das saídas do material no Dashboard de Saídas, mesmo período.
- A quantidade sugerida é reproduzível pela fórmula impressa.
- "Levar para a cesta" cria (ou soma) o item com a quantidade sugerida.

---

## 4. Decisões pendentes (resumo)

| Id | Decisão | Bloqueia |
|----|---------|----------|
| R1 | Coluna de prazo (`due_date`, `Prazo de Resposta` ou `Novo Prazo`) e precedência | seção 8 do Risco |
| R2 | Medir o tempo na situação: retrato diário ou histórico do Redmine | precisão da seção 3 (sem bloquear: sai como piso) |
| R3 | Faixas de prioridade; se o KPI "críticas" do Dashboard muda | matriz da seção 4 |
| R4 | Rodar `alter_demanda_busca.py --redmine` em produção (`nupSei`) | seções 5–7 do Risco e 3 do ARP |
| A1 | Unidade do SISMAT = unidade de fornecimento? | ARP inteiro |
| A3 | Abater devoluções | consumo líquido |
| A4 | Método de projeção | quantidade sugerida |
| A5 | Margem de segurança | quantidade sugerida |

---

## 5. Ordem e datas (P14)

| Etapa | Depende de | Data prevista |
|-------|------------|---------------|
| Panorama Executivo | — | entregue |
| Análise de Risco e Prazos (seções 1–7, 9, 10) | R3, R4 | *a definir pelo usuário* |
| Seção 8 do Risco (prazos) | R1 | *a definir pelo usuário* |
| Dimensionamento para ARP | A1, A3, A4, A5, R4 | *a definir pelo usuário* |
