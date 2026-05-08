# ANÁLISE HEURÍSTICA COMPARATIVA — DJUD PAINEL
## Avaliação baseada nas 10 Heurísticas de Usabilidade de Nielsen

**Versão:** 4.0
**Data:** Maio 2026
**Projeto:** DJUD Painel — Demandas Judiciais em Saúde (Ministério da Saúde)
**Avaliador:** Claude Sonnet 4.5 + Equipe de UX/Product Design
**Metodologia:** Inspeção Heurística contra Nielsen's 10 Usability Heuristics
**Referência anterior:** Análise Heurística v1.0 (Abril 2026, Score: 6.2/10)

---

## PAINEL EXECUTIVO DE EVOLUÇÃO

### Comparativo de Versões

| # | Heurística | v1.0 | v2.0 | v3.0 | **v4.0** | Δ (v1→v4) |
|---|-----------|------|------|------|---------|-----------|
| 1 | Visibilidade do Status | 5.0 | 5.5 | 6.0 | **7.5** | +2.5 ↑ |
| 2 | Correspondência Mundo Real | 7.5 | 7.5 | 7.5 | **8.0** | +0.5 ↑ |
| 3 | Controle e Liberdade | 5.5 | 5.5 | 5.5 | **6.0** | +0.5 ↑ |
| 4 | Consistência e Padrões | 7.0 | 7.5 | 7.5 | **8.5** | +1.5 ↑ |
| 5 | Prevenção de Erros | 5.0 | 5.5 | 6.0 | **7.0** | +2.0 ↑ |
| 6 | Reconhecimento vs Memória | 7.5 | 7.5 | 7.5 | **8.0** | +0.5 ↑ |
| 7 | Flexibilidade e Eficiência | 5.0 | 5.0 | 5.5 | **7.0** | +2.0 ↑ |
| 8 | Estética e Design Minimalista | 7.0 | 7.0 | 8.0 | **8.5** | +1.5 ↑ |
| 9 | Suporte e Documentação | 2.0 | 2.0 | 2.0 | **2.5** | +0.5 ↑ |
| 10 | Recuperação de Erros | 5.5 | 5.5 | 6.0 | **7.0** | +1.5 ↑ |
| | **SCORE GERAL** | **6.2** | **6.4** | **6.7** | **7.0** | **+0.8 ↑** |

### Gráfico de Evolução (ASCII)

```
Heurística          v1.0  v4.0  Ganho
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Visibilidade      ████░░░░░░  5.0 → 7.5  (+2.5) ↑↑
2. Mundo Real        ███████░░░  7.5 → 8.0  (+0.5) ↑
3. Controle          █████░░░░░  5.5 → 6.0  (+0.5) ↑
4. Consistência      ███████░░░  7.0 → 8.5  (+1.5) ↑↑
5. Prevenção Erros   █████░░░░░  5.0 → 7.0  (+2.0) ↑↑
6. Reconhecimento    ███████░░░  7.5 → 8.0  (+0.5) ↑
7. Flexibilidade     █████░░░░░  5.0 → 7.0  (+2.0) ↑↑
8. Estética          ███████░░░  7.0 → 8.5  (+1.5) ↑↑
9. Documentação      ██░░░░░░░░  2.0 → 2.5  (+0.5) ↑ (FRACO)
10. Recuperação      █████░░░░░  5.5 → 7.0  (+1.5) ↑↑
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCORE GERAL          ██████░░░░  6.2 → 7.0  (+0.8) ↑
```

---

## VISÃO GERAL POR HEURÍSTICA (v4.0)

| # | Heurística (Nielsen) | Status v4.0 | Score | Tendência | Principais impactos de negócio |
|---|---------------------|------------|-------|-----------|-------------------------------|
| 1 | Visibilidade do status | **Bom** | 7.5 | ↑↑ | Usuário sabe o estado da plataforma |
| 2 | Correspondência mundo real | **Bom** | 8.0 | ↑ | Linguagem institucional adequada |
| 3 | Controle e liberdade | **Médio** | 6.0 | ↑ | Ainda falta undo, breadcrumbs explícitas |
| 4 | Consistência e padrões | **Bom** | 8.5 | ↑↑ | Design system unificado e coerente |
| 5 | Prevenção de erros | **Bom** | 7.0 | ↑↑ | FormComponents com validação Zod |
| 6 | Reconhecimento vs memória | **Bom** | 8.0 | ↑ | Tabs analíticas organizam contexto |
| 7 | Flexibilidade e eficiência | **Bom** | 7.0 | ↑↑ | Tabs, File Preview, PDF Export |
| 8 | Estética e design | **Excelente** | 8.5 | ↑↑ | Design Spells + glassmorphism + gradients |
| 9 | Suporte e documentação | **Fraco** | 2.5 | ↑ | Ainda sem help contextual ou FAQ |
| 10 | Recuperação de erros | **Bom** | 7.0 | ↑↑ | Error states visíveis + mensagens |

**Score Geral v4.0: 7.0/10** *(vs 6.2/10 em v1.0 → +0.8 pontos)*

---

## ANÁLISE DETALHADA POR HEURÍSTICA

---

### H1 — VISIBILIDADE DO STATUS DO SISTEMA

**Score v4.0:** 🟢 **7.5/10** *(v1.0: 5.0 | v3.0: 6.0)*

**Contexto:** O sistema deve manter os usuários informados sobre o estado atual através de feedback visual claro e contínuo.

#### Pontos Fortes (v4.0) ✅

1. **Loading states completos em todas as páginas**
   - Dashboard: `<Loader2 className="animate-spin" />` centralizado durante fetch
   - Demandas: 10 linhas skeleton `animate-pulse` durante carregamento
   - Botão submit: `<Loader2 />` em substituição ao label durante submissão

2. **Error states visíveis no Dashboard**
   ```tsx
   // dashboard/page.tsx
   <div className="rounded-lg border border-destructive bg-destructive/10 p-6">
     <AlertTriangle /> Erro ao carregar métricas
     <button onClick={() => window.location.reload()}>Recarregar página</button>
   </div>
   ```

3. **4 MetricCards com KPIs sempre visíveis**
   - Total de Processos: 51.501
   - Passivo Ativo: contagem dinâmica
   - Demandas Críticas: contagem com ícone `<AlertTriangle />`
   - Taxa de Resolução: % formatado

4. **Status badges semânticos em toda tabela de demandas**
   - Verde, âmbar, vermelho, azul, laranja, roxo por status

5. **Filtros com botão "Limpar" visível apenas quando ativo**
   - `{hasActiveFilters && <Button>Limpar</Button>}`

#### Problemas / Oportunidades ❌

1. **Sem toast/notificações após ações CRUD**
   - Deletar/editar demanda não confirma visualmente o sucesso
   - Usuário fica sem feedback após submissão de formulário
   - Impacto: Alta confusão, especialmente após operações críticas

2. **Sem indicador de progresso em uploads**
   - Upload de arquivo não mostra % de conclusão
   - Para arquivos grandes (próximo a 10MB), aparência de "travado"

3. **Sem aviso de sessão expirando**
   - Usuário pode perder dados em formulário se sessão expirar silenciosamente

#### Recomendações v5.0

```tsx
// Implementar Sonner toast global
import { toast } from "sonner"

// Em cada mutação
await deleteUser(id);
toast.success("Usuário deletado com sucesso");

// Em erros
toast.error("Erro ao deletar. Tente novamente.");

// Upload progress
<Progress value={uploadPercent} className="h-1 mt-2" />
```

---

### H2 — CORRESPONDÊNCIA ENTRE SISTEMA E MUNDO REAL

**Score v4.0:** 🟢 **8.0/10** *(v1.0: 7.5 | v3.0: 7.5)*

**Contexto:** Usar linguagem e conceitos familiares ao domínio jurídico-governamental.

#### Pontos Fortes (v4.0) ✅

1. **Título do Dashboard reformulado para linguagem institucional**
   - v3: "Dashboard" → v4: **"Painel de Inteligência DJUD"**
   - Subtítulo: "Dimensionamento, tendência e gestão de riscos das demandas judiciais de medicamentos — Ministério da Saúde"

2. **Subtítulos das seções com linguagem decisória**
   - "Ranking por volume de processos judiciais — **subsidia o quantitativo para Atas de Registro de Preços (ARP)**"
   - "**Série Histórica** de Demandas — base para análise de tendência e previsibilidade"
   - "Servidores com maior volume de processos **sob responsabilidade**"

3. **MetricCards com terminologia jurídica-governamental**
   - "Passivo Ativo" (não "demandas abertas")
   - "Demandas Críticas" (não "prioridade alta")
   - "Taxa de Resolução" (padrão de gestão pública)

4. **Campos do formulário alinhados com vocabulário DJUD**
   - `principioAtivo` (não "medicamento genérico")
   - `areaTematica` (grupo temático jurídico)
   - `dataEntradaDJUD` (nomenclatura de sistema legado)
   - `trfRegiao` (Tribunal Regional Federal)

5. **Labels das tabs com contexto analítico claro**
   - "Tendência" → evolução temporal
   - "Dimensionamento" → volume para compras
   - "Riscos" → gargalos e prioridades
   - "Geografia" → distribuição regional
   - "Operacional" → servidores responsáveis

#### Problemas / Oportunidades ❌

1. **Logs ainda expõem termos técnicos**
   - Coluna "Entity" em inglês
   - IDs UUID truncados sem contexto: `abc123…`
   - JSON diff sem tradução amigável das mudanças

2. **Terminologia de Prioridade inconsistente**
   - Redmine usa "Normal", sistema usa "Média" e "Normal"
   - Cria confusão nos filtros do dashboard

3. **Falta de glossário para termos judiciais**
   - Novos servidores não conhecem TRF, DJUD, COAJUD, ARP, NUP
   - Sem tooltip de definição em campos do formulário

#### Recomendações v5.0

```tsx
// Tooltip glossário inline
<FormLabel>
  TRF Região
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger><HelpCircle className="h-3 w-3 ml-1" /></TooltipTrigger>
      <TooltipContent>Tribunal Regional Federal — instância judicial de 2° grau</TooltipContent>
    </Tooltip>
  </TooltipProvider>
</FormLabel>

// Logs com diff amigável
const formatChange = (key, before, after) => 
  `${fieldLabels[key] || key}: "${before}" → "${after}"`;
```

---

### H3 — CONTROLE E LIBERDADE DO USUÁRIO

**Score v4.0:** 🟡 **6.0/10** *(v1.0: 5.5 | v3.0: 5.5)*

**Contexto:** Permitir que usuários saiam de fluxos indesejados com "saídas de emergência" claras.

#### Pontos Fortes (v4.0) ✅

1. **ConfirmDialog antes de deletar** — implementado em Demandas e Usuários
2. **Botão Cancelar** em todos os formulários
3. **Filtros com reset** — botão "Limpar" visível quando filtros ativos
4. **Navegação sidebar** — usuário não fica preso em fluxo linear
5. **Modal FilePreview** tem botão fechar (`×`) claro
6. **DemandaExportModal** tem opções de cancelamento

#### Problemas / Oportunidades ❌

1. **Sem breadcrumbs explícitas em páginas de detalhe**
   - `/demandas/[id]/edit` não mostra "Demandas > #2024001 > Editar"
   - Topbar tem breadcrumbs dinâmicas mas podem não ser suficientemente destacadas

2. **Sem confirmação ao sair de formulário com dados não salvos**
   - Clicar em link da sidebar enquanto editando → dados perdidos silenciosamente
   - Impacto: Alta frustração + trabalho perdido

3. **Sem undo após DELETE**
   - Exclusão de demanda é irreversível (hard delete)
   - Usuário clica em "Confirmar" por engano → sem recuperação

4. **Sem auto-save em formulários longos**
   - Formulário de edição tem ~15 campos
   - Falha de rede ou sessão expirada → perda total

5. **Sem "Criar outro" após criação bem-sucedida**
   - Após criar demanda → redireciona para lista
   - Para criar 10 demandas, usuário precisa navegar 10×

#### Recomendações v5.0

```tsx
// Confirmação de saída com dados não salvos
const { isDirty } = useFormState({ control });

useEffect(() => {
  const handleBeforeUnload = (e: BeforeUnloadEvent) => {
    if (isDirty) {
      e.preventDefault();
      e.returnValue = "Há alterações não salvas. Deseja sair?";
    }
  };
  window.addEventListener("beforeunload", handleBeforeUnload);
  return () => window.removeEventListener("beforeunload", handleBeforeUnload);
}, [isDirty]);

// Soft delete com recuperação
// Em vez de DELETE físico → status = "ARQUIVADA", deletedAt = now()
// Mostrar opção "Restaurar" por 30 dias

// Opção pós-criação
<div className="flex gap-2">
  <Button onClick={() => router.push("/demandas")}>Ver lista</Button>
  <Button variant="outline" onClick={resetForm}>Criar outra</Button>
</div>
```

---

### H4 — CONSISTÊNCIA E PADRÕES

**Score v4.0:** 🟢 **8.5/10** *(v1.0: 7.0 | v3.0: 7.5)*

**Contexto:** Seguir convenções para que usuários possam prever o comportamento.

#### Pontos Fortes (v4.0) ✅

1. **FormComponents unificados (NOVO em v4)**
   - `<FormField />`, `<FormInput />`, `<FormSelect />`, `<FormTextarea />`, `<FormFileInput />`
   - Padrão único de label + input + error em todos os formulários
   - Elimina inconsistências entre form de Demanda e form de Usuário

2. **Section component padronizado no Dashboard**
   ```tsx
   <Section icon={<Icon />} title="..." subtitle="..." full={false}>
     <ChartComponent />
   </Section>
   ```
   - Mesmo cabeçalho em todos os 10 gráficos

3. **Gradientes de chart unificados**
   - `PALETTE_CATEGORICAL` compartilhado entre TopResponsaveis e outros
   - Mesmo padrão `linearGradient + Cell + url(#grad)` em todos os BarCharts
   - Glassmorphism tooltip idêntico em todos os charts:
     `bg-background/95 backdrop-blur-md border border-primary/30`

4. **FilterBar consistente em todas as listagens**
   - Demandas, Usuários, Logs → mesmo `<FilterBar isActive onReset>` pattern
   - Botão Reset aparece apenas quando há filtros ativos

5. **DataTable com mesmo layout em todas as páginas**
   - TanStack Table, mesma estrutura de colunas, paginação, empty state

6. **Sidebar navigation sem duplicata (corrigido em v4)**
   - Avatar removido do Topbar → presente apenas no footer da Sidebar
   - Elimina redundância visual confusa da v3

7. **Loading states consistentes**
   - `<Loader2 className="animate-spin" />` = padrão único
   - Skeleton animate-pulse = padrão único de lista

#### Problemas / Oportunidades ❌

1. **Dashboard usa `<select>` nativo, demais usam `<FilterSelect>`**
   - Inconsistência visual entre o select do dashboard e o select dos filtros nas listas
   - Impacto: Baixo, mas quebra uniformidade

2. **MetricCard duplicado (backoffice/ e dashboard/)**
   - Existe `components/backoffice/metric-card.tsx` E `components/dashboard/metric-card.tsx`
   - Pode gerar divergência futura

3. **Variante de botão não padronizada em Cancel**
   - Alguns formulários: `variant="outline"`, outros: `variant="ghost"`

#### Recomendações v5.0

```tsx
// Unificar MetricCard em um único componente
// Remover backoffice/metric-card.tsx (duplicata)

// Unificar selects do dashboard com FilterSelect
<FilterSelect
  label="Status"
  value={filterStatus}
  onChange={setFilterStatus}
  options={[{ value: "", label: "Todos os status" }, ...statusOptions]}
/>
```

---

### H5 — PREVENÇÃO DE ERROS

**Score v4.0:** 🟢 **7.0/10** *(v1.0: 5.0 | v3.0: 6.0)*

**Contexto:** Evitar problemas antes de ocorrerem por design cuidadoso.

#### Pontos Fortes (v4.0) ✅

1. **FormComponents com validação Zod integrada (NOVO v4)**
   - `<FormField />` recebe `error` prop e exibe abaixo do campo
   - react-hook-form + zodResolver para validação em tempo real
   - Feedback imediato sem precisar submeter

2. **ConfirmDialog em todas as ações destrutivas**
   - Deletar demanda, deletar usuário, deletar arquivo
   - Texto claro: "Esta ação não pode ser desfeita"

3. **Validação de arquivo no FormFileInput**
   - Tamanho: ≤ 10MB
   - Tipos MIME: PDF, JPG, PNG, DOC, DOCX
   - Erro exibido antes do upload

4. **Campos obrigatórios identificados**
   - `titulo` (required, min 3), `descricao` (required, min 10)
   - Zod schema valida client e server-side

5. **RBAC previne ações não autorizadas**
   - Botão "Deletar" só aparece se `canDelete` (baseado em role)
   - Endpoint retorna 403 se role insuficiente

6. **Número de demanda único (Prisma)**
   - `numero String @unique` previne duplicação em nível de banco

#### Problemas / Oportunidades ❌

1. **Sem rate limiting nas APIs**
   - POST `/api/demandas` pode ser chamado em loop sem limite
   - Risco de flood de dados ou abuso

2. **Campos opcionais sem indicação visual clara do que é obrigatório**
   - Formulário de demanda tem ~15 campos — usuário não sabe quais são necessários
   - Sem asterisco `*` em campos required

3. **Sem validação de datas incoerentes**
   - `dataInicio` pode ser posterior a `dataVencimento` sem aviso
   - `dataEntradaDJUD` pode ser no futuro sem alerta

4. **Sem sanitização explícita de XSS**
   - Campo `descricao` aceita HTML/scripts sem filtragem visível
   - Next.js/React sanitiza por default, mas sem validação extra

5. **Sem aviso sobre campos que afetam relatórios**
   - `principioAtivo` vazio → não aparece no gráfico de medicamentos
   - Sem hint: "Este campo alimenta o dimensionamento analítico"

#### Recomendações v5.0

```tsx
// Marcação de campos obrigatórios
<FormLabel>
  Título <span className="text-destructive">*</span>
</FormLabel>

// Validação de datas coerentes
.refine(
  (data) => !data.dataVencimento || !data.dataInicio || 
    data.dataVencimento >= data.dataInicio,
  { message: "Data vencimento deve ser após data início", path: ["dataVencimento"] }
)

// Rate limiting via middleware
import { Ratelimit } from "@upstash/ratelimit";
const ratelimit = new Ratelimit({ redis, limiter: Ratelimit.fixedWindow(10, "1m") });
```

---

### H6 — RECONHECIMENTO EM VEZ DE MEMORIZAÇÃO

**Score v4.0:** 🟢 **8.0/10** *(v1.0: 7.5 | v3.0: 7.5)*

**Contexto:** Tornar opções e instruções visíveis, sem exigir memorização.

#### Pontos Fortes (v4.0) ✅

1. **Tabs do Dashboard com ícones + labels (NOVO v4)**
   - `<TrendingUp /> Tendência`, `<Pill /> Dimensionamento`, `<ShieldAlert /> Riscos`
   - Usuário sabe exatamente onde está e o que cada tab contém

2. **Section subtitles como guia contextual**
   - Cada gráfico tem subtitle explicativo do que mede e para que serve
   - Ex: "Subsidia o quantitativo para Atas de Registro de Preços (ARP)"

3. **Status badges com cor + texto**
   - Não só cor — "Concluída" (verde), "Em Análise" (âmbar) — texto sempre presente

4. **RiskBadge com label + valor + barra visual**
   - Crítica/Alta/Normal/Baixa visíveis sem memorizar padrão de cor

5. **FilterBar com labels em todos os selects**
   - Não são selects anônimos — cada um tem `<Label>` claro

6. **Placeholders e empty states com calls to action**
   - "Sem dados de princípio ativo disponíveis"
   - "Comece criando uma nova demanda ou importe dados do Excel"

#### Problemas / Oportunidades ❌

1. **Logs: IDs técnicos sem contexto visual**
   - UUID truncado `abc123…` não ajuda o usuário a entender "o quê foi modificado"

2. **Falta de tooltips em colunas truncadas**
   - Título longo na DataTable é cortado sem hover tooltip
   - Medicamento > 28 chars exibe `…` sem forma de ver o nome completo (exceto no tooltip do gráfico)

3. **Sem indicador de "você está aqui" em tabs**
   - Tab ativa tem estilo diferente (Radix UI padrão) mas poderia ser mais pronunciada

4. **Formulário de demanda sem indicação de seção atual**
   - 4 seções (Básico, Responsabilidade, Datas, Dados Judiciais) sem step indicator
   - Para formulário longo, usuário não sabe progresso

#### Recomendações v5.0

```tsx
// Tooltip em colunas truncadas
<TableCell>
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger className="truncate max-w-[200px] block">
        {row.original.titulo}
      </TooltipTrigger>
      <TooltipContent>{row.original.titulo}</TooltipContent>
    </Tooltip>
  </TooltipProvider>
</TableCell>

// Step indicator no formulário
<div className="flex gap-2 mb-6">
  {sections.map((section, i) => (
    <div key={i} className={cn("flex-1 h-1 rounded", 
      i <= currentSection ? "bg-primary" : "bg-muted"
    )} />
  ))}
</div>
```

---

### H7 — FLEXIBILIDADE E EFICIÊNCIA DE USO

**Score v4.0:** 🟢 **7.0/10** *(v1.0: 5.0 | v3.0: 5.5)*

**Contexto:** Sistema deve ser utilizável por iniciantes mas também eficiente para usuários avançados.

#### Pontos Fortes (v4.0) ✅

1. **Tabs analíticas como atalho por contexto (NOVO v4)**
   - Usuário experiente vai diretamente para a tab relevante
   - Não precisa scrollar por todos os gráficos

2. **File Preview sem baixar arquivo (NOVO v4)**
   - Visualizar PDF/imagem direto no modal → economia de tempo
   - Zoom, navegação entre páginas do PDF

3. **PDF Export com opções granulares (NOVO v4)**
   - Usuário escolhe incluir/excluir gráficos e anexos
   - Opção download vs. email direto

4. **Filtros URL-synced = compartilháveis**
   - Analista filtra por TRF 3 + Prioridade Alta → compartilha link com gestor
   - Eficiente para comunicação de equipe

5. **100 itens por página**
   - Visão de maior volume sem paginação excessiva
   - Usuário avançado vê mais dados de uma vez

6. **Exportação CSV para análise externa**
   - Usuários avançados continuam análise no Excel/BI

#### Problemas / Oportunidades ❌

1. **Sem atalhos de teclado**
   - Ctrl+K: busca global (padrão de ferramentas modernas)
   - Ctrl+N: nova demanda
   - ESC: fechar modal
   - /: focar campo de busca

2. **Sem batch operations**
   - Selecionar 50 demandas → exportar selecionadas → não existe
   - Cada ação é individual → ineficiente para operações em massa

3. **Sem buscas salvas / favoritos**
   - "Mostrar demandas críticas do TRF 3 de São Paulo" — usuário reconfigura todo dia
   - Sem forma de salvar esse preset de filtros

4. **Sem busca global (Cmd+K)**
   - Ferramenta moderna de backoffice esperaria Command Palette
   - Busca por demanda #, medicamento, responsável — direto sem navegar

5. **Sem personalização do dashboard**
   - Todos os usuários veem os mesmos gráficos
   - Operador pode querer ver apenas sua região

6. **Pagesize fixo em 100**
   - Não há opção de ver 20, 50 ou 200 itens
   - Para usuários com tela grande, 200 seria mais eficiente

#### Recomendações v5.0

```tsx
// Command palette (cmdk)
import { Command } from "cmdk"

<Command>
  <Command.Input placeholder="Buscar demanda, usuário, medicamento..." />
  <Command.List>
    <Command.Item onSelect={() => router.push("/demandas/new")}>
      Nova Demanda ⌘N
    </Command.Item>
    {searchResults.map(item => <Command.Item key={item.id}>{item.titulo}</Command.Item>)}
  </Command.List>
</Command>

// Pagesize selector
<Select value={pageSize} onValueChange={setPageSize}>
  <SelectItem value="20">20 por página</SelectItem>
  <SelectItem value="50">50 por página</SelectItem>
  <SelectItem value="100">100 por página</SelectItem>
</Select>
```

---

### H8 — ESTÉTICA E DESIGN MINIMALISTA

**Score v4.0:** 🟢 **8.5/10** *(v1.0: 7.0 | v3.0: 8.0)*

**Contexto:** Interfaces não devem conter informações irrelevantes ou raramente necessárias.

#### Pontos Fortes (v4.0) ✅

1. **Design Spells sofisticados na Login (NOVO v4)**
   - Spring physics com Framer Motion (não animação linear)
   - Stagger children com delay progressivo
   - Magnetic cards com tracking de cursor
   - Cards institucionais com identidade visual forte

2. **Charts com gradientes e glassmorphism (NOVO v4)**
   - Todas as barras têm gradiente suave (opacity 0.8→1.0)
   - Tooltips: `bg-background/95 backdrop-blur-md` — glassmorphism elegante
   - Framer Motion nos pontos da timeline (r: 0→4, whileHover: r→7)
   - Cores bem calibradas por categoria

3. **Dashboard organizado em tabs**
   - Remove sobrecarga visual de mostrar 10 gráficos simultaneamente
   - Usuário vê apenas o contexto que precisa

4. **Section component limpo e padronizado**
   - Ícone + título + subtítulo → estrutura visual clara
   - `border border-border bg-card` — cards sem excesso

5. **RiskBadge como visualização de dados eficiente**
   - Barra horizontal + label + valor = informação densa e clara
   - 4 indicadores em espaço compacto

6. **Sidebar sem duplicata de avatar (corrigido v4)**
   - Eliminou confusão visual da v3 que mostrava avatar em dois lugares

7. **MetricCards com ícones e descriptions contextuais**
   - "Passivo Ativo" + "Processos não concluídos" → hierarquia de informação

#### Problemas / Oportunidades ❌

1. **Logs ainda expõem JSON bruto**
   - Expandir "Ver mudanças" mostra diff em JSON não formatado
   - Sem syntax highlighting, sem tradução amigável

2. **Login page: painel esquerdo muito denso em mobile**
   - Cards 2×3 ficam empilhados ou muito pequenos
   - `hidden md:flex` — ok, mas poderia ter versão mobile elegante

3. **DataTable muito densa em telas pequenas**
   - 9 colunas na tabela de demandas → horizontal scroll forçado
   - Sem card-view alternativo para mobile

4. **Alguns cards do grid da Login sem ícone**
   - Cards tipo "stat" (51.501, 98%) ficam mais "frios" que os com ícone
   - Poderia ter elementos visuais mais ricos

#### Recomendações v5.0

```tsx
// JSON diff amigável nos logs
const renderChanges = (changes: Record<string, unknown>) => (
  Object.entries(changes).map(([key, value]) => (
    <div key={key} className="flex gap-2 text-xs py-1 border-b border-border/50">
      <span className="text-muted-foreground min-w-[120px]">{fieldLabels[key] || key}:</span>
      <span className="text-foreground font-medium">{String(value)}</span>
    </div>
  ))
);

// Card-view alternativo para mobile
const isMobile = useMediaQuery("(max-width: 768px)");
{isMobile ? <DemandaCard data={row} /> : <DataTableRow row={row} />}
```

---

### H9 — AJUDA E DOCUMENTAÇÃO

**Score v4.0:** 🔴 **2.5/10** *(v1.0: 2.0 | v3.0: 2.0)*

**Contexto:** O sistema deve fornecer ajuda fácil de buscar, focada em tarefas específicas.

#### Pontos Fortes (v4.0) ✅

1. **Subtítulos dos gráficos funcionam como mini-documentação**
   - "Subsidia o quantitativo para ARPs" → informa o propósito de negócio
   - Melhor do que v3 que não tinha subtítulos

2. **Error messages mais claras no dashboard**
   - "Erro ao carregar métricas" + botão "Recarregar"
   - Melhor do que v3 (apenas console.error)

3. **Labels e placeholders com contexto**
   - Algum nível de orientação implícita nos campos

#### Problemas / Oportunidades ❌

1. **CRÍTICO: Sem botão de ajuda (?) em nenhuma página**
   - Nenhum ponto de acesso à documentação
   - Novo usuário não tem orientação

2. **CRÍTICO: Sem onboarding ou tutorial inicial**
   - Primeiro login cai no Dashboard sem explicação
   - Como criar a primeira demanda? Como filtrar? Não está documentado

3. **Sem glossário de termos**
   - TRF, DJUD, COAJUD, ARP, CNPJ, NUP — não explicados em nenhum lugar

4. **Sem FAQ ou página de ajuda**
   - `/help` não existe
   - Não há documentação de usuário final

5. **Sem matriz de permissões visível**
   - Novo OPERATOR não sabe o que pode/não pode fazer
   - Recebe erro 403 sem explicação contextual

6. **Sem contato de suporte**
   - Sem email, telefone ou form de suporte visível

7. **Sem changelog**
   - Usuário não sabe o que mudou na v4.0

#### Recomendações v5.0

Esta é a heurística com **maior gap** e **maior oportunidade de melhoria**.

```tsx
// 1. Página /help básica
// app/(auth)/help/page.tsx
export default function HelpPage() {
  return (
    <div>
      <PageHeader title="Central de Ajuda" />
      <Tabs defaultValue="inicio">
        <TabsTrigger value="inicio">Primeiros Passos</TabsTrigger>
        <TabsTrigger value="demandas">Demandas</TabsTrigger>
        <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
        <TabsTrigger value="permissoes">Permissões</TabsTrigger>
        <TabsTrigger value="glossario">Glossário</TabsTrigger>
      </Tabs>
    </div>
  );
}

// 2. Botão ? flutuante em todas as páginas
<Button
  variant="ghost"
  size="icon"
  className="fixed bottom-6 right-6 rounded-full shadow-lg"
  onClick={() => setHelpOpen(true)}
>
  <HelpCircle className="h-5 w-5" />
</Button>

// 3. Tooltip contextual por campo
<FormLabel>
  Grupo Temático
  <HelpTooltip>
    Categoria temática da demanda, usada para agrupamento analítico e planejamento de compras.
  </HelpTooltip>
</FormLabel>
```

**Impacto estimado de implementar H9:** +2.5 pontos → score 7.0 → **Score geral: ~7.8/10**

---

### H10 — RECUPERAÇÃO DE ERROS

**Score v4.0:** 🟢 **7.0/10** *(v1.0: 5.5 | v3.0: 6.0)*

**Contexto:** Ajudar o usuário a reconhecer, diagnosticar e recuperar-se de erros.

#### Pontos Fortes (v4.0) ✅

1. **Error state visível no Dashboard (NOVO v4)**
   ```tsx
   <div className="rounded-lg border border-destructive bg-destructive/10 p-6">
     <AlertTriangle className="h-4 w-4 text-destructive" />
     <span>Erro ao carregar métricas</span>
     <p>{error instanceof Error ? error.message : "Não foi possível consultar o banco de dados."}</p>
     <button onClick={() => window.location.reload()}>Recarregar página</button>
   </div>
   ```

2. **Error state na lista de demandas**
   - `<AlertCircle />` com mensagem de erro e botão de retry
   - Console logging para debug (`✅ loaded`, `❌ error`)

3. **ConfirmDialog com linguagem de risco**
   - "Esta ação não pode ser desfeita"
   - Previne o "erro" antes de ocorrer

4. **HTTP status codes corretos nas APIs**
   - 200: sucesso, 400: validação, 401: não autenticado, 403: sem permissão, 404: não encontrado

5. **Validação Zod retorna errors detalhados**
   - `ZodError.errors` com path + message específica por campo
   - Não retorna apenas "400 Bad Request"

6. **`app/error.tsx` como error boundary global**
   - Catches React errors sem crashar a aplicação inteira

#### Problemas / Oportunidades ❌

1. **Sem toast de feedback após ações CRUD**
   - Submit formulário → sem confirmação visual (sucesso ou erro)
   - O maior gap em feedback de recuperação

2. **Sem retry automático em falhas de rede**
   - Se o fetch falha, não há tentativa automática
   - TanStack Query poderia configurar `retry: 3`

3. **Sem timeout handler em formulários**
   - Submit lento (>30s) → botão fica "em loading" para sempre
   - Sem mensagem "A requisição está demorando mais que o esperado"

4. **Mensagens de erro de validação ainda técnicas**
   - Zod padrão: "String must contain at least 3 character(s)"
   - Deveria ser: "Título precisa ter pelo menos 3 caracteres"
   - Mapear erros Zod para português

5. **PDF Export sem feedback de progresso**
   - Gerar PDF de 51K registros pode demorar
   - Sem loading, sem barra de progresso, sem "estamos gerando..."

#### Recomendações v5.0

```tsx
// Mensagens Zod em português
const zodPt = {
  too_small: ({ minimum }) => `Mínimo de ${minimum} caracteres`,
  too_big: ({ maximum }) => `Máximo de ${maximum} caracteres`,
  invalid_type: () => "Campo obrigatório",
};
const zodPtResolver = zodResolver(schema, { errorMap: zodPt });

// Retry com TanStack Query
const { data, isError, refetch } = useQuery({
  queryKey: ["demandas", filters],
  queryFn: fetchDemandas,
  retry: 3,
  retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000),
});

// Toast global após mutations
const createDemanda = useMutation({
  mutationFn: (data) => fetch("/api/demandas", { method: "POST", body: JSON.stringify(data) }),
  onSuccess: () => {
    toast.success("Demanda criada com sucesso!");
    router.push("/demandas");
  },
  onError: (error) => {
    toast.error(`Erro ao criar demanda: ${error.message}`);
  },
});
```

---

## BACKLOG UX PRIORIZADO (v5.0)

### 🔴 Alta Prioridade — Impacto imediato na usabilidade

| # | Ação | Heurística(s) | Esforço | Impacto |
|---|------|--------------|---------|---------|
| 1 | Sistema de toast global (Sonner) | H1, H10 | Baixo | Alto |
| 2 | Mensagens Zod em português | H10, H5 | Baixo | Alto |
| 3 | Tooltip em colunas truncadas | H6, H8 | Baixo | Médio |
| 4 | Campo obrigatório com asterisco `*` | H5 | Muito baixo | Médio |
| 5 | Breadcrumbs explícitas em detalhe/edit | H3, H6 | Baixo | Médio |
| 6 | Confirmação de saída com dados não salvos | H3 | Médio | Alto |
| 7 | JSON logs com diff amigável | H2, H8 | Médio | Médio |

### 🟡 Média Prioridade — Melhora experiência de usuários frequentes

| # | Ação | Heurística(s) | Esforço | Impacto |
|---|------|--------------|---------|---------|
| 8 | Command palette Ctrl+K | H7 | Alto | Alto |
| 9 | Help page `/help` com glossário | H9 | Alto | Alto |
| 10 | Batch select + delete/export | H7 | Alto | Médio |
| 11 | Soft delete com recuperação 30 dias | H3 | Médio | Alto |
| 12 | Filtros salvos / favoritos | H7 | Alto | Médio |
| 13 | Pagesize selector (20/50/100) | H7 | Baixo | Médio |
| 14 | Tooltip contextual por campo (glossário inline) | H9, H2 | Médio | Médio |

### 🟢 Baixa Prioridade — Nice-to-have (v5.x)

| # | Ação | Heurística(s) | Esforço | Impacto |
|---|------|--------------|---------|---------|
| 15 | Onboarding tutorial para novo usuário | H9 | Alto | Médio |
| 16 | Step indicator em formulários longos | H6 | Médio | Baixo |
| 17 | Card-view alternativo para mobile | H8 | Alto | Médio |
| 18 | Dashboard customizável por usuário | H7 | Muito alto | Médio |
| 19 | Changelog em `/settings` | H9 | Baixo | Baixo |
| 20 | Sessão: aviso 5min antes de expirar | H1, H3 | Médio | Médio |

---

## ANÁLISE SWOT — UX v4.0

| | Positivo | Negativo |
|---|----------|---------|
| **Interno** | **Forças:** Design polido, Consistência alta, Charts analytics profissionais, File management completo | **Fraquezas:** Sem toast, Sem help/docs, Sem atalhos de teclado, Sem confirmação de saída |
| **Externo** | **Oportunidades:** Help system pode diferenciar de ferramentas concorrentes; PWA pode expandir usuários mobile; Sonner já instalado | **Ameaças:** Adoção lenta por operadores sem treinamento; Dados incorretos por falta de validação avançada |

---

## PROJEÇÃO DE EVOLUÇÃO DE SCORE

| Versão | Ações implementadas | Score estimado |
|--------|-------------------|----------------|
| v4.0 (atual) | — | **7.0/10** |
| v5.0 (Backlog Alta prioridade) | Toast + Mensagens PT + Breadcrumbs + Tooltips | **7.8/10** |
| v5.1 (+ Média prioridade) | Help page + Soft delete + Command palette | **8.4/10** |
| v5.x (+ Baixa prioridade) | Onboarding + Mobile cards + Dashboard custom | **9.0/10** |

**Caminho crítico para 8.0:** H9 (documentação) é o único heurístico Fraco. Implementar uma `/help` básica com glossário eleva o score de 2.5 para ~6.0, que por si só já eleva o score geral para ~7.7.

---

## CONCLUSÕES

### Score Final por Versão

| Versão | Data | Score | Classificação |
|--------|------|-------|--------------|
| v1.0 | Abril 2026 | 6.2/10 | Funcional com Melhorias |
| v2.0 | Abril 2026 | 6.4/10 | Funcional com Melhorias |
| v3.0 | Maio 2026 | 6.7/10 | Funcional com Melhorias |
| **v4.0** | **Maio 2026** | **7.0/10** | **Bom — Pronto para Produção** |

### Maiores Avanços v3 → v4

1. **+0.5 Estética (8.0→8.5):** Design Spells, gradientes, glassmorphism, tabs
2. **+1.5 Visibilidade (6.0→7.5):** Error states, MetricCards, loading states
3. **+1.5 Prevenção de Erros (6.0→7.0):** FormComponents Zod, FormFileInput validation
4. **+1.5 Flexibilidade (5.5→7.0):** Tabs analíticas, File Preview, PDF Export
5. **+1.0 Recuperação de Erros (6.0→7.0):** Dashboard error state, AlertCircle em listas

### Gap Crítico Restante

**H9 — Suporte e Documentação (2.5/10)** continua sendo o único Fraco. É a diferença entre um produto "bom" e um produto "excelente". Sem help contextual, novos usuários dependem completamente de treinamento presencial.

**Recomendação:** Priorizar a criação de `/help` page com FAQ + Glossário + Guia rápido como **primeira entrega da v5.0**, antes de qualquer nova feature. Impacto: estimado +4.5 pontos no score desta heurística = +0.45 no score geral.

---

## APÊNDICE: METODOLOGIA

### Critérios de Classificação

| Faixa | Classificação | Descrição |
|-------|--------------|-----------|
| 9–10 | ✅ Excelente | Feature completa, referência de mercado |
| 7–8 | 🟢 Bom | Feature implementada, sem problemas críticos |
| 5–6 | 🟡 Médio | Feature parcial, melhorias necessárias |
| 3–4 | 🟠 Fraco | Feature básica ou com problemas sérios |
| 1–2 | 🔴 Crítico | Feature ausente ou não funcional |

### Fontes de Avaliação v4.0

1. **Análise de código-fonte:** Todos os arquivos `.tsx` de páginas, componentes e charts
2. **Mapeamento arquitetural:** Estrutura de rotas, API endpoints, modelos Prisma
3. **Comparação com v1.0/v2.0/v3.0:** Evolução de cada heurística documentada
4. **Inspeção de componentes:** FormField, Charts, FilePreview, ExportModal
5. **Revisão de configurações:** Framer Motion, Recharts, Tailwind, TypeScript

### Limitações

- Análise baseada em inspeção de código — não em testes com usuários reais
- Sem métricas de uso real (Vercel Analytics, Mixpanel)
- Sem testes de acessibilidade WCAG 2.1
- Sem entrevistas etnográficas com equipe DJUD/COAJUD

---

**Documento finalizado em:** Maio 2026
**Próxima revisão recomendada:** Após v5.0 (implementação do Backlog Alta Prioridade)
**Responsável:** Equipe Product + UX + Claude Sonnet 4.5
