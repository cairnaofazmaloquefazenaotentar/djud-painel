---
name: design-review-and-quality
description: Conducts heuristic-based design review comparing implementation against the design spec. Use when verifying that code matches the design, when running a UX quality gate before merge, or when checking design consistency across screens. Evaluates against Nielsen's 10 heuristics and the original SPEC.
---

# Design Review and Quality

Verify that what was built matches what was designed — and that the design itself is sound.

## Overview

This skill reviews implemented code against the design spec, checking fidelity to the original design, UX heuristic compliance, accessibility, and visual consistency. It produces a structured review with findings categorized by severity and specific fix recommendations.

Use alongside the `code-review-and-quality` skill for a complete review — that skill handles code quality, this one handles design quality.

## When to Use

- Before merging a feature that has a design spec — verify fidelity
- After implementing a design — check for drift between Figma and code
- During QA — systematic UX quality gate
- When multiple engineers built different screens — check consistency
- At the end of a sprint — assess design debt accumulated

## Review Framework

Evaluate every implementation across these five dimensions:

### 1. Design Fidelity

Does the implementation match the spec?

- Spacing, sizing, and alignment match Figma (or SPEC)
- Colors use design tokens (not hardcoded hex values)
- Typography follows the defined scale
- Component behavior matches the spec (states, transitions, interactions)
- Responsive breakpoints implemented as documented

### 2. UX Heuristic Compliance

Using the `references/nielsen-heuristics-checklist.md`, score each heuristic:

- Does the implementation maintain or improve the SPEC's heuristic scores?
- Were any heuristic scores degraded during implementation?
- Are the engineering prompts from the SPEC properly addressed?

### 3. Accessibility

Using the `references/accessibility-checklist.md`:

- ARIA labels present on all interactive elements
- Keyboard navigation functional
- Color contrast meets WCAG 2.1 AA (4.5:1 text, 3:1 UI)
- Screen reader compatible
- Touch targets ≥ 44x44px on mobile

### 4. Visual Consistency

Across all screens in scope:

- Same component renders identically everywhere
- States (hover, active, disabled, error, loading) consistent
- Spacing rhythm maintained (not arbitrary gaps)
- Animation/transition timing consistent
- Dark mode support (if applicable)

### 5. Performance Impact

Design choices affecting performance:

- Images optimized (WebP, lazy loading, responsive srcset)
- Custom fonts loaded efficiently (preload, font-display)
- Animations use CSS transforms (not layout-triggering properties)
- Component renders are reasonable (no unnecessary re-renders from style props)
- Bundle size impact of design-related dependencies

## Output Format

Categorize every finding:

**Critical** — Design broken, must fix before merge (wrong layout, missing states, broken interactions)

**Important** — Noticeable design drift, should fix before merge (wrong spacing, inconsistent components)

**Nit** — Minor polish, author may address or defer (subtle alignment, micro-interactions)

```markdown
## Design Review Summary

**Verdict:** APPROVE | REQUEST CHANGES

**SPEC Reference:** [system-name]-spec.v[N].md
**Score Impact:** v[N] was X.X/10, implementation maintains/improves/degrades to Y.Y/10

### Critical Issues
- [Component/Screen] [Description and spec reference]

### Important Issues
- [Component/Screen] [Description and spec reference]

### Nits
- [Component/Screen] [Description]

### What Matches Well
- [Positive observations about design fidelity]

### Heuristic Delta
| Heurística | SPEC Score | Implementation Score | Δ |
|---|:---:|:---:|:---:|
| [Each affected heuristic] | [X] | [Y] | [+/-] |
```

## Rules

1. Read the SPEC first — review against documented requirements, not personal preference
2. Check Figma (if available) for visual details the SPEC may not capture
3. Every Critical and Important finding must reference the specific SPEC section it violates
4. If the implementation improves on the SPEC (better than designed), note it as positive
5. Don't block on Nits — they're suggestions, not requirements
6. Generate updated engineering prompts for any Critical/Important findings
