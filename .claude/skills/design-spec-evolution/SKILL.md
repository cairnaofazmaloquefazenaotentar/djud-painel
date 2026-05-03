---
name: design-spec-evolution
description: Generates versionable design specs (v1.md, v2.md, v3.md...) with automatic UX maturity scoring based on Nielsen's heuristics, delta comparison between versions, and ready-to-execute engineering prompts. Use when analyzing a design, tracking UX quality over time, bridging design to engineering, or preparing design handoff. Every design project should have a baseline spec.
---

# Design Spec Evolution

Evolve your design from good to great — measured, tracked, and actionable.

## Overview

This skill transforms design analysis into a living specification that serves as the single source of truth for Product, Design, Backend, Frontend, and QA. Unlike static PRDs, this evolves alongside your product and tracks UX maturity over time.

The output is a versionable markdown file (`[system]-spec.v1.md`, `v2.md`, `v3.md`...) containing three parts: a complete PRD, a Nielsen heuristic analysis with automatic scoring, and an engineering backlog with auto-generated prompts ready for devs to execute.

## When to Use

- Starting a new design project — create the baseline spec (v1)
- Completing a user journey or flow — evolve to v2, v3 as design matures
- After a cycle of corrections or user testing — document what improved
- At conversion milestones or delivery checkpoints — track score evolution
- Bridging design to engineering — generate context-aware prompts
- Preparing handoff to any team — each team extracts what they need

Not appropriate for quick wireframe feedback, design system component docs, or post-launch analytics review.

## Process

### 1. Gather Design Context

**From Figma (recommended):** Provide the Figma file URL or node ID. Use the Figma MCP to read component structure, layer names, design tokens, variants, and annotations. This extracts the source of truth directly from the design file and saves ~30 minutes of manual description.

**From description:** Describe the system (what it is, core flows, user segments), list key pages and components, and provide screenshots or wireframes as reference.

### 2. Check Version History

Before generating, determine:
- Is this v1 (first analysis) or an update (v2, v3...)?
- If updating, load the previous version to calculate delta
- What changed since last version? (new flows, fixes, redesigns)

Look for existing files in `_spec-design/` matching the system name.

### 3. Analyze Against Nielsen's 10 Heuristics

Score each heuristic independently:

| Score | Label | Meaning |
|:-----:|-------|---------|
| 10 | Bom | Meets expectations, no significant issues |
| 5 | Médio | Partially meets, identifiable gaps |
| 1 | Fraco | Does not meet, significant problems |

For nuanced scoring, use intermediate values (3, 7, 8) when the situation falls between labels. The final UX maturity score is the average of all 10 heuristics, reported as X.X / 10.

**Qualitative supplement:** After calculating, identify the 2-3 heuristics with biggest impact (highest and lowest), explain why they scored that way with specific evidence, flag quick wins (low effort, high impact), and note strategic challenges (harder problems worth tackling).

### 4. Generate the SPEC Document

**File name:** `[system-name]-spec.v[N].md` (kebab-case, e.g., `delivery-checkout-spec.v2.md`)

**Structure:**

```
HEADER (metadata block)
  Versão, Score UX, Delta, Data, Arquivo

HISTÓRICO DE VERSÕES (table, all versions)

PART 1: PRD
  1. Visão Geral do Produto
  2. Arquitetura de Informação
  3. Páginas e Funcionalidades
  4. Componentes Globais
  5. Funcionalidades Interativas
  6. Integrações e Tecnologias
  7. Observações e Gaps
  8. Considerações Finais

PART 2: HEURISTIC ANALYSIS
  Score table (each heuristic + score + delta)
  Detailed findings per heuristic (strengths + problems)

PART 3: ENGINEERING BACKLOG
  High / Medium / Low priority
  Each item: problem + auto-generated engineering prompt
```

Every PRD section includes a `🔄 Mudanças desde a versão anterior` field, filled only in v2+.

### 5. Auto-Generate Engineering Prompts

For each identified problem or opportunity, generate a self-contained engineering prompt in the 5-section format. Read `references/engineering-prompt-template.md` for the exact template structure.

Each prompt pulls context directly from the PRD (stack, audience, constraints, design tokens) so the dev receives a complete, copy-paste-ready command with zero ambiguity. The prompt format has five sections: Role & Context, System Rules, Current Mission, Task-Specific Rules, and Expected Output.

### 6. Save and Archive

Save the file to `_spec-design/[system-name]-spec.v[N].md`. Never overwrite a previous version — always create a new file with incremented version number. History is the evidence of progress.

```
_spec-design/
├── README.md                          (index of all versions)
├── delivery-checkout-spec.v1.md       (baseline)
├── delivery-checkout-spec.v2.md       (iteration 1)
└── delivery-checkout-spec.v3.md       (iteration 2)
```

## Figma Integration

When using the Figma MCP, extract:

1. **Component hierarchy** — pages, frames, component sets → map to SPEC sections
2. **Design tokens** — colors, spacing, typography → map to Componentes Globais
3. **Variants** — component states and variations → map to Funcionalidades Interativas
4. **Annotations** — designer notes and specs → map to requirements
5. **Prototype flows** — interaction links → map to user journeys

This reduces manual description effort and ensures alignment between Figma and SPEC.

## Common Rationalizations

| Rationalization | Reality |
|:--|:--|
| "Spec v1 will take forever" | 2-3 hours now prevents 40 hours of rework in production. The PRD section alone saves that in alignment meetings. |
| "Score is just a vanity metric" | Score is a north star. Showing v1: 6.0 → v3: 8.5 proves investment, justifies resources, and creates accountability. |
| "Skip heuristics, just do PRD" | Heuristics catch UX debt before it ships. A missing error message found in v1 costs 1 hour to fix. Found in production: 40 hours. |
| "Engineering prompts are overkill" | Without prompts: back-and-forth, interpretation differences, rework. With them: dev copies, pastes, ships in one sprint. |
| "We'll document changes later" | You won't. Document now while the context is fresh. Later never comes, and the reasoning is lost. |

## Red Flags

- **No clear user segment defined** — can't assess heuristics fairly without knowing who uses this
- **Design still in wireframe phase** — flows aren't finalized, too early for a scored spec
- **Stakeholders misaligned on goals** — do PRD alignment first, then heuristics
- **Claiming v2 without v1 existing** — check `_spec-design/` or create v1 baseline first
- **Skipping Figma and description** — no input means guessing, and guessing means wrong spec

## Verification

After generating the SPEC, validate:

- [ ] PRD accuracy — does it match what's actually in Figma or the description?
- [ ] Score fairness — can you point to specific evidence for each heuristic score?
- [ ] Delta clarity — is it obvious what changed from the previous version?
- [ ] Prompt quality — would a dev execute these without asking follow-up questions?
- [ ] Gaps identified — are the problems/opportunities sections revealing real, actionable work?
- [ ] File saved — does `_spec-design/[system]-spec.v[N].md` exist with correct naming?

If any fail, iterate before distributing to the team.
