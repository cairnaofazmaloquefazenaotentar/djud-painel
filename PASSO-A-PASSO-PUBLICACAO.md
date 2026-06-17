# Passo a passo — publicar as mudanças e ver tudo online

Há **duas frentes**. A de **código** põe no ar as novas abas, o funil e os reordenamentos. A de **dados** faz os gráficos de valor e a série histórica funcionarem de verdade (e prepara o fornecedor). Para ver **tudo** funcionando, as duas precisam acontecer.

## Pré-requisitos
- Node 20+, repositório clonado, e os 11 arquivos desta entrega já aplicados (cópia direta ou `git apply alteracoes.patch`).
- A `DATABASE_URL` do banco de **produção (Neon)** à mão.
- O arquivo `baseRedmine_17-03-2026.xlsx`.

---

## Etapa 0 — Testar local (recomendado, opcional)
```bash
npm install
npx prisma generate
npm run lint && npm run build      # valida tipos e build (localmente o Prisma gera normalmente)
npm run dev                        # http://localhost:3000 (se quiser ver antes de publicar)
```

## Etapa 1 — Código no ar (Vercel)
```bash
git checkout -b painel-diretor
git add -A
git commit -m "Painel DJUD: aba Valores, serie por tribunal, funil de gargalos, rankings por valor e scaffold de fornecedor"
git push origin painel-diretor
```
Abra o Pull Request para `main` e faça o merge (ou faça push direto em `main`, se preferir). O push em `main` dispara automaticamente:
- **CI** (`.github/workflows/ci.yml`): typecheck → lint → build. Passa normalmente — o `prisma generate` roda no CI, então os erros de tipo que aparecem **só localmente** (cliente Prisma não gerado no sandbox) **não ocorrem lá**.
- **Deploy** (`.github/workflows/deploy.yml`): publica em produção na Vercel.

Ao fim desta etapa o site **já mostra**: abas renomeadas ("Processos", "Valores"), o funil de gargalos e os rankings com o maior em cima. As abas/gráficos de **valor** ainda aparecem vazios — isso é resolvido nas Etapas 2 e 3.

## Etapa 2 — Criar a coluna nova no banco (Neon)
O novo campo `fornecedor` precisa existir no banco. Com a `DATABASE_URL` de produção (rode num terminal local apontando para o Neon):
```bash
DATABASE_URL="postgresql://...SEU_NEON..." npx prisma db push
```
Cria a coluna `fornecedor` e o índice **sem apagar dados**.

## Etapa 3 — Reimportar a base (popular valores, datas e fornecedor)
A importação usa `skipDuplicates`, ou seja, **não atualiza** linhas já existentes. Para aplicar os novos campos (valor, data real de criação, fornecedor), a base precisa ser recarregada.

> ⚠️ Faça num horário de baixa utilização. Como o painel é apenas leitura analítica sobre os dados importados do Redmine, recarregar a tabela `Demanda` é seguro **se não houver anexos nem edições manuais** feitos dentro do painel. Se houver, faça backup antes.

```bash
# 1) (opcional) valida sem gravar
EXCEL_PATH="/caminho/baseRedmine_17-03-2026.xlsx" \
DATABASE_URL="postgresql://...SEU_NEON..." \
npx tsx scripts/import-excel-demandas.ts --dry-run

# 2) limpar a tabela Demanda — escolha UMA forma:
#    a) Prisma Studio:  DATABASE_URL="..." npx prisma studio   (apagar via interface)
#    b) SQL no Neon (cascateia para Attachment):
#       TRUNCATE TABLE "Attachment", "Demanda" RESTART IDENTITY CASCADE;

# 3) importar de fato
EXCEL_PATH="/caminho/baseRedmine_17-03-2026.xlsx" \
DATABASE_URL="postgresql://...SEU_NEON..." \
npx tsx scripts/import-excel-demandas.ts --confirm
```

**Sobre o fornecedor:** o importador já procura as colunas `Fornecedor`, `Laboratório`, `Empresa`, `Fabricante`, `Detentor do Registro`. Se a sua exportação usar outro nome, ajuste essa lista (uma linha) em `scripts/import-excel-demandas.ts`. Enquanto a planilha não trouxer essa coluna, o gráfico de fornecedor mostra o estado-vazio — **sem erro**.

## Etapa 4 — Conferir online
Abra `https://djud-painel.vercel.app/` e valide:
- **Valores** (1ª aba): série histórica de R$ preenchida.
- **Processos**: série por tribunal ao longo do tempo, com meses reais.
- **Dimensionamento**: top 15 por valor preenchido; maior em cima nos rankings; card de fornecedor (gráfico ou estado-vazio).
- **Riscos**: funil de gargalos na ordem do fluxo (entrada no topo → conclusão embaixo).

> O endpoint de métricas tem cache de 60s. Se algo não atualizar na hora, aguarde ~1 minuto e recarregue.

---

## Resumo da dependência

| Para ver… | Precisa de… |
|---|---|
| Abas renomeadas, funil, rankings ordenados | Etapa 1 (deploy) |
| Série histórica com meses reais e por tribunal | Etapa 1 + Etapa 3 (reimport) |
| Gráficos de valor (total, por tribunal, top 15 por R$) | Etapa 1 + Etapa 3 |
| Fornecedor populado | Etapa 1 + 2 + 3 **e** a coluna existir na planilha |

## Se algo falhar
- **CI vermelho no typecheck:** confirme que o passo de `prisma generate` rodou no CI (ele roda no job de build). Os erros de `Prisma.sql` só acontecem sem o cliente gerado.
- **Valores continuam zerados após deploy:** você ainda não fez a Etapa 3 (reimport), ou importou sem limpar a tabela (o `skipDuplicates` ignorou as linhas já existentes).
- **Série histórica num único mês:** sinal de base antiga (sem o `created_on` mapeado). Reimporte (Etapa 3).
- **"column fornecedor does not exist":** rode a Etapa 2 (`prisma db push`) antes de reimportar. Mesmo sem ela, o painel não quebra — a consulta de fornecedor é resiliente.
