# Alterações no Painel DJUD — Necessidades do Diretor

Pasta com **exatamente os arquivos que você precisa alterar** no repositório `djud-painel`.
A estrutura de pastas espelha a do repositório: basta sobrescrever os arquivos de mesmo caminho.
Há também `alteracoes.patch` (um `git diff` unificado) para aplicar via `git apply`,
e `PASSO-A-PASSO-PUBLICACAO.md` com o roteiro completo para colocar tudo online.

## Arquivos (11)

Modificados (7):
```
prisma/schema.prisma
scripts/import-excel-demandas.ts
lib/metrics.ts
app/(auth)/dashboard/page.tsx
components/dashboard/charts/top-medicamentos-chart.tsx
components/dashboard/charts/objeto-acao-chart.tsx
components/dashboard/charts/status-chart.tsx
```
Novos (4):
```
components/dashboard/charts/tribunal-timeline-chart.tsx
components/dashboard/charts/valor-timeline-chart.tsx
components/dashboard/charts/top-medicamentos-valor-chart.tsx
components/dashboard/charts/fornecedor-chart.tsx
```

## Como aplicar
**Opção A — substituir os arquivos:** copie cada arquivo para o mesmo caminho no repositório.
**Opção B — patch:** na raiz do repo (árvore limpa), `git apply --whitespace=nowarn alteracoes.patch`.

Depois rode `npm run lint` e `npm run build` para validar.

## ⚠️ Passos obrigatórios para os dados (resumo — detalhe no PASSO-A-PASSO)
1. `npx prisma db push` (com a `DATABASE_URL` de produção) — cria a coluna `fornecedor`.
2. Reimportar a base (`scripts/import-excel-demandas.ts --confirm`) — popula valor, data real e fornecedor.
   Limpe a tabela `Demanda` antes (o import usa `skipDuplicates` e não atualiza linhas existentes).

---

## O que cada requisito virou

| Item | Pedido | Arquivo(s) | Situação |
|------|--------|-----------|----------|
| 1 | Renomear aba "Tendência" → "Processos" | `app/(auth)/dashboard/page.tsx` | ✅ Feito |
| 1.1 | 2º gráfico: volume por **tribunal** ao longo do tempo (empilhado) | `tribunal-timeline-chart.tsx` (novo), `lib/metrics.ts` (`tribunalTimeline`), `page.tsx` | ✅ Feito |
| 2 | Série histórica de **valores** por mês, decomposta por tribunal | `valor-timeline-chart.tsx` (novo), `tribunal-timeline-chart.tsx`, `lib/metrics.ts` (`valorTimeline`, `valorTribunalTimeline`), `page.tsx` | ⚠️ Total ok; por-tribunal vazio até a base ter TRF nas linhas de valor (Bloqueio B) |
| 2.1 | Aba "Valores" separada, **primeira** (à esquerda) | `app/(auth)/dashboard/page.tsx` | ✅ Feito |
| 3 | Top 15 princípios ativos: **maior em cima** | `top-medicamentos-chart.tsx` | ✅ Feito |
| 3.1 | Gráfico adicional: top 15 por **valor total** | `top-medicamentos-valor-chart.tsx` (novo), `lib/metrics.ts` (`topMedicamentosValor`), `page.tsx` | ⚠️ Depende da reimportação (Bloqueio A) |
| 3.2 | Volume por **fornecedor** do medicamento | `prisma/schema.prisma`, `scripts/import-excel-demandas.ts`, `lib/metrics.ts` (`fornecedorDistribution`), `fornecedor-chart.tsx` (novo), `page.tsx` | 🟡 **Encaminhado** — código pronto; popula quando a planilha trouxer a coluna (Bloqueio C) |
| 3.3 | "Por Objeto da Ação": **maior em cima** | `objeto-acao-chart.tsx` | ✅ Feito |
| 4 | "Gargalos por Status" → **funil** na ordem do fluxo | `status-chart.tsx` (reescrito), `lib/metrics.ts` (`FLUXO_DJUD`) | ✅ Feito |

---

## Detalhe por arquivo

**`prisma/schema.prisma`** — adicionado o campo `fornecedor String?` ao modelo `Demanda` + `@@index([fornecedor])`. (Requer `prisma db push` para criar a coluna no banco.)

**`scripts/import-excel-demandas.ts`**
- Helper `parseValorBR` ("5.551.031,41" → `5551031.41`).
- Mapeia `valorEstimado` ← "Valor do Depósito (em reais)".
- Mapeia `criadoEm` ← `created_on` (antes caía no default `now()`, colapsando a série temporal num único mês).
- Mapeia `fornecedor` ← primeira coluna encontrada entre `Fornecedor`/`Laboratório`/`Empresa`/`Fabricante`/`Detentor do Registro` (ajuste o nome se a sua exportação usar outro).

**`lib/metrics.ts`**
- 5 novos campos em `MetricsData`: `tribunalTimeline`, `valorTimeline`, `valorTribunalTimeline`, `topMedicamentosValor`, `fornecedorDistribution`.
- Constante `FLUXO_DJUD` (13 etapas) — `statusDistribution` agora vem ordenado pelo fluxo (alimenta o funil).
- Novas consultas `$queryRaw` (série por tribunal, valor por mês, valor por tribunal/mês, top 15 por valor). TRF filtrado para 1..6.
- Consulta de `fornecedor` em SQL bruto **dentro de try/catch e fora do `Promise.all`**: se a coluna ainda não existir, retorna lista vazia sem derrubar as demais métricas.

**`status-chart.tsx`** — reescrito de barras para **funil** (`FunnelChart`), 1ª etapa no topo; largura = volume parado (hoje o ponto mais largo é "Em Análise COAJUD").

**`top-medicamentos-chart.tsx` / `objeto-acao-chart.tsx`** — removido o `.reverse()`: o maior fica no topo.

**Novos componentes** — `tribunal-timeline-chart.tsx` (área empilhada por TRF, genérico p/ volume e valor), `valor-timeline-chart.tsx` (série de valor total; exporta `fmtBRLCompacto`), `top-medicamentos-valor-chart.tsx` (top 15 por R$), `fornecedor-chart.tsx` (ranking por fornecedor, com estado-vazio).

**`app/(auth)/dashboard/page.tsx`** — aba "Valores" (1ª), aba "Processos" (ex-"Tendência") com gráfico por tribunal, top 15 por valor e o card de fornecedor na Dimensionamento, funil em largura total na aba Riscos.

---

## Os três pontos que dependem da base (não do código)

**A — Valores precisam ser reimportados.** `valorEstimado` nunca era carregado; corrigi o importador, mas nada de valor aparece até reimportar. Depois: valor total ≈ R$ 3,34 bi e o card de valor (hoje oculto) aparece sozinho.

**B — "Valor por tribunal" fica vazio com a base atual.** As 3.929 linhas com valor (Cumprimento de Ordem Judicial) não têm `TRF Região` nem `Data de Entrada` preenchidos. A série de valor total funciona; a decomposição por tribunal já está codada e se popula quando o TRF for preenchido nessas demandas.

**C — Fornecedor: código pronto, dado ainda inexistente.** Não há coluna de fornecedor nas 120 colunas atuais (só CNPJ, em 38 linhas). Toda a cadeia (schema → importador → métrica → gráfico → UI) está pronta; basta a exportação do Redmine passar a incluir a coluna e reimportar.

---

## Observação sobre tipos (TypeScript)
Erros locais em `lib/metrics.ts` do tipo *"Property 'sql' does not exist on type 'typeof Prisma'"* são só porque o cliente Prisma não foi gerado. `npx prisma generate` (ou `npm run build`) resolve. Esses padrões já existiam no arquivo original e o CI gera o cliente automaticamente.
