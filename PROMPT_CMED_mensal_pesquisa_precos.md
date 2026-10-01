# PROMPT — Tabelas CMED mensais (jan/2017 → atual) na Pesquisa de Preços do DJUD Painel

> **Como usar:** cole este texto inteiro numa sessão nova do Claude Code aberta no repositório
> `djud-painel`. Antes de colar, revise o bloco **0. Parâmetros a confirmar** (é o único trecho que
> talvez você queira editar). As planilhas **não** vão para o repositório: a carga roda localmente,
> apontando o script para a pasta onde elas estão.

---

## Sua tarefa

1. Criar o importador das **listas mensais da CMED** (planilhas `NNN.mmm.aa.xlsx`, de `001.jan.17` em
   diante) para o banco Neon, guardando **todas as competências** e **todas as alíquotas de ICMS**.
2. Corrigir e endurecer o importador da **Grande Padrão** (vínculo Registro ANVISA × CATMAT).
3. Na aba **Pesquisa de Preço** (`/pesquisa-preco`), acrescentar em **"Mais filtros"** os filtros
   **Mês de Competência** e **Alíquota ICMS**, que passam a definir de qual tabela CMED e de qual coluna
   de alíquota sai o teto PMVG.
4. Propagar competência e alíquota para o relatório IN 65/2021, para a cesta e para a documentação.

Trabalhe em incrementos pequenos e verificáveis, na ordem das seções 5 → 6 → 7. Não pule a seção 9
(verificação).

---

## 0. Parâmetros a confirmar (decisões de negócio já assumidas como padrão)

| # | Decisão | Padrão adotado neste prompt |
|---|---------|-----------------------------|
| P1 | Alíquota padrão do teto | **"Sem impostos"** quando a competência publicar essa coluna; senão **"0%"** (preserva o comportamento atual, que usa `pmvgSemImpostos`). |
| P2 | Competência padrão | A **mais recente** carregada. |
| P3 | Alcance do filtro de competência | Recorta **só a CMED** (teto). BPS, SIASG e PNCP continuam considerando todo o período. |
| P4 | Produto isento de ICMS (a lista só publica 0%) | Se a alíquota escolhida vier vazia e a de 0% existir, **usar 0% e sinalizar** "isento de ICMS". |
| P5 | Cesta de itens | **Gravar** competência e alíquota em cada item; o relatório da cesta reusa os dois. |
| P6 | Tabela legada `PrecoCmed` | **Manter** até validar a nova estrutura; remoção só em PR separado. |
| P7 | Registros com preço "Liberado" | Listados no painel e no relatório, **fora** do cálculo do teto. |
| P8 | Regra do teto | Mantém o **menor PMVG unitário**, mas com **alerta** de provável erro de Qt_Embal (sem exclusão automática; a curadoria já permite excluir com justificativa). |
| P9 | Catálogo de referência para CATMAT | Arquivo **"CATMATs e PDMs 11/07"** (133.353 itens). **Nenhuma descrição/sugestão de CATMAT pode vir de fora da coluna `codigoItem` desse arquivo.** Confirme com o usuário se `CatmatItem` no banco deve ser recarregado com ele. |

Se algum item acima não valer, pare e pergunte antes de implementar a parte afetada.

---

## 1. Contexto de negócio (leia antes de modelar)

- A CMED publica todo mês a **Lista de Preços de Medicamentos**, com dois tetos para compras públicas:
  - **PF — Preço Fábrica**: teto geral.
  - **PMVG — Preço Máximo de Venda ao Governo** = PF × (1 − CAP). Obrigatório para produtos marcados
    **CAP** e para **qualquer compra por decisão judicial**. O DJUD compra por decisão judicial, então
    **o PMVG é o teto de referência para todas as apresentações**, não só para as marcadas CAP.
- O **CAP muda ao longo dos anos** (18% em 2017, Comunicado CMED nº 6/2016). Hoje o código tem
  "21,53%" fixo no texto de observação: isso vira dado da competência (derivado da própria lista).
- Os preços vêm **por embalagem** e **por alíquota de ICMS**: 0%, 12%, 17%, 17,5%, 18%, 20% (2017) e,
  em listas mais novas, 19%, 19,5%, 20,5%, 21%, 22%, 22,5%, 23%, versões **ALC** (Área de Livre
  Comércio) e a coluna **"Sem impostos"**. O conjunto de colunas **varia entre competências**.
- **Isentos de ICMS** (Convênios CONFAZ 87/02 e 140/01, laboratórios oficiais): a lista publica
  **apenas a coluna 0%**.
- **"Liberado"** (Res. CMED nº 5/2003): a célula de PF 0% traz o texto `Liberado` e não há preço.
- Em 2017, linhas com **CAP = Sim não publicam PF** (só PMVG).
- **Não derive alíquotas por fórmula.** Na lista de jan/17, `PF(t) = PF0 / (1 − t)` diverge do valor
  publicado em 28% das células, e as colunas ALC diferem da alíquota "cheia" em 5.791 linhas. Grave
  sempre o valor publicado.

---

## 2. Onde está o código hoje (leia estes arquivos primeiro)

**Branch:** main

Arquivos centrais:

| Arquivo | Papel |
|---------|-------|
| `prisma/schema.prisma` | `PrecoCmed` (1 foto, sem competência), `CmedRegistro`, `CatmatItem`, `CestaItem` |
| `lib/pesquisa-preco.ts` | `resolverItem`, `sugerirMateriais`, `mapearUnidades`, `pesquisarPrecos` (teto = `cmed.pmvgUnitMin`) |
| `lib/pesquisa-preco-filtros.ts` | Módulo **puro** dos filtros opcionais (importado pela página client) |
| `lib/pesquisa-preco-curadoria.ts` | Estatística, IQR, exclusões justificadas |
| `lib/relatorio-pesquisa-preco.ts` | HTML do relatório (seção CMED em `conteudoCmed`) |
| `app/(auth)/pesquisa-preco/page.tsx` | Tela; "Mais filtros" com Fornecedor/Fabricante/CNPJ; `CmedPanel`; `RecomendacaoPanel` |
| `hooks/usePesquisaPreco.ts` | `useItemPesquisa`, `usePesquisaPrecos` (queryKey + params) |
| `app/api/precos/buscar/route.ts` | GET/POST da pesquisa |
| `app/api/precos/catmat/[codigo]/route.ts` | Item + unidades (conta registros CMED com preço) |
| `app/api/precos/cmed/route.ts` | Listagem legada de `PrecoCmed` |
| `app/api/relatorios/pesquisa-preco/route.ts`, `app/api/relatorios/cesta/route.ts`, `app/api/precos/cesta/*` | Relatórios e cesta (chamam `pesquisarPrecos`) |
| `lib/demandas-catmat.ts` | Também usa `resolverItem` (filtro CATMAT das demandas) |
| `scripts/import_cmed_registros.py` | Carga da Grande Padrão → `CmedRegistro` |
| `scripts/import_catmat_classes.py` | Carga do catálogo → `CatmatItem` |
| `scripts/precos_norm.py` | Espelho Python de `normalizarTexto`/`normalizarUnidade` |
| `scripts/create_cesta_table.py` | Padrão de DDL em Python idêntica ao `prisma db push` |
| `lib/pmvg-metrics.ts` | `PMVG_COLS`: precedente de array de preços alinhado a uma lista fixa de alíquotas |
| `lib/data-version.ts`, `app/api/fontes/route.ts` | Cache por versão do dado; página de fontes |

**Convenções do projeto a respeitar:** a máquina de trabalho **não tem node**; tabelas novas são
criadas por scripts Python com **a mesma DDL que o `prisma db push` geraria** (e o modelo Prisma é
atualizado junto). Carga via `psycopg` + `COPY`, modos `--dry-run`/`--confirm`, `DATABASE_URL` lido de
`.env.local` por `load_database_url()` de `scripts/import_redmine_base.py`. Tipos/helpers usados pela
página client ficam em módulo puro (sem Prisma). Comentários e mensagens em português.

**Fluxo atual de associação Registro × CATMAT (para entender o que muda):**
`CATMAT → CmedRegistro(catmat) → filtra por unidadeNorm escolhida → PrecoCmed(registro) →
pmvgSemImpostos ÷ qtEmbalagem → teto = menor valor`. Pesquisa por registro usa o próprio registro.

---

## 3. Arquivos de entrada (layouts documentados na análise de 30/09/2026)

### 3.1 Listas mensais CMED — `NNN.mmm.aa.xlsx` (ex.: `001.jan.17.xlsx` … `116.ago.26.xlsx`)

- `NNN` = sequência a partir de jan/2017 → **validar** `NNN == (ano − 2017) × 12 + mês`. A aba tem o
  mesmo nome (`jan.17`). A competência sai do **nome do arquivo**.
- Layout de jan/17 (versão "limpa" pelo usuário — as notas da CMED foram para um .docx à parte):
  - Linhas 1–4 vazias, exceto **D1 = contagem de linhas** (24.939). **Cabeçalho na linha 5, coluna D.**
  - Colunas: `PRINCÍPIO ATIVO, CNPJ, LABORATÓRIO, CÓDIGO GGREM, REGISTRO, EAN, PRODUTO, APRESENTAÇÃO,
    CLASSE TERAPÊUTICA, PF 0%, PF 12%, PF 17%, PF 17% ALC, PF 17,5%, PF 17,5% ALC, PF 18%, PF 18% ALC,
    PF 20%, PMVG 0% … PMVG 20%, RESTRIÇÃO HOSPITALAR, CAP, CONFAZ 87, ANÁLISE RECURSAL`.
  - `PF 0%` e `PMVG 0%` vêm como **texto com vírgula** (`"1383,38"`); as demais como número.
    `REGISTRO` vem como inteiro de 13 dígitos; `EAN` e `GGREM` como texto.
- O layout **muda ao longo dos anos** (a partir de abr/17 aparece `COMERCIALIZAÇÃO 2016`; listas
  recentes trazem `SUBSTÂNCIA`, `EAN 1/2/3`, `TIPO DE PRODUTO (STATUS DO PRODUTO)`, `REGIME DE PREÇO`,
  `ICMS 0%`, `TARJA`, `PF/PMVG Sem Impostos` e as alíquotas 19%–23% com ALC). **Peça ao usuário
  amostras de épocas diferentes** (sugestão: uma de 2017, 2019, 2020, 2023, 2024 e a mais recente) e
  rode o `--dry-run` nelas antes da carga completa. O importador tem de ser **dirigido pelo cabeçalho**,
  nunca por posição de coluna.

### 3.2 Grande Padrão — `01. CMED - grande.padrão - de jan.17 a ago.26.xlsx`

- Aba única. **Linhas 1–3 são contadores; cabeçalho na linha 5, colunas D–Q**:
  `nº, Registro, Gen., ICMS, CATMAT, Descrição, Unidade de\nfornecimento, Qt_Embal, xxx, Substância,
  Produto, Apresentação, CNPJ, Fabricante`.
- 51.151 registros, **0 duplicados**, 2 com tamanho ≠ 13 (`112363418`, `57600510011`).
- `CATMAT`: 48.967 numéricos (4.086 códigos distintos — **todos presentes no catálogo 11/07**),
  1.461 `"Não tem"`, 715 vazios, 7 `"Fora"`, 1 `"NÃO SERA CRIADO (JUSTIF. CATMAT)"`.
- `Qt_Embal`: `"—"` em 1.471 linhas, vazio em 720.
- `Descrição` é a descrição do catálogo **sem os rótulos de atributo** (igual em 94,7% dos CATMATs; o
  resto está desatualizado). Portanto **a descrição exibida deve vir sempre de `CatmatItem`**.
- ⚠️ O `import_cmed_registros.py` atual lê o cabeçalho na **linha 1** (`next(rows)`) e **aborta** com
  este arquivo. Corrigir (seção 6).

### 3.3 Vigência — `vigência..cmed...jan.17 a ago.26.xlsx`

- Linha 3 = nº da planilha, linha 4 = mês (`jan`…), linha 5 = ano (2 dígitos); dados a partir da linha
  6: coluna A = registro, B = total de meses, C em diante = `"V"` quando vigente. O cabeçalho vai até
  dez/26, mas há dados só até **ago/26 (116 meses)**.
- 51.153 registros, **3.023.218** marcas `V`; 22–30 mil registros por mês; **8.069 registros saem e
  voltam** (lacunas).
- Serve **só como conferência**: depois da carga, a vigência é derivável do banco. Jan/17 = 24.935.

### 3.4 Catálogo CATMAT — `CATMATs e PDMs 11_07.xlsx`

- Aba `Catmats` (primeira aba), cabeçalho na linha 1: `codigoGrupo, nomeGrupo, codigoClasse,
  nomeClasse, codigoPdm, nomePdm, codigoItem, descricaoItem, codigoNcm, aplicaMargemPreferencia,
  dataHoraAtualizacao`. 133.353 itens, `codigoItem` único. Compatível com `import_catmat_classes.py`
  (as duas colunas extras são ignoradas; a aba `PDMs` também).
- **Regra do usuário:** nenhuma descrição ou sugestão de CATMAT pode vir de código fora da coluna
  `codigoItem` deste arquivo.

### 3.5 Textos originais — `textos_CMED_original.docx` (opcional)

- Para cada planilha (`001.jan.17`, `002.fev.17`…), o cabeçalho original da lista com a **data de
  publicação** (ex.: jan/17 → 23/01/2017) e as notas. Se o usuário fornecer o .docx completo, extraia
  `dataPublicacao` (parágrafo `^\d{3}\.[a-z]{3}\.\d{2}$` seguido da primeira data `dd/mm/aaaa`).

---

## 4. Modelo de dados (Neon)

### 4.1 Por que não uma linha por registro × mês com todas as colunas

São ~3,0 milhões de pares registro × competência. Uma tabela "larga" com textos e até 26 pares
PF/PMVG por linha passaria de 1,5–2 GB. Mas o preço de um registro muda pouco (reajuste anual em
abril, mudanças de CAP e de alíquotas), então a mesma combinação de valores se repete por muitos
meses. Guardamos **versões de preço deduplicadas** + uma **matriz de vigência** enxuta (é exatamente
a planilha de vigência, agora apontando para o preço). Estimativa: ~0,5–0,8 GB no total — o script
tem de **medir e imprimir** o tamanho real (`pg_total_relation_size`) ao final de cada lote.

### 4.2 Lista canônica de alíquotas (append-only)

Crie `lib/cmed-aliquotas.ts` (**módulo puro**, sem Prisma) e o espelho `scripts/cmed_layout.py`:

```ts
// Ordem = posição no array JSON gravado no banco. NUNCA reordenar nem remover;
// alíquota nova entra no FIM (e nos dois arquivos, TS e Python).
export const ALIQUOTAS_ICMS = [
  "SEM_IMPOSTOS", "0", "12", "12_ALC", "17", "17_ALC", "17,5", "17,5_ALC", "18", "18_ALC",
  "19", "19_ALC", "19,5", "19,5_ALC", "20", "20_ALC", "20,5", "20,5_ALC", "21", "21_ALC",
  "22", "22_ALC", "22,5", "22,5_ALC", "23", "23_ALC",
] as const;
export type CodigoAliquota = (typeof ALIQUOTAS_ICMS)[number];
export function rotuloAliquota(c: CodigoAliquota): string  // "Sem impostos", "0%", "17,5% ALC"…
export function aliquotaPadrao(disponiveis: readonly string[]): CodigoAliquota // P1
export function rotuloCompetencia(iso: string): string       // "2017-01" → "jan/2017"
```

Ordem de exibição na tela: "Sem impostos", depois numérica crescente, cada ALC logo após a cheia.

### 4.3 Modelos Prisma (schema `public`) — e DDL idêntica no script Python

```prisma
/// Uma lista mensal CMED carregada (uma linha por competência).
model CmedCompetencia {
  competencia      DateTime  @id @db.Date      // 1º dia do mês
  sequencia        Int       @unique           // NNN do arquivo (001 = jan/2017)
  dataPublicacao   DateTime? @db.Date
  arquivo          String
  sha256           String
  linhas           Int                         // linhas de dados lidas
  registros        Int                         // registros distintos vigentes
  aliquotas        String[]                    // códigos de ALIQUOTAS_ICMS presentes na lista
  capPercentual    Float?                      // mediana de (1 − PMVG 0% / PF 0%) × 100
  colunasOriginais Json                        // cabeçalho bruto → campo (auditoria de layout)
  importadoEm      DateTime  @default(now())
  @@schema("public")
}

/// Versão de preço de uma apresentação. Deduplicada por hash do conteúdo:
/// todos os meses com os mesmos valores apontam para a mesma versão.
model CmedPrecoVersao {
  id                  Int      @id @default(autoincrement())
  hash                String   @unique       // sha1 do conteúdo canônico (tudo menos a competência)
  registro            String                 // só dígitos; normalmente 13
  codigoGgrem         String?
  ean                 String[]
  substancia          String?
  cnpj                String?
  laboratorio         String?
  produto             String?
  apresentacao        String?  @db.Text
  classeTerapeutica   String?
  tipoProduto         String?
  regimePreco         String?
  tarja               String?
  comercializacao     String?
  restricaoHospitalar Boolean?
  cap                 Boolean?
  confaz87            Boolean?
  icms0               Boolean?
  analiseRecursal     Boolean?
  precoLiberado       Boolean  @default(false)
  pf                  Json                   // (number|null)[] alinhado a ALIQUOTAS_ICMS
  pmvg                Json                   // idem
  extras              Json?                  // colunas não mapeadas, preservadas
  criadoEm            DateTime @default(now())
  vigencias           CmedVigencia[]
  @@index([registro])
  @@schema("public")
}

/// Matriz de vigência: versão de preço em vigor em cada competência.
model CmedVigencia {
  competencia DateTime        @db.Date
  versaoId    Int
  versao      CmedPrecoVersao @relation(fields: [versaoId], references: [id], onDelete: Cascade)
  @@id([competencia, versaoId])
  @@index([versaoId])
  @@schema("public")
}
```

- `pf`/`pmvg` em **Json** (e não `Float[]`): o Prisma não dá suporte a `NULL` dentro de listas escalares, e o
  projeto já usa esse padrão em `SismatPmvg.pmvgPrecos`.
- Gere a DDL a partir do schema onde houver node
  (`npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`) e copie
  para o script — assim o `db:push` posterior é no-op.
- `CmedRegistro` (Grande Padrão) continua sendo a dimensão estática registro → CATMAT/unidade/Qt_Embal.
  Acrescente a coluna `statusCatmat TEXT` (seção 6).

---

## 5. Script novo — `scripts/import_cmed_mensal.py`

### 5.1 Interface

```
python scripts/import_cmed_mensal.py --dir "C:\...\CMED mensais" --dry-run
python scripts/import_cmed_mensal.py --dir "..." --confirm                 # todos os NNN.mmm.aa.xlsx, em ordem
python scripts/import_cmed_mensal.py --file "001.jan.17.xlsx" --confirm     # um arquivo
python scripts/import_cmed_mensal.py --dir "..." --somente 001-012 --confirm
python scripts/import_cmed_mensal.py --dir "..." --vigencia "vigência..cmed...xlsx" --dry-run  # confere contagens
python scripts/import_cmed_mensal.py --textos "textos_CMED_original.docx" ...  # opcional: dataPublicacao
python scripts/import_cmed_mensal.py --limpar-orfas --confirm               # apaga versões sem vigência
```

- Semântica **REPLACE por competência** (idempotente): recarregar um mês substitui só aquele mês.
- Um arquivo por transação; falha num arquivo não desfaz os anteriores; relatório final por arquivo.
- Sem `--dry-run`/`--confirm` → erro (mesmo padrão dos outros importadores).

### 5.2 Leitura (regras já validadas em protótipo sobre `001.jan.17.xlsx`)

```python
def chave(h):  # sem acento, maiúsculas, espaços colapsados
    return re.sub(r"\s+", " ", sem_acentos(h or "").upper()).strip()

RE_PRECO = re.compile(r"^(PF|PMVG)\s*(SEM IMPOSTOS|(\d+(?:[.,]\d+)?)\s*%)\s*(ALC)?$")
# código = "SEM_IMPOSTOS" ou "17,5" (+ "_ALC"); código fora de ALIQUOTAS_ICMS → ABORTA o arquivo
# pedindo para acrescentar a alíquota ao fim da lista (TS + Python).

TEXTO = {  # cabeçalho normalizado → campo (ampliar conforme as amostras de outras épocas)
  "PRINCIPIO ATIVO": "substancia", "SUBSTANCIA": "substancia", "CNPJ": "cnpj",
  "LABORATORIO": "laboratorio", "CODIGO GGREM": "codigoGgrem", "REGISTRO": "registro",
  "EAN": "ean1", "EAN 1": "ean1", "EAN 2": "ean2", "EAN 3": "ean3", "PRODUTO": "produto",
  "APRESENTACAO": "apresentacao", "CLASSE TERAPEUTICA": "classeTerapeutica",
  "RESTRICAO HOSPITALAR": "restricaoHospitalar", "CAP": "cap", "CONFAZ 87": "confaz87",
  "ICMS 0%": "icms0", "ANALISE RECURSAL": "analiseRecursal", "TARJA": "tarja",
  "REGIME DE PRECO": "regimePreco", "TIPO DE PRODUTO (STATUS DO PRODUTO)": "tipoProduto",
}  # "COMERCIALIZACAO ..." (qualquer ano) → comercializacao; o resto → extras (e listar no relatório)
```

- **Cabeçalho:** procurar nas primeiras 80 linhas a linha que contém `REGISTRO` **e** ao menos uma
  coluna `PF`/`PMVG`. Guardar o cabeçalho bruto em `colunasOriginais`.
- **Valores de preço:** número → `round(v, 2)`; texto `"1.234,56"`/`"1383,38"` → decimal; `"-"`, `"—"`,
  vazio → `null`; `"Liberado"` → `precoLiberado = true` e preços `null`; qualquer outro texto → `null` +
  contador `valor_invalido` (listar exemplos).
- **Booleanos:** `Sim/S` → true, `Não/N` → false, resto → null.
- **Registro:** só dígitos. Sem dígitos (ex.: `"SI/NC"`, "PROCEDIMENTO MEDICO TABELADO") → descartar e
  listar. Tamanho ≠ 13 → **manter** (a vigência também os conta) e listar no relatório.
- **Duplicatas no mesmo mês**, chave (registro, GGREM):
  - idênticas → descartar a repetida;
  - diferem só em booleanos/textos → mesclar (OR nos booleanos, primeiro não vazio nos textos) e listar
    (caso real: WILFACTIN `1630700060028`, 4 linhas que só divergem em ANÁLISE RECURSAL);
  - diferem em preço → manter as duas versões e listar como **CONFLITO**.
- **CAP da competência:** mediana de `1 − PMVG0/PF0` nas linhas com os dois valores → `capPercentual`.
- **Hash da versão:** `sha1` do JSON canônico (`sort_keys=True`, preços com 2 casas) de todos os campos
  da versão.

### 5.3 Gravação

1. `CREATE TABLE IF NOT EXISTS` das três tabelas (DDL da seção 4.3).
2. `COPY` das linhas do mês para uma tabela temporária `tmp_cmed (hash, …campos…)`.
3. `INSERT INTO "CmedPrecoVersao" (...) SELECT DISTINCT ON (hash) ... FROM tmp_cmed ON CONFLICT (hash) DO NOTHING`.
4. `DELETE FROM "CmedVigencia" WHERE competencia = $1`, depois
   `INSERT INTO "CmedVigencia" SELECT $1, v.id FROM tmp_cmed t JOIN "CmedPrecoVersao" v USING (hash)`.
5. Upsert em `CmedCompetencia`.
6. `COMMIT`. `--limpar-orfas` apaga versões sem nenhuma vigência.

### 5.4 Relatório por arquivo (imprimir; e `--saida relatorio.csv` opcional)

linhas lidas · registros distintos · alíquotas presentes · colunas não mapeadas · liberados ·
"só 0% publicado" · CAP = Sim sem PF · valores inválidos · registros ≠ 13 dígitos · duplicatas
(idênticas/mescladas/conflito) · CAP derivado · versões novas × reaproveitadas · tamanho das tabelas.
Com `--vigencia`: diferença simétrica entre os registros carregados e as marcas `V` da competência
(**tem de ser zero**; se não for, listar).

### 5.5 Critério de aceite com `001.jan.17.xlsx` (valores medidos na análise)

| Medida | Esperado |
|--------|----------|
| Linhas de dados | 24.939 |
| Descartadas sem registro | 1 (`SI/NC`) |
| Registros distintos | **24.935** (= vigência jan/17; diferença simétrica 0) |
| Duplicatas | WILFACTIN `1630700060028`: 4 linhas → 1 (mescladas) |
| Alíquotas presentes | `0, 12, 17, 17_ALC, 17,5, 17,5_ALC, 18, 18_ALC, 20` (sem "Sem impostos") |
| `precoLiberado` | 1.214 |
| Só coluna 0% publicada | ~3.077 (inclui os 2.320 com CONFAZ 87 = Sim) |
| CAP = Sim sem PF | 1.692 |
| CAP derivado | **18,0%** |
| Exemplo | ORENCIA 250 MG, reg. `1018003900019`: só PF 0% = 1383,38 e PMVG 0% = 1134,37; CONFAZ 87 = Sim |

---

## 6. Ajustes no `scripts/import_cmed_registros.py` (Grande Padrão)

1. **Detecção do cabeçalho**: procurar nas primeiras 20 linhas a que contém `Registro`, `CATMAT` e
   `Qt_Embal` (hoje está na linha 5, a partir da coluna D). Manter o mapeamento por nome.
2. **`statusCatmat`** (coluna nova em `CmedRegistro`, também no Prisma): `VINCULADO` (numérico),
   `NAO_TEM` ("Não tem"), `FORA` ("Fora"), `NAO_SERA_CRIADO` (justificativa), `PENDENTE` (vazio).
   Hoje tudo isso vira `catmat = NULL` e se perde a diferença entre "decidido que não tem" e "backlog":
   dos 715 vazios, 712 estão vigentes em ago/26 e 460 entraram na lista em ago/26.
3. **Validação contra o catálogo:** CATMAT numérico ausente de `CatmatItem` → manter o código, mas
   listar no relatório; em tempo de consulta ele é tratado como "sem CATMAT" (seção 7.3).
4. **`--relatorio revisao.xlsx`**: gerar a planilha de revisão com as verificações abaixo (a análise
   de 30/09/2026 já entregou uma versão: `revisao_grande_padrao.xlsx`). A Grande Padrão continua
   sendo **manual**: o script **não** grava sugestões no banco; a equipe corrige a planilha e recarrega.

| Verificação | Regra | Achado em 30/09/2026 |
|-------------|-------|----------------------|
| **Qt_Embal × gramatura do blister** | `(PVDC\|PVC/PVDC\|PE/PVDC\|ACLAR\|PCTFE) N (TRANS\|OPC\|INC\|AMB\|LEIT\|BCO…) … X M` e `Qt_Embal == N × M` | **95 registros** (47 vigentes) com Qt_Embal 40–120× maior. Ex.: CITALOPRAM 20 MG (CATMAT 272903), reg. `1256802720130` "…PVDC 40 TRANS X 30" com Qt_Embal 1200. Como o teto é o **menor** PMVG unitário, esse registro passa a ditar o teto. |
| Qt_Embal × apresentação | apresentação simples com um único `X N` e sem multiplicador (`CT 3 BL`, `CX 50`, `DISP`, `CART`, `EST`) e Qt_Embal ≠ N | 85 fortes suspeitos (ex.: "X 200" com Qt_Embal 4). Inferência geral concorda com a planilha em 96,9% |
| Dose CATMAT × apresentação | sólidos de princípio ativo único, mesma unidade (MG/MCG/UI/G), valores diferentes | 101 (parte é equivalência de sal legítima) |
| Forma | unidade COMPRIMIDO com apresentação `CAP` (e vice-versa) | 39 |
| Mesma apresentação, CATMATs diferentes | agrupar pela assinatura (abaixo) | 243 assinaturas / 518 linhas |
| Registro inválido / ausente | tamanho ≠ 13; registro presente na lista mensal mas ausente da Grande Padrão | 2 + 2 (CITROPLEX `1046500060010`, `1046500060029`) |
| Erros de princípio ativo confirmados | — | ex.: LEMBOREXANTE (DAYVIGO) `1731000070025` → CATMAT de LENALIDOMIDA; HOLMES H (olmesartana + HCTZ) → CATMATs de propranolol e de telmisartana |

5. **Sugestões de CATMAT (para os registros sem vínculo)** — sempre **restritas a `codigoItem` do
   catálogo** e exibindo a `descricaoItem` do catálogo:
   - **Por gêmeo (confiável):** assinatura = ingredientes normalizados (sem acento, maiúsculas,
     separados por `;`, ordenados) + `" | "` + trecho inicial da apresentação até o 1º marcador de
     embalagem `\b(CT|CX|EMB|DISPLAY|FR|FRS|BL|ENV|AMP|FA|SER|BG|BOLS|SACH|POT|TB|GL|STR|KIT|CART)\b`,
     normalizando `\s*/\s*`→`/`, `1,0`→`1`, `10 MG`→`10MG`. Se registros já vinculados têm a mesma
     assinatura, sugerir o CATMAT majoritário. **Teste retroativo: acerta 98,0%** dos vínculos
     existentes (cobre 92,7% deles). Hoje: 591 registros sem CATMAT têm gêmeo, 571 com sugestão única
     (532 dos 715 vazios). 36 estão marcados "Não tem" mas têm gêmeo vinculado → conflito a revisar.
   - **Pelo catálogo (só como candidatos):** princípio ativo + dose + forma contra os itens da classe
     6505. Precisão baixa (correto em 1º lugar ~54%, entre os 3 primeiros ~88%) → listar até 3
     candidatos, nunca aplicar sozinho. Cobre mais 179 registros.
6. `descricaoCatmat` continua sendo gravada (auditoria), mas **não** é mais usada para exibição.

---

## 7. Painel — passo a passo

### 7.1 Tipos puros (`lib/cmed-aliquotas.ts` + `lib/pesquisa-preco-filtros.ts`)

- `ALIQUOTAS_ICMS`, `rotuloAliquota`, `aliquotaPadrao`, `rotuloCompetencia` (seção 4.2).
- Novo tipo **separado** dos filtros de mercado — **não** coloque competência/alíquota dentro de
  `FiltrosOpcionais`, senão `FONTE_SEM_CAMPO`/`filtrosAtivos` passariam a excluir BPS/SIASG/PNCP:
  ```ts
  export type ReferenciaCmed = { competencia: string | null; aliquota: CodigoAliquota | null }; // "2026-08"
  ```

### 7.2 Consulta CMED no servidor (`lib/cmed.ts`, novo)

- `listarCompetencias()` → `[{ competencia: "2026-08", rotulo, dataPublicacao, aliquotas, capPercentual, registros }]`, mais recente primeiro.
- `resolverReferencia(ref)` → competência padrão (P2), alíquota padrão (P1); competência inexistente ou
  alíquota não publicada nela → erro 400 com mensagem clara.
- `precosCmed(registros: string[], competencia: Date)` →
  `db.cmedVigencia.findMany({ where: { competencia, versao: { registro: { in: registros } } }, include: { versao: true } })`.
- `precoNaAliquota(versao, aliquota)`:
  ```ts
  // 1. precoLiberado → { pmvg: null, pf: null, motivo: "LIBERADO" }
  // 2. valor da coluna pedida (pmvg[i] ?? pf[i]) → { ..., aliquotaAplicada: aliquota }
  // 3. vazio, mas há 0% e (só 0% publicado || confaz87 || icms0) → usa 0%, motivo "ISENTO_ICMS" (P4)
  // 4. senão → { null, motivo: "SEM_PRECO_NA_ALIQUOTA" }
  ```
  Validar em runtime que `pf`/`pmvg` são arrays do tamanho de `ALIQUOTAS_ICMS` (o Json chega sem tipo).

### 7.3 `lib/pesquisa-preco.ts`

- `ParametrosPesquisa` ganha `referenciaCmed?: Partial<ReferenciaCmed>`; `ResultadoPesquisa` devolve a
  referência efetivamente usada (competência, rótulo, data de publicação, alíquota, CAP).
- `buscarCmed` passa a usar `precosCmed(registrosDaUnidade, competencia)` no lugar de `db.precoCmed`.
- `RegistroCmedPreco`: acrescentar `aliquotaAplicada`, `isentoIcms`, `precoLiberado`,
  `suspeitaQtEmbalagem`; `pmvgEmbalagem`/`pfEmbalagem` passam a ser **na alíquota aplicada**
  (não mais "sem impostos" fixo). `id` = `versaoId` (as exclusões da curadoria usam esse id).
- `CmedResultado`: acrescentar `competencia`, `aliquota`, `liberados`, `isentos`, `capPercentual`.
- Registros liberados e sem preço na alíquota: listados, fora de `pmvgUnitMin`/`pmvgUnitMax`.
- **Alerta de Qt_Embal (P8):** marcar `suspeitaQtEmbalagem` quando o PMVG unitário ficar abaixo do
  limite inferior do IQR (ou < mediana ÷ 4, com menos de 4 registros) entre os registros considerados;
  observação: "O teto está sendo definido pelo registro X, cujo preço unitário destoa dos demais —
  verifique a quantidade por embalagem (Qt_Embal) ou desconsidere-o na curadoria."
- Observação do CAP: usar `capPercentual` da competência (remover o "21,53%" fixo).
- `mapearUnidades(item, competencia)`: a contagem "CMED" por unidade considera só os registros com
  preço **na competência selecionada**.
- **Regra do catálogo (P9):**
  - `resolverItem` (REGISTRO): se `reg.catmat` não existir em `CatmatItem`, tratar como **sem
    CATMAT** (mercado não é consultado) e descrever pelo próprio registro — nunca por
    `reg.descricaoCatmat`. Acrescentar a observação "CATMAT X da Grande Padrão não consta do catálogo".
  - `resolverItem` (CATMAT): código fora do catálogo → não encontrado (remover o fallback para
    `regs[0].descricaoCatmat`).
  - `resolverItem` (REGISTRO) ausente da Grande Padrão mas presente em `CmedPrecoVersao` → item sem
    CATMAT, unidade `EMBALAGEM`, descrição pelo registro.
  - `sugerirMateriais`: a descrição dos registros sugeridos vem de `CatmatItem` (busca em lote pelos
    CATMATs) ou do próprio registro — nunca de `descricaoCatmat`.
  - Conferir o efeito em `lib/demandas-catmat.ts` (usa `resolverItem`).

### 7.4 Rotas

- `GET /api/precos/cmed/competencias` (novo): lista da 7.2 + `{ padrao }`. Mesmas checagens de sessão e
  `precos:pesquisar` das outras rotas; cache revalidado pela versão do dado (7.9).
- `GET/POST /api/precos/buscar`: aceitar `competencia` (`AAAA-MM`) e `aliquota`; validar por
  `resolverReferencia` (400 com mensagem em português).
- `GET /api/precos/catmat/[codigo]?competencia=AAAA-MM`: repassar a `mapearUnidades`.
- `app/api/precos/cmed/route.ts` (legado): migrar para as tabelas novas ou marcar como obsoleto.

### 7.5 Hook (`hooks/usePesquisaPreco.ts`)

- `ParametrosBusca` ganha `competencia` e `aliquota`; incluir nos `queryKey` e na query string.
- `useItemPesquisa(codigo, competencia)`; novo `useCompetenciasCmed()` (staleTime longo).
- Usar `apiPath()` nos `fetch` (fix de basePath da `main`).

### 7.6 Tela (`app/(auth)/pesquisa-preco/page.tsx`)

Dentro de **"Mais filtros"**, abaixo de Fornecedor/Fabricante/CNPJ, um subgrupo com título
**"Tabela CMED (teto PMVG)"**:

- **Mês de Competência** — `Select` com as competências ("ago/2026 · publicada em dd/mm/aaaa"),
  padrão = mais recente. Ajuda: "Define a lista CMED usada no teto. As bases de mercado (BPS, SIASG,
  PNCP) continuam considerando todo o período."
- **Alíquota ICMS** — `Select` só com as alíquotas publicadas na competência escolhida, rótulos de
  `rotuloAliquota`. Padrão = `aliquotaPadrao(...)`. Ao trocar a competência, se a alíquota escolhida
  não existir nela, voltar ao padrão e avisar. Ajuda: "Produtos isentos de ICMS (Convênio 87/02) só
  têm preço a 0% e são considerados nessa alíquota."
- O badge de "Mais filtros" e o botão "Limpar filtros opcionais" contam/resetam esses dois **apenas
  quando diferentes do padrão**.
- `CmedPanel`: no cabeçalho, badges "Competência: ago/2026" e "ICMS: 18%"; rótulos "PMVG unitário
  mín./máx. (ICMS X%)"; em cada registro, badges "Isento de ICMS — preço a 0%", "Preço liberado",
  "Qt_Embal suspeita". Mensagem vazia: "Nenhum registro ANVISA com preço na lista CMED de <mês>".
- `RecomendacaoPanel`: legenda do teto passa a "CMED <mês/ano> · ICMS <rótulo> ÷ Qt_Embal".
- Tokens de cor do design system (nada de hex novo). Mesmo padrão visual dos campos já existentes.

### 7.7 Relatório IN 65/2021 (`lib/relatorio-pesquisa-preco.ts` + rotas de relatório)

- Repassar `competencia`/`aliquota` ao `pesquisarPrecos`.
- Seção CMED: "Lista CMED de **<mês/ano>** (publicada em dd/mm/aaaa), PMVG na alíquota de ICMS
  **<rótulo>**; CAP vigente **<x>%**; **n** registro(s) isento(s) de ICMS considerado(s) a 0%;
  **n** com preço liberado (fora do teto)." Coluna "Alíquota aplicada" na tabela de registros.
- Atualizar os textos metodológicos que dizem "PMVG sem impostos" / "vigente".
- Registrar competência e alíquota no `AuditLog` junto com os demais parâmetros.

### 7.8 Cesta (P5)

- `CestaItem`: `competenciaCmed DateTime? @db.Date` e `aliquotaIcms String?` (null = padrão). Script
  `scripts/alter_cesta_cmed.py` (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, `--dry-run/--confirm`).
- Chave lógica do item passa a `codigo + unidade + uf + competenciaCmed + aliquotaIcms`.
- `POST /api/relatorios/cesta` refaz a pesquisa com a referência gravada em cada item.
- Atualizar o aviso da tela sobre filtros não levados para a cesta (competência e alíquota **vão**).

### 7.9 Fontes, cache e documentação

- `lib/data-version.ts`: acrescentar `CmedCompetencia` (coluna `importadoEm`) e usar nas rotas de
  competências e de busca. A rota `catmat/[codigo]` tem `max-age=300`: aceitável, mas documentar.
- `app/api/fontes/route.ts` + página de fontes: "CMED — última competência carregada".
- `CLAUDE.md`, seção "Pesquisa de Preços": novas tabelas, comandos do importador, regra das
  alíquotas (append-only, TS + Python), regra do catálogo (P9), filtros novos e cobertura (só CMED).

---

## 8. Regras de preço — resumo para conferência

1. Teto = menor PMVG **unitário** (embalagem ÷ Qt_Embal) entre os registros do CATMAT/unidade **na
   competência e alíquota escolhidas**, excluídos: liberados, sem preço na alíquota, sem Qt_Embal e os
   desconsiderados na curadoria.
2. Isento (só 0% publicado) → 0%, sinalizado.
3. PF exibido na mesma alíquota do PMVG.
4. CAP exibido é o da competência.
5. Nunca calcular alíquota por fórmula; nunca mostrar descrição de CATMAT fora do catálogo.

---

## 9. Verificação (antes de qualquer push)

- `npm run lint`, typecheck (`npx tsc --noEmit`) e `npm run build`; `python scripts/precos_norm.py`
  (autoteste) e um autoteste equivalente em `scripts/cmed_layout.py` (ALIQUOTAS em TS e Python
  idênticas; regex de cabeçalho com exemplos "PF 17% ALC", "PF 17 % ALC", "PMVG Sem Impostos",
  "PF 17,5%").
- `import_cmed_mensal.py --file 001.jan.17.xlsx --dry-run` batendo **todos** os números da seção 5.5.
- `--dry-run` nas amostras de outras épocas: nenhuma coluna de preço desconhecida; colunas de texto
  novas mapeadas ou conscientemente mandadas para `extras`.
- `import_cmed_registros.py --dry-run` com o arquivo atual: 51.151 registros, contagens de
  `statusCatmat` iguais às da seção 3.2.
- Com banco: carregar jan–mar/2017 e conferir com `--vigencia`. Na pesquisa:
  - CATMAT **434765** (ABATACEPTE 125 MG/ML, seringa): trocar a alíquota muda o teto (em jan/17,
    ORENCIA reg. `1018003900061` tem PMVG 900,56 a 0% e 1098,24 a 18% por embalagem);
  - CATMAT **365451** (ABATACEPTE 250 MG): com 18% escolhido, ORENCIA reg. `1018003900019` aparece
    como **isento, a 0%** (PMVG 1134,37);
  - registros "Liberado" aparecem listados e fora do teto.
- Relatório: competência, alíquota e CAP impressos; cesta preserva ambos.

---

## 10. Ordem de execução sugerida

1. Branch de trabalho a partir de `feat/base-redmine-20260827` + merge da `main`.
2. Schema Prisma + `lib/cmed-aliquotas.ts` + `scripts/cmed_layout.py`.
3. `import_cmed_mensal.py` → aceite com jan/17 (sem banco).
4. Correções do `import_cmed_registros.py` + relatório de revisão.
5. Pedir ao usuário para rodar localmente: `--dry-run` em todas as 116+ planilhas → revisar o
   relatório → `--confirm` → `--vigencia` (diferença zero em todas as competências).
6. Código do painel (7.1 → 7.9), verificação (9), PR.
7. Depois de validado em produção: PR separado removendo `PrecoCmed` e a rota legada.

## 11. Não fazer

- Não commitar planilhas nem dumps.
- Não derivar colunas de alíquota por fórmula; não reordenar `ALIQUOTAS_ICMS`.
- Não sugerir nem exibir descrição de CATMAT fora de `codigoItem` do catálogo.
- Não gravar sugestões de CATMAT no banco nem alterar a Grande Padrão automaticamente.
- Não misturar competência/alíquota em `FiltrosOpcionais` (quebraria a lógica de cobertura por fonte).
- Não apagar `PrecoCmed` neste PR.

## 12. Entregáveis

- `scripts/import_cmed_mensal.py`, `scripts/cmed_layout.py`, `scripts/alter_cesta_cmed.py` e o
  `scripts/import_cmed_registros.py` corrigido.
- Modelos Prisma + DDL; `lib/cmed-aliquotas.ts`, `lib/cmed.ts`; alterações em pesquisa, rotas, hook,
  tela, relatório, cesta, fontes, `data-version` e `CLAUDE.md`.
- Relatório do `--dry-run` de jan/17 (seção 5.5) e das amostras de outras épocas, anexado ao PR.
