---
location: packages/runtime/README.md
version: 0.11.3
maintainer: Axel Elstermann | einfach.design (e2d)
scope: Runtime package documentation and configuration.
description: Runtime package README (usage, contracts, and developer notes).
---

# @einfach-design/runtime

TypeScript ESM library scaffold aligned with RunTime 0.11.3 spec/impl plan.

## Runtime Snapshot Contract

Supported hydration flow:

- `const snapshot = run.get("*", { as: "snapshot" })`
- `run.set(snapshot)`

The snapshot must include the full contract keys:

- `defaults`
- `flags`
- `changedFlags`
- `seenFlags`
- `signal`
- `seenSignals`
- `scopeProjectionBaseline`
- `impulseQ`
- `backfillQ`
- `registeredQ`
- `registeredById`
- `diagnostics`

Hydration remains strict: incomplete snapshots are rejected with `set.hydration.incomplete` and throw.

## Build output

- Build artifacts are generated into `packages/runtime/dist/` by `tsup`.
- `dist/` is a local build artifact and is not committed to the source repository.
- `prepublishOnly` runs clean + lint + typecheck + format:check + test + build before publish.
- Generate artifacts locally with: `pnpm -C packages/runtime build`.
