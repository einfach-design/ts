---
location: AGENTS.md
version: 0.15.0
maintainer: Axel Elstermann | einfach.design (e2d)
scope: Agent instructions and project guardrails.
description: Repository agent instructions (SSoT references, workflow, constraints).
---

# AGENTS.md — AI-first workflow rules (repo-wide)

This repository is an AI-first workspace. Agents must produce PR-ready changes without requiring the user to copy/paste code or manually edit files.

## Non-negotiables

- DO NOT ask the user to copy/paste code or manually edit files in GitHub UI.
- If CI / lint / test / build fails, you MUST diagnose and fix the issue yourself and re-run until green.
- DO NOT weaken quality gates (no disabling eslint rules, no skipping tests, no relaxing tsconfig) unless WORKMAP/SSoT explicitly requires it.

## Sources of Truth (SSoT)

- docs/runtime/RunTime-0.11.3-Specification.md
- docs/runtime/RunTime-0.11.3-Impl.md
- docs/styleguide/typescript.md
- packages/runtime/WORKMAP.md

## Default validation loop (must be green before finishing)

- pnpm -C packages/runtime lint
- pnpm format:check
- pnpm -C packages/runtime typecheck
- pnpm -C packages/runtime test
- pnpm -C packages/runtime build

If any command fails:

1. Read the error output.
2. Fix the code (minimal change, preserve behavior).
3. Re-run the full validation loop until green.

## Deliverables

- Commit(s) with clear messages.
- PR description includes:
  - what changed
  - commands run and green
