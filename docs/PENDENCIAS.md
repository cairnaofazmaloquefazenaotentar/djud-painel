# Pendências registradas (backlog)

Itens identificados e diagnosticados, **sem implementação programada**. Cada um traz a causa e a
correção proposta, para que possa ser retomado sem refazer a investigação. Ao implementar um item,
remova-o daqui no mesmo PR.

---

## P-001 — Botão "Nova Demanda" não funciona (aba Demandas)

- **Registrado em:** 15/10/2026, na reunião de validação com a DLOG.
- **Situação:** registrado para correção futura. **Não faz parte** do
  `PROMPT_avaliacao_DLOG_melhorias.md` nem do adendo 1.

**Causa**

- A rota `/demandas/new` **não existe**, nem no histórico do git.
- O botão "Nova Demanda" (`app/(auth)/demandas/page.tsx:711` e `:895`) e o atalho Ctrl+N
  (`components/keyboard-shortcuts-provider.tsx:48-51`) caem em `app/(auth)/demandas/[id]/page.tsx`
  com `id = "new"`, que procura uma demanda inexistente.
- `POST /api/demandas` (`app/api/demandas/route.ts`) existe e funciona. Falta só a página.

**Risco a resolver junto**

O importador do Redmine é REPLACE e roda `DELETE FROM "Demanda"`
(`scripts/import_redmine_base.py:690`). Uma demanda criada à mão no painel **seria apagada na
próxima carga**.

**Antes de implementar: decidir com o usuário**

- **Demandas manuais fazem sentido?** Se todo cadastro nasce no Redmine, a correção é **retirar o
  botão e o atalho**, e mais nada.
- **Se fizerem sentido:**
  1. Criar a coluna `origemCadastro` (`REDMINE | MANUAL`, padrão `REDMINE`), com DDL em script
     Python (`ADD COLUMN IF NOT EXISTS` + backfill) e o modelo Prisma atualizado.
  2. Fazer o importador apagar **só** `WHERE "origemCadastro" = 'REDMINE'`.
  3. Numerar a demanda manual como `MAN-AAAA-NNNNN` (sequência própria), porque `numero` é único e o
     Redmine usa números puros.
  4. Criar a página `app/(auth)/demandas/new/page.tsx`, com o formulário da edição extraído para um
     componente comum. Ela chama `POST /api/demandas` e redireciona para o detalhe. Exige
     `demandas:write`.

**Aceite**

- Criar uma demanda manual e rodar a carga do Redmine em `--dry-run`: a demanda manual não entra na
  contagem de exclusão.
- Ctrl+N abre o formulário.
