# PR #14 — Review

Decision: **MERGE**

## Summary

- `backfillRun` now builds its `workingQ` snapshot with id-based de-duplication (`Set<string>`) before processing, preventing duplicate in-cycle processing for repeated ids.
- Queue consumption switched from `slice(1)` copying to index-based FIFO traversal; in-loop appends are still processed in the same run.
- Added optional `maxIterations?: number` in `BackfillRunOptions`; when finite and exceeded, `backfillRun` throws a deterministic guardrail error.
- Rotation behavior remains deploy+pending only, now guarded by `queuedInWorking` so the same id is not re-added multiple times simultaneously.
- Added tests for duplicate-id dedupe, tombstone skip semantics, and max-iteration overflow behavior.
- PR also includes a repository review artifact `reviews/pr-13-review.md`.

## CI/Workflow parity

- Workflow file `.github/workflows/runtime.yaml` runs:
  1. `pnpm install --frozen-lockfile`
  2. `pnpm format:check`
  3. `pnpm -C packages/runtime lint`
  4. `pnpm -C packages/runtime typecheck`
  5. `pnpm -C packages/runtime test`
  6. `pnpm -C packages/runtime build`
- Executed locally with same commands from repo root.
- Result: all steps passed.

## Findings

### Blockers (must fix before merge)

- None.

### Non-blockers (recommendations)

- Consider validating `maxIterations` input (`>= 0` integer) explicitly to make invalid values fail fast with clearer messaging.
- Keep PR metadata consistent: the PR description references runtime hardening, while the single commit message is docs-focused.

## File-by-file notes

- `packages/runtime/src/runs/backfillRun.ts`
  - Behavior change is deterministic and aligned with id-centric semantics: dedupe at snapshot time, preserve FIFO traversal, and enforce optional finite loop guard.
  - No hidden global state introduced; mutability is limited to local `workingQ`, `queuedInWorking`, and `pendingForReenqueue`.
- `packages/runtime/tests/unit/task-d/runs-actImpulse.spec.ts`
  - New tests validate the intended behavior changes and are assertion-based (not force-green).
  - Coverage includes key edge paths: duplicate ids, tombstones, and bounded looping.
- `reviews/pr-13-review.md`
  - New documentation artifact; no runtime behavior impact.

## Risk assessment

- Potential regressions:
  - If external callers pass non-finite `maxIterations`, guard is intentionally bypassed (by design in current code), so pathological loops remain possible unless finite value is provided.
  - Snapshot dedupe may mask upstream invariant violations (duplicate ids in `backfillQ.list`) rather than surfacing them.
- Suggested additional regression tests:
  - `maxIterations: 0` and negative finite values to lock intended boundary behavior.
  - Case where duplicate ids in initial queue are distinct object refs and `registeredById` lacks id entry, confirming deterministic object selection semantics.

## Final checklist

- [x] Workflow parity confirmed
- [x] Lint/typecheck/tests pass
- [x] No unintended public API changes
- [x] Adequate tests for edge cases
