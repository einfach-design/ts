---
location: packages/runtime/WORKMAP.md
version: 0.15.0
maintainer: Axel Elstermann | einfach.design (e2d)
scope: Runtime package documentation and configuration.
description: Runtime package work map (planned work and current focus).
---

# WORKMAP

Single Source of Truth für Implementierungs-Ownership, Parallelisierung, PR-Regeln und “Definition of Done” (DoD).

## Ziele
- Maximale Parallelität ohne Merge-Konflikte
- Keine “Public surface drift”
- Spec-first: Spec/Impl Plan sind normative Grundlage

## Quellen (SSoT)
- `../../docs/runtime/RunTime-0.11.3-Specification.md`
- `../../docs/runtime/RunTime-0.11.3-Impl.md`
- `../../docs/styleguide/typescript.md`

---

## Goldene Regeln (müssen)

1) **Ein Owner pro File.** Nur Owner ändert das File (außer Integrations-Ausnahme für Team 0).  
2) **Kein Cross-Editing.** Wenn du in fremden Files etwas brauchst → Change-Request (siehe unten).  
3) **Contracts sind frozen.** `src/index.ts` und `src/index.types.ts` werden nur von Team 0 (Core) angepasst.  
4) **Keine neuen Dependencies** ohne explizite Freigabe durch Team 0 (Test-only Ausnahme siehe unten).  
5) Änderungen an `src/**` brauchen mindestens **einen Unit-Test** **oder** eine **explizite Begründung** im PR; für Conformance-Trigger-Pfade zusätzlich **`pnpm test:conformance`**.
6) Keine “Repo-weiten” Format-Änderungen in fachlichen PRs (nur scopebezogen).

7) **Neue Files brauchen Ownership.** Jede neue Datei muss in dieser WORKMAP einem Team zugeordnet werden (Owner), bevor sie gemerged wird.  

### Integrationsänderungen durch Team 0 (Ausnahme)
Team 0 darf in Owner-Files anderer Teams **nur Integrationsänderungen** machen:
- Imports/Exports
- Wiring/Glue Code (Zusammenschalten von Modulen)
- minimale Typ-Anpassungen an Callsites (ohne Semantikänderung)

**Verboten:** Logikänderungen, Algorithmik, Semantik-Fixes in Owner-Files anderer Teams.  
Logik bleibt beim jeweiligen Owner-Team.

### Hotfix-Protokoll (wenn `main` rot ist)
Wenn `main`/CI **rot** ist, darf Team 0 einen **minimalen** Fix in fremden Owner-Files machen, **ausschließlich** um CI wieder grün zu bekommen.

Bedingungen:
- Fix ist so klein wie möglich (keine Refactors, keine Semantik-Änderungen “auf Verdacht”).
- Team 0 erstellt **sofort** ein Follow-up Issue/PR-Note für das Owner-Team:
  - Referenz auf den Hotfix-Commit/PR
  - Beschreibung der eigentlichen Ursache
  - Plan für die “richtige” Owner-Implementierung/Absicherung (Tests)

Danach übernimmt das Owner-Team den Fix sauber (oder ersetzt ihn), sodass Ownership/Logik wieder beim Owner liegt.

### Dependencies (Ausnahme: Tests)
- Neue Runtime-Dependencies: nur mit expliziter Freigabe durch Team 0.
- **Test-only Dependencies** (nur `devDependencies`) sind erlaubt, wenn:
  1) ausschließlich in `tests/**` verwendet
  2) Team 0 kurz approvt (✅ im PR reicht)

Beispiel: `fast-check` für Property-Tests.

### Definition: “Neue Dependency”
Eine “neue Dependency” bedeutet eine **neue direkte** Dependency in `package.json` (`dependencies` oder `devDependencies`).
- `devDependencies` gelten als “Test-only”, wenn sie ausschließlich unter `tests/**` genutzt werden (und Team 0 ✅ gibt).
- Transitive Dependencies (indirekt über Tooling) zählen nicht als “neu”, solange keine neue direkte Dependency hinzugefügt wird.


---

### Tests: Mindestanforderung für `src/**`
Für Änderungen unter `src/**` gilt:
- mindestens **ein Unit-Test**, **oder**
- eine **explizite Begründung** im PR (warum hier kein Test sinnvoll ist).

Hinweis: Für Conformance-Trigger-Pfade gilt zusätzlich die Pflicht aus dem Conformance-Trigger-Abschnitt.


## Public Surface Policy
- **Nur `src/index.ts`** ist Public *Value* Surface. Alles andere ist internal.
- **Nur `src/index.types.ts`** ist Public *Type* Surface.
- `package.json` exports bleiben strikt auf:
  - `"."` für Values (`index.ts`)
  - `"./types"` für Public Types (`index.types.ts`)
  - keine weiteren Deep-Imports / Subpath-Exports
- Externe Consumer importieren Types ausschließlich über `@…/types` (nicht aus leaf `*.types.ts`).
- **Prinzip:** Alles in `src/**` ist internal, außer was in `index.ts` bzw. `index.types.ts` explizit exportiert wird.
## Teams & Ownership

### Team 0 — Core / Contracts / Integration
**Owner Files**
- `src/index.types.ts`
- `src/index.ts`
- `src/runtime.ts`
- `tests/conformance/**` (Gate-Ownership, siehe unten)

**Scope**
- Frozen contracts (Types + Signaturen)
- `src/runtime.ts` liegt bei Team 0; Änderungen daran sind typischerweise Wiring/Orchestration und müssen **Conformance-grün** sein
- Schnittstellen-Entscheidungen (Change Requests mergen)
- Conformance Gate koordinieren und mergen

---

### Team A — Canonicalization (pure)
**Owner Files**
- `src/canon/flagSpecInput.ts`
- `src/canon/impulseEntry.ts`

**Scope**
- Deterministische Pure Functions (keine Side Effects)
- Input-Normalisierung gemäß Spec/Impl

---

### Team B — State: Flags & Diff (pure/functional)
**Owner Files**
- `src/state/flagsView.ts`
- `src/state/changedFlags.ts`

**Scope**
- FlagsView stable-unique
- ChangedFlags Semantik prev/next/remove/add

---

### Team C — State: Defaults & Signals
**Owner Files**
- `src/state/defaults.ts`
- `src/state/signals.ts`

**Scope**
- Defaults storage/resolution helpers
- Signals tracking + scalar projection helpers

---

### Team D — State: Registry & Backfill Queue
**Owner Files**
- `src/state/registry.ts`
- `src/state/backfillQ.ts`

**Scope**
- registeredQ + registeredById + tombstones
- backfillQ append-if-absent + snapshot/projection

---

### Team E — Match Engine
**Owner Files**
- `src/match/matchExpression.ts`

**Scope**
- defaults overlay + gate evaluation + required.flags thresholds
- Pure / Side-effect free (nur Inputs → Output)

---

### Team F — Targets & Diagnostics
**Owner Files**
- `src/targets/dispatch.ts`
- `src/diagnostics/index.ts`
- `src/diagnostics/emit.ts`

**Scope**
- Target dispatch (callback/object), silent semantics
- diagnostics emit/collect minimal, stabil

### Diagnostics (Policy + Code Registry)
Es gibt **eine** zentrale Registry für Diagnostic Codes, damit `code`/`payload`/`severity` stabil bleiben.

Festlegung:
- `src/diagnostics/codes.ts` ist die **verbindliche** Registry: `code -> { description, severity, shape }`

Regel:
- Neue Codes oder Änderungen an `payload shape` nur via Team 0 Review + Update der Registry.

- `diagnostics/emit.ts` enthält nur Mechanik (emit/collect/format), **keine Policy**.
- Neue Diagnostic Codes/Shapes oder Public-Exposure nur mit Team-0 Review.

---

### Team G — Processing: Drain & Trim
**Owner Files**
- `src/processing/drain.ts`
- `src/processing/trim.ts`

**Scope**
- drain-loop scheduling, abort semantics
- trim retain/maxBytes/defer/onTrim ordering

---

### Team H — Runs: Registered/Backfill & actImpulse
**Owner Files**
- `src/processing/actImpulse.ts`
- `src/runs/registeredRun.ts`
- `src/runs/backfillRun.ts`

**Scope**
- actImpulse occurrence construction
- registeredRun/backfillRun snapshot/reset/rotation/gate-choice

---

## Tests Ownership

### Unit vs. Conformance
- Unit-Tests: Owner-Teams schreiben Tests für ihre Module (frei erweiterbar).
- Conformance-Tests: Release-Gate, owned by Team 0 (hart).

### Conformance Gate Ownership (hart)
- `tests/conformance/**` ist **owned by Team 0** (Review required).
- Andere Teams dürfen PRs beisteuern, aber **Merge erfolgt durch Team 0**.
- Conformance-Tests sind das Release-Gate und dürfen nicht pro Team auseinanderdriften.

### Teststruktur (normativ)
- **Unit-Tests gehören nach** `tests/unit/<team>/**`
- **Conformance-Tests gehören nach** `tests/conformance/**` (Gate-Ownership Team 0)

---

## Early Start / Abhängigkeiten (für maximale Parallelität)

### Baseline-Reihenfolge (ideal)
1) Team 0: Contracts/Signaturen minimal finalisieren (nur das Nötigste)
2) Parallel: Team A, B, C, D, E, F
3) Danach: Team G und H
4) Abschluss: Team 0 integriert + Conformance Gate wird “hart”

### Early Start für Team G/H (ohne Blocker)
Team G/H darf vor A–F starten, **aber nur**:
- gegen Mock Contracts / Test Doubles
- ohne Annahmen über finale Semantik
- mit TODOs/Adapter-Layer, der später auf echte Module umgestellt wird

Spätestens vor Merge müssen G/H auf die echten Module umgestellt werden.

---

## Change-Request Prozess (für Contracts / fremde Files)
Wenn du eine Änderung in nicht-owned Files brauchst:

1) Erstelle ein Issue/Kommentar/PR-Note mit:
   - **Betroffenes File**
   - **Was genau fehlt / warum nötig**
   - **Minimaler Vorschlag** (Signatur, Typ, zusätzlicher Export)
   - **Impact** (welche Teams betroffen)

2) Team 0 entscheidet:
   - Accept (ändert selbst) oder
   - Alternative Lösung (z.B. helper in deinem Modul statt Contract change)

**Regel:** Niemals “mal eben” `src/index.types.ts` oder `src/index.ts` in einem fremden PR ändern.

---

## PR-Konventionen

### Branch Naming
- `team-a/canon-flagSpecInput`
- `team-d/registry-tombstones`
- `team-g/drain-loop`

### Commit/PR Prefix (empfohlen)
- `feat(canon): ...`
- `feat(state): ...`
- `feat(match): ...`
- `feat(processing): ...`
- `feat(runs): ...`
- `feat(targets): ...`
- `chore(ci): ...`
- `test(conformance): ...`

### PR-Regeln
- PR darf nur Owner-Files + passende Tests ändern (Team-0 Integrations-Ausnahme gilt).
- Keine Formatierung über das ganze Repo (nur scopebezogen).
- Jede PR beschreibt:
  - Was implementiert wurde
  - Welche Spec/Impl Abschnitte betroffen sind
  - Welche Tests hinzugefügt wurden
  - Ob es Contract-/Dependency-Requests gibt

---

## Review & Merge

### Review SLAs (leichtgewichtig)
- Owner-Team reviewt PRs, die ihre Owner-Files anfassen.
- Team 0 reviewt/mischt nur:
  - Contracts/Public surface
  - Conformance Gate (`tests/conformance/**`)
  - Dependency approvals
  - Integration patches (Imports/Wiring)

---

## Definition of Done (DoD)
### Conformance-Trigger (Pflicht)
Wenn ein PR eines dieser Ziele anfasst, ist zusätzlich **`pnpm test:conformance` Pflicht**:
- `src/processing/**`
- `src/runs/**`
- `src/match/**`
- `src/targets/**`
- `src/runtime.ts`
- `src/index.types.ts`

Ein Task/PR gilt als Done, wenn:

- `pnpm typecheck` ✅
- `pnpm lint` ✅
- `pnpm test` ✅ (oder mindestens die betroffenen Unit-Tests; Conformance wenn relevant)
- Tests decken Kerninvarianten ab (Edgecases)
- Keine Änderungen an nicht-owned Files (außer explizit durch Team 0 als Integration)
- Keine neuen Dependencies ohne Freigabe (Test-only Ausnahme beachtet)

---