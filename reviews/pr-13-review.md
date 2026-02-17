# PR #13 Review

Decision: MERGE

This review was performed against PR branch `pr-13` fetched from `https://github.com/einfach-design/ts` (`refs/pull/13/head`).

## Summary

- Hardened `backfillRun` by deduplicating queue snapshot entries by expression id before processing.
- Replaced slice-based queue consumption with index-based FIFO iteration while allowing in-loop appends.
- Added optional `maxIterations` guard in `BackfillRunOptions` to stop pathological requeue loops.
- Preserved id-based live lookup and tombstone skipping behavior.
- Added unit tests covering duplicate-id dedupe, tombstone behavior, and max-iteration guardrail.

## Workflow parity

Verified against `.github/workflows/runtime.yaml` commands:

- `pnpm install --frozen-lockfile`
- `pnpm format:check`
- `pnpm -C packages/runtime lint`
- `pnpm -C packages/runtime typecheck`
- `pnpm -C packages/runtime test`
- `pnpm -C packages/runtime build`

All passed locally.
