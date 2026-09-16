# Operacao do DJUD Painel

## Desenvolvimento e Pull Requests

1. Atualize a `main` e crie uma branch com nome descritivo, por exemplo `feat/filtro-por-uf`.
2. Desenvolva e rode localmente `npm ci`, `npm run lint`, `npx tsc --noEmit` e `npm run build`.
3. Nunca envie arquivos `.env`, senhas, dumps SQL, arquivos da pasta `uploads` ou bases com dados pessoais para o Git.
4. Abra um Pull Request para `main`, descrevendo objetivo, telas afetadas, impacto nos dados e como testar.
5. Aguarde os checks automáticos do GitHub Actions: TypeScript, ESLint, Prisma e build do Next.js.
6. Um revisor aprova a regra de negocio e a experiencia da tela. Depois do merge, a AWS publica a versao automaticamente.

## Publicacao na AWS

A AWS consulta a branch `main` a cada 15 minutos. Quando encontra um commit novo, ela compila a aplicacao, recria somente o container `djud-painel` e verifica a tela de login.

Se a verificacao falhar, a imagem anterior volta automaticamente. Alteracoes em `prisma/schema.prisma` nao sao publicadas por esse fluxo: elas exigem migracao de banco revisada, backup e validacao de dados.

## Configuracao recomendada no GitHub

Um administrador do repositorio deve proteger a branch `main` em `Settings > Branches`:

- exigir Pull Request antes de merge;
- exigir pelo menos uma aprovacao;
- exigir que os checks `TypeScript`, `ESLint` e `Next.js Build` passem;
- impedir push direto na `main`.

Os checks sao automaticos. A revisao humana continua necessaria para avaliar regra de negocio, seguranca e impacto nos dados.

## Reversao

O atualizador guarda a imagem anterior. Em caso de falha durante uma publicacao, ele retorna automaticamente. Para reverter uma funcionalidade ja publicada e saudavel, crie um novo Pull Request que reverta o commit ou publique uma correcao.
