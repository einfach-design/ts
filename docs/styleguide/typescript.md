---
location: docs/styleguide/typescript.md
version: 0.15.0
maintainer: Axel Elstermann | einfach.design (e2d)
scope: Project-wide coding, type-architecture, and documentation standards for TypeScript-only repositories.
description: TypeScript style guide with mandatory narrative JSDoc, e2d metadata/file-ops compliance, toolchain-first enforcement, and audited rule provenance.
---

# e2d TypeScript Style Guide

This document defines normative rules for this repository.

## 1. General principles

- Prefer clarity over cleverness.
- Optimize for maintainability in multi-author, long-lived codebases.
- Keep diffs minimal and scoped.

## 2. Documentation rules

- Prefer describing:
  - intent (“why this exists”)
  - behavior (“what it guarantees”)
  - constraints (“preconditions / invariants”)
  - edge cases (“what to expect on boundaries”)
  - lifecycle/ownership (“who calls it / who owns data”)
- Avoid redundancy:
  - do not restate types already expressed by TypeScript
  - avoid auto-generated “noise docs” that add no intent
- Optional tags (only if they add value beyond TS types):
  - `@remarks` for important nuances
  - `@example` for non-obvious usage
  - `@deprecated` with migration guidance
  - `@throws` when exceptions are part of the contract
  - `@see` for linked specs/modules

## 3. Commenting rules

- Prefer `/** ... */` for multi-line commentary blocks.
- Place inline comments `//` comments on their own line above the statement when needed.
- Use actionable tags:
  - `// TODO:` for planned work
  - `// FIXME:` for known issues that must be fixed

## 4. Types Architecture Conventions

### 4.1 Leaf type files (`*.types.ts`) are the Single Source of Truth (SSoT)

Every module with **domain meaning** MUST define its types in a sibling `*.types.ts` file.

A module has “domain meaning” if any of the following applies:

- its concepts appear in docs/specs/contract text, or
- it defines externally meaningful entities (not just helpers), or
- its types are imported across the module’s domain boundary.

**Domain boundary definition (SSoT):**

- A “domain” is a top-level folder **under `src/`** (e.g., `src/targets/*`, `src/runs/*`).
- Files directly under `src/` are treated as belonging to a single implicit “root” domain, but are discouraged.

### Starter Pack note (mandatory policy; creation routine)

This repository is shipped as a **starter pack**. It is valid that not every domain/module already has its final `*.types.ts` leaf files from day one.

**However:** this Styleguide is **binding** and remains normative. Missing leaf files in the starter pack do **not** weaken or relax any rule — they only indicate that some modules have not yet crossed the “domain meaning” threshold in this scaffold.

**Creation routine (required):**
When implementing or evolving a module such that it has “domain meaning” (as defined above), you MUST, in the same change set:

1. Create the colocated `*.types.ts` leaf file(s) as the single source of truth (SSoT).
2. Move/define the canonical types there (no shadow shapes in value modules).
3. Export only the intentional public surface via `index.types.ts` (curated, explicit; no wildcards).
4. Ensure the type import graph stays acyclic (break cycles via narrow interfaces / shared primitives, never via value imports).

This routine is a **review requirement**. See **Chapter 5** for enforcement and review expectations.

### 4.2 Type-only discipline

`*.types.ts` files MUST be type-only:

- They MUST export only types (`type`, `interface`) and type-only constants (e.g., `as const` literal types) that do not require runtime evaluation.
- They MUST NOT export runtime values (functions, classes, objects).
- They MUST NOT import from value/implementation modules — even via `import type`.

**Escape hatch (strict):**

- Exception is allowed only if there is **no viable alternative due to third-party constraints** (e.g., a library exposes types only via a value/implementation module).
- The rationale MUST be documented and a tracked ticket/issue MUST be created to remove the exception.
- This escape hatch MUST NOT be used to resolve cycles.
- Types imported via this escape hatch MUST NOT be re-exported from `index.types.ts`.

### 4.3 No shadow types

Do not redefine shapes in multiple places.

- If a type exists, reuse it.
- If a type is missing, create it at the correct leaf location.

### 4.4 Allowed imports between leaf type files

Leaf `*.types.ts` MAY import from other leaf `*.types.ts` files **only if**:

- it does not introduce cycles, and
- the dependency direction remains intentional (prefer “downwards” dependencies).

**Cycle-breaking rule (normative):**

- Break cycles by introducing **narrow interfaces** (e.g., `*Context`, `*Ref`, `*Handle`) or by moving shared primitives into an existing **lowest-level leaf types file**; **never** by using imports from value/implementation modules.

**Cycle detection (enforcement):**

- Cycles in the **type import graph of `*.types.ts` files** (including transitive edges introduced via `index.types.ts`) MUST be caught **pre-merge** (e.g., enforced in CI) via an agreed mechanism (dedicated cycle check or an equivalent lint/build rule).

### 4.5 Public type surface (`index.types.ts`)

`index.types.ts` defines the public type surface.

- It MUST live next to `index.ts`.
- External consumers MUST import types only from `index.types.ts`.
- Internal code MAY import leaf types directly.
- `index.types.ts` MUST NOT use wildcard exports of any kind, including `export * from ...` and `export type * from ...`, to prevent accidental public API exposure.
- It MUST export types explicitly.

### 4.6 No convenience hubs (`all.types.ts` etc.)

Global type aggregators are prohibited:

- `all.types.ts`, `everything.types.ts`, etc. MUST NOT exist.
- Folder-local internal barrels are discouraged.
- `index.types.ts` MUST NOT re-export internal barrels.

### 4.7 Review sensitivity

Changes to `index.types.ts` and `index.ts` are contract-sensitive and require extra review scrutiny.

## 5. File Ops Compliance

### 5.1 Language policy (mandatory)

Use **en-US** for:

- code identifiers
- comments and JSDoc
- documentation
- commit messages

### 5.2 Mandatory metadata headers (inside every file)

Every generated/modified file must contain a complete metadata header with:

- `location`
- `version`
- `maintainer`
- `scope`
- `description`

Template patterns:

**JS/TS (`.js`, `.mjs`, `.ts`)**

```ts
/**
 * @file <location>
 * @version <version>
 * @maintainer <maintainer>
 * @scope <scope>
 * @description <description>
 */
```

**Markdown docs (`.md`)**

```yaml
---
location: <location>
version: <version>
maintainer: <maintainer>
scope: <scope>
description: <description>
---
```

#### 5.2.1 Exception (machine-consumed YAML)

For machine-consumed YAML (workflows, lockfiles, orchestration YAML), metadata headers MUST be comment-based (`# key: value`) to avoid breaking parsers/tools.

#### 5.2.2 Exception (machine-generated and third-party artifacts)

Machine-generated artifacts and third-party/vendor artifacts are explicitly exempt from the metadata header rule.

Examples (non-exhaustive):

- `node_modules/**`
- package-manager lockfiles (e.g., `pnpm-lock.yaml`)
- build outputs (e.g., `dist/**`, `coverage/**`)

### 5.3 Placeholder resolution

All `<...>` placeholders must be resolved from:

1. session context
2. project context
3. system context

Fallback behavior: emit literal if unresolved (and warn).

### 5.4 Deterministic + auditable output

- Outputs must be deterministic, reproducible, and auditable.
- Warn if metadata is missing/inconsistent/unresolved.
- Propose version increments for major file changes.

### 5.5 Dependency integrity

- Do not introduce new dependencies without confirmation.
- Verify module references before aggregation.

### 5.6 Update workflow (aggregate_full_file)

When updating code files:

1. Discuss required changes briefly in plain language.
2. Review small snippets for clarity before approval.
3. After approval, deliver the complete integrated file only.

## 6. Enforcement

This style guide is normative. Enforcement is **toolchain-first**:

- **Prettier** is the **only** formatter and the source of truth for formatting.
- **TypeScript typecheck (`tsc`)** and **TypeScript ESLint rules** are authoritative for TypeScript semantics.
- **ESLint (Flat Config)** enforces the lint/policy subset, including the adopted policy subset listed in §8.1 (Airbnb origin is tracked for audit only).

Required quality gates (pre-merge):

- `pnpm lint`
- `pnpm format:check`

Lockfile discipline is mandatory:

- CI MUST install dependencies with lockfile enforcement (e.g., `pnpm install --frozen-lockfile`).
- Any dependency change MUST include the corresponding lockfile update.

## 7. UI Rendering Rule (Raw Block Safety)

When providing copy/paste content, always render it in a raw block.

- Do not render styled markdown for copy/paste payloads.
- The raw block is the canonical source for copy/paste.

## 8. Airbnb-derived Guidance (Adapted)

This section embeds **adapted** (non-verbatim) guidance from specific Airbnb JavaScript Style Guide chapters for audit traceability.
During adaptation, any statements that would conflict with this style guide, TypeScript semantics, or the Prettier-only formatting strategy have been **removed**.

The following guidance is **not** a toolchain baseline. Only the explicitly adopted rule subset is normative (see §8.1). Everything else is guidance.

Guidance MUST NOT be used to override this style guide, TypeScript authority, or Prettier formatting. Do not use “Airbnb says…” as justification to change enforced project policy.

### 8.1 Adopted Airbnb rule subset (normative)

This project adopts the following Airbnb-origin rules as normative policy:

- `no-const-assign`
- `no-dupe-class-members`
- `dot-notation`
- `no-eval`
- `no-new-func`
- `eqeqeq`
- `no-array-constructor`
- `no-new-object`
- `prefer-object-spread`
- `prefer-rest-params`
- `prefer-spread`
- `no-useless-escape`
- `default-param-last`

### 8.2 Airbnb chapter 3.5 (adapted)

- Prefer clarity over cleverness.
- Avoid ambiguous constructs that hide intent.
- Optimize for maintainability in multi-author codebases.

### 8.3 Airbnb chapter 4 (adapted)

- Prefer `const` by default; use `let` only when reassignment is required.
- Avoid `var`.
- Keep variable scope tight and explicit.

### 8.4 Airbnb chapter 10 (adapted)

- Prefer pure functions where feasible.
- Default parameters must be last (`default-param-last`).
- Avoid dynamic code execution (`eval`, `new Function`).

### 8.5 Airbnb chapter 14 (adapted)

- Prefer object spread over `Object.assign`.
- Prefer rest parameters over `arguments`.
- Prefer spread over `apply`.

### 8.6 Airbnb chapter 18 (adapted)

- Prefer explicitness in comparisons.
- Use strict equality (`eqeqeq`) with the defined exception policy.

### 8.7 Airbnb chapter 23 (adapted)

- Avoid patterns that obscure control flow or ownership.
- Keep code reviewable: straightforward structure over dense expressions.
