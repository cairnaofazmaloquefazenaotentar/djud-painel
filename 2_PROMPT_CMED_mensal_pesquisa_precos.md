<!--
Prompt original da sessão de 01/10/2026 que gerou scripts/associar_catmat.py e scripts/catmat_assoc/.
Salvo como 2_PROMPT_CMED_mensal_pesquisa_precos.md porque PROMPT_CMED_mensal_pesquisa_precos.md já
guarda o prompt das listas mensais da CMED.
-->

## Arquivos anexados à sessão

Os quatro arquivos abaixo foram anexados junto com este prompt. **Não estão no repositório** (as
planilhas não vão para o git); guarde-os localmente para reproduzir a rodada. O sha256 (16 primeiros
caracteres) permite conferir se é a mesma versão.

| Arquivo | Conteúdo | Tamanho | sha256 |
|---|---|---|---|
| `01. CMED - grande.padrão - de jan.17 a ago.26.xlsx` | Grande Padrão (GP): registros ANVISA × CATMAT, cabeçalho na linha 5 | 4.3 MB | `9830cec16a170c01` |
| `08.26.xlsx` | Lista CMED de preços de ago/2026 (publicada em 11/08/2026) | 14.0 MB | `33771bef3d635157` |
| `Catmats 11-07.CSV` | Catálogo CATMAT de 11/07 — única fonte de código e descrição | 24.8 MB | `c4fc37b0dbf5c021` |
| `Extração Unidades de Fornecimento 29-09.csv` | Situação (Ativo/Inativo) e unidades de fornecimento oficiais por CATMAT | 28.9 MB | `9aa6e33ced1c1dee` |

---

# PROMPT — Associação Registro ANVISA × CATMAT na Grande Padrão da CMED

> **Como usar:** cole este texto inteiro numa sessão nova do Claude Code aberta no repositório
> `djud-painel` e anexe os quatro arquivos da seção 2. Antes de colar, revise o bloco
> **0. Parâmetros a confirmar**, o único trecho que talvez você queira editar. As planilhas
> **não** vão para o repositório. Todos os números citados foram medidos nesses arquivos em
> 01/10/2026: use-os como critério de aceite, não como enfeite.

---

## Sua tarefa (escopo fechado)

Construir um **associador reprodutível** que, para cada Registro ANVISA da Grande Padrão (GP) ainda
sem CATMAT, proponha o **CATMAT correto**, junto com os campos que andam com ele na mesma linha:
`Descrição`, `Unidade de fornecimento` e `Qt_Embal`. Cada proposta sai com o **nível de confiança**
e a **evidência** que a sustenta. O associador tem de:

1. aprender as convenções que a equipe aplicou à mão, ao longo de anos, nos **48.967 vínculos já
   feitos** (a GP é o gabarito);
2. raciocinar como um **catalogador farmacêutico** quando não houver precedente: princípio ativo,
   sal/éster e equivalência de dose, forma farmacêutica, liberação, via e acessórios;
3. **aproximar ao máximo** antes de desistir: entre os CATMATs **ativos**, achar o que identifica
   especificamente aquela substância, dose e forma, mesmo quando a descrição não é idêntica. "Não tem"
   (pedido de CATMAT novo) só quando **nenhum** item ativo puder identificar o produto sem trocar um
   atributo essencial (escada da R14);
4. preencher sozinho **apenas** o que atingir a precisão medida no nível A (≥ 99,5% em
   backtest) e mandar o resto para revisão, com a sugestão pronta;
5. servir **todo mês**: entra a lista mensal nova da CMED, saem as linhas novas da GP já associadas.

**Fora do escopo** (fica para outro momento, não mexa):
- corrigir vínculos já existentes na GP: só **liste** as suspeitas que surgirem (aba `Suspeitas na GP`, seção 5.4);
- o banco Neon, os importadores (`import_cmed_registros.py` etc.), o painel e a forma de pesquisar ou
  exibir esses dados;
- qualquer CATMAT fora do catálogo `Catmats 11-07.csv`.

---

## 0. Parâmetros a confirmar

| # | Decisão | Padrão adotado neste prompt |
|---|---------|-----------------------------|
| P1 | Onde fica o código | Pacote Python em `scripts/catmat_assoc/` + CLI `scripts/associar_catmat.py`, numa branch própria. Sem node, sem banco, sem tocar `app/`, `lib/` nem `prisma/`. Saídas em `saida_catmat/` (no `.gitignore`). |
| P2 | O que é gravado automaticamente | **Só o nível A** vai para as colunas oficiais (H–K) da **cópia** da GP, com a origem marcada. B, C e D ficam em colunas de proposta e na planilha de revisão. O arquivo original **nunca** é sobrescrito. |
| P3 | Revisar os "Não tem" | **Sim**, numa aba separada ("Não tem → possível CATMAT"), **nunca** automático. O catálogo mudou desde muitas dessas decisões (seção 3.6). |
| P4 | Quem adjudica os casos sem precedente (nível C) | **O próprio agente na sessão**, lendo o pacote de evidências e gravando as decisões num arquivo. Sem chave de API. Automatizar com a API do Claude fica para depois, se o usuário quiser. |
| P5 | CATMAT **inativo** (`situacaoCatmat = Inativo` na extração de unidades) | **Nunca** propor: não tem unidade de fornecimento e não pode ser comprado. Se o precedente da GP aponta para um inativo, buscar o substituto ativo (nível B). |
| P6 | Pedido de criação de CATMAT | Só no fim da escada da R14 (nível D): gerar o **rascunho** da descrição no padrão do catálogo, listar os itens ativos mais próximos e por que nenhum serve, e marcar `xxx = planilhar`. |
| P7 | Lista mensal de referência | A mais recente disponível (hoje `08.26.xlsx`). Linhas da GP **vigentes** nela vêm primeiro na fila de revisão. |
| P8 | O que pode ser aproximado (R14) | Grau 1 (equivalente, entra como C normal): diferenças só de expressão (sal × base com dose equivalente, por mL × total, forma implícita na unidade de fornecimento, "revestido"). Grau 2 (aproximado, C com alerta): liberação modificada sem item próprio, acessório não citado no CATMAT, creme × pomada, solução × xarope oral. **Nunca**: princípio ativo, dose, via, comprimido × cápsula, associação × monodroga. |

Se algum item acima não valer, **pare e pergunte** antes de implementar a parte afetada.

---

## 1. Contexto de negócio e glossário

- **Registro ANVISA** (13 dígitos, ex.: `1.0043.0034.007-7` = `1004300340077`): `1` = medicamento ·
  `0043` = empresa · `0034` = produto · `007` = apresentação · `7` = dígito verificador.
  **Raiz** = os 9 primeiros dígitos = o **produto** (todas as apresentações da mesma marca da mesma
  empresa). Empresas diferentes podem ter "clones" do mesmo produto, com raízes diferentes.
- **CATMAT** (Compras.gov.br): cada código tem **uma única descrição**, no padrão
  `PDM, RÓTULO: valor , RÓTULO: valor …`. O PDM (padrão descritivo de material) costuma ser o princípio
  ativo. **Vários registros → um CATMAT; um registro → um CATMAT** (ou um status).
- O CATMAT descreve o **item de compra**: princípio(s) ativo(s), dose, forma, liberação, via e, às
  vezes, acessório. O tamanho da embalagem **não** entra no CATMAT; ele vai para a **unidade de
  fornecimento** e para o `Qt_Embal`. A exceção é quando o CATMAT expressa dose total por recipiente
  (seção 4, R3).
- A lista mensal da CMED traz os registros e os preços, **sem CATMAT**. A GP é a camada que a equipe
  construiu por cima dela, de jan/2017 a ago/2026, uma linha por registro já publicado.

---

## 2. Arquivos de entrada (layouts verificados em 01/10/2026)

### 2.1 Grande Padrão — `01. CMED - grande.padrão - de jan.17 a ago.26.xlsx`

- Aba única `grande padrão`. Linhas 1–3 trazem contadores **com fórmula** (`=COUNTA(E6:E1048576)`,
  `=E1-H1` "ç Faltam", `=H2/E1`); preserve-as na cópia. **Cabeçalho na linha 5, colunas D–Q**; dados a
  partir da linha 6. Localize o cabeçalho **pelo conteúdo** (linha com `Registro`, `CATMAT` e
  `Qt_Embal`), não pela posição.

| Col. | Cabeçalho | Conteúdo medido |
|------|-----------|-----------------|
| D | `nº` | Sequencial de inclusão, único (1–51.151). A planilha é **ordenada por substância**, então `nº` não segue a ordem das linhas. Os `nº` 50.692–51.151 são as **460 inclusões de ago/26**, todas sem CATMAT. |
| E | `Registro` | 51.151, **sem duplicata**; 2 com tamanho ≠ 13 (`112363418`, `57600510011`). |
| F | `Gen.` | `SIM`/`NÃO` = genérico (casa com `TIPO DE PRODUTO = Genérico` da lista mensal em 98,9% dos genéricos). |
| G | `ICMS` | `Sim`/`Não`. Metadado da inclusão: não use na associação. |
| H | `CATMAT` | 48.967 numéricos (**4.086 distintos, 100% presentes no catálogo**) · 1.461 `Não tem` · **715 vazios** · 7 `Fora` · 1 `NÃO SERA CRIADO (JUSTIF. CATMAT)` |
| I | `Descrição` | A descrição do catálogo **sem os rótulos de atributo** (98,8% idêntica após normalizar espaços). Regra: trocar `, RÓTULO: ` por `, `. |
| J | `Unidade de fornecimento` | `COMPRIMIDO`, `CÁPSULA`, `FRASCO-AMPOLA`… (72%) ou `<TIPO> <n,dd> <UN>`, ex. `FRASCO 100,00 ML`, `BISNAGA 40,00 G`, `AMPOLA 2,00 ML` (28%). |
| K | `Qt_Embal` | Inteiro (48.960) · `—` (1.471: os "Não tem"/"Fora") · vazio (720: os 715 pendentes + 5). |
| L | `xxx` | Fila de pedido de CATMAT: `planilhar` (1.370 = 1.359 "Não tem" + 11 com número) e `planilhado` (99 = 75 "Não tem" + 23 com número + 1). Com número, o pedido provavelmente foi atendido ou superado (confirme com o usuário). |
| M–Q | `Substância`, `Produto`, `Apresentação`, `CNPJ`, `Fabricante` | Texto **da época da inclusão**: em relação à lista de ago/26, `Substância` difere em 11% dos registros e `Apresentação` em 16% (a CMED reescreve). 5.892 apresentações têm espaço não separável (`\xa0`). |

- **Significado dos status:** número = vinculado · `Não tem` = não existe CATMAT adequado (com
  `planilhar`/`planilhado` = pedido de criação) · `Fora` = produto de teste da ANVISA
  ("MEDICAMENTO TESTE", "PRODUTO TESTE 21.08") · vazio = **pendente** (o backlog deste prompt).

### 2.2 Lista mensal CMED — `08.26.xlsx` (formato original publicado pela CMED)

- Aba `Planilha1`, 26.055 linhas. As linhas 1–53 são notas (inclui "Publicada em 11/08/2026 19h30min.").
  **Cabeçalho na linha 54**, 74 colunas. Detecte-o pelo conteúdo (célula `REGISTRO` + colunas PF/PMVG
  nas primeiras 80 linhas), porque outras listas usam a linha 4 ou 5.
- Colunas úteis aqui: `SUBSTÂNCIA, CNPJ, LABORATÓRIO, CÓDIGO GGREM, REGISTRO, EAN 1–3, PRODUTO,
  APRESENTAÇÃO, CLASSE TERAPÊUTICA, TIPO DE PRODUTO (STATUS DO PRODUTO), REGIME DE PREÇO, RESTRIÇÃO
  HOSPITALAR, CONFAZ 87, ICMS 0%, TARJA`. Os preços não importam para a associação.
- 26.001 linhas de dados, **26.000 registros distintos** (SANTIPLEX B `1018600330018` aparece duas
  vezes, com dois GGREM). **Os 26.000 estão na GP**: nenhum registro de ago/26 ficou de fora.
- Vigentes em ago/26: 24.675 com CATMAT · **712 vazios** · 610 "Não tem" · 3 "Fora".

### 2.3 Catálogo — `Catmats 11-07.CSV`

- **Separador `@`, codificação cp1252**, cabeçalho `codigoItem@descricaoItem`; 133.353 itens,
  `codigoItem` único. **É a única fonte de CATMAT aceita**: nenhuma sugestão ou descrição pode vir de
  código fora dele.
- O arquivo **não traz** grupo, classe, código de PDM, status nem unidades de fornecimento, e mistura
  todos os grupos de material. Você precisa separar o que é medicamento (seção 3.5).
- A descrição oficial a usar é a deste CSV. A extração de unidades (2.4) traz a mesma descrição
  com espaçamento diferente em 15% dos itens: compare normalizando espaços e vírgulas.
- Se o usuário tiver a versão xlsx do mesmo catálogo ("CATMATs e PDMs 11/07", com
  `codigoClasse`/`codigoPdm`), use-a só para **filtrar** (classe 6505 etc.). As descrições têm de
  continuar idênticas às do CSV; verifique isso.

### 2.4 Unidades de fornecimento — `Extração Unidades de Fornecimento 29-09.csv`

- **Separador `@`, cp1252, CRLF**; colunas `codigoCatmat, descricaoItem, situacaoCatmat,
  unidadeFornecimentoCapacidade, unidadeFornecimento, capacidade, siglaUnidadeMedida`. Uma linha por
  **CATMAT × unidade** (144.479 linhas, 131.383 CATMATs). Item sem unidade vem com `NA`.
- `unidadeFornecimentoCapacidade` é exatamente o texto da coluna J da GP (`FRASCO 100,00 ML`,
  `COMPRIMIDO`); `capacidade` + `siglaUnidadeMedida` dão o conteúdo em número.
- **Situação:** 63.830 linhas de itens Ativos, 80.649 de Inativos (nenhum item com situação mista).
  Inativo vem sem unidade de fornecimento.
- Cobertura frente ao catálogo de 11/07: 130.895 em comum; 2.458 só no catálogo (sem situação
  conhecida → tratar como **não confirmado**, nunca nível A); 488 só na extração (criados depois de
  11/07: podem ser candidatos, mas a descrição vem desta extração; sinalize).
- Nos vínculos da GP: a unidade gravada **consta da lista oficial do CATMAT em 99,2%**; os CATMATs
  usados têm em média 1,43 unidade. **119 CATMATs usados na GP (325 vínculos) estão hoje Inativos**
  (ex.: ETODOLACO 500 MG 351478, 39 vínculos; PINAVÉRIO 50 MG 395608, 20).
- É aqui que mora a forma dos itens antigos: `OMEPRAZOL, CONCENTRAÇÃO: 20 MG` (267712) tem as
  unidades `CÁPSULA` **e** `COMPRIMIDO`; `CITALOPRAM, DOSAGEM: 20 MG` (272903) só `COMPRIMIDO`.

---

## 3. Diagnóstico medido (o que o associador precisa saber antes de começar)

### 3.1 O backlog

**715 registros vazios** (712 vigentes em ago/26; 460 entraram em ago/26, 255 são de antes). A equipe
estimava "cerca de 800": a diferença está nos "Não tem" que podem ter ganhado CATMAT desde a
decisão (seção 3.6). Os vazios, classificados pela evidência disponível:

| Nível provável | Situação | Registros |
|----------------|----------|-----------|
| A | Irmão: mesma raiz + mesma assinatura + mesmos acessórios, CATMAT unânime | 66 |
| A | Gêmeo: mesma assinatura + acessórios em outro produto, CATMAT unânime | 460 |
| B | Gêmeo majoritário (7), divergente (1) ou só sem considerar acessórios (21) | 29 |
| C | Substância conhecida na GP, apresentação nova (dose/forma inédita) | 72 |
| C | Substância(s) que a GP nunca vinculou (24 substâncias distintas) | 88 |

**Espaço para aproximar:** dos 160 sem precedente, **126 têm ao menos um CATMAT ativo que contém
todas as suas substâncias** (dose e forma ainda a conferir). Dos 34 restantes, parte se resolve por
ponte ou PDM de categoria (MECOBALAMINA → VITAMINA B12; vacinas dengue, chikungunya e meningocócica C
→ VACINA; as três nutrições parenterais → NUTRIÇÃO PARENTERAL / EMULSÃO). Só sobram como candidatos
reais a CATMAT novo, numa busca preliminar, os biológicos e moléculas muito recentes:
ALFAEFGARTIGIMODE, MIRIQUIZUMABE, ROZANOLIXIZUMABE, SERPLULIMABE, UBLITUXIMABE, CLESROVIMABE,
DEPEMOQUIMABE, SEPIAPTERINA, TRIFAROTENO e FOSLEVODOPA + FOSCARBIDOPA. Mesmo esses só viram D depois
da escada completa da R14.

### 3.2 Precedente (gêmeos) é o sinal mais forte, medido em backtest

**Assinatura** = ingredientes normalizados (sem acento, maiúsculas, separados por `;`, ordenados) +
`" | "` + apresentação até o 1º marcador de embalagem (`CT, CX, EMB, DISPLAY, FR, FRS, BL, ENV, AMP,
FA, SER, BG, BOLS, SACH, POT, TB, GL, STR, KIT, CART, EST…`), com `\s*/\s*`→`/`, `1,0`→`1`, `10 MG`→`10MG`.
**Acessórios** = marcadores **depois** do prefixo: `DIL`, `SIST FECH`, `SER`, `CAN` (caneta), `INAL`,
`APLIC`, `CAR`/`REFIL`, `BOLS`, `AMP`, `FA`, `ENV/SACH`, `CALEND`.

| Método (validação cruzada) | Cobertura | Acerto |
|----------------------------|-----------|--------|
| Gêmeo unânime, assinatura só (leave-one-out) | 86,4% | 99,61% |
| Gêmeo unânime, assinatura + acessórios | 87,0% | 99,68% |
| Gêmeo majoritário, assinatura + acessórios | 91,7% | 98,88% |
| **Excluindo a própria raiz** (simula produto novo), unânime | 77,6% | 99,52% |
| idem, gêmeos de **≥ 2 raízes** distintas | 67,9% | 99,72% |
| idem, gêmeos de **≥ 3 raízes** distintas | 61,9% | 99,81% |
| idem, maioria ≥ 2× (não unânime) | 3,6% | 90,7% → **nunca automático** |
| Irmão (mesma raiz + assinatura + acessórios), unânime | 69,1% | 99,52% |

Leia assim: (a) os acessórios importam: meropenem 1 G com diluente em bolsa é o CATMAT 288298
("sistema fechado"), sem diluente é o 268488; (b) o resíduo de "erro" do nível unânime é, na maior
parte, **erro da GP** e não do método (ex.: ANLODIPINO 2,5 MG ligado a LEVANLODIPINO; CICLOSPORINA
50 MG ligada ao CATMAT de 25 MG); (c) o **volume** importa quando o CATMAT expressa dose total.
ADALIMUMABE 50 MG/ML × 0,4 ML = 20 mg não pode herdar o CATMAT "40 MG" dos gêmeos de 0,8 ML. Por isso
o nível A **também** passa pelas guardas da seção 5.4.

Atenção: a GP é ordenada por substância e o `nº` foi renumerado nessa ordenação. **Não use `nº` como
eixo temporal**. Valide por **grupo de raiz** (K-fold) e por **substância** (seção 6).

### 3.3 Ponte de nomes (substância CMED → PDM do catálogo)

Nas linhas de um único princípio ativo, o nome-base (sem sal/hidrato) **é** o PDM em 66,4% dos casos
e é compatível (prefixo/contido) em 90,1%. Os outros 10% exigem **407 pontes distintas**, que devem
ser **aprendidas da própria GP** (dicionário `ingrediente CMED → PDM`, com contagem). Tipos de ponte:

- **sal/hidrato/estereoisômero no nome**: HEMIFUMARATO DE QUETIAPINA → QUETIAPINA (390);
  MONTELUCASTE DE SÓDIO → MONTELUCASTE SÓDICO (258); BISSULFATO DE CLOPIDOGREL → CLOPIDOGREL;
  CEFTRIAXONA HEMIEPTAIDRATADA → CEFTRIAXONA SÓDICA; LEVANLODIPINO HEMIPENTAIDRATADO → LEVANLODIPINO
  BESILATO;
- **PDM invertido (o sal vira PDM)**: TROMETAMOL CETOROLACO → `TROMETAMOL, COMPOSIÇÃO: SAL CETOROLACO`;
- **pró-fármaco/éster ou sinônimo DCB**: AXETILCEFUROXIMA → CEFUROXIMA; MESSALAZINA → MESALAZINA;
  ERITROPOIETINA → ALFAEPOETINA; VALPROATO DE SÓDIO → ÁCIDO VALPROICO; MECOBALAMINA → VITAMINA B12;
  FERRIPOLIMALTOSE → HIDRÓXIDO DE FERRO III; ONASEMNOGENO ABEPARVOVEQUE → ONASEMNOGENE ABEPARVOVEC-XIOI;
- **erro de digitação da CMED**: ORLIPASTAT → ORLISTATE;
- **PDM de categoria** (o ingrediente vira atributo): CONTRASTE RADIOLÓGICO (gadotérico, iobitridol,
  ioexol, iodixanol, ioversol, iopamidol, iomeprol), EXTRATO MEDICINAL (fitoterápicos: GINKGO,
  HEDERA, AESCULUS, PASSIFLORA, VALERIANA, SENNA, GLYCINE MAX…), CONCENTRADO DE FATOR DE COAGULAÇÃO
  (fator VIII/IX e alfa-octocogues), PROBIÓTICO (SACCHAROMYCES), SOLUÇÃO PARA HEMODIÁLISE /
  DIÁLISE PERITONEAL, EMULSÃO DE LIPÍDIOS, NUTRIÇÃO PARENTERAL, IMUNOGLOBULINA HUMANA, INTERFERONA,
  INSULINA (tipo como atributo), FOLITROPINA (alfa/beta/delta como atributo), VACINA, ÁGUA DESTILADA;
- **SUBSTÂNCIA da CMED incompleta**: a associação aparece com um ingrediente só (CLAVULANATO DE
  POTÁSSIO para amoxicilina + clavulanato; ETINILESTRADIOL para drospirenona + etinilestradiol).
  Conte os componentes pela `APRESENTAÇÃO` (`+`, parênteses) e use o `PRODUTO`.

### 3.4 Forma farmacêutica: de-para aprendido da GP

916 combinações distintas de forma/via no prefixo; as 50 mais frequentes cobrem 88%. Amostra (n =
registros vinculados):

| CMED | n | Unidade usada na GP | Forma no CATMAT |
|------|---|---------------------|-----------------|
| `COM REV` | 14.018 | COMPRIMIDO | geralmente **ausente** (o CATMAT não distingue revestido) |
| `COM` | 8.242 | COMPRIMIDO | ausente; `COMPRIMIDO DISPERSÍVEL` quando for o caso |
| `CAP DURA` / `CAP GEL DURA` / `CAP MOLE` | 1.831 / 845 / 706 | CÁPSULA | ausente |
| `COM REV LIB PROL` / `COM LIB PROL` | 1.033 / 342 | COMPRIMIDO | `LIBERAÇÃO CONTROLADA/PROLONGADA/LENTA` |
| `COM REV LIB RETARD` / `CAP DURA LIB RETARD` | 527 / 375 | COMPRIMIDO / CÁPSULA | `LIBERAÇÃO ENTÉRICA`, `MICROGRÂNULOS DE LIBERAÇÃO LENTA`… |
| `COM ORODISP` / `COM SUBL` / `COM MAST` / `COM EFEV` / `COM SUS` | 377 / 253 / 294 / 96 / 103 | COMPRIMIDO | `ORODISPERSÍVEL` / `SUB-LINGUAL` / `MASTIGÁVEL` / `EFERVESCENTE` / `DISPERSÍVEL` |
| `SOL INJ` (+ IV/IM/SC) | 2.824 | AMPOLA · FRASCO · SERINGA · BOLSA | `SOLUÇÃO INJETÁVEL` ou ausente (`USO: INJETÁVEL`) |
| `PO LIOF INJ` / `PO LIOF SOL INJ` / `PO SOL INJ` | 695 / 297 / 198 | FRASCO-AMPOLA | `PÓ LIÓFILO P/ INJETÁVEL` / `PÓ P/ SOLUÇÃO INJETÁVEL` |
| `SOL OR` / `XPE` / `SUS OR` / `PO SUS OR` | 1.143 / 1.131 / 588 / 268 | FRASCO | `SOLUÇÃO ORAL` / `XAROPE` / `SUSPENSÃO ORAL` / `PÓ P/ SUSPENSÃO ORAL` |
| `CREM DERM` / `POM DERM` / `GEL` / `CREM VAG` | 717 / 416 / 176 / 238 | BISNAGA | `CREME` / `POMADA` / `GEL` / `CREME VAGINAL` |
| `SOL OFT` / `SOL NAS` | 503 / 111 | FRASCO | `SOLUÇÃO OFTÁLMICA` / `SOLUÇÃO NASAL` |
| `GRAN` | 117 | ENVELOPE / SACHÊ | `GRANULADO (PARA SOLUÇÃO ORAL)` |

Os rótulos do catálogo são **inconsistentes**: a forma aparece como `FORMA FARMACÊUTICA`,
`FORMA FARMACEUTICA`, `FORMA FÍSICA`, `APRESENTAÇÃO: SOLUÇÃO INJETÁVEL`, `INDICAÇÃO: LOÇÃO`,
`USO: INJETÁVEL`, `APLICAÇÃO: POMADA`, `TIPO MEDICAMENTO: SUBLINGUAL`. **Interprete o valor pelo
sentido, não pelo rótulo.** Nos itens antigos sem forma (`CITALOPRAM, DOSAGEM: 20 MG`), quem diz se é
comprimido ou cápsula é a **unidade de fornecimento** oficial do CATMAT (extração 2.4).

### 3.5 O catálogo e as armadilhas dele

- **Itens que não são medicamento acabado** com o mesmo PDM, a serem excluídos ou rebaixados:
  insumo/matéria-prima (`ASPECTO FÍSICO`, `FÓRMULA QUÍMICA`, `PESO MOLECULAR`, `GRAU DE PUREZA`,
  `TEOR`, `SOLUBILIDADE`), veterinário (`USO VETERINÁRIO`, `FORMA FÍSICA … USO VETERINÁRIO`),
  manipulado (`FORMULAÇÃO ESPECIALMENTE MANIPULADA`), reagente/padrão analítico, `NOME: X`
  (ex.: `CITALOPRAM, NOME: CITALOPRAM`). O filtro é **suave**: alguns vínculos legítimos da GP usam
  `ASPECTO FÍSICO` (ÁGUA DESTILADA estéril) ou `NOME:` (RADIOFÁRMACO).
- **Itens inativos:** o CSV do catálogo não diz quais itens estão ativos; a extração de unidades
  (2.4) diz. Os códigos usados na GP vão de 260160 a 639249, e há 1.242 itens de medicamento com
  PDM já usado **abaixo de 260000** que nunca foram escolhidos: **1.240 deles estão Inativos** (ex.:
  `AMOXICILINA, PRINCÍPIO ATIVO: AMOXICILINA , CONCENTRAÇÃO: 500 MG , APRESENTAÇÃO: CÁPSULA…` 226371,
  sem unidade). O filtro certo é a **situação**, não o código: entre 260000 e 400000 há 48.627
  linhas de itens inativos.
- **Duplicatas (ou quase) no catálogo** (mesma coisa na prática, códigos diferentes, e a GP usa os
  dois): BETAISTINA 8 MG (274807 × 399109), QUININA 500 MG (266727 × 272131), OMEPRAZOL 20 MG
  (267712 × 460950 "liberação prolongada"), GLICOSE 5% sistema fechado (270092 × 357880), BUDESONIDA
  spray nasal (266706 × 452913). Desempate: (1) o que a GP já usa para a mesma assinatura; (2) item Ativo; (3) todos os
  atributos satisfeitos e nenhum contrariado; (4) o que tem a unidade de fornecimento que cabe no
  registro; (5) ainda empatado → nível B, com as duas opções.
- **Catálogo novo:** o maior código é 639843. Itens criados depois das decisões "Não tem" (seção 3.6)
  só aparecem quando se procura por eles.

### 3.6 "Não tem" que talvez já tenham CATMAT

1.461 "Não tem" (610 vigentes). **795** deles têm ao menos um CATMAT ativo contendo todas as suas
substâncias, e outros 390 têm item ativo para parte delas: é o universo a revisar pela escada da
R14. **31** têm irmão ou gêmeo unânime **vinculado** (conflito a revisar). Numa busca grosseira por dose + forma, **≥ 43** casam com CATMAT de código ≥ 600000 nunca
usado na GP. Exemplos conferidos à mão:

| Registro / produto | Situação na GP | Candidato no catálogo |
|--------------------|----------------|-----------------------|
| ACICLOVIR 40 MG/ML SUS OR | Não tem · `planilhado` | 628716 `ACICLOVIR, CONCENTRAÇÃO: 40 MG/ML, FORMA FARMACEUTICA: SUSPENSÃO ORAL` |
| TOPIRAMATO 100 MG/ML SOL GOT OR | Não tem · `planilhar` | 618334 `… 100 MG/ML, … SOLUÇÃO ORAL - GOTAS` |
| DIASPARTATO DE PASIREOTIDA 0,9 MG/ML SOL INJ | Não tem · `planilhar` | 639084 `PASIREOTIDA, CONCENTRAÇÃO: 0,9 MG/ML, … SOLUÇÃO INJETÁVEL` |
| TRIBENOSÍDEO + LIDOCAÍNA 50 + 20 MG/G CREM | Não tem · `planilhado` | 628743 `LIDOCAÍNA CLORIDRATO, … ASSOCIADA COM TRIBENÓSIDO , 20 MG/G + 50 MG/G, CREME` (ordem invertida: R5) |
| DESONIDA + GENTAMICINA 0,5 + 1 MG/G GEL CREM | Não tem · `planilhar` | 618536 `GENTAMICINA, … ASSOCIADO À DESONIDA , 1 MG/G + 0,5 MG/G, GEL CREME` |

A mesma busca dá muitos **falsos positivos** em associações: casa só um dos princípios ativos, como
AZELASTINA + FLUTICASONA com o CATMAT só de fluticasona. Por isso essa revisão nunca é automática.

### 3.7 Baseline ingênuo pelo catálogo (o que **não** basta)

Casamento léxico de PDM + números da dose + palavras da forma, testado em registros sem gêmeo: **top-1
43%, top-3 63%**. As falhas mostram o que o raciocínio farmacêutico precisa cobrir:

- concentração × dose total: DOCETAXEL 80 MG/2 ML → `40 MG/ML`; ÁCIDO ASCÓRBICO 500 MG/5 ML →
  `100 MG/ML`; CARBOPLATINA 10 MG/ML × 45 ML → `450 MG`;
- associação × monodroga: BETAMETASONA + GENTAMICINA não é `GENTAMICINA, 1 MG/G`;
- forma/via: ALFADORNASE `SOL P/ INALAÇÃO` não é `SOLUÇÃO INJETÁVEL`; PERMETRINA `LOÇÃO` não é
  `CREME CAPILAR`;
- duplicatas e itens inativos (BETAISTINA, QUININA, AMOXICILINA 226371);
- PDM de categoria (SOLUÇÃO PARA HEMODIÁLISE, VACINA, EMULSÃO DE LIPÍDIOS).

### 3.8 Dose: concordância CMED × CATMAT nos vínculos existentes (monodrogas)

88,5% literal · 1,4% concentração × total (volume) · 0,6% sal × base · 6,0% sem dose comparável ·
3,5% "diferente". Este último grupo é quase todo **conversão** que o parser precisa saber fazer:
separador de milhar `50.000 UI`; `2 MG/5 ML` = `0,4 MG/ML`; pó para reconstituir (AMPICILINA 3 G →
`50 MG/ML`); granulado `40 MG/G` × envelope de 5 G = `200 MG`; SOMATROPINA 8 MG = `24 UI`. O resto
são erros da GP, a apontar e não a imitar: HEPARINA → BEMIPARINA; CYNARA (alcachofra) → extrato de
CURCUMA; FATOR IX → COMPLEXO PROTROMBÍNICO; GLIMEPIRIDA 2 MG → DESLORATADINA xarope; MIRTAZAPINA 45
ODT → 30 MG; ENALAPRIL 10 → 5 MG.

### 3.9 Campos que acompanham o CATMAT

- **Unidade de fornecimento:** a lista oficial por CATMAT está na extração (2.4) e a GP a respeita
  em 99,2% dos vínculos. Em 98,6% a unidade também já foi usada por outro registro do mesmo CATMAT. Para líquidos e semissólidos, o
  número é o conteúdo do recipiente (`FRASCO 120,00 ML`, `BISNAGA 30,00 G`, `BOLSA 3000,00 ML`).
- **Qt_Embal** = quantas unidades de fornecimento vêm na embalagem. Regras simples sobre a
  apresentação reproduzem **97,0%** da GP (COMPRIMIDO 98,5%, CÁPSULA 98,7%, FRASCO 98,4%, BISNAGA
  98,7%; SACHÊ 68,7% e BOLSA 86,7% são os fracos). Armadilha conhecida: a gramatura do blister
  (`PVDC 40 TRANS X 30` → Qt 30, **não** 1200).

---

## 4. Regras de decisão (catalogação + farmácia)

Escreva estas regras como **código e testes**, não só como texto. Cada regra aplicada a uma proposta
entra no campo `evidencia`.

- **R1 — Identidade do item.** Mesmo CATMAT ⇔ mesmo conjunto de princípios ativos (porção ativa) +
  mesma dose + mesma forma farmacêutica (inclui o tipo de liberação) + mesma via, quando o CATMAT a
  nomeia + mesmo acessório, quando o CATMAT o nomeia. Marca, fabricante, material e cor do
  recipiente, tamanho da embalagem e "EMB HOSP"/"EMB FRAC" **nunca** diferenciam.
- **R2 — Sal, éster e hidrato.** Compare pela **porção ativa**. A CMED escreve em DCB com o sal na
  frente ("CLORIDRATO DE X"); o catálogo usa `X`, `X CLORIDRATO`, `X, SAL CLORIDRATO` ou até o sal
  como PDM. Se o catálogo tiver item específico do sal, prefira-o. Converta a dose quando um lado
  estiver em base e o outro em sal: `dose_base = dose_sal × MM_base / MM_sal`. Casos da GP:
  FENFLURAMINA HCl 2,5 → `2,2 MG/ML`; BETAMETASONA 0,5 (base) → `DIPROPIONATO 0,64 MG/G`;
  POLICARBOFILA CÁLCICA 625 → `500 MG`; OMEPRAZOL MAGNÉSIO 20 → `20,6 MG`; DICLOFENACO DIETILAMÔNIO
  11,6 → `10 MG/G`. Ésteres que mudam o produto (dipropionato × valerato × fosfato de
  betametasona/dexametasona) **não** são intercambiáveis. Massa molar só de fonte citável
  (Farmacopeia/DCB/PubChem), numa tabela versionada; sem fonte → nível B com alerta.
- **R3 — Normalização da dose.** G/MG/MCG/NG; L/ML; UI e U; MEQ; `%` (p/v: 0,9% = 9 MG/ML);
  `MG/5 ML`; milhar com ponto; `MCG/DOSE` e `/ACION` (inalatórios e sprays); dose total =
  concentração × volume do recipiente; pó para reconstituir (concentração após reconstituição, quando
  a apresentação informa o volume final); granulado e pó por envelope. Gere **as duas leituras**
  (por mL e por recipiente) e case com a que o CATMAT usa. UI ↔ mg só para biológicos com fator
  oficial e citável.
- **R4 — Forma e liberação.** Use o de-para da seção 3.4, aprendido e ampliado a partir da GP.
  `REV` e `GEL` (cápsula gelatinosa) não diferenciam. `LIB PROL`, `LIB RETARD`, `LIB MOD`, `ORODISP`,
  `SUBL`, `MAST`, `EFEV`, `DISP`/`SUS` (comprimido para suspensão) diferenciam **quando houver CATMAT
  próprio**. Se só existir o item genérico, ele serve, mas **anote o alerta**. COMPRIMIDO × CÁPSULA
  nunca se trocam.
- **R5 — Associações.** Todos os princípios ativos e todas as doses têm de casar, como **conjunto**
  de pares (ingrediente, dose), sem depender da ordem: o PDM do CATMAT pode ser qualquer um dos
  ingredientes. **Nunca** associe associação a monodroga, nem o contrário. Se a `SUBSTÂNCIA` tiver
  menos componentes que a `APRESENTAÇÃO`, trate-a como incompleta (seção 3.3).
- **R6 — Kits e esquemas** (duas formas ou doses numa caixa: `100 MG COM REV + 200 MG COM REV … X 14 +
  14`, terapia hormonal bifásica, AAS + clopidogrel). Use o CATMAT do kit quando o catálogo tiver
  (ex.: `ESTRADIOL, TRATAMENTO HORMONAL BIFÁSICO…`); senão, **D**. Na GP, 153 dos 180 kits têm CATMAT.
- **R7 — Acessórios.** Seringa preenchida, caneta aplicadora, diluente, bolsa de diluição (sistema
  fechado), inalador, aplicador e blister calendário diferenciam quando o CATMAT os nomeia
  (`COM CANETA`, `C/ SERINGA`, `SISTEMA FECHADO`, `+ DILUENTE`, `COM FRASCO INALADOR`).
- **R8 — Biológicos.** Mesmo nome DCB/INN + dose + forma = mesmo CATMAT; biossimilares não ganham
  item próprio. Prefixos e sufixos mudam a molécula: alfa ≠ beta (alfaepoetina × betaepoetina);
  peg- ≠ não peguilado; insulina por tipo (NPH, regular, aspart, glargina, degludeca…); fator VIII
  plasmático × recombinante × meia-vida estendida, quando o catálogo distinguir; vacinas por
  composição, valência e tipo (inativada, atenuada, mRNA).
- **R9 — Fitoterápicos.** Espécie (binômio) + parte da planta + extrato/padronização + dose. Nunca
  troque de espécie (o caso CYNARA × CURCUMA da GP é erro).
- **R10 — Escolha entre candidatos válidos.** Na ordem: (1) precedente da GP para a mesma assinatura;
  (2) Ativo e não insumo/veterinário/manipulado; (3) todos os atributos do CATMAT
  satisfeitos pelo registro (atributo do CATMAT sem correspondência = contradição); (4) mais
  específico sem contradição; (5) empate → nível B com as opções.
- **R11 — "Não tem" só no fim da escada R14**, depois de busca exaustiva por todos os nomes (DCB,
  INN, sinônimos, sal, ponte aprendida), por PDM de categoria e por associação invertida, **só entre
  itens ativos**. Junte o rascunho do pedido de criação **no padrão do catálogo**, imitando itens
  recentes do mesmo tipo (ex.: `X, CONCENTRAÇÃO: 100 MG, FORMA FARMACÊUTICA: COMPRIMIDO REVESTIDO`),
  os 3 itens ativos mais próximos com o atributo essencial que cada um contraria, e marque
  `xxx = planilhar`.
- **R12 — Fora.** Produtos de teste da ANVISA ("PRODUTO DE MEDICAMENTO PARA TESTE", "PRODUTO TESTE
  21.08", fabricante "VISA ESTADUAL SP TESTE"; alguns com registro iniciado por 9) → `Fora`.
- **R13 — Cross-check terapêutico.** A `CLASSE TERAPÊUTICA` da lista mensal (ex.: `D7B2 -
  CORTICOESTERÓIDES ASSOCIADOS A ANTIMICOTICOS`) tem de ser coerente com o CATMAT. Incoerência →
  alerta, e a proposta não pode ficar no nível A.
- **R14 — Escada de aproximação** (o objetivo é **evitar "Não tem"** sempre que um item ativo
  identifique especificamente o produto). Para cada registro sem precedente, desça até achar:
  1. **Exato:** todos os atributos do CATMAT presentes no registro, e vice-versa nos essenciais.
  2. **Equivalente (grau 1):** só difere na forma de escrever. Sal × base com dose equivalente
     (R2); por mL × total (R3); forma não escrita mas dada pela unidade de fornecimento (o item tem
     `COMPRIMIDO` entre as unidades); "revestido", "gelatinosa", "dura/mole"; material e tipo do
     recipiente. Entra como nível C normal.
  3. **Aproximado (grau 2):** difere num atributo não essencial que o catálogo não oferece de forma
     mais específica, com precedente na GP: liberação retardada → item "liberação
     prolongada/lenta/controlada" (a GP fez isso em 863 de 959 registros LIB RETARD); acessório do
     registro não citado no CATMAT; creme × pomada (61 de 622 pomadas na GP); suspensão × solução e
     solução × xarope orais. Entra como nível C **com alerta "aproximado"** e o atributo divergente
     escrito.
  4. **Novo CATMAT (nível D):** nenhum item ativo passa sem trocar um **atributo essencial**:
     conjunto de princípios ativos, dose (após equivalência), via, comprimido × cápsula, associação
     × monodroga, espécie vegetal, molécula biológica (alfa/beta, peguilada). Os graus 2 aceitos são
     o parâmetro P8.
  Quando dois itens servem em graus diferentes, vence o de grau menor; empate no mesmo grau → R10.

---

## 5. Arquitetura do associador

```
scripts/associar_catmat.py           CLI (--gp, --catalogo, --lista, --saida, --dry-run, --backtest,
                                      --decisoes, --somente-vigentes, --revisar-nao-tem)
scripts/catmat_assoc/
  leitura.py        GP (cabeçalho pelo conteúdo, status, nº), lista mensal (cabeçalho na linha 4/5/54…),
                    catálogo (cp1252, "@"), extração de unidades (cp1252, "@")
  normaliza.py      texto (sem acento, maiúsculas), ingredientes, apresentação, assinatura, acessórios,
                    volume/conteúdo, contagem, doses (R3)
  catalogo.py       parse do CATMAT: PDM, atributos (pelo sentido, não pelo rótulo), doses, forma,
                    flags insumo/veterinário/manipulado + situação e unidades (extração 2.4), descrição sem rótulos
  pontes.py         dicionários aprendidos da GP: ingrediente→PDM, forma CMED→forma/unidade, CATMAT→unidades
  precedente.py     índices de gêmeos e irmãos (chaves hierárquicas da 5.3)
  candidatos.py     geração de candidatos do catálogo (foco em recall)
  guardas.py        verificações G1–G7 (5.4) e escada de aproximação (R14)
  fornecimento.py   unidade de fornecimento + Qt_Embal
  adjudicacao.py    pacote de evidências (JSON) para o agente + leitura de decisoes_catmat.csv
  saida.py          cópia da GP + planilha de revisão
  backtest.py       validação cruzada por raiz e por substância
  testes/           pytest com os casos da 6.3
```

Mesmo padrão dos scripts existentes (`--dry-run`/`--confirm` quando gravar arquivo, mensagens em
português, sem dependência além de `openpyxl`; `pandas` é opcional).

### 5.1 Entrada da fila

1. **Registros novos:** estão na lista mensal e não estão na GP. Cada um vira linha nova da GP,
   preenchida a partir da lista: `Registro`, `Gen.` (Genérico → SIM), `ICMS`, `Substância`, `Produto`,
   `Apresentação`, `CNPJ`, `Fabricante`; `nº` = máximo + 1. Hoje são **0**.
2. **Backlog:** `CATMAT` vazio (715). Use **os dois textos**, o da GP (época da inclusão) e o da lista
   atual, e fique com o que der o parse mais completo, registrando qual foi usado.
3. **Revisão de "Não tem"** (P3): fila à parte.

### 5.2 Normalização (determinística e testada)

Ingredientes e contagem de componentes; dose(s) por componente nas duas leituras (R3); forma, via e
liberação; recipiente primário; conteúdo por recipiente; número de recipientes/unidades; acessórios.
Antes de tudo: `\xa0` e espaços repetidos → um espaço; `MG / ML` → `MG/ML`; vírgula decimal. Guarde o
resultado de cada parse na planilha de revisão, para auditoria.

### 5.3 Precedente (nível A quando unânime e aprovado nas guardas)

Chaves, da mais específica para a mais geral; pare na primeira que tiver precedente:

1. `raiz | assinatura | acessórios` → **irmão**;
2. `assinatura | acessórios | volume` (só para líquidos e injetáveis, quando a dose do CATMAT
   depender do volume);
3. `assinatura | acessórios` → **gêmeo**;
4. `assinatura` → só nível B (falta conferir os acessórios).

**Nível A** = CATMAT unânime **e** (irmão **ou** gêmeos de ≥ 2 raízes distintas) **e** CATMAT
**Ativo** **e** todas as guardas aprovadas. Precedente apontando para CATMAT inativo → nível B, com o
substituto ativo proposto pela R14. Gêmeo de uma raiz só, ou maioria ≥ 2× → **B**. Divergente → **B**, com as opções e a
contagem de cada uma.

### 5.4 Guardas (valem para todo nível, inclusive o A)

- **G1 Catálogo:** o código existe no CSV, está **Ativo** na extração de unidades e não tem flag de
  insumo, veterinário ou manipulado. Item sem situação conhecida (os 2.458 ausentes da extração)
  nunca passa no nível A.
- **G2 Ingredientes:** mesmo número de princípios ativos (R5) e todos presentes no CATMAT (PDM ou
  atributo), pela ponte de nomes.
- **G3 Dose:** todas as doses do CATMAT reproduzidas por alguma leitura do registro (R2/R3), com
  tolerância de arredondamento de ±2%; equivalência sal × base só com massa molar tabelada.
- **G4 Forma:** sem contradição (COMPRIMIDO × CÁPSULA; oral × injetável × tópico × oftálmico ×
  inalatório; liberação especial × convencional, quando houver item específico).
- **G5 Acessório/volume:** acessório ou volume nomeado no CATMAT presente no registro.
- **G6 Classe terapêutica:** coerente (R13).
- **G7 Unidade:** existe na lista oficial do CATMAT uma unidade de fornecimento compatível com o
  recipiente e o conteúdo do registro (e com a forma, nos itens sem forma escrita).

Reprovou em alguma guarda → desce para **B** com o motivo. As guardas também correm sobre os 48.967
vínculos existentes: o que reprovar vai para a aba **"Suspeitas na GP"** (só lista, não corrige).

### 5.5 Catálogo e adjudicação (níveis C e D)

1. **Candidatos (recall):** itens cujo PDM ou atributo contenha algum ingrediente (pela ponte, pelo
   nome-base, por sinônimo DCB/INN ou por PDM de categoria). Corte por compatibilidade de forma e de
   dose. Guarde até 10, ordenados por R10.
2. **Pacote de evidências** (um JSON por registro, e o resumo na planilha): os dados CMED (GP + lista
   atual + classe terapêutica + tipo de produto), o parse, os candidatos com a descrição integral,
   as guardas de cada um e os vínculos da GP para a mesma substância (todas as doses e formas já
   usadas, que mostram o "estilo" do PDM).
3. **Decisão do agente** (P4): para cada pacote, escolha **um** CATMAT ou "Não tem", com justificativa
   curta que cite as regras usadas (ex.: "R2: 2,5 mg de cloridrato = 2,2 mg de base; R4: solução
   oral; G1–G7 ok"). Grave em `saida_catmat/decisoes_catmat.csv`
   (`registro;decisao;catmat;justificativa;regras;autor;data`). **Não decida em lote por analogia**:
   um pacote por vez. O que não for inequívoco fica B com 2–3 opções.
4. **Nível C** = decisão do agente com guardas aprovadas, marcada com o grau da R14 (exato,
   equivalente ou aproximado) → **sempre revisão humana** (nunca entra sozinho nas colunas oficiais).
5. **Nível D** = "Não tem" só no fim da escada R14, com busca exaustiva documentada (lista do que foi
   procurado), os itens ativos mais próximos e o atributo essencial que cada um contraria, e o
   rascunho do pedido de criação (R11).
6. Decisões confirmadas pelo usuário viram **precedente** na rodada seguinte: o script relê
   `decisoes_catmat.csv` e também a GP já corrigida. É assim que o associador aprende mês a mês.

### 5.6 Unidade de fornecimento e Qt_Embal

- Unidade: **sempre da lista oficial do CATMAT** (2.4). Escolha a que bate com o recipiente e o
  conteúdo do registro (`capacidade` + `siglaUnidadeMedida` contra o `X 100 ML`, `X 40 G` da
  apresentação); empate → a já usada na GP para o mesmo CATMAT. Nenhuma compatível → alerta e nível B
  (é sinal de CATMAT errado ou de unidade a pedir).
- Qt_Embal: contagem a partir da apresentação (seção 3.9), com alerta quando o valor destoar dos
  irmãos (mesma raiz) ou quando o padrão de gramatura de blister aparecer.

---

## 6. Validação (antes de entregar qualquer proposta)

### 6.1 Backtest do precedente

- **GroupKFold por raiz** (5 dobras) sobre os 48.967 vínculos: nenhuma apresentação do mesmo produto
  pode estar no treino e no teste ao mesmo tempo. Reporte cobertura e acerto por nível e por chave da
  5.3. **Aceite: nível A ≥ 99,5% de acerto** (referência medida: 99,52–99,81%). Abaixo disso,
  aperte as regras (≥ 3 raízes, chave com volume) até passar.
- Mostre **todos** os desacordos do nível A no backtest, com o tipo provável: erro da GP, acessório
  ou volume não capturado, duplicata do catálogo. É esta lista que vira regra nova.

### 6.2 Backtest do catálogo e da adjudicação (simula substância nova)

- Sorteie (semente fixa) **150 vínculos** da GP em que a substância tenha ≤ 3 registros, e outros 50
  de associações. Esconda o CATMAT, o precedente da mesma substância e as pontes de nome aprendidas
  dela, e rode candidatos + adjudicação **às cegas**.
- Reporte top-1, top-3 e "Não tem" indevido. **Meta:** top-1 ≥ 90% e o CATMAT correto entre os
  candidatos em ≥ 98%. O baseline léxico dá 43%/63% (seção 3.7). Explique cada erro pela regra que
  faltou.

### 6.3 Testes unitários do parser (casos reais da GP)

| Apresentação | Esperado |
|--------------|----------|
| `10 MG/G + 0,443 MG/G CREM DERM CT BG AL X 40 G` | 2 componentes; CREME; BISNAGA 40,00 G; Qt 1 |
| `125 MG/ML SOL INJ CT 1 SER PREENC VD TRANS + DISPOSITIVO ULTRASAFE PASSIVE + EXTENSORES DE APOIO` | SOL INJ; seringa preenchida; Qt 1 |
| `20 MG CAP DURA LIB RETARD CT BL AL PVC TRANS X 14` | CÁPSULA; liberação retardada; Qt 14 |
| `(300 + 35 + 50) MG COM REV CT BL AL PLAS PVC/PVDC TRANS X 30` | 3 doses; COMPRIMIDO; Qt 30 |
| `1000 MG PO SOL INJ IV CT 10 FA VD II TRANS + DIL 10 BOLS PLAS…` | acessórios DIL + BOLS → CATMAT 288298, não 268488 |
| `10 MG/ML SOL DIL INFUS IV CT FA VD AMB X 45 ML` | leitura total 450 MG (CATMAT 270409) |
| `100 MG/ML SOL INJ CT 2 BL X SER PREENC VD TRANS X 0,4 ML + AGU + ENV LEN ÁLCOOL` | leitura total 40 MG (CATMAT 290058); Qt 2 |
| `50 MG/ML SOL INJ CT SER PREENC VD TRANS X 0,4 ML + AGU` | leitura total 20 MG: **não** é o CATMAT "40 MG" |
| `250 MG/5 ML PO SUS OR CT FR VD TRANS X 150 ML` (com `\xa0` no fim) | 50 MG/ML (CATMAT 271111); FRASCO 150,00 ML; Qt 1 |
| `50.000 UI CAP MOLE CT BL AL PLAS OPC X 4` | 50000 UI, não 50 (CATMAT 431098); Qt 4 |
| `9 MG/ML SOL INJ IV CX 200 AMP PLAS TRANS X 10 ML` | equivale a 0,9%; AMPOLA 10,00 ML; Qt 200 |
| `100 MG COM REV + 200 MG COM REV CT BL AL PLAS PVC/PCTFE TRANS X 14 + 14` | kit (R6), 2 doses; 14 + 14 unidades |
| `20 MG COM REV CT BL AL PLAS PVDC 40 TRANS X 30` | Qt **30** (a GP tem 1200: gramatura lida como quantidade) |
| `40 MG/G GRAN CT 15 ENV AL/PLAS PE X 5 G` | 200 MG por envelope (CATMAT 432679); ENVELOPE; Qt 15 |
| `120 MG/G GRAN CT 16 ENV AL/PLAS X 5 G` | 600 MG por envelope (CATMAT 434110) |

E testes do parse do catálogo com rótulos irregulares (`CONCENTRAÇAO`, `CONCENTRAÇÃO*`,
`FORMA FARMACEUTICA`, `INDICAÇÃO: LOÇÃO`, `USO: INJETÁVEL`, `DOSAGEM COMPRIMIDO: 750 MG`).

### 6.4 Conferência final da rodada

- Contagens fecham: fila = A + B + C + D + Fora; nenhum registro perdido nem duplicado.
- Toda descrição proposta é **byte a byte** a do catálogo sem os rótulos (regra da coluna I, seção 2.1).
- Nenhum código fora do CSV, nenhum inativo e nenhuma unidade fora da lista oficial.
- Amostra de 30 propostas do nível A conferida à mão pelo agente, com o resultado registrado.

---

## 7. Saídas (em `saida_catmat/`, fora do git)

1. **`grande.padrao.<AAAA-MM>.proposta.xlsx`**: cópia fiel da GP (mesma aba, linhas 1–5 e fórmulas
   intactas, mesma ordem). Linhas novas no fim, se houver. Nível A preenche H–K **somente onde H
   estava vazio**. Colunas novas a partir de **R**: `Proposta CATMAT`, `Proposta Descrição`,
   `Proposta Unidade`, `Proposta Qt_Embal`, `Nível` (A/B/C/D/Fora), `Aderência` (exato/equivalente/
   aproximado, R14), `Método` (irmão/gêmeo/catálogo/
   adjudicação), `Evidência` (curta), `Alertas`, `Origem` (`AUTO-A 2026-10-01` etc.). Linha que já
   tinha CATMAT **não é tocada**.
2. **`revisao_catmat_<AAAA-MM>.xlsx`**, com as abas: `Resumo` (contagens por nível, métricas do
   backtest) · `Nível A` (para auditoria por amostragem) · `Nível B` (opções + contagens) · `Nível C`
   (decisão, justificativa, top-3, guardas) · `Nível D` (busca feita + rascunho do pedido de CATMAT) ·
   `Não tem → possível CATMAT` (P3) · `Conflitos` ("Não tem" com gêmeo vinculado) · `Suspeitas na GP`
   (guardas reprovadas em vínculos existentes, **só lista**) · `Pontes aprendidas` (ingrediente→PDM,
   forma→unidade) · `Backtest`.
3. **`pacotes/<registro>.json`** (evidências do nível C) e **`decisoes_catmat.csv`** (5.5).
4. Relatório no terminal: o mesmo `Resumo`.

---

## 8. Não fazer

1. Não sobrescrever a GP original nem alterar linha que já tem CATMAT ou status.
2. Não propor CATMAT fora de `Catmats 11-07.CSV`, nem inativo, nem exibir descrição que não seja a
   do catálogo.
2a. Não marcar "Não tem" sem percorrer a escada R14 até o fim e documentar os itens mais próximos.
3. Não aplicar automaticamente nada além do nível A validado (≥ 99,5%).
4. Corrigir vínculos existentes está fora do escopo: suspeitas só vão para a aba `Suspeitas na GP`.
5. Não associar associação a monodroga (nem o contrário), comprimido a cápsula, nem trocar espécie
   vegetal, alfa por beta ou peguilado por não peguilado.
6. Não inventar massa molar, fator UI/mg ou sinônimo sem fonte; na dúvida, nível B com alerta.
7. Não usar `nº` como ordem temporal; não confiar na ordem das colunas: o cabeçalho manda.
8. Não tocar no banco, no painel, nos importadores existentes nem commitar planilhas, pacotes ou
   saídas.

---

## 9. Entregáveis

- `scripts/associar_catmat.py` + `scripts/catmat_assoc/` + testes (pytest) passando.
- Saídas da seção 7 para a GP atual (backlog de 715 + revisão dos "Não tem").
- Relatório do backtest (6.1 e 6.2) com a lista de desacordos comentada.
- Uma subseção nova no `CLAUDE.md` ("Associação Registro × CATMAT"): comando, níveis, regras
  R1–R14, guardas e o fluxo mensal (5.5, item 6).

## 10. Ordem de execução

1. Ler os quatro arquivos e **reproduzir os números das seções 2 e 3** (eles são o teste de que a
   leitura está certa). Divergiu → pare e explique antes de seguir.
2. `normaliza.py` + `catalogo.py` + testes da 6.3.
3. Carregar a extração de unidades (situação + unidades), depois `pontes.py` + `precedente.py` + `guardas.py` → backtest 6.1 até o nível A ≥ 99,5%.
4. `fornecimento.py` (unidade e Qt_Embal) + conferência contra a GP (≥ 97%).
5. `candidatos.py` + `adjudicacao.py` → backtest às cegas 6.2.
6. Rodar no backlog: nível A automático; pacotes do nível C adjudicados um a um; D com o rascunho do
   pedido.
7. Revisão dos "Não tem" (P3) e lista de conflitos.
8. Gerar as saídas, conferir (6.4), mostrar o `Resumo` ao usuário e **pedir a revisão** dos níveis B,
   C e D antes de qualquer outra coisa.
