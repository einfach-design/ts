---
location: docs/runtime/RunTime-0.11.3-Impl.md
version: 0.11.3
maintainer: Axel Elstermann | einfach.design (e2d)
scope: Runtime specification and implementation notes.
description: Runtime documentation (specification and implementation notes).
---

# RunTime 0.11.3 – Impl (pre-release)

# Implementierungsplan (final, konsolidiert) — RunTime 0.11.3 (conformance-first)

> Ziel: Eine Implementierung, die sich **hart** durch Conformance-Tests absichern lässt (drift-proof),
> synchron + deterministisch, mit klaren Contracts für Flags, `get("*")`, EmptyImpulse, Backfill, Trim und Target-Dispatch.

---

## 0) Harte Invarianten

1. **Synchron & deterministisch**: keine Wallclock-/Async-Abhängigkeiten; gleiche Inputs ⇒ gleiche Reihenfolge/States.
2. **Occurrence-Shape**: pro Occurrence: optional `backfillRun`, dann genau einmal `registeredRun` (oder nur `registeredRun`).
3. **`run.set` ist rein stateful**: niemals Drain/Matching/Backfill/Targets starten.
4. **`run.get("*")` ignoriert `scope`** (liefert immer applied+pending; Hydration-Roundtrip muss stabil bleiben).
5. **EmptyImpulse ist beobachtbar**: valid `run.impulse` enqueued **immer genau einen** Queue-Entry; EmptyImpulse verarbeitet aber **keine** Occurrence/Targets.
6. **Objekt-Target Dispatch ist “silent” bei fehlendem/nicht-callable handler** (keine onError/Diagnostics) — _silent gilt nur auf Handler-Ebene; fehlender/invalid `on` Entrypoint ist onError._
7. **Backfill-Dedupe/Lookup/Skip ist ausschließlich id-basiert**, niemals ref-equality.
8. **Trim-Order**: falls retain und maxBytes beide trimmen müssen → zwei Trims, **retain dann maxBytes**; Trims dürfen keine Impulsverarbeitung triggern.

---

## 1) Architektur / Module

### Core

- `runtime/index.ts`: `createRunTime()` + public API (`add`, `impulse`, `get`, `set`, `matchExpression`, `onDiagnostic`)
- `processing/drain.ts`: enqueue, drain-loop, abort semantics
- `processing/actImpulse.ts`: Occurrence-Erzeugung, `i`-Construction, Sequencing
- `runs/registeredRun.ts`: deterministische Iteration über `registeredQ` Snapshot; Debt-Entry + backfill-enqueue
- `runs/backfillRun.ts`: workingQ snapshot+reset, debt-weighted gate-choice, opposite attempt, rotation, re-enqueue
- `match/matchExpression.ts`: defaults overlay + gate evaluation + required.flags thresholds

### Canon / State / Views

- `canon/flagSpecInput.ts`: FlagSpecInput → FlagSpec[] (**last-one-wins**)
- `state/flagsView.ts`: FlagsView stable-unique (**first occurrence wins**), builder, helpers
- `state/changedFlags.ts`: `computeChangedFlags(prev,next, removeFlags, addFlags)` (membership+order; siehe §4)
- `canon/impulseEntry.ts`: impulse payload → `ImpulseQEntryCanonical` (Container-defaults only; keine Netting/Dedupe)
- `state/registry.ts`: `registeredQ`, `registeredById`, tombstone
- `state/backfillQ.ts`: `appendIfAbsent` (by id), invariants, snapshot projection (IDs)
- `targets/dispatch.ts`: callback/object dispatch (silent semantics)
- `diagnostics.ts`: diagnostic emitter/registry
- `test/trace.ts`: Trace recorder (nur tests / `__TEST__`)

---

## 2) SSoT (interner State) & Snapshot-Shapes

### 2.1 Registry (SSoT)

- `registeredQ: RegisteredExpression[]` (Insert-Order FIFO)
- `registeredById: Map<string, RegisteredExpression>` (**SSoT-Quelle** für Lookup/Skip)

#### Remove/Tombstone Policy

- Entfernen bedeutet **tombstone markieren**, nicht “hard free”.
- Jede Verarbeitung prüft `registeredById.get(id)` + `tombstoned` bevor sie arbeitet.

### 2.2 BackfillQ (intern vs Snapshot)

- **Intern**: `backfillQ: { list: RegisteredExpression[]; map: Record<string,true> }`
  - `list` ist FIFO-Teilnehmer-Cache.
  - **Alle Semantik ist id-basiert** (`regExpression.id`), niemals `===`.
- **Snapshot**: `BackfillQSnapshot: { list: string[]; map: Record<string,true> }`

#### Explizite Regel (no ref-equality decisions)

- Dedup/Lookup/Skip/Rotation/Pending Entscheidungen dürfen **nie** Objektidentität (`===`) verwenden; nur `id`.

#### BackfillQ intern (Refs erlaubt) — aber id ist die Wahrheit

- Intern darf `backfillQ.list` RegisteredExpression-Refs enthalten (FIFO-Teilnehmerreihenfolge als Cache).
- **Dedup, Lookup und Skip sind ausschließlich id-basiert** (`regExpression.id`), nie Ref-Equality.
- `registeredById` ist die SSoT-Quelle. Backfill/Run-Logik darf sich nicht auf Objektidentität verlassen.
- Guardrail (Dev/Test): assert
  - `backfillQ.map[id]` ⇔ genau ein list-Element mit `.id===id`
  - jedes id in backfillQ ist in `registeredById` vorhanden (oder wird deterministisch geskippt, wenn tombstoned/unknown).

#### appendIfAbsent (by id, normiert)

```ts
function appendIfAbsent(bq, expr) {
  const id = expr.id;
  if (bq.map[id]) return;
  bq.list.push(expr);
  bq.map[id] = true;
}
```

### 2.3 impulseQ

- `impulseQ.q.entries: ImpulseQEntryCanonical[]` (FIFO call-order)
- `impulseQ.q.cursor: number`
- `impulseQ.config: ImpulseQConfigCanonical`
- `draining: boolean`
- `trimPendingMaxBytes: boolean`

### 2.4 Flags/Signals

- `flagsTruth: FlagsView`
- `seenFlags: FlagsView` (monoton)
- `changedFlags: FlagsView | undefined` (Delta des zuletzt angewandten Entries)
- `signal: Signal | undefined`
- `seenSignals: { list: Signal[]; map: Record<string,true> }`

---

## 3) Trace Recorder (First-Class Test Tool)

Nur in Tests (`__TEST__`), niemals Teil der public API.

### Events

- `occurrenceStart({ entryIndex, occurrenceIndex, signal })`
- `coreRunAttempt({ q:"backfill"|"registered", regExpressionId, gate, result:"deploy"|"reject"|"pending" })`
- `targetCall({ regExpressionId, targetKind:"callback"|"object", handler:"everyRun"|Signal, q, signal })`
- `trim({ reason:"retain"|"maxBytes", removedCount, cursorDelta })`
- `trimDeferred({ reason:"maxBytes" })`
- `drainAbort({ atCursor, phase })`

### Test-Adapter (für Anti-Ref-Equality / spezielle Seeds)

- Für Anti-Ref-Equality-Tests existiert ein `__TEST__`-only Adapter, der BackfillQ/Registry-Referenzen seeden kann
  (z.B. `__TEST__.seedBackfillQRef(exprRef)` und `__TEST__.overrideRegisteredById(id, exprRef)`).

---

## 4) Flags — Drift-proof Contracts

### 4.1 FlagSpecInput (Registration-side)

- `FlagSpecInput` → `FlagSpec[]`: Duplikate **last-one-wins** in Input-Reihenfolge.
- Persistiert im `RegisteredExpression`.

### 4.2 FlagsView (State/Getters)

- `FlagsView.list`: stable-unique **first occurrence wins**.

#### FlagsView Contract (exact, bijektiv)

- `FlagsView.map` enthält **genau** die Keys aus `FlagsView.list` (bijektiv), Werte immer `true`:
  - `keys(map) === set(list)`
  - `map[k] === true` für alle `k`

### 4.3 changedFlags: Membership vs Order

- **Membership**: Flags mit `prevTruth != nextTruth` (Mengen-Sicht).
- **Order**: abgeleitet aus effektiver Delta-Sequenz:
  1. effektive Removes in `removeFlags`-Order
  2. effektive Adds in `addFlags`-Order
  3. stable-unique über diese Sequenz (first occurrence wins)

#### Implementierung

`computeChangedFlags(prevTruth, nextTruth, removeFlags, addFlags)`:

- `membership = symmetricDiff(prevTruth, nextTruth)`
- `orderSeq = effectiveDeltaSeq(prevTruth, removeFlags, addFlags)`
- `list = stableUnique(orderSeq.filter(f => membership.has(f)))`
- `map` aus `list`

---

## 5) run.get (scope, snapshot/reference, get("\*"))

### 5.1 Scope-Projektion

- applied segment: indices `< cursor`
- pending segment: indices `>= cursor`
- Flags getter: seed pendingOnly = empty
- Signal getter: seed pendingOnly = `undefined`

### 5.2 `as:"snapshot"`

- liefert stabile Kopien (keine live leaks).
- darf frei mutierbar sein (Userland).

### 5.3 `as:"reference"` (read-only view, throw-on-write)

- `as:"reference"` liefert eine **read-only** Ansicht, die intern aliasen darf (keine Kopie), aber **nie** beschreibbar ist.
- Einheitlich **throw-on-write** (Dev und Prod), um CI eindeutig zu halten.
- `reference` darf nur Strukturen enthalten, die vollständig write-protectable sind (**keine nested mutable objects**).
- `as:"reference"` darf niemals direkte, beschreibbare SSoT-Objekte exponieren; es liefert ausschließlich read-only Views/Wrapper.

#### Definition: “Write” (breit)

Write umfasst mindestens:

- property set, delete
- `Object.defineProperty` / `defineProperties`
- `Object.setPrototypeOf`
- `Object.preventExtensions` / `seal` / `freeze` (auf der reference selbst)
- Array mutators (`push`, `pop`, `shift`, `unshift`, `splice`, `sort`, `reverse`, `copyWithin`, `fill`, etc.)
- Map/Set mutators (sollten idealerweise gar nicht exposed werden)

### 5.4 `run.get("*")`

- eigener API-Pfad
- akzeptiert `scope`, wertet `scope` aber NICHT aus → immer applied+pending
- enthält determinismusrelevanten Vollzustand inkl. backfillQ (IDs), impulseQ (cursor+entries), flags/signals, defaults.

---

## 6) run.set (Patch vs Hydration) — Eindeutig, strikt, ohne Side-Effects

### 6.1 Erkennung

- Hydration ⇔ Payload hat `backfillQ` als **own property**.
- Patch ⇔ Payload hat `backfillQ` **NICHT** als own property.

### 6.2 Hydration

- muss vollständigen Snapshot übernehmen (wie von `get("*",{as:"snapshot"})` erzeugt).
- Import:
  - `impulseQ.q` (cursor+entries) + `impulseQ.config`
  - defaults
  - `flagsTruth`, `seenFlags`, `changedFlags`
  - `signal`, `seenSignals`
  - backfillQ Snapshot (IDs) → intern via lookup + `appendIfAbsent` in FIFO-Order

- Unknown IDs in backfillQ:
  - onError/Diagnostic (phase `"set/hydration/backfillQ"`)
  - danach deterministisch droppen, falls weiterhin unknown

### 6.3 Patch (strict)

Patch darf:

- `flags` **oder** (`addFlags`/`removeFlags`) setzen (Konflikte => throw)
- defaults patchen (stateful)
- `impulseQ.config` patchen (stateful; kann trim auslösen)

Patch darf NICHT (own properties):

- `changedFlags` → throw
- `seenFlags` → throw
- `signal` → throw
- `seenSignals` → throw
- `impulseQ.q` → throw (Patch darf nur config)

Wichtig:

- `run.set({ defaults: ... })` darf keinen Drain starten.

### 6.4 Trim durch `run.set({ impulseQ:{config} })`

- retain-trim: synchron in diesem `run.set` Call (applied-only; cursor shift)
- maxBytes-trim:
  - wenn Stack aktiv: defer (`trimDeferred`), ausführen beim Stack-Exit bevor Kontrolle ans Userland zurückkehrt
  - sonst: synchron

- wenn retain und maxBytes beide trimmen müssen:
  - zwei Trims, retain dann maxBytes, je Trim genau ein onTrim vor physischem Entfernen

Guardrails:

- Trims dürfen keine Impulsverarbeitung auslösen (kein drain, keine occurrences, keine targets).
- Trim darf enqueue (durch User-Code in `onTrim`) erlauben, aber **niemals** selbst einen Drain starten oder eine laufende Drain verschachteln.

---

## 7) run.add (Registrierung)

- fail-fast, atomar (kein partial register bei Fehlern)
- callback-target muss callable sein
- object-target: shape validieren (fail-fast bei invalid)
- signals-multiplexing: wenn signals gesetzt & nicht leer → pro Signal ein RegisteredExpression, Insert-Order entspricht signals-Reihenfolge
- persistiert `FlagSpec[]` aus `canon/flagSpecInput` (last-one-wins)

---

## 8) run.impulse (Entry-Kanonisierung, Enqueue, Drain, EmptyImpulse)

### 8.1 Entry-Kanonisierung (vor Enqueue)

- Container-defaults: fehlende own props → `[]`/`false`
- keine Dedupe/Netting auf Entry-Level
- invalid payload => kein enqueue

### 8.2 Enqueue-Contract

- jeder valide `run.impulse` Call enqueued genau einen Entry (auch wenn später EmptyImpulse)
- wenn kein drain aktiv: drain synchron starten
- wenn drain aktiv: nur enqueue, keinen zweiten drain

### 8.3 Atomisierung vs EmptyImpulse

- Atomisierung: signals missing OR `[]` ⇒ atomisierte Liste `[undefined]`
- EmptyImpulse: zusätzlich effektive Delta-Sequenz leer ⇒ skip processing
  - keine Occurrence/`actImpulse`
  - keine Targets
  - optional Diagnostic `impulse.input.empty`
  - Entry bleibt im impulseQ (beobachtbar)

### 8.4 Flag-Deltas Timing

- add/remove Flags genau einmal pro `run.impulse` Call anwenden vor Occurrence-Verarbeitung
- `changedFlags` via §4.3 setzen
- `seenFlags` monotone Erweiterung als Side-Effect

### 8.5 Abort durch throw

- throw stoppt drain sofort
- cursor unverändert
- pending bleibt; erneute Verarbeitung nur durch späteres `run.impulse`

---

## 9) Targets / Dispatch

### 9.1 Callback-Target

- non-callable => onError (phase `"target/callback"`), nicht attempted

### 9.2 Object-Target (runtime dispatch) — SILENT non-callable handler

- Entrypoint `on` muss object-non-null sein (sonst onError, nicht attempted).
- **Silent gilt nur für handler-level missing/non-callable**, nicht für missing/invalid entrypoint.

Handler:

- `everyRun` (own+callable) wird zuerst aufgerufen
- signal-handler nur wenn:
  - `i.signal !== undefined` und `i.signal !== "everyRun"`
  - `hasOwn(on, i.signal)`

- Wenn own aber nicht callable: silent No-Op
  - kein onError
  - kein Diagnostic
  - zählt nicht als attempted

---

## 10) Runs

### 10.1 registeredRun(occurrence)

- iteriert deterministisch über `registeredQ.slice()`
- pro expr:
  - tombstone skip
  - matchExpression
  - coreRun attempt (deploy/reject)
  - Debt darf nur hier wachsen
  - bei Debt-Entry (<=0→>0): `appendIfAbsent(backfillQ, expr)` (by id)

### 10.2 backfillRun(occurrence)

Start:

- nur wenn `backfillQ.list.length > 0`
- `workingQ = snapshot(backfillQ.list)`
- `backfillQ = { list:[], map:{} }` (harte Neuinstanz)

Iteration (präzise Definition):

- Eine Iteration verarbeitet genau `workingQ[0]`:
  1. primary attempt (gate: debt-weighted; tie=signal)
  2. falls reject: genau ein opposite attempt
  3. max ein deploy pro Iteration
  4. Ergebnis:
     - deploy+pending => rotation ans Ende
     - reject => keine rotation, kein retry

Run-Ende:

- pending expressions re-enqueue via `appendIfAbsent(backfillQ, expr)` (by id)

No ref-equality decisions:

- Entscheidungen über pending/rotation/dedupe/skip/lookup sind id-basiert.

---

## 11) MUST-Tests (kompakt, aber vollständig)

### 11.1 `as:"reference"` / `as:"snapshot"`

- snapshot stabil, keine live leaks
- reference throw-on-write für:
  - set/delete/defineProperty/setPrototypeOf/preventExtensions
  - array mutators

- Folge-snapshot identisch (SSoT unverändert)
- Invarianten-Checks nach jedem write-attempt:
  - FlagsView: map/list bijektiv (exact contract)
  - BackfillQSnapshot: map<->list konsistent
  - impulseQ: cursor in range, entries unverändert

### 11.2 `get("*")`

- `get("*",{scope:"pendingOnly"})` deep-equal `get("*")`

### 11.3 `run.set`

- Hydration-Erkennung: nur own backfillQ => hydration
- Patch-Verbote: changedFlags/seenFlags/signal/seenSignals/impulseQ.q => throw
- `run.set({ defaults: ... })` startet keinen drain (trace)
- Trim via config:
  - retain trim sync, applied-only, cursor shift
  - maxBytes deferred wenn Stack aktiv (trace `trimDeferred`)
  - retain dann maxBytes Order (zwei trim Events)

### 11.4 `run.impulse`

- invalid => kein enqueue
- valid => genau ein enqueue
- EmptyImpulse => entry existiert, aber kein `occurrenceStart`/`coreRunAttempt`/`targetCall`
- throw abort => cursor unverändert, pending bleibt

### 11.5 Object-Target Dispatch

- non-callable own handler => silent No-Op (kein onError/Diagnostic)
- prototype handler zählt nicht (hasOwn)
- Reihenfolge: everyRun vor signal-handler
- Sonderfälle: `i.signal === undefined` / `"everyRun"`

### 11.6 Backfill (trace-basiert)

- snapshot+reset (hard reinit)
- reject => genau 1 opposite attempt
- max 1 deploy pro Iteration
- rotation nur bei deploy+pending
- anti-ref-equality test:
  - Seed `backfillQ.list` mit `exprA(id="X")`, aber `registeredById.get("X") === exprB` (andere Instanz)
  - Assert: Verarbeitung nutzt exprB (Lookup via Map), nicht exprA

### 11.7 Trim: “no processing by trim”

- Nach `run.set({ impulseQ:{config:{retain:...}} })`:
  - keine `occurrenceStart`/`coreRunAttempt`/`targetCall` im Trace
  - `trim(...)` darf vorkommen

---

## 12) Implementations-Reihenfolge (empfohlen)

1. State/Canon: FlagSpecInput + FlagsView + changedFlags + registry/backfillQ helpers
2. run.add fail-fast + registration + multiplexing
3. run.get inkl. snapshot/reference (read-only, throw-on-write) + get("\*") scope-ignore
4. run.set patch/hydration + strict verbote + trim (retain/maxBytes) + “no processing by trim”
5. run.impulse enqueue+drain + delta timing + EmptyImpulse contract + abort semantics
6. registeredRun + coreRun + object-target dispatch (silent)
7. backfillRun (outer-loop, attempts, rotation, re-enqueue) + trace suite
8. Vollständige MUST-Testmatrix grün + invariant asserts überall
