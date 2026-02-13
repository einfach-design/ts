---
location: docs/styleguide/README.md
version: 0.15.0
maintainer: Axel Elstermann | einfach.design (e2d)
scope: Project-wide TypeScript style guide and documentation.
description: Project-wide TypeScript style guide and supporting documentation.
---

# Styleguide

This directory contains the **repo-wide baseline** conventions for engineering work in this repository.

## Baseline

- `docs/styleguide/typescript.md` is the **canonical default** for TypeScript/React/Node work across the repo.
- Unless explicitly overridden, all packages MUST follow this baseline.

## Package overrides

Packages MAY define overrides when necessary.

- Location: `packages/<package>/docs/styleguide.md`
- Format: **delta-only**. Overrides MUST describe what differs from the baseline and why.
- Overrides MUST NOT copy the baseline content. If the baseline changes, the override should remain a small, maintainable set of exceptions.

If a package has no override file, the baseline applies unchanged.
