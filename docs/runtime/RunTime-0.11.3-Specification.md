---
location: docs/runtime/RunTime-0.11.3-Specification.md
version: 0.11.3
maintainer: Axel Elstermann | einfach.design (e2d)
scope: Runtime specification and implementation notes.
description: Runtime documentation (specification and implementation notes).
---

# RunTime 0.11.3 – Specification (pre-release)
**Referenzraum (X):** RunTime 0.x (RunIverse: Impulse Signal Flag)
**Geltungsbereich:** Normative Semantik für API, Matching, Queue-/Backfill-Verarbeitung, Retroactive-Onboarding, Fehler & Diagnostics.  
**Außerhalb des Geltungsbereichs:** Async/Await/Promises, Scheduling-/Zeitlogik (Debounce/Timeout), Prioritäten, Predicate-DSLs, Debug-Graphen.

**Meta-Spezifikation:** Dieses Dokument folgt:
- Spezifikationssemantik-und-Grammatik-0.3.0.md,
- Artefakterstellung-Session-Vibe-1.1.0.md und
- Artefakterstellung-Spezifikation-1.1.0.md.

> Leitprinzip (SSoT, nicht normativ): **Flags und Signals kommen aus der Realität** und müssen das System **sofort** durchdringen.  
> `run.get(...)` liefert immer **Wahrheit zum Aufrufzeitpunkt**.
- `as: "snapshot"` (Default) gibt einen **stabilen Snapshot** zurück: Der Rückgabewert bleibt unabhängig von späteren State-Änderungen; es wird **keine Live-Referenz** auf interne, mutierbare Daten geleakt.
- `as: "reference"` gibt eine **Referenz auf interne, mutierbare Daten** zurück und ist **UNSAFE**: Der Rückgabewert kann spätere Mutationen widerspiegeln und/oder externe Mutation erlauben.


## 1. Normative Sprache

Die Schlüsselwörter MUSS, DARF NICHT, SOLL, DARF sind normativ zu lesen:

- MUSS: zwingende Anforderung für Konformität
- DARF NICHT: verboten
- SOLL: starke Empfehlung; Abweichung ist zulässig, MUSS aber begründet werden
- DARF: optional

Nicht-normative Inhalte MÜSSEN explizit als *nicht normativ* markiert sein.


## 2. Konstrukte (normativ)

### 2.1 RunTime `run`
`run` ist die Engine: sie macht Realität im System verarbeitbar und führt Targets synchron und deterministisch aus.

**Norm**
- **RunTime definiert** eine synchrone, deterministische Matching-Engine, die Impulse verarbeitet und Targets ausführt.
- **Träger:** eine RunTime-Instanz (`run`) trägt RunTime.
- **Annotation:** Öffentliche API (`run.add`, `run.impulse`, `run.get`, `run.matchExpression`) sowie Registrierungs-/Impulse-Optionen drücken Parameter/Bindungen von RunTime aus.
- RunTime MUSS synchron arbeiten.
- RunTime MUSS deterministisch sein (gleiche Registrierung + gleiche Impulsfolge ⇒ gleiche Target-Reihenfolge).


### 2.2 RunCore `r`
`r` ist das kleine `run`: ein bewusst minimales, sicheres Subset-Handle für Targets.

**Norm**
- **RunCore definiert** ein kleines, bewusst minimales Run-Handle, das Targets benutzen dürfen.
- **Träger:** Argument 3 in Target-Aufrufen (`r`) trägt RunCore.
- **Annotation:** `r.get`, `r.matchExpression`.
- `r.get(...)` und `r.matchExpression(...)` MÜSSEN semantisch identisch zu `run.get(...)` und `run.matchExpression(...)` sein.


### 2.3 Signal `signal`
Ein Signal ist ein benanntes „es ist passiert“: eine Occurrence, die in RunTime sichtbar wird.

**Norm**
- **Signal definiert** eine Occurrence (ein passiertes, benanntes Ereignis).
- **Träger:** `signals` in `ImpulseOpts` und `signal` in Expressions tragen Signal.
- **Annotation:** Signal-Name (string).
- Ein Signal MUSS als Occurrence interpretiert werden.
- Pro actImpulse-Occurrence MUSS es höchstens ein Signal geben.
- RunTime MUSS `seenSignals` als monotone Dokumentationssicht führen.
- `signal` ist die SSoT-Wahrheit zum Aufrufzeitpunkt (*live-by-call*).


### 2.4 Flag `flag`
Ein Flag ist ein Presence-Bit der Realität: es ist da oder es ist nicht da.

**Norm**
- **Flag definiert** ein Presence-Bit (on/off) in der Realität.
- **Träger:** `addFlags`/`removeFlags` (Delta) sowie Flag-Constraints in Expressions tragen Flag.
- **Annotation:** Flag-Name (string).
- Flags sind Presence-Bits, nicht Zähler.
- `flags` ist die SSoT-Wahrheit zum Aufrufzeitpunkt (*live-by-call*).


### 2.5 FlagsView / changedFlags / seenFlags `flagsView`

FlagsView ist die read-only Sicht auf Flag-Wahrheit – inklusive der stabilen Ansichten „changed“ und „seen“.

Norm
- Ein `FlagsView` MUSS als `{ list, map }` dargestellt werden (siehe Typen in §3.2).
- Ein `FlagsView` MUSS konsistent sein: `map[f] === true` ⇔ `list` enthält `f` (siehe §3.2).
- Für die Ordnung und Deduplizierung von `FlagsView.list` MUSS §3.2 gelten (Single Source of Truth).
- Eine Implementation MUSS `FlagsView` als read-only Sicht exponieren (keine mutierenden APIs auf dem View).


### 2.6 Expression `expression`
Expression ist die platonische Ur-Form: ein Ausdruck darüber, wie Realität aussehen kann, unabhängig davon, ob sie gerade so ist. Alle anderen *Expression sind Expression.

**Norm**
- **Expression definiert** einen Ausdruck über mögliche/aktuelle Realität (Signal + FlagSpecs + required.flags).
- **Träger:** Registrierungen via `run.add(AddOpts)` und deren persistierte registeredExpression tragen Expression.
- **Annotation:** `signal?`, `flags?`, `required?`, `targets?`, `payload?`, `runs?`, `backfill?`, Policies.


### 2.7 registeredExpression / appliedExpression / actualExpression `regExpression / applExpression / actExpression`
Diese drei Entitäten beschreiben Möglichkeit, echte Realität und deren kurzzeitige Überschneidung im Target-Aufruf.

**Norm**
- **registeredExpression (`regExpression`) definiert** eine Möglichkeit, wie Realität aussehen kann.
  - **Träger:** Einträge in `registeredQ` (stabile Insert-Order).
  - **Annotation:** `regExpression` ist die Code-Referenz dieser Entität.
- **actualExpression (`actExpression`) definiert** echte Realität als stabilen Snapshot des aktuellen Occurrence-Kontexts.
  - **Träger:** Argument 2 in Target-Aufrufen.
  - **Annotation:** `actExpression` ist die Code-Referenz dieser Entität.
- **appliedExpression (`applExpression`) definiert** die Überschneidung von registeredExpression und actualExpression inklusive Selbsterfahrung (Self-Referenz) im Moment der Realisierung.
  - **Träger:** Argument 1 in Target-Aufrufen.
  - **Annotation:** `applExpression` ist die Code-Referenz dieser Entität; `appliedExpression` ist die Prosa-Entität derselben Sache.
- appliedExpression MUSS ausschließlich für den kurzen Moment innerhalb von `coreRun` gelten, in dem das Target der appliedExpression aufgerufen wird (Realisation ist dispatch-lokal).
- `applExpression` und `actExpression` MÜSSEN als immutable behandelt werden (keine In-Place-Mutation; kein Ref-Leak als Live-Carrier).


### 2.8 Payload `payload`
Payload ist Nutzlast: opaque Daten, die an appliedExpression bzw. actualExpression hängen – die Engine interpretiert sie nicht.

**Norm**
- **Payload definiert** Nutzdaten, die an Expressions bzw. Impuls-Occurrences gebunden sind.
- **Träger:** `applExpression.payload` (aus `AddOpts.payload`) und `actExpression.payload` (aus `ImpulseOpts.livePayload`) tragen Payload.
- **Annotation:** frei (opaque) – RunTime interpretiert Payload nicht.
- `applExpression.payload` MUSS `AddOpts.payload` entsprechen (kann `undefined` sein).
- `actExpression.payload` MUSS `ImpulseOpts.livePayload` entsprechen (kann `undefined` sein).


### 2.9 Impulse `impulse`
Ein Impulse macht eine „Kante“ der Realität in RunTime sichtbar: er bringt Änderungen und Occurrences in den Verarbeitungspfad.

**Norm**
- **Impulse definiert** einen Match-Anstoß als (a) Flag-Delta und (b) eine Sequenz atomarer Signal-Occurrences.
- **Träger:** ein `run.impulse(ImpulseOpts)`-Aufruf sowie die intern daraus entstehenden **actImpulse**-Occurrences.
- **Annotation:** `signals`, `addFlags`, `removeFlags`, `livePayload`, `useFixedFlags`, `onError`.
- Ein Impulse MUSS als existent gelten, wenn mindestens eines gilt:
  - mindestens ein Signal wird emittiert (`signals` nicht-leer)
  - mindestens ein Flag wird hinzugefügt (`addFlags` nicht-leer)
  - mindestens ein Flag wird entfernt (`removeFlags` nicht-leer)


### 2.10 Impulse Context `i`
`i` ist der Impuls-Kontext, der jedem Target-Aufruf zur Verfügung steht und Occurrence-invariante Werte sowie per-Target-Call Snapshots enthält.

Hinweis (nicht normativ): Details zu Lifetime, Init-/Set-Regeln und Semantik von `i.q` und `i.expression` sind in §6.4 normiert.

**Norm**
- RunTime MUSS für jeden Target-Aufruf einen `ImpulseContext i` erzeugen und an diesen Target-Aufruf übergeben.
- Ein `ImpulseContext i` MUSS während des Target-Aufrufs immutable sein.
- Occurrence-invariante Werte MÜSSEN über alle `ImpulseContext i` derselben atomisierten Occurrence identisch sein.
- `i.signal` MUSS das Occurrence-Signal sein oder `undefined` sein.
- `i.addFlags` und `i.removeFlags` MÜSSEN die Flag-Requests des zugehörigen `run.impulse(...)` Aufrufs sein.
- `i.changedFlags` MUSS das Flags-Delta dieser Occurrence sein.
- `i.id` MUSS für die Occurrence unique sein; `i.seq` MUSS monoton pro run sein (Details: §6.4).
- `i.q` MUSS gesetzt sein und MUSS genau `"backfill"` oder `"registered"` sein (Details: §6.4.1).
- `i.expression` MUSS gesetzt sein und MUSS ein per-Target-Call Snapshot für die aktuelle appliedExpression sein (Details: §6.4.2).
- `i.expression` MUSS mindestens die folgenden Felder enthalten (Shape-only; Details: §6.4.2):
  - `i.expression.backfillSignalRuns?`
  - `i.expression.backfillFlagsRuns?`
  - `i.expression.backfillRuns?`
  - `i.expression.inBackfillQ`
  - `i.expression.actBackfillGate?`
- `i.expression` DARF NICHT als zweite Source-of-Truth für `RegisteredExpression`-State verstanden werden; die Semantik von Telemetrie/Projektion MUSS aus §6.4 abgeleitet werden.

**Träger:** Argument 4 in Target-Aufrufen (`i`) MUSS den Impuls-Kontext tragen.  
**Annotation:** `changedFlags`, `addFlags`, `removeFlags`, `signal`, `id`, `seq`, `q`, `expression`.


### 2.11 impulseQueue `impulseQ`

impulseQueue ist die kanonische Warteschlange für `run.impulse`: alle Impulse werden FIFO registriert; ein Cursor trennt applied segment und pending segment.

#### 2.11.1 impulseQueue: applied segment vs. pending segment (Terminologie)

Im Kontext von `impulseQ` bezeichnen:

- applied segment: alle Einträge vor dem Cursor, deren zugehörige `actImpulse`-Verarbeitung vollständig abgeschlossen ist.
- pending segment: alle Einträge ab Cursor (inklusive Cursor-Position), die in `impulseQ` registriert sind, aber noch nicht angewandt wurden.

Ein Eintrag kann höchstens einmal vom pending segment in den applied segment übergehen.

Norm
- `impulseQ` MUSS eine FIFO-Queue von `ImpulseQEntryCanonical` führen.
- `impulseQ.q.entries` MUSS die Queue-Elemente in Call-Time-Order tragen.
- `impulseQ.q.cursor` MUSS einen Integer-Index in der Range `0 ≤ impulseQ.q.cursor ≤ impulseQ.q.entries.length` tragen.
- Für `impulseQ` MUSS applied segment alle Queue-Elemente mit Index `< impulseQ.q.cursor` bezeichnen.
- Für `impulseQ` MUSS pending segment alle Queue-Elemente mit Index `>= impulseQ.q.cursor` bezeichnen.
- Ein Queue-Element MUSS höchstens einmal vom pending segment in den applied segment übergehen.
- Der Begriff applied segment DARF NICHT als Alias für Scope-Werte verwendet werden.
- Der Begriff pending segment DARF NICHT als Alias für Scope-Werte verwendet werden.
- Ein `run.impulse(opts)`-Aufruf MUSS `opts` **vor dem Enqueue** zu `ImpulseQEntryCanonical` kanonisieren und MUSS den kanonischen Entry FIFO am Ende von `impulseQ.q.entries` anhängen, sofern die Entry-Kanonisierung nicht gemäß diesem Abschnitt als invalid behandelt wird.
- Kanonisierung (MUSS, prüfbar; JS/TS; **Entry-Kanonisierung**):
  - `signals`: fehlt `signals` als own property, MUSS `signals` als `[]` kanonisiert werden; ist `signals` als own property vorhanden und `Array.isArray(signals) !== true` gilt, MUSS RunTime den `run.impulse(opts)`-Aufruf als invalid behandeln und MUSS gemäß §8.2 (OnError Control Flow) mit Phase `"impulse/canon"` verfahren.
  - `addFlags`: fehlt `addFlags` als own property, MUSS `addFlags` als `[]` kanonisiert werden; ist `addFlags` als own property vorhanden und `Array.isArray(addFlags) !== true` gilt, MUSS RunTime den `run.impulse(opts)`-Aufruf als invalid behandeln und MUSS gemäß §8.2 (OnError Control Flow) mit Phase `"impulse/canon"` verfahren.
  - `removeFlags`: fehlt `removeFlags` als own property, MUSS `removeFlags` als `[]` kanonisiert werden; ist `removeFlags` als own property vorhanden und `Array.isArray(removeFlags) !== true` gilt, MUSS RunTime den `run.impulse(opts)`-Aufruf als invalid behandeln und MUSS gemäß §8.2 (OnError Control Flow) mit Phase `"impulse/canon"` verfahren.
  - `useFixedFlags`: fehlt `useFixedFlags` als own property, MUSS `useFixedFlags` als `false` kanonisiert werden; ist `useFixedFlags` als own property vorhanden und `useFixedFlags !== false` gilt, MUSS RunTime `useFixedFlags` als `FlagsView` gemäß dessen normierter Definition validieren; wenn die Validierung fehlschlägt, MUSS RunTime den `run.impulse(opts)`-Aufruf als invalid behandeln und MUSS gemäß §8.2 (OnError Control Flow) mit Phase `"impulse/canon"` verfahren.
  - Wenn ein `run.impulse(opts)`-Aufruf gemäß diesem Abschnitt als invalid behandelt wird, DARF RunTime keinen Queue-Entry in `impulseQ.q.entries` enqueuen.
  - Iterations-Order MUSS erhalten bleiben: die Reihenfolge der Elemente in `signals`, `addFlags`, `removeFlags` MUSS der Input-Iteration-Order entsprechen.
  - Entry-Kanonisierung DARF NICHT deduplizieren und DARF NICHT Netto-Deltas ableiten (stable-unique / netting erfolgt nicht hier; siehe Semantik von Deltas und per-occurrence Ableitungen in §6.2 und §6.4).
  - Entry-Kanonisierung DARF ausschließlich Container-Defaults anwenden (fehlende own properties → `[]` / `false`) und MUSS alle übrigen Werte, die in diesem Abschnitt genannt sind, unverändert übernehmen.
  - Entry-Kanonisierung MUSS `livePayload` (falls als own property vorhanden) unverändert übernehmen; weitere Felder außerhalb der in diesem Abschnitt kanonisierten/normierten Felder werden von diesem Abschnitt nicht normiert.
- Wenn zum Zeitpunkt des Enqueue kein `impulseQ`-Drain aktiv ist, MUSS RunTime unmittelbar einen synchronen Drain starten.
- Wenn zum Zeitpunkt des Enqueue ein `impulseQ`-Drain aktiv ist, gilt: RunTime DARF NICHT einen weiteren Drain starten.
- Ein `impulseQ`-Drain MUSS Queue-Elemente am Cursor verarbeiten.
- Beim Verarbeiten eines Queue-Elements am Cursor MUSS RunTime eine `actImpulse`-Occurrence aus diesem Queue-Element ableiten.
- Beim Verarbeiten eines Queue-Elements am Cursor DARF RunTime den Queue-Entry NICHT mutieren; per-occurrence Felder (z. B. `i.signal`, `i.addFlags`, `i.changedFlags`) DÜRFEN ausschließlich abgeleitet werden.
- Beim Verarbeiten eines Queue-Elements am Cursor MUSS RunTime dieses Element gemäß Kapitel 6 und 7 verarbeiten.
- Nach erfolgreicher Verarbeitung MUSS RunTime `impulseQ.q.cursor` genau einmal inkrementieren.
- Ein `impulseQ`-Drain MUSS fortgesetzt werden, bis `impulseQ.q.cursor === impulseQ.q.entries.length` gilt.
- Für JS/TS MUSS `run.get("impulseQ", { as: "snapshot" }).q.entries` Entries liefern, die die Kanonisierungspflichten aus diesem Abschnitt erfüllen.


#### 2.11.2 Abort durch throw

Norm
- Wenn Impulsverarbeitung durch `throw` abbricht, MUSS RunTime die Impulsverarbeitung abbrechen.
- Wenn Impulsverarbeitung durch `throw` abbricht, gilt: RunTime DARF NICHT `impulseQ` weiter drainen.
- Wenn Impulsverarbeitung durch `throw` abbricht, MUSS RunTime `impulseQ.q.cursor` unverändert lassen.
- Wenn Impulsverarbeitung durch `throw` abbricht, MUSS jedes zu diesem Zeitpunkt im pending segment befindliche Queue-Element in `impulseQ` verbleiben.
- Wenn Impulsverarbeitung durch `throw` abbricht, MUSS jedes zu diesem Zeitpunkt im pending segment befindliche Queue-Element über `run.get("impulseQ")` sichtbar bleiben.
- Eine weitere Verarbeitung von Queue-Elementen im pending segment MUSS ausschließlich durch einen späteren, expliziten `run.impulse(...)`-Aufruf angestoßen werden.
- Ein Queue-Element im applied segment MUSS hiervon unbeeinflusst bleiben.

#### 2.11.3 Retention / Trim (impulseQ.config.* via `run.set({ impulseQ: { config: ... } })`)

Norm
- Retention/Trim MUSS ausschließlich auf Queue-Elemente im applied segment wirken.
- Retention/Trim DARF NICHT Queue-Elemente im pending segment entfernen.
- Retention/Trim DARF NICHT `impulseQ.q.cursor` erhöhen.

- Ein RunTime-Stack MUSS als aktiv gelten, solange die synchrone Kontrolle innerhalb eines öffentlichen RunTime-API-Calls ist, inklusive aller daraus synchron ausgelösten Drains und `actImpulse`-Verarbeitung.
- Ein RunTime-Stack MUSS als inaktiv gelten, sobald die Kontrolle vollständig ans Userland zurückkehrt.

- `impulseQ.config.retain` MUSS `number | boolean` akzeptieren.
- `impulseQ.config.retain` MUSS beschreiben, wie viele Queue-Elemente im applied segment gehalten werden.
- Wenn `impulseQ.config.retain` nicht gesetzt ist, MUSS `impulseQ.config.retain` als `0` gelten.
- `impulseQ.config.retain: true` MUSS zu `Infinity` kanonisiert werden.
- `impulseQ.config.retain: false` MUSS zu `0` kanonisiert werden.
- Wenn die Anzahl der Queue-Elemente im applied segment größer ist als `impulseQ.config.retain`, MUSS RunTime synchron die ältesten Queue-Elemente im applied segment entfernen, bis `impulseQ.config.retain` erfüllt ist.
- Wenn RunTime `n` Queue-Elemente aus dem applied segment entfernt, MUSS RunTime `impulseQ.q.cursor` um `n` reduzieren.

- `impulseQ.config.maxBytes` MUSS `number` akzeptieren.
- `impulseQ.config.maxBytes` MUSS ein Byte-Budget für Queue-Elemente im applied segment beschreiben.
- Wenn `impulseQ.config.maxBytes` nicht gesetzt ist, MUSS `impulseQ.config.maxBytes` als `Infinity` gelten.
- Die Implementation DARF die Byte-Budget-Messung frei definieren.
- Wenn `impulseQ.config.maxBytes` gesetzt ist und das Budget überschritten wird und kein RunTime-Stack aktiv ist, MUSS RunTime synchron ausschließlich die ältesten Queue-Elemente im applied segment entfernen, bis das Budget eingehalten ist.
- Wenn `impulseQ.config.maxBytes` gesetzt ist und das Budget überschritten wird und ein RunTime-Stack aktiv ist, gilt: RunTime DARF NICHT Byte-Budget-Trim ausführen.
- Wenn `impulseQ.config.maxBytes` gesetzt ist und das Budget überschritten wird und ein RunTime-Stack aktiv ist, MUSS RunTime einen ausstehenden Byte-Budget-Trim markieren.
- Sobald kein RunTime-Stack mehr aktiv ist, MUSS RunTime einen ggf. notwendigen Byte-Budget-Trim synchron durchführen, bevor die Kontrolle vollständig ans Userland zurückkehrt.

- RunTime MUSS für jedes aufgrund von Byte-Budget entfernte Queue-Element den Grund `"maxBytes"` verwenden.
- RunTime MUSS für jedes aufgrund von retain entfernte Queue-Element den Grund `"retain"` verwenden.

#### 2.11.4 onTrim / onError

Norm
- Eine Trim-Operation MUSS genau einen `stats.reason` haben.
- Für eine Trim-Operation MUSS für jedes entfernte Queue-Element derselbe Grund wie `stats.reason` verwendet werden.
- Wenn sowohl retain-Trim als auch Byte-Budget-Trim notwendig sind, MUSS RunTime zwei Trim-Operationen ausführen.
- Wenn sowohl retain-Trim als auch Byte-Budget-Trim notwendig sind, MUSS RunTime zuerst retain-Trim ausführen und danach Byte-Budget-Trim ausführen.

- Wenn `impulseQ.config.onTrim` gesetzt ist, MUSS RunTime `impulseQ.config.onTrim` vor jedem physischen Entfernen von Queue-Elementen im applied segment genau einmal pro Trim-Operation aufrufen.
- Wenn `impulseQ.config.onTrim` gesetzt ist, MUSS RunTime `entries` als FIFO-Liste der entfernten `ImpulseQEntryCanonical[]` (oldest-first) übergeben.
- Wenn `impulseQ.config.onTrim` gesetzt ist, MUSS RunTime `stats.reason` auf `"retain"` oder `"maxBytes"` setzen.
- Wenn `impulseQ.config.onError` gesetzt ist, MUSS RunTime `impulseQ.config.onError` für Fehler in `impulseQ`-Operationen verwenden.
- Die Control-Flow-Semantik von `impulseQ.config.onError` MUSS §8.2 entsprechen.


### 2.12 registeredQueue `registeredQ`
registeredQ ist die kanonische Ordnung: sie bestimmt die stabile Insert-Reihenfolge aller registrierten Möglichkeiten.

**Norm**
- **registeredQueue definiert** die kanonische Ordnung aller registeredExpression (stabile Insert-Order).
- **Träger:** `registeredQ` trägt registeredQueue.
- **Annotation:** `registeredQ` ist die Code-Referenz dieser Queue.
- Die kanonische Ordnung MUSS aus `registeredQ` kommen.


### 2.13 backfillQueue `backfillQ`
backfillQ ist die FIFO-Queue der Backfill-Teilnehmer in der Reihenfolge ihres Debt-Entry.

**Norm**
- backfillQ MUSS die Queue-Manifestation der Backfill-Teilnehmer definieren, d. h. die FIFO-Order derjenigen registeredExpression, die beim Debt-Entry enqueued werden.
- Eine registeredExpression MUSS Backfill-Teilnehmer sein genau dann, wenn mindestens eines gilt:
  - `(regExpression.backfill.signal.debt ?? 0) > 0`.
  - `(regExpression.backfill.flags.debt  ?? 0) > 0`.
- `backfillQ` MUSS als `{ list, map }` dargestellt sein:
  - `backfillQ.list` MUSS ein Array von registeredExpression in FIFO-Reihenfolge sein.
  - `backfillQ.map` MUSS ein boolean-set (`true`/absent) über `RegisteredExpression["id"]` sein.
  - **Klarstellung:** `backfillQ` (intern) ist **nicht** identisch mit `BackfillQSnapshot` (Export/Hydration).
    - Intern beschreibt `backfillQ.list` die FIFO-Reihenfolge der **registeredExpression-Teilnehmer** (Implementierung DARF hierfür direkte Referenzen/Objekte verwenden).
    - `BackfillQSnapshot` ist eine **Snapshot-View** derselben Queue und enthält ausschließlich **IDs** (`string[]`), typischerweise als Projektion `regExpression.id`.
    - `run.get("*", { as: "snapshot" })` MUSS `backfillQ` als `BackfillQSnapshot` ausgeben.
    - `run.set(hydrationSnapshot)` konsumiert `BackfillQSnapshot` und rekonstruiert daraus die interne `backfillQ` durch Lookup der IDs gegen die aktuell registrierten `regExpression` (siehe Behandlung unbekannter IDs).
- `regExpression.id` MUSS stabil sein.
- `backfillQ` MUSS id-dedupe garantieren: `backfillQ.list` DARF NICHT dieselbe `regExpression.id` mehr als einmal enthalten.
- Die folgenden Konsistenz-Invarianten MÜSSEN gelten:
  - `backfillQ.map[regExpression.id] === true` MUSS genau dann gelten, wenn `backfillQ.list` eine registeredExpression mit `id === regExpression.id` enthält.
- Eine registeredExpression MUSS über *appendIfAbsent* in `backfillQ` enqueued werden (einziger Insert-Pfad).
  - Wenn `backfillQ.map[regExpression.id] !== true`, dann MUSS `regExpression` an das Ende von `backfillQ.list` angehängt werden und `backfillQ.map[regExpression.id]` MUSS auf `true` gesetzt werden.
  - Wenn `backfillQ.map[regExpression.id] === true`, dann DARF NICHT erneut angehängt werden.
- Eine registeredExpression DARF `appendIfAbsent(backfillQ, regExpression)` **nur** in den folgenden Fällen aufrufen:
  - **Debt-Entry** der `registeredExpression` in `registeredRun` (Transition `<= 0 → > 0` in mindestens einem `regExpression.backfill.<gate>.debt`)
  - **Re-enqueue** einer `pending` `registeredExpression` **am Ende von `backfillRun`** (um einen späteren Impuls zu ermöglichen)
  - In allen anderen Fällen/Übergängen DARF NICHT in `backfillQ` enqueued werden.
- Die Enqueue-Reihenfolge MUSS FIFO nach Debt-Entry sein.
  - Debt-Entry MUSS als Transition von „kein Backfill“ zu „Backfill-Teilnehmer“ definiert sein, d. h. *vorher* sind beide Debts `<= 0` und *nachher* ist mindestens ein Debt `> 0`.
  - Ein Debt-Inkrement bei bestehender Backfill-Teilnahme (`>0 → >0`) DARF NICHT zu erneutem Enqueue führen.
- Die Quelle der FIFO-Ordnung MUSS deterministisch an die Processing-/Visit-Order gebunden sein: die Eintrittsreihenfolge MUSS der Reihenfolge entsprechen, in der Debt-Entry während der deterministischen Iteration festgestellt wird; real-time Timestamps DARF NICHT als Ordnungsquelle verwendet werden.
- Der Reset von `backfillQ` am Backfill-Rundenstart MUSS wie folgt erfolgen:
  - Die Working-Queue MUSS als Snapshot von `backfillQ.list` gebildet werden.
  - Unmittelbar danach MUSS `backfillQ` als *harte Neuinstanz* auf leer gesetzt werden: `backfillQ = { map: {}, list: [] }`.
- **Träger** MUSS `backfillQ` sein.
- **Annotation** MUSS `backfillQ` als Code-Referenz der Queue sein.

Hinweis (nicht normativ): Während einer Backfill-Abarbeitung wird die Working-Queue aus einem Snapshot gebildet; in dieser Phase kann eine registeredExpression Backfill-Teilnehmer (Debt>0) sein, ohne in der aktuellen `backfillQ`-Instanz zu stehen.


### 2.14 Backfill-State `regExpression.backfill`

`regExpression.backfill` ist der persistente State-Träger für Backfill pro `RegisteredExpression` (zweikanalig: `signal`/`flags`).

Hinweis (nicht normativ): §2.14 beschreibt den State-Shape; die Mechanik ist in §7.2 und §9 normiert.

**Norm**
- `regExpression.backfill` MUSS die folgenden State-Felder bereitstellen (Shape-only):

```ts
regExpression.backfill: {
    signal: {
        debt?: number
        runs: {
            used: number
            max?: number | Infinity
        }
    }
    flags: {
        debt?: number
        runs: {
            used: number
            max?: number | Infinity
        }
    }
}
```

- `regExpression.backfill.<gate>.runs.used` und `regExpression.backfill.<gate>.runs.max` MÜSSEN als Gate-spezifische Counter/Maxima gemäß §9.4 verstanden werden.
- Debt-Erzeugung/-Abbau für `regExpression.backfill.<gate>.debt` MUSS gemäß §9.3 (Debt-Split) verstanden werden.
- Backfill-Membership/Enqueue und Queue-Ordnung MÜSSEN gemäß §2.13 (`backfillQ`) und den Runs gemäß §7.2 verstanden werden.
- Details der Backfill-Verarbeitung (Gate-Wahl/Attempts/Debt/Multi-fire) MÜSSEN ausschließlich in §9.* normiert sein.
- Legacy-Felder `regExpression.backfill.<gate>.max` oder `regExpression.backfill.<gate>.used` (ohne `.runs.*`) DÜRFEN NICHT als Teil dieses State-Shapes erzeugt oder vorausgesetzt werden.

- **Träger:** `regExpression.backfill` MUSS Backfill-State tragen.
- **Annotation:** `regExpression.backfill` MUSS die Code-Referenz dieses State-Feldes sein.


## 3. Datentypen (normativ)

### 3.1 Primitive

```ts
type Flag = string
type Signal = string
```

### 3.2 FlagsView

Für Performance/Immutability wird Wahrheit als Array+Object dargestellt:

```ts
type FlagsView = {
    list: readonly Flag[];
    map: Readonly<Record<Flag, true>>;
}
```

Norm
- Konsistenz: Ein `FlagsView` MUSS konsistent sein: `map[f] === true` ⇔ `list` enthält `f`.
- Input-Sequenz: Die „Input-Sequenz“ ist die Sequenz von Flags, die RunTime beim Erzeugen des jeweiligen `FlagsView` in Iterationsreihenfolge verarbeitet.
- Stable-Unique: `FlagsView.list` MUSS stable-unique sein; d. h.:
  - (a) `list` MUSS jedes Flag höchstens einmal enthalten,
  - (b) wenn ein Flag mehrfach in der Input-Sequenz vorkommt, MUSS nur das erste Vorkommnis berücksichtigt werden („first occurrence wins“),
  - (c) die relative Reihenfolge der ersten Vorkommnisse MUSS erhalten bleiben.
- Verbotene Ordnungsquelle: Eine Implementation DARF NICHT eine Real-Time-Zeitquelle (z. B. Timestamp / Wallclock) als Ordnungsquelle für `FlagsView.list` verwenden.


### 3.3 FlagValue / FlagSpec

```ts
type FlagValue = true | false | "*"

type FlagSpec = {
  flag: Flag;
  value: FlagValue;
}
```

Semantik:
- `true`: Flag MUSS präsent sein
- `false`: Flag MUSS abwesend sein
- `"*"`: Watch ohne Constraint (Match immer true; zählt als Spec)

### 3.4 FlagSpecInput

```ts
type FlagSpecInput =
  | Flag
  | readonly Flag[]
  | Readonly<Record<Flag, true | false | "*" | { flag?: Flag; value?: true | false | "*" }>>
```

**Norm**
- `FlagSpecInput` MUSS gemäß Abschnitt 5.1/5.2 kanonisiert werden.
- Map-Value Defaults:
  - `flag` default = Map-Key
  - `value` default = `true`


### 3.5 FlagSpecInputOpts

```ts
type FlagSpecInputOpts = {
    flags?: FlagSpecInput;
};
```

Norm
- Wenn `flags` als own property in einem `FlagSpecInputOpts`-Wert vorhanden ist, MUSS RunTime dessen Wert gemäß §5.1/§5.2 kanonisieren.
- Wenn `flags` nicht als own property vorhanden ist, MUSS RunTime so behandeln, als wäre kein `flags`-Input angegeben worden.


### 3.6 ImpulseContext

```ts
type ImpulseContext = {
  changedFlags: FlagsView;           // tatsächlich geändert
  addFlags: readonly Flag[];          // requested (gesetzt vs leer: nur nicht-leer)
  removeFlags: readonly Flag[];       // requested (gesetzt vs leer: nur nicht-leer)
  signal: Signal | undefined;         // atomar pro Occurrence
  q: "backfill" | "registered";         // pro Target-Call gesetzt

  // per Target-Call Snapshot der aktuellen appliedExpression (Details: §6.4)
  expression: {
    backfillSignalRuns?: number;
    backfillFlagsRuns?: number;
    backfillRuns?: number;            // derived view (Summe), optional
    inBackfillQ: boolean;
    actBackfillGate?: "signal" | "flags";
  };

  id: string;                         // unique (Format frei)
  seq: number;                        // monoton steigend pro run
}
```

### 3.7 onError

```ts

type OnError =
  | "throw"
  | "report"
  | "swallow"
  | ((err: unknown, ctx: { phase: string; signal?: Signal; regExpressionId?: string; i?: ImpulseContext }) => void)
```

Norm
- Wenn ctx.regExpressionId gesetzt ist, MUSS es RegisteredExpression["id"] (also regExpression.id) referenzieren.


### 3.8 Expression-Typen

```ts
type TargetKind = "callback" | "object";

type TargetType = Callback | object;

/**
 * Input token for AddOpts.targets:
 * - implicit: Callback | object
 * - explicit: { kind, target }
 */
type TargetToken =
    | Callback
    | object
    | { kind: "callback"; target: TargetType }
    | { kind: "object"; target: TargetType };

/** canonical form stored in regExpression */
type Target = Readonly<{
    kind: TargetKind;
    target: TargetType;
}>;

type RegisteredExpression = WithDefaults & {
  id: string;                         // unique; Format frei (stabil)
  signal: Signal | undefined;
  flags: readonly FlagSpec[];         // kanonisiert
  required: {
    flags: { min: number; max: number | Infinity; changed: number }
  };

  targets: readonly Target[];
  
  payload: unknown;

  runs: { used: number; max: number | Infinity };

  retroactive: boolean;                            // default: false
  onError: OnError;

  backfill: {
    signal: {
      debt?: number;
      runs: { used: number; max?: number | Infinity };
    };
    flags: {
      debt?: number;
      runs: { used: number; max?: number | Infinity };
    };
  };

  tombstone?: true;
}

type AppliedExpression = RegisteredExpression & {
  remove(): void;

  // Convenience: immer gegen flags (nicht actExpression.flags)
  matchFlags(input: FlagSpecInput): boolean;
}

type ActualExpression = {
  signal: Signal | undefined;
  payload: unknown;

  // Gate-Inputs
  flags?: FlagsView;                 // undefined => live-by-call via run.get("flags")
  changedFlags: FlagsView;           // Delta dieser Occurrence
}
```

**Norm**
- `RegisteredExpression` MUSS die SSoT für die registrierte (persistierte) Expression sein.
- `tombstone` MUSS ein *ephemeral marker* sein und DARF nur intern gesetzt werden.
- `ActualExpression.signal` und `ActualExpression.payload` MÜSSEN aus der jeweiligen actImpulse Occurrence stammen.
- `ActualExpression.flags` DARF `undefined` sein; wenn `ActualExpression.flags === undefined` gilt, dann MUSS `run.matchExpression(...)` (unter `coreRun`) die Flags live-by-call aus dem Run beziehen (z. B. über `run.get("flags")`) und DARF NICHT auf eine im `i` gespeicherte Flags-Wahrheit angewiesen sein.
- Wenn `ActualExpression.flags` gesetzt ist, dann MUSS `run.matchExpression(...)` diese Flags-Wahrheit als fixed input verwenden.
- `ActualExpression.changedFlags` MUSS gesetzt sein und MUSS die Flag-Deltas dieser Occurrence tragen (konsistent zu `i.changedFlags`).


### 3.9 CoreOpts (Call-Options Base)

`CoreOpts` definiert das gemeinsame Options-Shape für Call-Eintrittspunkte.

```ts
type CoreOpts = {
  onError?: OnError;
};
```

**Norm**
- `CoreOpts` MUSS als gemeinsames Basis-Shape für Options-Typen von Call-Eintrittspunkten verwendet werden, die `onError` annehmen.
- Die Semantik der Felder von `CoreOpts` MUSS durch den jeweiligen Call (z. B. `run.add`, `run.impulse`, `run.set`) normiert werden; `CoreOpts` selbst definiert keine zusätzliche fachliche Semantik über die Feldnamen und Typen hinaus.


### 3.10 Defaults (Defaults-Anker)

Defaults ist das Modell für Scope- und Gate-Policies über die Dimensionen `signal` und `flags`.

```ts
export type Scope = "applied" | "pending" | "pendingOnly";

export type DefaultsDimScope = Readonly<{
    value: Scope;
    force: true | undefined;
}>;

export type DefaultsDimGate = Readonly<{
    value: boolean;
    force: true | undefined;
}>;

export type Defaults = Readonly<{
    scope: Readonly<{
        signal: DefaultsDimScope;
        flags: DefaultsDimScope;
    }>;
    gate: Readonly<{
        signal: DefaultsDimGate;
        flags: DefaultsDimGate;
    }>;
}>;

export type SetDefaultsDimScope = Readonly<{
    value: Scope;
    force?: true;
}>;

export type SetDefaultsDimGate = Readonly<{
    value: boolean;
    force?: true;
}>;

export type SetDefaults = Readonly<{
    scope?: Scope | Readonly<{
        signal?: Scope | SetDefaultsDimScope;
        flags?: Scope | SetDefaultsDimScope;
    }>;
    gate?: boolean | Readonly<{
        signal?: boolean | SetDefaultsDimGate;
        flags?: boolean | SetDefaultsDimGate;
    }>;
}>;

export type ResolvedDefaults = Defaults;

export type WithDefaults = Readonly<{
    scope?: SetDefaults["scope"];
    gate?: SetDefaults["gate"];
}>;
```

Norm
- `Defaults` MUSS voll kanonisch sein.
- In `Defaults` MUSS `value` pro Dimension vorhanden sein.
- In `Defaults` MUSS `force` pro Dimension als `true | undefined` vorhanden sein.
- `globalDefaults` MUSS die Baseline für die Auflösung sein.
- In `globalDefaults` MUSS `scope.signal.value` `"applied"` sein.
- In `globalDefaults` MUSS `scope.flags.value` `"applied"` sein.
- In `globalDefaults` MUSS `gate.signal.value` `true` sein.
- In `globalDefaults` MUSS `gate.flags.value` `true` sein.
- In `globalDefaults` MUSS `scope.signal.force` `undefined` sein.
- In `globalDefaults` MUSS `scope.flags.force` `undefined` sein.
- In `globalDefaults` MUSS `gate.signal.force` `undefined` sein.
- In `globalDefaults` MUSS `gate.flags.force` `undefined` sein.

- `SetDefaults` DARF Properties fehlen lassen.
- Ein fehlendes Property in `SetDefaults` MUSS als nicht gesetzt interpretiert werden.
- Ein fehlendes Property in `SetDefaults` DARF NICHT die Baseline verändern.
- In `SetDefaults` DARF NICHT ein vorhandenes Property den Wert `undefined` haben.
- Wenn in `SetDefaults` ein vorhandenes Property den Wert `undefined` hat, MUSS die Implementation den Input als invalid behandeln und MUSS throwen.
- In `SetDefaults` DARF NICHT `force` explizit `false` sein.
- Wenn in `SetDefaults` `force` explizit `false` ist, MUSS die Implementation den Input als invalid behandeln und MUSS throwen.

- Kanonisierung MUSS vor jeder weiteren Verarbeitung stattfinden.
- Nach Kanonisierung MUSS jedes vorhandene Dim-Override in Objektform vorliegen.
- In einem kanonisierten Dim-Override DARF `force` fehlen.
- Wenn in einem kanonisierten Dim-Override `force` fehlt, MUSS `force` als `undefined` interpretiert werden.
- Wenn `SetDefaults.scope` ein `Scope` ist, MUSS es als `{ signal: { value }, flags: { value } }` kanonisiert werden.
- Wenn `SetDefaults.gate` ein `boolean` ist, MUSS es als `{ signal: { value }, flags: { value } }` kanonisiert werden.
- Wenn `SetDefaults.scope.signal` ein `Scope` ist, MUSS es als `{ value }` kanonisiert werden.
- Wenn `SetDefaults.scope.flags` ein `Scope` ist, MUSS es als `{ value }` kanonisiert werden.
- Wenn `SetDefaults.gate.signal` ein `boolean` ist, MUSS es als `{ value }` kanonisiert werden.
- Wenn `SetDefaults.gate.flags` ein `boolean` ist, MUSS es als `{ value }` kanonisiert werden.
- Wenn ein Dim-Override `force: true` enthält, MUSS im selben Dim-Override `value` vorhanden sein.
- Wenn ein Dim-Override `force: true` enthält und `value` fehlt, MUSS die Implementation den Input als invalid behandeln und MUSS throwen.

- `ResolvedDefaults` MUSS das Ergebnis der Auflösung von `SetDefaults` gegen eine Baseline sein und MUSS als `Defaults` repräsentiert werden.
- Die Auflösung MUSS pro Feld stattfinden.
- Ein Feld MUSS eines der folgenden sein: `scope.signal`, `scope.flags`, `gate.signal`, `gate.flags`.
- Die Auflösung MUSS eine Kaskade über genau vier Ebenen verwenden: `globalDefaults` < `expressionOverrides` < `impulseOverrides` < `callOverrides`.
- Für jedes Feld MUSS die Kaskade in dieser Reihenfolge ausgewertet werden.
- Für jedes Feld MUSS der zuletzt in der Kaskade gesetzte Kandidat das Ergebnis bestimmen, wenn kein Force-Filter greift.
- Für jedes Feld MUSS Force pro Feld ausgewertet werden.
- Für ein Feld MUSS ein Force-Filter greifen, wenn mindestens ein Kandidat für dieses Feld `force: true` hat.
- Wenn für ein Feld ein Force-Filter greift, DARF NICHT ein Kandidat ohne `force: true` für dieses Feld berücksichtigt werden.
- Wenn für ein Feld ein Force-Filter greift, MUSS unter den verbleibenden Kandidaten weiterhin die normale Kaskaden-Reihenfolge gelten.

- `WithDefaults` MUSS die Form der Defaults-Overrides für Calls sein.
- `WithDefaults` MUSS Overrides als Flat-Properties `scope` und `gate` tragen.
- Ein Feld `defaults` DARF NICHT in öffentlichen Call-Overrides als Container verwendet werden.


### 3.11 SignalOpts und SignalInputOpts

```ts
type SignalOpts = {
    signals?: readonly Signal[];
};

type SignalInputOpts = {
    signals?: readonly Signal[];
};
```

Norm
- `run.add(opts)` verwendet `SignalOpts` über `AddOpts` (siehe Typdefinition §4.4).
- `run.impulse(opts)` verwendet `SignalInputOpts` über `ImpulseOpts` (siehe Typdefinition §4.5).
- Die Semantik von `signals` in `run.add(opts)` MUSS gemäß §4.4 normiert sein.
- Die Semantik von `signals` in `run.impulse(opts)` MUSS gemäß §6.1 normiert sein.

Nicht normativ
- `SignalOpts` und `SignalInputOpts` haben derzeit dasselbe Shape (`signals?: readonly Signal[]`), unterscheiden sich jedoch in ihrer Rolle (`run.add` vs. `run.impulse`).
- TypeScript-Beispiel (illustrativ):


### 3.12 FlagInputOpts

```ts
type FlagInputOpts = {
    addFlags?: readonly Flag[];
    removeFlags?: readonly Flag[];
};
```

Norm
- `run.impulse(opts)` verwendet `FlagInputOpts` über `ImpulseOpts` (siehe Typdefinition §4.5).
- Die Semantik der Flag-Deltas (`addFlags`, `removeFlags`) MUSS gemäß §6.2 normiert sein.


## 4. Öffentliche API (normativ)

### 4.1 run.get

```ts
export type RunGetKey =
    | "flags"
    | "changedFlags"
    | "seenFlags"
    | "signal"
    | "seenSignals"
    | "impulseQ"
    | "defaults";

export type ImpulseQEntryCanonical = ImpulseOptsCanonical;

export type ImpulseQSnapshot = Readonly<{
    cursor: number;
    entries: readonly ImpulseQEntryCanonical[];
}>;

export type ImpulseQSnapshotView = Readonly<{
    config: ImpulseQConfigCanonical;
    q: ImpulseQSnapshot;
}>;

/**
 * Snapshot-View der internen `backfillQ`:
 * - `list` enthält `regExpression.id` in FIFO-Reihenfolge.
 * - `map` ist ein boolean-set über dieselben IDs (`true`/absent).
 * Hinweis: die interne `backfillQ` DARF Referenzen auf `registeredExpression` halten; `BackfillQSnapshot` enthält ausschließlich IDs.
 */
export type BackfillQSnapshot = Readonly<{
    list: readonly string[];
    map: Readonly<Record<string, true>>;
}>;

export type RunGetMap = {
    flags: FlagsView;
    changedFlags: FlagsView | undefined;
    seenFlags: FlagsView;
    signal: Signal | undefined;
    seenSignals: { list: readonly Signal[]; map: Readonly<Record<Signal, true>> };
    impulseQ: ImpulseQSnapshotView;
    defaults: Defaults;
};

export type RunGetFullSnapshot =
    Readonly<{
        flags: FlagsView;
        changedFlags: FlagsView | undefined;
        seenFlags: FlagsView;
        signal: Signal | undefined;
        seenSignals: { list: readonly Signal[]; map: Readonly<Record<Signal, true>> };
        impulseQ: ImpulseQSnapshotView;
        backfillQ: BackfillQSnapshot;
        defaults: Defaults;
    }>
    & Readonly<Record<string, unknown>>;

export type RunGetOpts = Readonly<{
    scope?: Scope;
    as?: "snapshot" | "reference";
}>;

export type RunCore = Readonly<{
    get(name: "*", opts?: RunGetOpts): RunGetFullSnapshot;
    get<K extends RunGetKey>(name: K, opts?: RunGetOpts): RunGetMap[K];
}>;
```

Norm
- Alles, was nach außen als Getter exponiert wird, MUSS ausschließlich über `run.get` erreichbar sein.
- `run.get(name)` MUSS throwen, wenn `name` weder `"*"` ist noch ein Element von `RunGetKey` ist.
- `RunGetOpts.scope` MUSS `Scope` akzeptieren.
- `RunGetOpts.as` MUSS `"snapshot"` und `"reference"` akzeptieren.
- Ein Getter MUSS als scope-aware gelten, wenn er `RunGetOpts.scope` auswertet.
- `run.get(...)` MUSS für scope-aware Getter die Scope-Projektion aus dem aktuellen internen RunState berechnen.

- `as: "snapshot"` MUSS einen stabilen Snapshot liefern, der unabhängig von späteren State-Änderungen bleibt.
- `as: "snapshot"` DARF NICHT eine Live-Referenz auf interne, mutierbare Daten zurückgeben.
- `as: "reference"` DARF eine borrowed reference auf interne Strukturen zurückgeben.
- Ein Rückgabewert aus `as: "reference"` DARF NICHT gespeichert werden.
- Ein Rückgabewert aus `as: "reference"` DARF NICHT weitergereicht werden.
- Ein Rückgabewert aus `as: "reference"` DARF NICHT mutiert werden.
- Eine externe Mutation eines `as: "reference"`-Rückgabewerts DARF NICHT den nächsten `as: "snapshot"`-Rückgabewert für denselben Getter beeinflussen.
- In Dev-Mode SOLL die Implementation `as: "reference"`-Rückgabewerte schreibschützen.
- `run.get(...)` DARF pro Call neue Objektidentitäten liefern.
- `run.get(...)` DARF Rückgabewerte cachen.
- Für Getter, deren Rückgabewert ein Primitiv ist, DARF `as` semantisch bedeutungslos sein.
- Für Getter, deren Rückgabewert ein Primitiv ist, MUSS `as` akzeptiert werden.

- `scope` MUSS als Projektion über `impulseQ.q.entries` relativ zu `impulseQ.q.cursor` interpretiert werden.
- Die applied segment MUSS die Teilmenge mit `index < cursor` sein.
- Die pending segment MUSS die Teilmenge mit `index >= cursor` sein.
- Der Begriff `pending segment` MUSS ausschließlich die pending segment bezeichnen.
- `scope: "pending"` MUSS die Projektion `applied+pending` bezeichnen.
- `scope: "pending"` DARF NICHT synonym zu `pending segment` verwendet werden.
- `scope: "applied"` MUSS die Projektion nur über die applied segment liefern.
- `scope: "pending"` MUSS die Projektion über applied segment und pending segment liefern.
- `scope: "pendingOnly"` MUSS die Projektion nur über die pending segment liefern.

- `run.get("flags")` MUSS als Flags-Dimension-Getter behandelt werden.
- `run.get("changedFlags")` MUSS als Flags-Dimension-Getter behandelt werden.
- `run.get("seenFlags")` MUSS als Flags-Dimension-Getter behandelt werden.
- `run.get("changedFlags")` DARF `undefined` liefern.
- `run.get("signal")` MUSS als Signal-Dimension-Getter behandelt werden.
- `run.get("seenSignals")` MUSS als Signal-Dimension-Getter behandelt werden.
- Für Flags-Dimension-Getter MUSS für `scope: "pendingOnly"` der Seed das leere Set sein.
- Für Signal-Dimension-Getter MUSS für `scope: "pendingOnly"` der Seed `undefined` sein.

- `run.get("defaults")` MUSS einen `Defaults`-Wert liefern.
- `run.get("defaults")` MUSS `RunGetOpts.scope` akzeptieren.
- `run.get("defaults")` DARF NICHT `RunGetOpts.scope` auswerten.

- `run.get("impulseQ")` MUSS `RunGetOpts.scope` auswerten.
- Für JS/TS MUSS `run.get("impulseQ", { scope: S, as: "snapshot" }).q.entries` ausschließlich kanonische Entries gemäß `ImpulseQEntryCanonical` liefern.
- Wenn `q0 = run.get("impulseQ", { scope: "pending", as: "snapshot" }).q` ist, MUSS `run.get("impulseQ", { scope: "applied", as: "snapshot" }).q` deep-equal zu `{ cursor: q0.cursor, entries: q0.entries.slice(0, q0.cursor) }` sein.
- Wenn `q0 = run.get("impulseQ", { scope: "pending", as: "snapshot" }).q` ist, MUSS `run.get("impulseQ", { scope: "pendingOnly", as: "snapshot" }).q` deep-equal zu `{ cursor: 0, entries: q0.entries.slice(q0.cursor) }` sein.

- `run.get("*")` MUSS als eigener API-Pfad existieren.
- `run.get("*")` MUSS applied+pending liefern.
- `run.get("*")` MUSS `RunGetOpts.scope` akzeptieren.
- `run.get("*")` DARF NICHT `RunGetOpts.scope` auswerten.
- `run.get("*")` MUSS mindestens die Keys `flags`, `changedFlags`, `seenFlags`, `signal`, `seenSignals`, `impulseQ`, `backfillQ` und `defaults` liefern.
- Wenn `s = run.get("*", { as: "snapshot" })` ist, MUSS `run.set(s)` bewirken, dass ein unmittelbar folgendes `run.get("*", { as: "snapshot" })` deep-equal zu `s` ist.
- Ein Zustand MUSS als determinismusrelevant gelten, wenn sein Fehlen in `run.get("*", { as: "snapshot" })` bewirkt, dass die unmittelbar folgende Roundtrip-Bedingung nicht erfüllt ist.
- `run.get("*")` MUSS alle determinismusrelevanten Zustände liefern.
- Für JS/TS MUSS deep-equal bedeuten: gleiche Menge an own enumerable keys und für jeden Key deep-equal Werte.


### 4.2 run.set

```ts
export type RunSetImpulseQPatch = Readonly<{
    config?: ImpulseQConfig;
}>;

export type RunSetPatch = Readonly<{
    flags?: FlagsView;
    addFlags?: FlagsView;
    removeFlags?: FlagsView;
    signals?: readonly Signal[];
    impulseQ?: RunSetImpulseQPatch;
    defaults?: SetDefaults;
}>;

export type RunSetHydrationSnapshot = RunGetFullSnapshot;

export type RunSetInput = RunSetPatch | RunSetHydrationSnapshot;

run.set(opts: RunSetInput): void
```

run.set ist der einzige mechanische Eintrittspunkt zum Übernehmen extern gelieferter Zustandsdaten in RunTime.

Norm
- `run.set(opts)` MUSS ausschließlich über den Parameter `opts` gesteuert werden.
- `run.set(opts)` DARF NICHT Matching durchführen.
- `run.set(opts)` DARF NICHT Expression-Auswertung durchführen.
- `run.set(opts)` DARF NICHT Queue-Verarbeitung auslösen.
- `run.set(opts)` DARF NICHT Backfill-Verarbeitung auslösen.
- `run.set(opts)` DARF NICHT actImpulse-Verarbeitung auslösen.
- `run.set(opts)` DARF Diagnosen emittieren.
- `run.set(opts)` DARF NICHT semantische Ableitungen aus Diagnosen vornehmen.

- Ein Call MUSS als Hydration-Snapshot behandelt werden, wenn `backfillQ` als own property im Payload vorhanden ist.
- Ein Call MUSS als Patch-Call behandelt werden, wenn `backfillQ` nicht als own property im Payload vorhanden ist.

- Ein Hydration-Snapshot MUSS vollständig sein.
- Für JS/TS MUSS ein Hydration-Snapshot alle own enumerable keys enthalten, die `run.get("*", { as: "snapshot" })` liefert.
- Wenn ein Hydration-Snapshot nicht vollständig ist, MUSS `run.set(opts)` throwen.

- Ein Payload DARF NICHT konkurrierende Schreibformen für dieselbe Domain enthalten.
- Ein Payload MUSS als invalid gelten, wenn er konkurrierende Schreibformen für dieselbe Domain enthält.
- Eine Domain MUSS die Menge der Keys sein, die dieselbe Dimension als primären Zielzustand schreiben.
- Wenn ein Payload als invalid gilt, MUSS `run.set(opts)` throwen.

- Die Flags-Domain MUSS die Keys `flags`, `addFlags` und `removeFlags` umfassen.
- Ein Payload, der sowohl `flags` als auch `addFlags` enthält, MUSS als invalid gelten.
- Ein Payload, der sowohl `flags` als auch `removeFlags` enthält, MUSS als invalid gelten.
- Ein Payload MUSS als invalid gelten, wenn ein Flag sowohl in `addFlags` als auch in `removeFlags` enthalten ist.
- RunTime SOLL vor dem Throw einen Diagnostic mit `code: "set.flags.addRemoveConflict"` erzeugen; falls ein solcher Diagnostic erzeugt wird, MUSS dessen `code` `set.flags.addRemoveConflict` sein und dessen `severity` MUSS `"error"` sein.

- Wenn `flags` im Payload vorhanden ist, MUSS `run.set(opts)` den Flags-State auf `flags` setzen.
- Wenn `addFlags` im Payload vorhanden ist, MUSS `run.set(opts)` alle Flags aus `addFlags` zum Flags-State hinzufügen.
- Wenn `removeFlags` im Payload vorhanden ist, MUSS `run.set(opts)` alle Flags aus `removeFlags` aus dem Flags-State entfernen.
- Wenn `flags` im Payload vorhanden ist und `seenFlags` nicht als own property im Payload vorhanden ist, MUSS `run.set(opts)` `seenFlags` um alle Flags aus `flags` erweitern.
- Wenn `addFlags` im Payload vorhanden ist und `seenFlags` nicht als own property im Payload vorhanden ist, MUSS `run.set(opts)` `seenFlags` um alle Flags aus `addFlags` erweitern.
- Wenn `removeFlags` im Payload vorhanden ist und `seenFlags` nicht als own property im Payload vorhanden ist, MUSS `run.set(opts)` `seenFlags` um alle Flags aus `removeFlags` erweitern.

- `run.set(opts)` DARF NICHT `changedFlags` als monotone Historie behandeln.
- `run.set(opts)` DARF NICHT `changedFlags` als Side-Effect eines Flags-Updates aus `diff(prevFlags, nextFlags)` ableiten.
- Wenn `changedFlags` als own property in einem Patch-Call vorhanden ist, MUSS `run.set(opts)` den Input als invalid behandeln und MUSS throwen.
- Wenn `changedFlags` in einem Hydration-Snapshot vorhanden ist, MUSS `run.set(opts)` den changedFlags-State auf `changedFlags` setzen.
- Wenn `changedFlags` als own property in einem Hydration-Snapshot vorhanden ist, DARF NICHT `run.set(opts)` `changedFlags` zusätzlich als Side-Effect aus Flags-Updates verändern.

- Die Signals-Domain MUSS die Keys `signals` umfassen.

- Wenn `signals` im Payload vorhanden ist und `signals.length` `0` ist, MUSS `run.set(opts)` den Signal-State auf `undefined` setzen.
- Wenn `signals` im Payload vorhanden ist und `signals.length` größer als `0` ist, MUSS `run.set(opts)` den Signal-State auf das letzte Element von `signals` setzen.
- Wenn `signals` im Payload vorhanden ist und `seenSignals` nicht als own property im Payload vorhanden ist, MUSS `run.set(opts)` `seenSignals` um jedes Element aus `signals` erweitern.
- Wenn `signals` im Payload vorhanden ist, gilt: `run.set(opts)` DARF NICHT eine Step-Interpretation über `signals` durchführen.

- `run.set(opts)` DARF NICHT `impulseQ.q` in einem Patch-Call übernehmen.
- Wenn `impulseQ.q` in einem Patch-Call vorhanden ist, MUSS `run.set(opts)` den Input als invalid behandeln und MUSS throwen.
- Wenn `impulseQ.config` in einem Patch-Call vorhanden ist, MUSS `run.set(opts)` `impulseQ.config` als Patch gegen die bestehende `impulseQ.config` anwenden.

- Wenn `impulseQ.q` in einem Hydration-Snapshot vorhanden ist, MUSS `run.set(opts)` `impulseQ.q.cursor` und `impulseQ.q.entries` übernehmen.
- Wenn `impulseQ.config` in einem Hydration-Snapshot vorhanden ist, MUSS `run.set(opts)` `impulseQ.config` übernehmen.
- Für JS/TS MUSS `impulseQ.q.entries` in einem Hydration-Snapshot ausschließlich kanonische Entries gemäß `ImpulseQEntryCanonical` enthalten.

- `run.set(opts)` MUSS `defaults` in einem Patch-Call als `SetDefaults` interpretieren.
- Wenn `defaults` in einem Patch-Call vorhanden ist, MUSS `run.set(opts)` die Auflösung gemäß §3.10 anwenden und MUSS den Defaults-State auf das Ergebnis setzen.
- `run.set(opts)` MUSS `defaults` in einem Hydration-Snapshot als `Defaults` interpretieren.
- Wenn `defaults` in einem Hydration-Snapshot vorhanden ist, MUSS `run.set(opts)` den Defaults-State auf `defaults` setzen.

- Wenn `signal` in einem Hydration-Snapshot vorhanden ist, MUSS `run.set(opts)` den Signal-State auf `signal` setzen.
- Wenn `seenSignals` in einem Hydration-Snapshot vorhanden ist, MUSS `run.set(opts)` den seenSignals-State auf `seenSignals` setzen.
- Wenn `seenFlags` in einem Hydration-Snapshot vorhanden ist, MUSS `run.set(opts)` den seenFlags-State auf `seenFlags` setzen.
- Wenn `backfillQ` in einem Hydration-Snapshot vorhanden ist, MUSS `run.set(opts)` den backfillQ-State auf `backfillQ` setzen.
  - Für jede `regExpression.id` aus `backfillQ.map` wird versucht, eine `regExpression.id` in `registeredQ` zu finden.
  - Wenn keine passende `regExpression` existiert, MUSS `onError` aufgerufen werden (Phase: `"set/hydration/backfillQ"`; `regExpressionId` gesetzt, wobei `regExpressionId` die aktuelle `regExpression.id` ist).
  - Wenn nach `onError` weiterhin keine passende `regExpression` existiert, MUSS die `regExpression` mit `regExpression.id` gedroppt werden (sie DARF NICHT in die interne `backfillQ` übernommen werden).

- Wenn `seenFlags` als own property im Payload vorhanden ist, gilt: `run.set(opts)` DARF NICHT `seenFlags` zusätzlich als Side-Effect aus `flags`, `addFlags` oder `removeFlags` verändern.
- Wenn `seenSignals` als own property im Payload vorhanden ist, gilt: `run.set(opts)` DARF NICHT `seenSignals` zusätzlich als Side-Effect aus `signals` verändern.

- Wenn `seenFlags` als own property in einem Patch-Call vorhanden ist, MUSS `run.set(opts)` den Input als invalid behandeln und MUSS throwen.
- Wenn `seenSignals` als own property in einem Patch-Call vorhanden ist, MUSS `run.set(opts)` den Input als invalid behandeln und MUSS throwen.
- Wenn `signal` als own property in einem Patch-Call vorhanden ist, MUSS `run.set(opts)` den Input als invalid behandeln und MUSS throwen.

### 4.2.1 impulseQueue-Konfiguration (`opts.impulseQ`)

#### 4.2.1.1 Shapes (SSoT)

~~~ts
// Shared shapes (SSoT)
// Ziel: Feldnamen + Callback-Signaturen genau einmal definieren,
// damit Setter (Patch) und Getter (Canonical) nicht driften.

export type ImpulseQTrimStats = Readonly<{
  reason: "retain" | "maxBytes";
  bytesFreed?: number; // optional; Messbasis implementation-defined.
}>;

export type ImpulseQTrimInfo = Readonly<{
  entries: readonly ImpulseQEntryCanonical[]; // oldest-first; applied-only.
  stats: ImpulseQTrimStats;
}>;

/**
 * Setter/Patch-Form (Input):
 * - optional fields (Patch-Semantik in run.set)
 * - retain erlaubt boolean shorthands (DX)
 *
 * Reasoning:
 * run.set übernimmt nur explizit gesetzte Felder; deshalb sind Felder optional.
 * boolean shorthands vermeiden "Infinity" als eigener Typ und sind bequemer.
 */
export type ImpulseQConfig = Readonly<{
  retain?: number | boolean; // Default: 0; true ⇒ Infinity; false ⇒ 0.
  maxBytes?: number;         // Default: Infinity.

  onTrim?: (info: ImpulseQTrimInfo) => void;
  onError?: OnError; // Semantik wie 8.2 (OnError Control Flow)
}>;

/**
 * Setter-Container:
 * In Patch-Calls via `run.set({ impulseQ: { config: ... } })` DARF RunTime ausschließlich `config` akzeptieren (nie `q`).
 * In Hydration-Snapshots DARF/MUSS `impulseQ.q` übernommen werden (siehe §4.2 run.set).
 */
export type ImpulseQSetOpts = Readonly<{
  config?: ImpulseQConfig;
}>;

/**
 * Getter/Canonical-Form (Output):
 * - Defaults angewandt, shorthands aufgelöst
 * - retain/maxBytes sind required numbers (effektive Werte)
 *
 * Reasoning:
 * Getter soll den "effektiven Zustand" liefern, nicht wieder Patch-/Input-Logik leaken.
 * Wir übernehmen Struktur/Callbacks aus ImpulseQConfig und kanonisieren nur die Werte.
 */
export type ImpulseQConfigCanonical = Readonly<
  Omit<ImpulseQConfig, "retain" | "maxBytes"> & {
    retain: number;
    maxBytes: number;
  }
>;

/**
 * Queue-State (beobachtbar via run.get):
 * - entries sind persistierte, kanonisierte Queue-Entries (ImpulseQEntryCanonical)
 * - cursor trennt applied (index < cursor) von pending (index >= cursor)
 */
export type ImpulseQSnapshot = Readonly<{
  cursor: number;
  entries: readonly ImpulseQEntryCanonical[];
}>;

/**
 * run.get("impulseQ") Snapshot-Shape:
 * liefert immer { config, q } (einziger Einstieg; "innen = außen").
 *
 * Reasoning:
 * config und q sind orthogonal: Policy vs Daten.
 * as:"snapshot"|"reference" wirkt konsistent auf die gesamte Struktur.
 */
export type ImpulseQSnapshotView = Readonly<{
  config: ImpulseQConfigCanonical;
  q: ImpulseQSnapshot;
}>;
~~~

#### 4.2.1.2 Begriffe

- Ein `impulseQ`-Eintrag ist entweder *pending* (registriert) oder *applied* (angewandt). Trim-Regeln dieses Abschnitts
  gelten ausschließlich für *applied* Einträge (siehe 7.4/2.11 für Cursor-/Drain-Modell).

#### 4.2.1.3 retain

- Wenn `opts.impulseQ?.config?.retain` gesetzt ist, MUSS RunTime den Wert als neues Retentions-Limit für *applied* Einträge in `impulseQ` übernehmen.
- `retain = N` bedeutet: RunTime MUSS sicherstellen, dass höchstens die **letzten N** *applied* Einträge in `impulseQ` gehalten werden.
- Retention-Trim (MUSS): Wenn nach Übernahme von `retain` mehr als `N` *applied* Einträge vorhanden sind,
  MUSS RunTime **synchron innerhalb desselben `run.set`-Calls** die **ältesten** *applied* Einträge (FIFO) trimmen,
  bis die Bedingung erfüllt ist.

#### 4.2.1.4 maxBytes

- Definition “RunTime-Stack aktiv” (MUSS):
  - RunTime-Stack gilt als aktiv ab Eintritt in einen öffentlichen API-Call (run.get/run.set/run.add/run.impulse/run.matchExpression)
    bis zu dessen Return, sowie während eines impulseQ-drains (inkl. verschachtelter synchroner Verarbeitung).
  - Ein synchron aufgerufener Callback (Targets, onTrim, onDiagnostic) zählt als “während RunTime-Stack aktiv”.
- Wenn `opts.impulseQ?.config?.maxBytes` gesetzt ist, MUSS RunTime den Wert als neues Byte-Budget für in `impulseQ` gehaltene Daten übernehmen.
- Byte-Budget-Messung (MUSS): Die Messung, welche Bytes gegen `maxBytes` gezählt werden, ist **implementation-defined**.
- Determinismus (MUSS):
  - Die Byte-Messfunktion MUSS eine pure, deterministische Funktion über den Queue-Snapshot sein
    (gleiche applied-entries in gleicher Reihenfolge ⇒ gleiche gemessene Byte-Summe).
  - Die Messbasis für stats.bytesFreed MUSS exakt dieselbe Messfunktion sein wie für maxBytes.
- Byte-Budget-Trim (MUSS):
  - RunTime DARF *applied* Einträge trimmen, um `maxBytes` einzuhalten, MUSS dabei aber ausschließlich *applied* Einträge trimmen
    und MUSS FIFO („älteste *applied* zuerst“) vorgehen.
  - RunTime DARF NICHT Byte-Budget-Trim ausführen, solange ein RunTime-Stack aktiv ist (d. h. während laufender Verarbeitung /
    innerhalb eines öffentlichen API-Calls / während eines Drains).
  - Sobald kein RunTime-Stack mehr aktiv ist, MUSS RunTime einen ggf. notwendigen Byte-Budget-Trim durchführen, bis das Budget eingehalten ist
    oder keine *applied* Einträge mehr trimmbar sind.
- Deferred-Trim (MUSS):
  - Wenn ein Trim-Bedarf während aktivem Stack entsteht, MUSS RunTime ihn als pending markieren
    und MUSS ihn unmittelbar nach Stack-Exit (bevor die Kontrolle vollständig ans Userland zurückkehrt) ausführen.

#### 4.2.1.5 onTrim (Persistierbarkeit)

- Wenn `opts.impulseQ?.config?.onTrim` gesetzt ist, MUSS RunTime diesen Callback registrieren.
- Wenn RunTime eine Trim-Operation aufgrund von `retain` oder `maxBytes` ausführt, bei der mindestens ein *applied* Eintrag physisch entfernt wird,
  MUSS RunTime `onTrim(...)` **synchron** **genau einmal pro Trim-Operation** aufrufen, **bevor** die Einträge physisch entfernt werden,
  damit die zu entfernenden Daten verlässlich persistiert werden können.
- `onTrim` MUSS die Menge der in dieser Trim-Operation zu entfernenden Einträge als `entries` erhalten; die Reihenfolge in `entries`
  MUSS der FIFO-Entfernreihenfolge entsprechen.
- `bytesFreed` MUSS die in dieser Trim-Operation freigegebenen Bytes bezeichnen; die Messbasis ist **implementation-defined**
  (konsistent zur Messung von `maxBytes`).
- `stats` MUSS Zusatzinformationen zur Trim-Operation liefern; der genaue Inhalt ist **implementation-defined**, MUSS aber stabil innerhalb
  einer Implementation sein.
- `stats` (SOLL):
  - `stats` SOLL mindestens { reason, bytesFreed? } enthalten; zusätzliche Felder sind implementation-defined.
- Drift-Guard (MUSS): `run.get("impulseQ", { as: "snapshot" }).q.entries` MUSS ausschließlich Entries liefern, die die Kanonisierungspflichten aus §2.11.1 (Entry-Kanonisierung) erfüllen.
- Drift-Guard (MUSS): `ImpulseQTrimInfo.entries` MUSS ausschließlich Entries liefern, die die Kanonisierungspflichten aus §2.11.1 (Entry-Kanonisierung) erfüllen.
- Drift-Guard (DARF NICHT): `run.get("impulseQ", { as: "snapshot" }).q.entries` DARF NICHT Entries liefern, die die Kanonisierungspflichten aus §2.11.1 (Entry-Kanonisierung) verletzen.
- Drift-Guard (DARF NICHT): `onTrim(info)` DARF NICHT `info.entries` erhalten, die die Kanonisierungspflichten aus §2.11.1 (Entry-Kanonisierung) verletzen.

#### 4.2.1.6 onError (impulseQ-spezifisch)

- Wenn `opts.impulseQ?.config?.onError` gesetzt ist, MUSS RunTime diesen Handler als Fehlerbehandlung für `impulseQ`-Operationen registrieren,
  insbesondere für Fehler, die innerhalb von `impulseQ.config.onTrim` auftreten.
- Die Control-Flow-Semantik von `opts.impulseQ.config.onError` MUSS der in 8.2 definierten `OnError`-Semantik entsprechen (inkl. "throw"/"report"/"swallow"
  und Funktionsform).

#### 4.2.1.7 Keine Impulsverarbeitung durch Trim

- Trim-Operationen, die durch `retain` oder `maxBytes` ausgelöst werden, DÜRFEN keine neue Impulsverarbeitung (`run.impulse`/Drain) anstoßen.
  Insbesondere DARF NICHT `run.set` durch `opts.impulseQ` einen neuen Drain starten noch laufende Drains verschachteln.


### 4.3 run.onDiagnostic

```ts
run.onDiagnostic(handler: (d: Diagnostic) => void): () => void
```

**Norm**
- RunTime MUSS `run.onDiagnostic` bereitstellen, um Diagnostics beobachtbar zu machen.
- `run.onDiagnostic` MUSS einen Handler registrieren und MUSS eine Remove-Funktion zurückgeben, die den Handler deregistriert.
- Wenn RunTime einen Diagnostic erzeugt, MUSS RunTime alle aktuell registrierten `run.onDiagnostic`-Handler synchron aufrufen (unabhängig von `onError`).
- Wenn `onError: "report"` aktiv ist, DARF RunTime zusätzlich über `console.*` loggen.
- Logging (z. B. bei `onError: "report"`) DARF das Emittieren über `run.onDiagnostic` nicht ersetzen.


### 4.4 run.add

```ts
type AddOpts =
  & CoreOpts
  & SignalOpts
  & FlagSpecInputOpts
  & WithDefaults
  & {
    id?: string;
    required?: {
      flags?: {
        min?: number;
        max?: number | Infinity;
        changed?: number;
      };
    };
    targets: readonly TargetToken[];
    payload?: unknown;
    runs?: { max?: number | Infinity };
    retroactive?: boolean;
    backfill?: {
      signal?: { runs?: { max?: number | Infinity } };
      flags?: { runs?: { max?: number | Infinity } };
    };
  };

type Remove = () => void

run.add(opts: AddOpts): Remove
```

Norm
- `run.add(opts)` MUSS eine oder mehrere `RegisteredExpression` registrieren.
- `run.add(opts)` MUSS eine `Remove`-Funktion zurückgeben.
- Jedes durch `run.add(opts)` registrierte Element MUSS im Folgenden `regExpression` heißen.


- `opts.id` KANN gesetzt sein (stabile, vom Nutzer gewählte ID).
- Wenn `opts.id` gesetzt ist und bereits für eine bestehende registeredExpression vergeben ist, MUSS `run.add(opts)` throw.
- Wenn `opts.id` nicht gesetzt ist, MUSS die Engine eine Auto-ID vergeben: ein monoton steigender Integer ab 0, der zu string gecastet wird ("0", "1", …).


- `opts.signals` MUSS als Eingabefeld von `run.add(opts)` behandelt werden.
- `opts.flags` MUSS als Eingabefeld von `run.add(opts)` behandelt werden.
- `opts.targets` MUSS als Eingabefeld von `run.add(opts)` behandelt werden.
- `opts.backfill` MUSS als Eingabefeld von `run.add(opts)` behandelt werden.
- `opts.required` MUSS als Eingabefeld von `run.add(opts)` behandelt werden.

- Wenn `scope` als own property in `opts` vorhanden ist, MUSS `run.add(opts)` für jedes registrierte `regExpression` `regExpression.scope` auf `opts.scope` setzen.
- Wenn `scope` nicht als own property in `opts` vorhanden ist, DARF NICHT `run.add(opts)` für jedes registrierte `regExpression` `regExpression.scope` setzen.
- Wenn `gate` als own property in `opts` vorhanden ist, MUSS `run.add(opts)` für jedes registrierte `regExpression` `regExpression.gate` auf `opts.gate` setzen.
- Wenn `gate` nicht als own property in `opts` vorhanden ist, DARF NICHT `run.add(opts)` für jedes registrierte `regExpression` `regExpression.gate` setzen.

- Wenn `opts.runs` als own property in `opts` vorhanden ist und `opts.runs.max` als own property in `opts.runs` vorhanden ist, MUSS `run.add(opts)` für jedes registrierte `regExpression` `regExpression.runs.max` auf `opts.runs.max` setzen.
- Wenn `opts.runs` nicht als own property in `opts` vorhanden ist, MUSS `run.add(opts)` für jedes registrierte `regExpression` den Default für `regExpression.runs.max` gemäß §13 anwenden.
- Wenn `opts.runs` als own property in `opts` vorhanden ist und `opts.runs.max` nicht als own property in `opts.runs` vorhanden ist, MUSS `run.add(opts)` für jedes registrierte `regExpression` den Default für `regExpression.runs.max` gemäß §13 anwenden.

- Wenn `opts.required` als own property in `opts` vorhanden ist und `opts.required.flags` als own property in `opts.required` vorhanden ist und `opts.required.flags.min` als own property in `opts.required.flags` vorhanden ist, MUSS `run.add(opts)` für jedes registrierte `regExpression` `regExpression.required.flags.min` auf `opts.required.flags.min` setzen.
- Wenn `opts.required` als own property in `opts` vorhanden ist und `opts.required.flags` als own property in `opts.required` vorhanden ist und `opts.required.flags.max` als own property in `opts.required.flags` vorhanden ist, MUSS `run.add(opts)` für jedes registrierte `regExpression` `regExpression.required.flags.max` auf `opts.required.flags.max` setzen.
- Wenn `opts.required` als own property in `opts` vorhanden ist und `opts.required.flags` als own property in `opts.required` vorhanden ist und `opts.required.flags.changed` als own property in `opts.required.flags` vorhanden ist, MUSS `run.add(opts)` für jedes registrierte `regExpression` `regExpression.required.flags.changed` auf `opts.required.flags.changed` setzen.

- Wenn `opts.flags` als own property vorhanden ist, MUSS RunTime den Wert gemäß §3.5 und §5.1/§5.2 kanonisieren und als `regExpression.flags` persistieren.

- Wenn `opts.signals` nicht als own property in `opts` vorhanden ist, MUSS `run.add(opts)` genau ein `regExpression` registrieren.
- Wenn `opts.signals` nicht als own property in `opts` vorhanden ist, MUSS `run.add(opts)` `regExpression.signal` auf `undefined` setzen.
- Wenn `opts.signals` als own property in `opts` vorhanden ist und `opts.signals` leer ist, MUSS `run.add(opts)` genau ein `regExpression` registrieren.
- Wenn `opts.signals` als own property in `opts` vorhanden ist und `opts.signals` leer ist, MUSS `run.add(opts)` `regExpression.signal` auf `undefined` setzen.

- Wenn `opts.signals` als own property in `opts` vorhanden ist und `opts.signals` nicht leer ist, MUSS `run.add(opts)` `opts.signals` zu einer Sequenz `sigList` kanonisieren.
- Wenn `opts.signals` als own property in `opts` vorhanden ist und `opts.signals` nicht leer ist, MUSS `run.add(opts)` Duplikate aus `opts.signals` ab ihrer zweiten Occurrence entfernen.
- Wenn `opts.signals` als own property in `opts` vorhanden ist und `opts.signals` nicht leer ist, MUSS `run.add(opts)` die Reihenfolge der ersten Occurrences aus `opts.signals` erhalten.
- Wenn `opts.signals` als own property in `opts` vorhanden ist und `opts.signals` nicht leer ist, MUSS `run.add(opts)` für jedes `sig` in `sigList` genau ein `regExpression` registrieren.
- Wenn `opts.signals` als own property in `opts` vorhanden ist und `opts.signals` nicht leer ist, MUSS `run.add(opts)` für jedes aus `sigList` registrierte `regExpression` `regExpression.signal` auf exakt dieses `sig` setzen.
- Wenn `opts.signals` als own property in `opts` vorhanden ist und `opts.signals` nicht leer ist, MUSS `run.add(opts)` für jedes aus `sigList` registrierte `regExpression` alle Felder außer `regExpression.signal` so ableiten, als ob `opts.signals` nicht als own property in `opts` vorhanden wäre.
- Das Mapping von `regExpression.scope` MUSS identisch sein für alle `regExpression`, die aus `sigList` entstehen.
- Das Mapping von `regExpression.gate` MUSS identisch sein für alle `regExpression`, die aus `sigList` entstehen.

- Wenn `opts.signals` als own property in `opts` vorhanden ist und `sigList.length < opts.signals.length` gilt, MUSS RunTime mindestens eine Diagnostic emittieren.
- Wenn `opts.signals` als own property in `opts` vorhanden ist und `sigList.length < opts.signals.length` gilt, MUSS die Diagnostic `severity: "warn"` verwenden.
- Wenn `opts.signals` als own property in `opts` vorhanden ist und `sigList.length < opts.signals.length` gilt, MUSS die Diagnostic `code: "add.signals.dedup"` verwenden.
- Wenn `opts.signals` als own property in `opts` vorhanden ist und `sigList.length < opts.signals.length` gilt, MUSS die Diagnostic in `data` mindestens `signals: opts.signals` enthalten.
- Wenn `opts.signals` als own property in `opts` vorhanden ist und `sigList.length < opts.signals.length` gilt, MUSS die Diagnostic in `data` mindestens `deduped: sigList` enthalten.

- Jede registrierte `regExpression` MUSS in `registeredQ` hinten angehängt werden.
- Wenn `opts.signals` als own property in `opts` vorhanden ist und `opts.signals` nicht leer ist, MUSS die Insert-Order der registrierten `regExpression` der Reihenfolge von `sigList` entsprechen.

- `run.add(opts)` MUSS `regExpression.backfill.<gate>.runs.max` ausschließlich über `opts.backfill.<gate>.runs.max` befüllen (`<gate>` ∈ `{ "signal", "flags" }`).
- Wenn `opts.backfill` als own property in `opts` vorhanden ist und `opts.backfill.signal` als own property in `opts.backfill` vorhanden ist und `opts.backfill.signal.runs` als own property in `opts.backfill.signal` vorhanden ist und `opts.backfill.signal.runs.max` als own property in `opts.backfill.signal.runs` vorhanden ist, MUSS `run.add(opts)` für jedes registrierte `regExpression` `regExpression.backfill.signal.runs.max` auf `opts.backfill.signal.runs.max` setzen.
- Wenn `opts.backfill` als own property in `opts` nicht vorhanden ist oder `opts.backfill.signal` nicht als own property in `opts.backfill` vorhanden ist oder `opts.backfill.signal.runs` nicht als own property in `opts.backfill.signal` vorhanden ist oder `opts.backfill.signal.runs.max` nicht als own property in `opts.backfill.signal.runs` vorhanden ist, MUSS `run.add(opts)` für jedes registrierte `regExpression` den Default für `regExpression.backfill.signal.runs.max` gemäß §13 anwenden.
- Wenn `opts.backfill` als own property in `opts` vorhanden ist und `opts.backfill.flags` als own property in `opts.backfill` vorhanden ist und `opts.backfill.flags.runs` als own property in `opts.backfill.flags` vorhanden ist und `opts.backfill.flags.runs.max` als own property in `opts.backfill.flags.runs` vorhanden ist, MUSS `run.add(opts)` für jedes registrierte `regExpression` `regExpression.backfill.flags.runs.max` auf `opts.backfill.flags.runs.max` setzen.
- Wenn `opts.backfill` als own property in `opts` nicht vorhanden ist oder `opts.backfill.flags` nicht als own property in `opts.backfill` vorhanden ist oder `opts.backfill.flags.runs` nicht als own property in `opts.backfill.flags` vorhanden ist oder `opts.backfill.flags.runs.max` nicht als own property in `opts.backfill.flags.runs` vorhanden ist, MUSS `run.add(opts)` für jedes registrierte `regExpression` den Default für `regExpression.backfill.flags.runs.max` gemäß §13 anwenden.

- Das Mapping von `opts.backfill` DARF NICHT eine zweite Counter-Struktur erzeugen.
- `regExpression.runs.max` MUSS global bleiben.
- `regExpression.runs.max` DARF NICHT durch Backfill-Gate-Maxima ersetzt werden.
- `regExpression.backfill.<gate>.runs.max` MUSS gate-spezifisch bleiben.
- `regExpression.backfill.<gate>.runs.max` DARF NICHT in `regExpression.runs.max` verschmolzen werden.
- Legacy-Felder wie `regExpression.backfill.<gate>.max` DARF NICHT durch `run.add(opts)` erzeugt werden.
- Legacy-Felder wie `regExpression.backfill.<gate>.used` DARF NICHT durch `run.add(opts)` erzeugt werden.

- Die Bedeutung von `regExpression.runs.used/max` MUSS gemäß §9.4 verstanden werden.
- Die Bedeutung von `regExpression.backfill.<gate>.runs.used/max` MUSS gemäß §9.4 verstanden werden.
- `run.add(opts)` DARF NICHT die Backfill-Verarbeitung normieren.
- `run.add(opts)` MUSS für Backfill-Verarbeitung auf §9 verweisen.

- Die von `run.add(opts)` zurückgegebene `Remove`-Funktion MUSS alle durch diesen Call registrierten `regExpression` aus `registeredQ` entfernen.
- Die von `run.add(opts)` zurückgegebene `Remove`-Funktion SOLL idempotent sein.


#### 4.4.1 `add.signals`: Fail-fast Validierung für Objekt-Targets (MUSS)

Wenn `opts.signals` als own property in `opts` vorhanden ist und `opts.signals` nicht leer ist, MUSS `run.add(opts)` die folgenden Fail-fast-Validierungen durchführen.

Vorbereitung (MUSS)
- `run.add(opts)` MUSS `opts.signals` gemäß §4.4 zu einer kanonischen Sequenz `sigList` kanonisieren (inkl. Dedup/Order gemäß §4.4).
- Wenn §4.4 die Emission von `add.signals.dedup` verlangt, MUSS RunTime `add.signals.dedup` gemäß §4.4 emittieren, unmittelbar nachdem `sigList` kanonisiert wurde, und bevor die Kanonisierung von `opts.targets` gemäß §4.7 beginnt.
- `run.add(opts)` MUSS `opts.targets` gemäß §4.7 (Kanonisierung in `run.add`) zu einer kanonischen Target-Liste `targets` kanonisieren, bevor die Validierung gemäß diesem Abschnitt ausgeführt wird.
- `run.add(opts)` MUSS die Validierung gemäß diesem Abschnitt durchführen, bevor ein `regExpression` registriert oder in `registeredQ` eingefügt wird.

Scope (MUSS)
- Dieser Abschnitt gilt ausschließlich für kanonische Targets mit `t.kind === "object"` und für die `isObjectNonNull(t.target)` erfüllt ist (im Folgenden: Objekt-Targets). Callback-Targets sind von dieser Validierung ausgenommen.

Prädikate (MUSS)
- Für `isCallable` und `isObjectNonNull` gilt §4.7.3.
- Für `hasOwn(o, k)` gilt §8.3.2 (Handler-Resolution).

Diagnostics vor Throw (MUSS)
- Wenn `run.add(opts)` gemäß diesem Abschnitt throwt, MUSS RunTime jeden gemäß diesem Abschnitt erzeugten Diagnostic mit `code: "add.objectTarget.missingEntrypoint"`, `code: "add.objectTarget.missingHandler"` oder `code: "add.objectTarget.nonCallableHandler"` erzeugen, bevor `run.add(opts)` throwt.

`onError` bei Throws gemäß diesem Abschnitt (MUSS)
- Wenn `run.add(opts)` gemäß diesem Abschnitt throwt, DARF RunTime für die Ursache dieses Throws NICHT zusätzlich `onError` aufrufen; `onError`-Aufrufe, die unabhängig davon während der Kanonisierung von `opts.targets` gemäß §4.7 entstehen, bleiben hiervon unberührt.

Fail-fast (MUSS)
- `run.add(opts)` MUSS beim ersten festgestellten Verstoß gegen diesen Abschnitt throwen; weitere Prüfungen DARF RunTime überspringen.
- RunTime MUSS Objekt-Targets in der kanonischen Reihenfolge von `targets` prüfen (wie aus §4.7 resultierend).
- RunTime MUSS pro geprüftem Objekt-Target `sigList` in der kanonischen Reihenfolge gemäß §4.4 prüfen.

Entrypoint-Validierung (MUSS)
- Für jedes Objekt-Target `t` aus `targets` MUSS gelten:
  - Wenn `t.target.on === undefined` gilt, MUSS `run.add(opts)` throwen.
  - Wenn `t.target.on !== undefined` gilt und `isObjectNonNull(t.target.on)` nicht erfüllt ist, MUSS `run.add(opts)` throwen.
  - Wenn `run.add(opts)` gemäß diesem Block throwt, MUSS RunTime (gemäß Diagnostics-Mechanik) mindestens einen Diagnostic mit `code: "add.objectTarget.missingEntrypoint"` erzeugen.
- RunTime MUSS die Handler-Validierung gemäß diesem Abschnitt für ein Objekt-Target `t` nur dann ausführen, wenn die Entrypoint-Validierung für dieses `t` erfolgreich war.

Handler-Validierung pro `sig` (MUSS)
- Für jedes Objekt-Target `t` aus `targets` und für jedes `sig` aus `sigList` MUSS gelten:
  - Wenn `sig === "everyRun"` gilt, MUSS `run.add(opts)` throwen.
    - Wenn `run.add(opts)` gemäß diesem Bullet throwt, MUSS RunTime (gemäß Diagnostics-Mechanik) mindestens einen Diagnostic mit `code: "add.objectTarget.missingHandler"` erzeugen.
  - Wenn `sig !== "everyRun"` gilt und `hasOwn(t.target.on, sig)` nicht erfüllt ist, MUSS `run.add(opts)` throwen.
    - Wenn `run.add(opts)` gemäß diesem Bullet throwt, MUSS RunTime (gemäß Diagnostics-Mechanik) mindestens einen Diagnostic mit `code: "add.objectTarget.missingHandler"` erzeugen.
  - Wenn `sig !== "everyRun"` gilt und `hasOwn(t.target.on, sig)` erfüllt ist, aber `isCallable(t.target.on[sig])` nicht erfüllt ist, MUSS `run.add(opts)` throwen.
    - Wenn `run.add(opts)` gemäß diesem Bullet throwt, MUSS RunTime (gemäß Diagnostics-Mechanik) mindestens einen Diagnostic mit `code: "add.objectTarget.nonCallableHandler"` erzeugen.

Atomarität (MUSS)
- Wenn `run.add(opts)` gemäß diesem Abschnitt throwt, DARF RunTime keinen `regExpression` aus diesem Call registrieren und DARF keine partielle Registrierung (z. B. für einen Prefix von `sigList`) durchführen.
- Wenn `run.add(opts)` gemäß diesem Abschnitt nicht throwt, MUSS `run.add(opts)` die Registrierung von `regExpression` aus `sigList` unverändert gemäß §4.4 durchführen (inkl. “genau ein `regExpression` pro `sig`” und Insert-Order in `registeredQ`).


### 4.5 run.impulse

```ts
type ImpulseOpts =
  & CoreOpts
  & SignalInputOpts
  & FlagInputOpts
  & WithDefaults
  & {
    livePayload?: unknown;
    useFixedFlags?: false | FlagsView;
  };

run.impulse(opts: ImpulseOpts): void
```

**Norm**
- `run.impulse` MUSS Impulse erzeugen und MUSS sie deterministisch abarbeiten (siehe 6–9).
- `run.impulse` DARF re-entrant aufgerufen werden (während Processing); Semantik siehe 7.4.



### 4.6 run.matchExpression

```ts
run.matchExpression({
    expression: RegisteredExpression,
    reference?: ActualExpression | { flags?: FlagsView; signal?: Signal | undefined; changedFlags?: FlagsView | undefined },
    gate?: SetDefaults["gate"],
    changedFlags?: FlagsView | undefined
}): boolean
```

Norm
- `run.matchExpression(...)` MUSS Defaults über §3.10 auflösen.
- `globalDefaults` MUSS der aktuelle Defaults-State sein.
- `globalDefaults` MUSS über `run.get("defaults")` abgeleitet werden.
- `expressionOverrides` MUSS aus `expression` als `WithDefaults` abgeleitet werden.
- Wenn ein Impuls-Kontext vorhanden ist, MUSS `impulseOverrides` aus diesem Kontext als `WithDefaults` abgeleitet werden.
- Wenn kein Impuls-Kontext vorhanden ist, MUSS `impulseOverrides` als `undefined` gelten.
- `callOverrides` MUSS aus dem Argumentobjekt als `WithDefaults` abgeleitet werden.
- Wenn `gate` als own property im Argumentobjekt vorhanden ist, MUSS `callOverrides.gate` auf `gate` gesetzt werden.
- Wenn `gate` nicht als own property im Argumentobjekt vorhanden ist, DARF NICHT `callOverrides.gate` gesetzt werden.

- Wenn `reference` nicht als own property im Argumentobjekt vorhanden ist, MUSS `reference.signal` über `run.get("signal", { scope: defaults.scope.signal.value })` abgeleitet werden.
- Wenn `reference` als own property im Argumentobjekt vorhanden ist und `reference` eine own property `signal` enthält, MUSS `reference.signal` aus dieser Property übernommen werden.
- Wenn `reference` als own property im Argumentobjekt vorhanden ist und `reference` keine own property `signal` enthält, MUSS `reference.signal` über `run.get("signal", { scope: defaults.scope.signal.value })` abgeleitet werden.

- Wenn `reference` nicht als own property im Argumentobjekt vorhanden ist, MUSS `reference.flags` über `run.get("flags", { scope: defaults.scope.flags.value })` abgeleitet werden.
- Wenn `reference` als own property im Argumentobjekt vorhanden ist und `reference` eine own property `flags` enthält, MUSS `reference.flags` aus dieser Property übernommen werden.
- Wenn `reference` als own property im Argumentobjekt vorhanden ist und `reference` keine own property `flags` enthält, MUSS `reference.flags` über `run.get("flags", { scope: defaults.scope.flags.value })` abgeleitet werden.

- Wenn `changedFlags` als own property im Argumentobjekt vorhanden ist, MUSS `changedFlags` als fixed input verwendet werden.
- Wenn `changedFlags` nicht als own property im Argumentobjekt vorhanden ist und `reference` als own property im Argumentobjekt vorhanden ist und `reference` eine own property `changedFlags` enthält, MUSS `changedFlags` aus `reference.changedFlags` übernommen werden.
- Wenn `changedFlags` nicht als own property im Argumentobjekt vorhanden ist und `reference` nicht als own property im Argumentobjekt vorhanden ist, MUSS `changedFlags` über `run.get("changedFlags", { scope: defaults.scope.flags.value })` abgeleitet werden.
- Wenn `changedFlags` nicht als own property im Argumentobjekt vorhanden ist und `reference` als own property im Argumentobjekt vorhanden ist und `reference` keine own property `changedFlags` enthält, MUSS `changedFlags` über `run.get("changedFlags", { scope: defaults.scope.flags.value })` abgeleitet werden.

- Wenn `defaults.gate.signal.value === false` ist, MUSS das Signal-Gate als erfüllt gelten.
- Wenn `defaults.gate.signal.value !== false` ist und `expression.signal` `undefined` ist, MUSS das Signal-Gate als erfüllt gelten.
- Wenn `defaults.gate.signal.value !== false` ist und `expression.signal` nicht `undefined` ist, MUSS das Signal-Gate genau dann als erfüllt gelten, wenn `reference.signal === expression.signal` ist.

- Wenn `defaults.gate.flags.value === false` ist, MUSS das Flags-Gate als erfüllt gelten.
- Wenn `defaults.gate.flags.value !== false` ist, MUSS das Flags-Gate gemäß §5 ausgewertet werden.
- Wenn `defaults.gate.flags.value !== false` ist, MUSS die Flags-Gate-Auswertung `reference.flags` als Flags-Input verwenden.
- Wenn `defaults.gate.flags.value !== false` ist, MUSS die Flags-Gate-Auswertung `changedFlags` als ChangedFlags-Input verwenden.

- `run.matchExpression(...)` MUSS `true` liefern genau dann, wenn Signal-Gate und Flags-Gate erfüllt sind.


### 4.7 Targets

- `targets` ist die konsolidierte Ziel-Liste einer `regExpression`. Ein Target beschreibt entweder einen Callback oder ein Objekt-Target.
- Die relative Reihenfolge der übernommenen Targets MUSS der Reihenfolge in `opts.targets` entsprechen (nach dem Herausfiltern ungültiger Tokens gemäß `onError`).

**Callback-Signatur (normativ):**
```ts
callback(applExpression, actExpression, r, i): void
```

#### 4.7.1 Input-Form (`AddOpts.targets`)
`AddOpts.targets` ist eine Liste von Tokens. Jedes Token ist entweder:

- **implizit:** `Callback | object`
- **explizit:** `{ kind: "callback" | "object", target: Callback | object }`
- Die kanonische Form MUSS immer `{ kind, target }` sein.


#### 4.7.2 Kanonische Form (`regExpression.targets`)
Kanonisch MUSS eine `regExpression` ihre Targets als Liste `targets: Target[]` speichern, wobei jedes Element eine discriminated Struktur `{ kind, target }` ist.


#### 4.7.3 Target-Typ-Prädikate (normativ)

Für die Kanonisierung von `targets` werden folgende Prädikate verwendet:

- `isCallable(x)` ist genau dann erfüllt, wenn `x` in der jeweiligen Host-Runtime **aufrufbar** ist (callable).
- `isObjectNonNull(x)` ist genau dann erfüllt, wenn `x` in der jeweiligen Host-Runtime ein **Objekt mit Identität** ist und **nicht null** ist.
  - Hinweis: Damit sind Funktionsobjekte *nicht ausgeschlossen*; eine callable Entität KANN zugleich `isObjectNonNull` erfüllen.

Implementationshinweis (nicht normativ):
- In JS/TS ist ein gängiges Mapping:
  - `isCallable(x)` ⇔ `typeof x === "function"`
  - `isObjectNonNull(x)` ⇔ `x !== null` && (`typeof x === "object"` || `typeof x === "function"`)


#### Norm: Kanonisierung in `run.add`
Für jedes Token `t` aus `opts.targets` MUSS die Engine wie folgt kanonisieren (für `isCallable` und `isObjectNonNull(x)` siehe 4.7.3):

1) **Explizite Token-Form** (Discriminator vorhanden)
- Wenn `t` ein Objekt ist und als own properties `kind` und `target` enthält, dann gilt:

  - Wenn `t.kind === "callback"`:
    - Wenn `isCallable(t.target)` **nicht** erfüllt ist,
        MUSS dies via `onError` behandelt werden (Phase: `"add/targets"`; `regExpression.id` falls schon bekannt; Details enthalten `kind: "callback"`),
        und dieses Target DARF NICHT in die kanonische `regExpression.targets` übernommen werden.
    - Sonst wird `{ kind: "callback", target: t.target }` übernommen.

  - Wenn `t.kind === "object"`:
    - Wenn `isObjectNonNull(t.target)` **nicht** erfüllt ist,
        MUSS dies via `onError` behandelt werden (Phase: `"add/targets"`; `regExpression.id` falls schon bekannt; Details enthalten `kind: "object"`),
        und dieses Target DARF NICHT in die kanonische `regExpression.targets` übernommen werden.
    - Sonst wird `{ kind: "object", target: t.target }` übernommen.

  - Für andere `kind`-Werte MUSS dies via `onError` behandelt werden (Phase `"add/targets"`), und das Target DARF NICHT übernommen werden.

2) **Implizite Token-Form** (kein Discriminator)
- Wenn `isCallable(t)` erfüllt ist, wird `{ kind: "callback", target: t }` übernommen.
- Andernfalls:
  - Wenn `isObjectNonNull(t)` **nicht** erfüllt ist, MUSS dies via `onError` behandelt werden (Phase `"add/targets"`), und das Target DARF NICHT übernommen werden.
  - Sonst wird `{ kind: "object", target: t }` übernommen.


## 5. registeredExpression: Flags & required.flags (normativ)

### 5.1 Flag-Inputformen (öffentlich)

Öffentliche Flächen akzeptieren:

- `"foo"` (implizit `{ foo: true }`)
- `["foo","bar"]`
- `{ foo: true, bar: "*", baz: false }`
- `{ foo: { value: true } }`
- `{ foo: { flag: "foo" } }`
- `{ foo: {} }`

**Persistenz (MUSS):**
Alles, was am `regExpression` persistiert wird, MUSS kanonisiert als `FlagSpec[]` vorliegen.


### 5.2 Kanonisierung (MUSS; deterministisch)

Norm:
1. Normalisiere Input zu einer flachen Liste von `{ flag, value }`.
2. Kollabiere zu „pro Flag genau ein Spec“.
3. Bei Duplikaten gilt: **last-one-wins** in Input-Reihenfolge.

Defaults in Spec-Objekten:
- fehlt `flag` in Map-Value ⇒ `flag` = Map-Key
- fehlt `value` ⇒ `value = true`

Invalid (MUSS):
- Ungültige Flag-Tokens oder Values MÜSSEN mit `throw` abgewiesen werden (`add.flags.invalidToken` / `add.flags.invalidValue`).


### 5.3 required.flags

```ts
regExpression.required?.flags?: {
  min?: number;      // default: specCount
  max?: number;      // default: Infinity
  changed?: number;  // default: 1
}
```

Definitionen:
- `specCount` = Anzahl kanonischer FlagSpecs (nach last-one-wins)
- `matchCount` = Anzahl Specs, die gegen `reference.flags` matchen:
  - `true`  ⇒ `reference.flags.map[flag] === true`
  - `false` ⇒ `reference.flags.map[flag] !== true`
  - `"*"`   ⇒ immer match
- `changedCount` = Anzahl Specs, deren `flag` in `changedFlags.map` vorkommt (**tatsächlich** geändert)


### 5.4 Schwellenwerte: -N / 0 / +N (MUSS)

Für `min`, `max`, `changed` gilt:

- Werte `< 0` werden als `0` behandelt.
- Werte `> specCount` werden als `specCount` behandelt (außer `max = Infinity`).

Clamp (MUSS):
- resultierender Wert wird auf `[0, specCount]` geklemmt (außer `max = Infinity`).

Defaults (MUSS):
- `min = specCount`
- `max = Infinity`
- `changed = 1`
- `changed = 0` ⇒ Changed-Gate deaktiviert (immer true)


### 5.5 Flags-Gate (MUSS)

Wenn `gate.flags === false` ⇒ Flags werden ignoriert.

Sonst ist Flags-Gate erfüllt genau dann, wenn:
1. `changedCount >= changed` (oder `changed === 0`)
2. `min <= matchCount <= max`

> Hinweis: `changedCount` basiert **nie** auf touched/requested, sondern ausschließlich auf `changedFlags`.


## 6. run.impulse: Atomisierung & Delta-Anwendung (normativ)

### 6.1 Impulse Input

**Naming & Atomisierung (MUSS):**
- In Signaturen/Input ist `signals` eine Liste.
- Beim Onboarding wird zu atomaren Occurrences entpackt:
  - pro Eintrag genau ein `actImpulse` mit `actExpression.signal = <signal>`
  - wenn keine `signals` vorliegen (nicht gesetzt): genau ein `actImpulse` mit `actExpression.signal = undefined`

**Duplikate (MUSS):**
- Duplikate in `signals` sind erlaubt und führen zu mehreren actImpulse-Occurrences.

**„gesetzt“ vs „leer“ (MUSS):**
- `[]` gilt **nicht** als „gesetzt“. Felder gelten nur als gesetzt, wenn **nicht-leer**.

Beispiele (nicht normativ)
```ts
run.impulse({})                      // 1 Occurrence: signal === undefined
run.impulse({ signals: [] })         // identisch zu oben
run.impulse({ signals: ["a", "a"] }) // 2 Occurrences (Duplikate erlaubt)
```


### 6.2 Flag-Deltas Timing & changedFlags (MUSS)

- `addFlags` / `removeFlags` werden **genau einmal pro `run.impulse(...)` Call** angewandt, **bevor** irgendein `actImpulse` aus der in §6.1 beschriebenen Atomisierung ausgeführt wird.

**Semantik (MUSS):**
- RunTime MUSS `prevFlags` als Flag-Wahrheit unmittelbar vor der Delta-Anwendung bestimmen.
- RunTime MUSS `nextFlags` als Flag-Wahrheit unmittelbar nach der Delta-Anwendung bestimmen.
- `changedFlags` MUSS `diff(prevFlags, nextFlags)` sein (symmetric diff).
- `diff(prevFlags, nextFlags)` MUSS die Menge der Flags in `changedFlags` bestimmen; die effektive Delta-Sequenz (siehe unten) MUSS ausschließlich die Ordnungsquelle für `changedFlags.list` bestimmen (gemäß §3.2).
- RunTime MUSS `changedFlags` als `FlagsView` konstruieren.

**Add/Remove Konflikt (MUSS):**
- Wenn ein Flag in `addFlags` und `removeFlags` im selben Call vorkommt, MUSS **remove wins** gelten (Resultat: Flag ist in `nextFlags` abwesend).
- RunTime SOLL in diesem Fall einen Diagnostic mit `code: "impulse.flags.addRemoveConflict"` erzeugen; falls ein solcher Diagnostic erzeugt wird, MUSS dessen `code` `impulse.flags.addRemoveConflict` sein und dessen `severity` MUSS `"warn"` sein.

**Remove-only Smell (MUSS):**
- Wenn ein Flag in `removeFlags` vorkommt, aber in `prevFlags` nicht präsent ist, DARF dieses Flag NICHT als effektives Delta zählen.
- RunTime SOLL in diesem Fall einen Diagnostic mit `code: "impulse.flags.removeNotPresent"` erzeugen; falls ein solcher Diagnostic erzeugt wird, MUSS dessen `code` `impulse.flags.removeNotPresent` sein und dessen `severity` MUSS `"warn"` sein.

**changedFlags.list Order (MUSS):**
- RunTime MUSS die Input-Sequenz zur Konstruktion von `changedFlags` als „effektive Delta-Sequenz“ bestimmen.
- Die effektive Delta-Sequenz MUSS die Netto-Deltas (d. h. nur tatsächlich wirksame Änderungen) in deterministischer Call-Order enthalten:
  - (a) Zuerst alle effektiven Removes in der Reihenfolge von `removeFlags`:
    - ein Remove ist genau dann effektiv, wenn das Flag in `prevFlags` präsent ist;
    - ein Flag, das in `addFlags` und `removeFlags` vorkommt, MUSS als Remove behandelt werden (remove wins) und DARF NICHT zusätzlich als Add behandelt werden.
  - (b) Danach alle effektiven Adds in der Reihenfolge von `addFlags`:
    - ein Add ist genau dann effektiv, wenn das Flag nach Anwendung aller effektiven Removes nicht präsent ist und es nicht durch einen Konflikt als Remove behandelt wurde.
- RunTime MUSS `changedFlags` so konstruieren, dass `changedFlags.list` die effektive Delta-Sequenz gemäß §3.2 (stable-unique; first occurrence wins) widerspiegelt.

**seenFlags Update (MUSS):**
- Wenn ein Flag durch Delta **präsent** wird (d. h. es war vorher nicht präsent und ist nachher präsent), MUSS es in `seenFlags` aufgenommen werden (monoton).


### 6.3 EmptyImpulse (MUSS)

Ein Impuls ohne Signal und ohne Flag-Delta ⇒ no-op; SOLL Diagnostic `impulse.input.empty` (`severity: "error"`).

Norm
- RunTime MUSS einen `run.impulse(opts)` als EmptyImpulse behandeln, wenn
  - die atomisierte Signal-Sequenz gemäß §6.1 genau `[undefined]` ist, und
  - die effektive Delta-Sequenz gemäß §6.2 (Netto-/Wirksamkeitsregeln) leer ist.
- Wenn ein `run.impulse(opts)` als EmptyImpulse gilt, DARF RunTime KEINE atomisierte Occurrence verarbeiten (d. h. DARF KEIN `actImpulse` ausführen) und DARF KEIN Target attempted werden.
- RunTime SOLL in diesem Fall einen Diagnostic mit `code: "impulse.input.empty"` erzeugen; falls ein solcher Diagnostic erzeugt wird, MUSS dessen `code` `impulse.input.empty` sein und dessen `severity` MUSS `"error"` sein.

### 6.4 actImpulse / i Erstellung (MUSS)

Für jede atomisierte Occurrence MUSS RunTime für jeden Target-Aufruf ein `ImpulseContext i` bereitstellen; Occurrence-invariante Werte MÜSSEN dabei identisch sein.

**Norm**
- Für jede atomisierte Occurrence MUSS RunTime einen Occurrence-Kontext definieren, der die Occurrence-invarianten Werte trägt (z. B. `signal`, `changedFlags`, `seq`, `id`).
- Für jeden Target-Aufruf innerhalb derselben atomisierten Occurrence MUSS RunTime ein `ImpulseContext i` erzeugen und an diesen Target-Aufruf übergeben.
- Ein `ImpulseContext i` MUSS während des Target-Aufrufs immutable sein.
- Occurrence-invariante Werte MÜSSEN über alle `ImpulseContext i` derselben atomisierten Occurrence identisch sein.
- `i.signal` MUSS das Occurrence-Signal sein (oder `undefined`).
- Die zugrundeliegende Input-Sequenz für `i.addFlags` MUSS die Sequenz der Flags aus dem `run.impulse(...)`-Payload-Feld `addFlags` in der Iterationsreihenfolge sein, in der RunTime dieses Feld verarbeitet.
- Die zugrundeliegende Input-Sequenz für `i.removeFlags` MUSS die Sequenz der Flags aus dem `run.impulse(...)`-Payload-Feld `removeFlags` in der Iterationsreihenfolge sein, in der RunTime dieses Feld verarbeitet.
- RunTime MUSS `i.addFlags` als stable-unique Sequenz konstruieren (gemäß §3.2 Stable-Unique; Input-Sequenz).
- RunTime MUSS `i.removeFlags` als stable-unique Sequenz konstruieren (gemäß §3.2 Stable-Unique; Input-Sequenz).
- `i.changedFlags` MUSS das tatsächliche Delta sein (identisch für alle Occurrences desselben `run.impulse(...)` Calls).
- `i.seq` MUSS ein monotoner Counter pro `run` sein (strictly increasing).
- `i.id` MUSS unique sein (Format frei).

#### 6.4.1 `i.q` (Pflichtfeld; Run-Phase)

**Norm**
- `i.q` MUSS gesetzt sein.
- `i.q` MUSS genau einen der Werte `"backfill"` oder `"registered"` haben.
- `i.q` MUSS pro Run-Phase eindeutig sein und DARF NICHT während eines Target-Aufrufs wechseln.
- Wenn eine Realisation innerhalb eines Backfill-Runs erfolgt, dann MUSS `i.q === "backfill"` gelten.
- Wenn eine Realisation innerhalb eines Registered-Runs erfolgt, dann MUSS `i.q === "registered"` gelten.

#### 6.4.2 `i.expression` (per-expression impulse telemetry)

`i.expression` ist eine per-Expression Telemetrie-Projektion, die pro Target-Aufruf als Snapshot im `i` sichtbar ist.

**Norm**
- `i.expression` MUSS gesetzt sein.
- `i.expression` MUSS ausschließlich Informationen zur aktuellen appliedExpression dieser Target-Realisation enthalten und DARF NICHT eine zweite Source-of-Truth für registeredExpression-State sein.
- `i.expression` MUSS mindestens die folgenden Felder tragen (je Feld gelten die Init-/Set-Regeln unten):
  - `i.expression.backfillSignalRuns?`
  - `i.expression.backfillFlagsRuns?`
  - `i.expression.backfillRuns?`
  - `i.expression.inBackfillQ`
  - `i.expression.actBackfillGate?`

##### 6.4.2.1 Init-Regeln (undefined/0/true/false)

**Norm**
- Eine Expression MUSS in einem Impuls als *backfill-relevant* gelten genau dann, wenn sie in diesem Impuls irgendwann Backfill-Teilnehmer ist (d. h. mindestens eines ihrer `backfill.<gate>.debt` ist zu irgendeinem Zeitpunkt `> 0`).
- `i.expression.actBackfillGate` MUSS initial `undefined` sein.
- Wenn die aktuelle appliedExpression in diesem Impuls nicht backfill-relevant ist, dann MUSS gelten:
  - `i.expression.backfillSignalRuns` MUSS `undefined` sein.
  - `i.expression.backfillFlagsRuns` MUSS `undefined` sein.
  - `i.expression.backfillRuns` MUSS `undefined` sein.
  - `i.expression.inBackfillQ` MUSS `false` sein.
- Wenn die aktuelle appliedExpression in diesem Impuls backfill-relevant ist, dann MUSS RunTime für diese Expression ein per-Impuls Stats-Objekt lazy initialisieren und dabei MUSS gelten:
  - `i.expression.backfillSignalRuns` MUSS bei `0` starten.
  - `i.expression.backfillFlagsRuns` MUSS bei `0` starten.
  - `i.expression.inBackfillQ` MUSS initial `undefined` sein (vor Finalisierung).

##### 6.4.2.2 Set-Regeln (Runs)

**Norm**
- `i.expression.backfillSignalRuns` DARF nur erhöht werden, wenn `i.q === "backfill"` gilt und die Realisation für diese Expression durch einen Backfill-Deploy mit `i.expression.actBackfillGate === "signal"` erfolgt ist.
- `i.expression.backfillFlagsRuns` DARF nur erhöht werden, wenn `i.q === "backfill"` gilt und die Realisation für diese Expression durch einen Backfill-Deploy mit `i.expression.actBackfillGate === "flags"` erfolgt ist.
- Ein Backfill-Run-Counter MUSS pro erfolgreicher Backfill-Realisation genau um `1` erhöht werden (kein Mehrfach-Inkrement pro Realisation).
- In einem Registered-Run (`i.q === "registered"`) DÜRFEN `i.expression.backfillSignalRuns` und `i.expression.backfillFlagsRuns` nicht erhöht werden.
- `i.expression.backfillRuns` DARF NICHT als eigener, gespeicherter Counter geführt werden und MUSS ein abgeleiteter Wert sein: wenn `i.expression.backfillSignalRuns` und `i.expression.backfillFlagsRuns` gesetzt sind, dann MUSS `i.expression.backfillRuns === i.expression.backfillSignalRuns + i.expression.backfillFlagsRuns` gelten; andernfalls MUSS `i.expression.backfillRuns` `undefined` sein.

##### 6.4.2.3 Set-Regeln (`actBackfillGate`)

**Norm**
- `i.expression.actBackfillGate` DARF nur gesetzt sein, wenn `i.q === "backfill"` gilt und genau diese konkrete Realisation durch einen Backfill-Deploy ermöglicht wurde.
- Wenn `i.expression.actBackfillGate` gesetzt ist, dann MUSS es `"signal"` oder `"flags"` sein.
- Wenn `i.q === "registered"` gilt, dann MUSS `i.expression.actBackfillGate` `undefined` sein.

##### 6.4.2.4 Set-Regeln (`inBackfillQ`, post-state)

`inBackfillQ` ist post-state bezogen auf diesen Impuls: es sagt, ob die Expression nach Abschluss dieses Impulses pending ist und deshalb für einen späteren Impuls in `backfillQ` stehen wird.

**Norm**
- Wenn RunTime eine Expression während eines Registered-Runs durch Debt-Entry in `backfillQ` enqueued und dabei `appendIfAbsent(backfillQ, regExpression)` ausführt, dann MUSS RunTime `i.expression.inBackfillQ = true` für diese Expression setzen.
- Wenn RunTime eine Expression während eines Backfill-Runs erneut in `backfillQ` enqueued und dabei `appendIfAbsent(backfillQ, regExpression)` ausführt, dann MUSS RunTime `i.expression.inBackfillQ = true` für diese Expression setzen.
- Nach Abschluss der Backfill-Verarbeitung dieses Impulses MUSS RunTime `i.expression.inBackfillQ` für backfill-relevante Expressions finalisieren:
  - Wenn eine Expression backfill-relevant ist und `i.expression.inBackfillQ` noch `undefined` ist, dann MUSS `i.expression.inBackfillQ = false` gesetzt werden.
- In jedem Target-Aufruf innerhalb eines Registered-Runs (`i.q === "registered"`) MUSS `i.expression.inBackfillQ` ein boolean (`true` oder `false`) sein und DARF NICHT `undefined` sein.


### 6.5 useFixedFlags: referenceFlags Resolution (MUSS)

**Ziel:** Optional „stabiler“ Wahrheitsmodus ohne Snapshot-Schleppen im Default-Fall.

**Norm**
- Für jeden einzelnen Impuls, den RunTime verarbeitet (einschließlich synthetisch ausgeführter Impulse), MUSS RunTime `referenceFlags` neu bestimmen.
- Wenn `ImpulseOpts.useFixedFlags` gesetzt ist, MUSS `referenceFlags` exakt der Wert von `ImpulseOpts.useFixedFlags` sein.
- Andernfalls MUSS `referenceFlags` semantisch identisch zu `run.get("flags", { as: "reference" })` sein (gleiche Datenbasis, gleiche Scope- und Borrowed-Reference-Semantik gemäß §4.1).
- Eine Implementierung DARF `referenceFlags` durch direkten Zugriff auf die interne Single Source of Truth bestimmen, sofern das von außen beobachtbare Verhalten dem von `run.get("flags", { as: "reference" })` entspricht.
- Das so bestimmte `referenceFlags` MUSS ausschließlich für die Verarbeitung dieses Impulses gelten und DARF NICHT für die Verarbeitung eines anderen Impulses wiederverwendet werden.


## 7. Queues, Determinismus, Reentrancy (normativ)

### 7.1 Determinismus & Order

- `registeredQ` MUSS stabile Insert-Order sein (FIFO der Registrierungen).
- Die Iteration über `registeredQ` MUSS in `registeredRun` über einen Snapshot erfolgen (siehe §7.2.1 `registeredRun`), so dass Insert-Order respektiert ist.
- Die Backfill-Reihenfolge DARF NICHT aus `registeredQ` abgeleitet werden.
- Die Backfill-Reihenfolge MUSS aus `backfillQ.list` abgeleitet werden (FIFO nach Debt-Entry gemäß §2.13).
- Die Quelle der Backfill-FIFO-Ordnung MUSS deterministisch an die Processing-/Visit-Order gebunden sein; ein real-time Timestamp DARF NICHT als Ordnungsquelle verwendet werden.
- Die Reihenfolge der Target-Aufrufe innerhalb einer Expression MUSS deterministisch sein.


### 7.2 Processing-Shape

Für jede actImpulse-Occurrence MUSS die Verarbeitung in zwei deterministischen Runs ausgedrückt werden: `backfillRun` (optional) und `registeredRun` (immer). Beide Runs MÜSSEN Slots ausschließlich über `coreRun` applied werden.



### 7.2.1 coreRun (…)


#### Run-Limits via `runs.used` / `runs.max` (MUSS)

- Nach einem erfolgreichen Deploy MUSS `coreRun` `runs.used` genau einmal um `1` erhöhen.
- Unmittelbar nach dieser Erhöhung MUSS `coreRun` prüfen, ob `runs.used >= runs.max` gilt.
- Wenn `runs.used >= runs.max` gilt, MUSS `coreRun` für die betreffende Expression ein Tombstone-Flag setzen (im Folgenden „Tombstone setzen“).
- Wenn `coreRun` gemäß dieser Regel ein Tombstone setzt, DARF RunTime optional eager GC gemäß §11 ausführen.

#### Wirksamkeit von Tombstones (MUSS)

- Ein durch `coreRun` gesetztes Tombstone MUSS erst bei der nächsten Tombstone-Prüfung wirksam werden.
- Eine Tombstone-Prüfung findet zu Beginn eines nachfolgenden `registeredRun`- oder `backfillRun`-Schritts statt (skip/continue).
- Ein durch `coreRun` gesetztes Tombstone MUSS NICHT die Auswahl- oder Entscheidungslogik des aktuell laufenden Schritts beeinflussen.


#### 7.2.1 Run-Typen

**coreRun (Slot-Core)**
- `coreRun` MUSS nur den Slot-Core abbilden: `mainGate` (Decision-Freeze), Deploy (Targets/Callback) und das Setzen der Realisations-Markierung auf dem Carrier.
- `coreRun` MUSS eine Gate-Konfiguration `gate` führen, die bestimmt, welche Gate-Teile für diesen Slot aktiv sind.
- `gate` MUSS mindestens die Felder `signal?: boolean` und `flags?: boolean` zulassen.
- `coreRun` MUSS `run.matchExpression(...)` unter Anwendung von `gate` ausführen; `coreRun` DARF NICHT die Gate-Konfiguration wählen (Gate-Wahl ist außerhalb von `coreRun`).
- `coreRun` DARF NICHT Debt erzeugen, Debt abbauen oder Queue-Membership/Queue-Order entscheiden.
- `coreRun` MUSS pro Expression-Slot deterministisch ausführen:
  - **mainGate**: `apply = run.matchExpression(...)` MUSS deterministisch entschieden und für den restlichen Expression-Slot unveränderlich sein.
  - **Deploy**: falls `apply`, MUSS die Target-Realisation synchron ausgeführt werden.
  - **Carrier-Markierung**: falls `apply`, MUSS `carrier.apply` als Realisations-Markierung exakt einmal gesetzt werden.

#### Run-Limits via `runs.used` / `runs.max` (MUSS)
- Nach einem erfolgreichen Deploy MUSS `coreRun` `runs.used` erhöhen.
- Wenn nach dieser Erhöhung `runs.used >= runs.max` gilt, MUSS `coreRun` für die betreffende Expression ein Tombstone setzen; RunTime DARF optional eager GC gemäß §11 ausführen.

#### Wirksamkeit von Tombstones (MUSS)
- Ein durch `coreRun` gesetztes Tombstone MUSS erst bei der nächsten Tombstone-Prüfung (skip/continue) zu Beginn eines nachfolgenden `registeredRun`- oder `backfillRun`-Schritts wirksam werden.
- Ein durch `coreRun` gesetztes Tombstone MUSS NICHT die Auswahl- oder Entscheidungslogik des aktuell laufenden Schritts beeinflussen.

**registeredRun**
- `registeredRun` MUSS über einen Snapshot von `registeredQ` iterieren.
- `registeredRun` MUSS `i.q === "registered"` für alle Target-Aufrufe setzen.
- `registeredRun` DARF Debt erzeugen.
- `registeredRun` MUSS bei Debt-Entry (siehe §2.13; Ordnung/FIFO siehe §9.2) `appendIfAbsent(backfillQ, regExpression)` ausführen.
- `registeredRun` DARF NICHT Debt abbauen.

**backfillRun**
- `backfillRun` MUSS nur ausgeführt werden, wenn `backfillQ.list.length > 0` gilt.
- `backfillRun` MUSS am Rundenstart `workingQ = snapshot(backfillQ.list)` bilden und danach `backfillQ = { map: {}, list: [] }` als harte Neuinstanz setzen (siehe §2.13).
- `backfillRun` MUSS über `workingQ` iterieren; `workingQ` DARF dabei deterministisch mutiert werden (z. B. pop/push).
- `backfillRun` MUSS `i.q === "backfill"` für alle Target-Aufrufe setzen.
- `backfillRun` DARF Debt abbauen.
- `backfillRun` DARF pending Expressions erneut enqueuen und MUSS dafür ausschließlich `appendIfAbsent(backfillQ, regExpression)` verwenden (siehe §2.13).
- `backfillRun` DARF NICHT Debt erzeugen.

#### 7.2.2 Run-Sequencing pro actImpulse-Occurrence

- Wenn `backfillQ.list.length > 0` gilt, dann MUSS die Occurrence genau einmal `backfillRun` ausführen und danach genau einmal `registeredRun` ausführen.
- Wenn `backfillQ.list.length === 0` gilt, dann MUSS die Occurrence genau einmal `registeredRun` ausführen und DARF NICHT `backfillRun` ausführen.
- Innerhalb einer Occurrence DARF kein weiterer Run-Typ ausgeführt werden.
- Ein Run MUSS deterministisch sein; insbesondere MÜSSEN alle Snapshot-Punkte (`registeredQ`-Snapshot, `backfillQ`-Snapshot) deterministisch gewählt und angewandt werden.


### 7.3 signal

`run.get("signal", opts)` MUSS einen skalarisierten Signal-Wert liefern, der ausschließlich durch `opts.scope` bestimmt wird.

`run.get("signal", { scope: "applied" })` MUSS den skalarisierten Signal-Wert des zuletzt *applied* `impulseQ`-Entries liefern.

`run.get("signal", { scope: "applied" })` MUSS `undefined` liefern, wenn kein *applied* `impulseQ`-Entry existiert.

`run.get("signal", { scope: "pending" })` MUSS den skalarisierten Signal-Wert des zuletzt *pending* `impulseQ`-Entries liefern.

`run.get("signal", { scope: "pending" })` MUSS `undefined` liefern, wenn kein *pending* `impulseQ`-Entry existiert.

`run.get("signal", { scope: "applied" })` MUSS `undefined` liefern, wenn das zuletzt *applied* `impulseQ`-Entry `signals.length === 0` ist.

`run.get("signal", { scope: "pending" })` MUSS `undefined` liefern, wenn das zuletzt *pending* `impulseQ`-Entry `signals.length === 0` ist.

`run.get("signal", { scope: "applied" })` MUSS das letzte Element von `signals` liefern, wenn das zuletzt *applied* `impulseQ`-Entry `signals.length > 0` hat.

`run.get("signal", { scope: "pending" })` MUSS das letzte Element von `signals` liefern, wenn das zuletzt *pending* `impulseQ`-Entry `signals.length > 0` hat.

`run.get("signal", { scope: "applied" })` DARF NICHT rückwärts über mehrere `impulseQ`-Entries scannen, um ein “letztes non-undefined Signal” zu finden.

`run.get("signal", { scope: "pending" })` DARF NICHT rückwärts über mehrere `impulseQ`-Entries scannen, um ein “letztes non-undefined Signal” zu finden.


### 7.4 run.impulse & impulseQueue (Reentrancy, Drain-Strategie)

Norm
- `run.impulse(...)` DARF jederzeit aufgerufen werden, auch reentrant während eines laufenden Drains von `impulseQ`.
- Jeder `run.impulse(opts)`-Aufruf MUSS genau einen neuen Queue-Eintrag am Ende von `impulseQ.q.entries` registrieren, sofern der Aufruf nicht gemäß §2.11.1 (Entry-Kanonisierung) als invalid behandelt wird.
- Die Drain-Grundmechanik von `impulseQ` MUSS §2.11.1 entsprechen.
- RunTime MUSS Flag-Deltas eines `run.impulse(...)`-Aufrufs gemäß §6.2 genau einmal und synchron am Call anwenden.
- RunTime MUSS Flag-Deltas eines `run.impulse(...)`-Aufrufs anwenden, bevor daraus entstehende `actImpulse`-Occurrences (aus dem Queue-Eintrag) verarbeitet werden.


## 8. Deploy / Targets / Budgets (normativ)

### 8.1 runs.max Budget

- Jede registeredExpression MUSS `runs.used` führen (monoton).
- `runs.max`:
  - wenn nicht gesetzt ⇒ wie `Infinity` behandeln
  - MUSS `N >= 1` oder `Infinity` sein
- Nach jeder erfolgreichen Realisierung (Expression matcht und mindestens ein Target wird attempted),
  MUSS `runs.used` erhöht werden.
- Wenn `runs.used >= runs.max`:
  - MUSS Expression enden (tombstone/GC; siehe 11)
  - DARF NICHT weitere Realisierungen ausführen.


### 8.2 onError Control Flow (MUSS)

- `onError: "throw"` ⇒ Verarbeitung bricht **sofort** ab; RunTime DARF NICHT weitere Verarbeitung fortsetzen (keine weiteren Targets/Expressions/actImpulse-Occurrences) und DARF NICHT `impulseQ`-Drain starten oder fortsetzen.
- `onError: "report"` ⇒ MUSS loggen und MUSS schlucken; Verarbeitung läuft weiter.
- `onError: "swallow"` ⇒ MUSS schlucken; Verarbeitung läuft weiter.
- `onError` als Funktion ⇒ MUSS aufgerufen werden; wenn sie wirft, MUSS der Fehler propagieren (wie `"throw"`).

**Scope & Wrapping (MUSS):**
- **Inner (Expression/Target-Zone):** Fehler, die während Realize/Deploy/Target-Ausführung *einer* `RegisteredExpression` auftreten, MÜSSEN zuerst mit `regExpression.onError` behandelt werden.
- **Outer (Impulse-Wrapper):** Fehler, die außerhalb der Expression/Target-Zone auftreten, MÜSSEN mit `ImpulseOpts.onError` behandelt werden.
- **Propagation:** Wenn ein Fehler innerhalb der Expression/Target-Zone durch Anwendung von `regExpression.onError` als `"throw"` propagiert (oder die `onError`-Funktion wirft), MUSS die Verarbeitung abbrechen und der Fehler MUSS propagieren; `ImpulseOpts.onError` DARF NICHT diesen Abort zu einem Weiterlauf umdeuten.
- **impulseQ-Folge:** Konsequenzen eines Abbruchs durch `throw` für noch ausstehende `impulseQ`-Einträge sind in 2.11 normiert.


### 8.3 Target-Ausführung (MUSS)

- `applExpression.remove()` während eines Target-Bodys:
  - wirkt sofort (siehe 11)
  - der aktuell laufende Target-Body wird nicht rückwirkend abgebrochen/rollbacked
- ab Rückkehr aus dem aktuellen Target gilt: RunTime DARF NICHT weitere Targets derselben Expression in dieser Realisierung ausführen (um „post-removal side effects“ zu vermeiden).


#### 8.3.1 kind-first Dispatch & Typverträglichkeit (MUSS)

Für jedes `t` in `regExpression.targets` MUSS RunTime `t.kind` als Dispatch-Quelle verwenden (nicht Host-Typ-Introspektion von `t.target`).

**Typverträglichkeit (MUSS):**
- Wenn `t.kind === "callback"`:
  - Wenn `isCallable(t.target)` **nicht** erfüllt ist, MUSS dies via `onError` behandelt werden
    (Phase: `"target/callback"`; `regExpression.id` gesetzt) und dieses Target DARF NICHT attempted werden.
  - Sonst MUSS `t.target(applExpression, actExpression, r, i)` synchron aufgerufen werden.

- Wenn `t.kind === "object"`:
  - Wenn `isObjectNonNull(t.target)` **nicht** erfüllt ist, MUSS dies via `onError` behandelt werden
    (Phase: `"target/object"`; `regExpression.id` gesetzt) und dieses Target DARF NICHT attempted werden.
  - Sonst MUSS `t.target` als Objekt-Target gemäß der Objekt-Target-Semantik verarbeitet werden.

- Wenn `t.kind` einen anderen Wert hat, MUSS dies via `onError` behandelt werden
  (Phase: `"target/dispatch"`; `regExpression.id` gesetzt) und das Target DARF NICHT attempted werden.

Hinweis: `isCallable` und `isObjectNonNull` sind in §4.7.3 normiert.


#### 8.3.2 Objekt-Target-Semantik (MUSS)

Wenn `t.kind === "object"` und `isObjectNonNull(t.target)` erfüllt ist, MUSS RunTime `t.target` als Objekt-Target wie folgt verarbeiten.

Entrypoint (MUSS)
- RunTime MUSS `t.target.on` als Entrypoint für Objekt-Target-Handler verwenden.
- RunTime DARF NICHT verlangen, dass `t.target.on` Handler für nicht-deklarierte Signale enthält; Vollständigkeit/Signal-Abdeckung wird ausschließlich über `add.signals` validiert.
- Wenn `t.target.on === undefined` gilt, MUSS dies via `onError` behandelt werden (Phase: `"target/object"`; `regExpression.id` gesetzt) und dieses Target DARF NICHT attempted werden.
- Wenn `t.target.on !== undefined` gilt und `isObjectNonNull(t.target.on)` nicht erfüllt ist, MUSS dies via `onError` behandelt werden (Phase: `"target/object"`; `regExpression.id` gesetzt) und dieses Target DARF NICHT attempted werden.
- Wenn ein Entrypoint-Fehler gemäß diesem Abschnitt auftritt, SOLL RunTime (gemäß Diagnostics-Mechanik) einen Diagnostic mit `code: "add.objectTarget.missingEntrypoint"` erzeugen.

Handler-Resolution (MUSS)
- Siehe §3.1 und §3.6: `Signal` ist `string`, `i.signal` ist `Signal | undefined`.
- RunTime MUSS ein Prädikat `hasOwn(o, k)` verwenden, das genau dann `true` liefert, wenn `k` (ein Handler-Key; string) eine own property von `o` ist.
- RunTime MUSS `t.target.on.everyRun` nur dann als vorhanden betrachten, wenn `hasOwn(t.target.on, "everyRun")` erfüllt ist.
- RunTime MUSS `t.target.on[i.signal]` nur dann als vorhanden betrachten, wenn `i.signal !== undefined` gilt, `i.signal !== "everyRun"` gilt und `hasOwn(t.target.on, i.signal)` erfüllt ist.
- Wenn `hasOwn(t.target.on, "everyRun")` erfüllt ist, aber `isCallable(t.target.on.everyRun)` nicht erfüllt ist, MUSS RunTime `t.target.on.everyRun` so behandeln, als wäre er nicht vorhanden; RunTime DARF NICHT via `onError` reagieren, DARF NICHT einen Diagnostic mit `code: "add.objectTarget.missingHandler"` oder `code: "add.objectTarget.nonCallableHandler"` erzeugen und SOLL im Übrigen keinen Diagnostic erzeugen.
- Wenn `i.signal !== undefined` gilt, `i.signal !== "everyRun"` gilt und `hasOwn(t.target.on, i.signal)` erfüllt ist, aber `isCallable(t.target.on[i.signal])` nicht erfüllt ist, MUSS RunTime `t.target.on[i.signal]` so behandeln, als wäre er nicht vorhanden; RunTime DARF NICHT via `onError` reagieren, DARF NICHT einen Diagnostic mit `code: "add.objectTarget.missingHandler"` oder `code: "add.objectTarget.nonCallableHandler"` erzeugen und SOLL im Übrigen keinen Diagnostic erzeugen.

Handler-Aufruf (MUSS)
- Wenn `hasOwn(t.target.on, "everyRun")` erfüllt ist und `isCallable(t.target.on.everyRun)` erfüllt ist, MUSS RunTime `t.target.on.everyRun(applExpression, actExpression, r, i)` synchron aufrufen.
- Wenn `i.signal !== undefined` gilt, `i.signal !== "everyRun"` gilt und `hasOwn(t.target.on, i.signal)` erfüllt ist und `isCallable(t.target.on[i.signal])` erfüllt ist, MUSS RunTime `t.target.on[i.signal](applExpression, actExpression, r, i)` synchron aufrufen.
- Wenn beide Handler (everyRun und `on[i.signal]`) vorhanden und callable sind, MUSS RunTime beide aufrufen und MUSS die Reihenfolge `everyRun` vor `on[i.signal]` einhalten.

No-Op bei fehlenden Handlern (MUSS)
- Wenn weder ein callable `everyRun` noch ein callable `on[i.signal]` vorhanden ist, MUSS RunTime dieses Target als No-Op behandeln.
- In diesem No-Op-Fall DARF RunTime NICHT `onError` aufrufen, DARF NICHT einen Diagnostic mit `code: "add.objectTarget.missingHandler"` oder `code: "add.objectTarget.nonCallableHandler"` erzeugen und SOLL im Übrigen keinen Diagnostic erzeugen.


## 9. Backfill (normativ)

### 9.1 Zweck & Begriffe

**Norm**
- Backfill MUSS die deterministische Nachverarbeitung von Backfill-Teilnehmern definieren, um Debt abzubauen, ohne `registeredQ`-Insert-Order zu verändern.
- Die Backfill-Verarbeitung (Debt-Abbau, Attempts, Gate-Wahl, Deploy-Mechanik, Multi-fire) MUSS ausschließlich in `backfillRun` stattfinden (siehe §7.2) und DARF NICHT in `registeredRun` stattfinden.
- Backfill-Membership (Debt-Entry) und Enqueue in `backfillQ` DÜRFEN in `registeredRun` stattfinden und MÜSSEN dort stattfinden, wenn Debt-Entry erkannt wird (siehe §7.2.1 `registeredRun` und §2.13, §9.2).
- Die folgenden Begriffe MÜSSEN in diesem Kapitel wie folgt verstanden werden:
  - **Debt-Entry** MUSS eine Transition `<= 0 → > 0` in mindestens einem `regExpression.backfill.<gate>.debt` sein (siehe §2.13, §9.2).
  - **pending** MUSS für eine Expression genau dann gelten, wenn nach einem Backfill-Schritt mindestens ein `regExpression.backfill.<gate>.debt > 0` gilt (siehe §9.8).
  - **Iteration** MUSS genau einen Backfill-Schritt für genau eine Expression aus `workingQ` bedeuten (siehe §9.9).
  - **Attempt** MUSS ein einzelner Backfill-Gate-Versuch (primär oder opposite) innerhalb einer Iteration sein (siehe §9.6/§9.7).
  - **Deploy** MUSS eine Realisation (Targets/Callback) im Sinne von `coreRun` sein (siehe §7.2.1 `coreRun`).
  - **Reject** MUSS bedeuten, dass ein Attempt keinen Deploy auslöst (unabhängig davon, ob der Grund Gate-Mismatch oder Maxima sind).


### 9.2 Ordnung (Debt-entry FIFO, dedupe, unabhängig von registeredQ)

**Norm**
- Die Backfill-Abarbeitungsreihenfolge MUSS FIFO nach Debt-Entry sein.
- Debt-Entry MUSS als Transition `<= 0 → > 0` verstanden werden (keine +1-Annahme).
- Eine Expression MUSS beim Debt-Entry genau einmal in `backfillQ` enqueued werden; spätere Debt-Inkremente bei bestehender Backfill-Teilnahme (`> 0 → > 0`) DÜRFEN NICHT erneut enqueuen.
- `backfillQ` MUSS id-dedupe erzwingen (siehe §2.13).
- Die Backfill-Order DARF NICHT aus `registeredQ` abgeleitet werden.
- Die Backfill-Order MUSS aus `backfillQ.list` abgeleitet werden (siehe §2.13).
- Die Quelle der FIFO-Ordnung MUSS deterministisch an die Processing-/Visit-Order gebunden sein; real-time Timestamps DÜRFEN NICHT als Ordnungsquelle verwendet werden.


### 9.3 Debt-Split (harte Norm)

**Norm**
- Debt DARF nur in `registeredRun` wachsen (siehe §7.2.1 `registeredRun`).
- Debt DARF nur in `backfillRun` schrumpfen.
- `registeredRun` DARF NICHT Debt abbauen.
- `backfillRun` DARF NICHT Debt erzeugen.


### 9.4 Counters & Maxima (global vs. Backfill-spezifisch)

**Norm**
- `regExpression.runs.used` MUSS expression-lifetime monoton sein und DARF NICHT dekrementiert werden.
- Jeder erfolgreiche Deploy (unabhängig von `i.q`) MUSS `regExpression.runs.used` genau um `1` erhöhen.
- Wenn `regExpression.runs.max` gesetzt ist und `regExpression.runs.used >= regExpression.runs.max` gilt, dann DARF `coreRun` für diese Expression keinen Deploy auslösen.
- Wenn `regExpression.runs.max` gesetzt ist und `regExpression.runs.used >= regExpression.runs.max` gilt, dann MUSS ein Backfill-Attempt für diese Expression als Reject behandelt werden.
- Backfill-spezifische Gate-Runs MÜSSEN separat von `regExpression.runs.used` geführt werden:
  - `regExpression.backfill.signal.runs.used` MUSS nur Backfill-Deploys zählen, die mit Attempt `"signal"` erfolgen.
  - `regExpression.backfill.flags.runs.used` MUSS nur Backfill-Deploys zählen, die mit Attempt `"flags"` erfolgen.
- Wenn `regExpression.backfill.<gate>.runs.max` gesetzt ist und `regExpression.backfill.<gate>.runs.used >= regExpression.backfill.<gate>.runs.max` gilt, dann MUSS ein Attempt mit diesem `<gate>` als Reject behandelt werden und DARF NICHT zu einem Deploy führen.
- Backfill-Gate-Runs DÜRFEN NICHT in `regExpression.runs.used` „umbenannt“ oder „ersetzt“ werden; beide Zähler MÜSSEN koexistieren.
- Ein erfolgreicher Backfill-Deploy MUSS sowohl `regExpression.runs.used` als auch `regExpression.backfill.<gate>.runs.used` jeweils genau um `1` erhöhen.


### 9.5 Backfill-Rundenstart (Snapshot + Reset)

**Norm**
- Ein `backfillRun` MUSS nur ausgeführt werden, wenn `backfillQ.list.length > 0` gilt (siehe §7.2.1 `backfillRun`).
- Ein `backfillRun` MUSS am Rundenstart `workingQ = snapshot(backfillQ.list)` bilden.
- Unmittelbar danach MUSS `backfillQ` als harte Neuinstanz auf leer gesetzt werden: `backfillQ = { map: {}, list: [] }` (siehe §2.13).
- `workingQ` MUSS deterministisch iteriert werden und DARF deterministisch mutiert werden.
- `workingQ` DARF NICHT Duplikate derselben `regExpression.id` enthalten.


### 9.6 Gate-Wahl (debt-weighted, Tie = signal)

**Norm**
- Für eine zu verarbeitende Expression MUSS `signalDebt = (regExpression.backfill.signal.debt ?? 0)` und `flagsDebt = (regExpression.backfill.flags.debt ?? 0)` bestimmt werden.
- Wenn `signalDebt > flagsDebt`, dann MUSS das primäre Attempt-Gate `"signal"` sein.
- Wenn `flagsDebt > signalDebt`, dann MUSS das primäre Attempt-Gate `"flags"` sein.
- Wenn `signalDebt === flagsDebt`, dann MUSS das primäre Attempt-Gate `"signal"` sein (Tie = signal).
- Ein Attempt `"signal"` MUSS `coreRun` mit einer Gate-Konfiguration aufrufen, die das opposite Gate explizit deaktiviert: `gate: { flags: false }` (siehe §7.2.1 `coreRun`).
- Ein Attempt `"flags"` MUSS `coreRun` mit einer Gate-Konfiguration aufrufen, die das opposite Gate explizit deaktiviert: `gate: { signal: false }`.
- Ein `backfillRun` DARF NICHT die Gate-Wahl in `coreRun` verlagern; `coreRun` DARF NICHT Gate-Wahl treffen (siehe §7.2.1 `coreRun`).


### 9.7 Backfill-Schritt (max 1 Deploy, opposite attempt, opposite=false)

**Norm**
- Eine Iteration MUSS genau eine Expression `regExpression` vom Kopf von `workingQ` entnehmen.
- Eine Iteration MUSS höchstens einen Deploy auslösen.
- Eine Iteration MUSS zunächst den primären Attempt gemäß §9.6 ausführen.
- Wenn der primäre Attempt einen Deploy auslöst, dann:
  - `regExpression.backfill.<primary>.debt` MUSS deterministisch **genau um `1`** schrumpfen und DARF NICHT unter `0` fallen.
  - `regExpression.backfill.<primary>.runs.used` MUSS um `1` erhöht werden.
  - `regExpression.runs.used` MUSS um `1` erhöht werden.
  - Die Iteration MUSS ohne Gegenversuch enden.
- Wenn der primäre Attempt als Reject endet, dann:
  - Die Iteration MUSS genau einen Gegenversuch (opposite attempt) mit dem jeweils anderen Gate ausführen.
  - Der Gegenversuch MUSS ebenfalls das opposite Gate explizit `false` setzen (siehe §9.6).
- Wenn der Gegenversuch einen Deploy auslöst, dann:
  - `regExpression.backfill.<opposite>.debt` MUSS deterministisch **genau um `1`** schrumpfen und DARF NICHT unter `0` fallen.
  - `regExpression.backfill.<opposite>.runs.used` MUSS um `1` erhöht werden.
  - `regExpression.runs.used` MUSS um `1` erhöht werden.
- Wenn weder primärer noch Gegenversuch einen Deploy auslöst, dann:
  - In dieser Iteration gilt: Debt DARF NICHT schrumpfen.
  - In dieser Iteration gilt: Run-Counter DARF NICHT erhöht werden.


### 9.8 Pending & Re-enqueue (Definition über Debt>0, appendIfAbsent)

**Norm**
- Eine Expression MUSS nach einer Iteration als pending gelten genau dann, wenn mindestens ein `regExpression.backfill.<gate>.debt > 0` gilt.
- Eine Expression, deren beide Debts `<= 0` sind, DARF NICHT (erneut) in `backfillQ` enqueued werden.
- Wenn eine Expression pending ist und `backfillRun` endet, dann MUSS RunTime diese Expression via `appendIfAbsent(backfillQ, regExpression)` für einen späteren Impuls erneut enqueuen.
- Wenn `appendIfAbsent(backfillQ, regExpression)` im `registeredRun` (Debt-Entry) oder im `backfillRun` (re-enqueue) ausgeführt wird und es im selben Impuls zu einem Target-Aufruf für diese Expression kommt, dann MUSS der `i.expression`-Snapshot für diese Expression `inBackfillQ === true` reflektieren (siehe §6.4.2.4).
- Nach Abschluss der Backfill-Verarbeitung des Impulses MUSS `i.expression.inBackfillQ` gemäß §6.4.2.4 finalisiert werden (für backfill-relevante Expressions) und MUSS in jedem Target-Aufruf innerhalb eines Registered-Runs boolean sein.


### 9.9 Multi-fire (outer-loop, FIFO-Rotation)

**Norm**
- `backfillRun` MUSS eine outer-loop über `workingQ` ausführen, bis `workingQ` leer ist.
- Pro outer-loop Iteration MUSS genau eine Iteration gemäß §9.7 ausgeführt werden.
- Wenn eine Iteration einen Deploy auslöst und die Expression danach pending ist, dann MUSS diese Expression deterministisch an das Ende von `workingQ` rotiert werden (FIFO-Rotation innerhalb der Runde; ohne Duplikate).
- Wenn eine Iteration keinen Deploy auslöst, dann DARF die Expression in dieser Runde nicht erneut versucht werden und DARF NICHT an das Ende von `workingQ` rotiert werden.
- Wenn eine Expression nach einer Iteration weiterhin pending ist, dann MUSS sie für einen späteren Impuls gemäß §9.8 re-enqueued werden (spätestens am Ende des `backfillRun`).
- Ein `backfillRun` DARF NICHT für dieselbe Expression innerhalb derselben Iteration mehr als einen Deploy auslösen.
- Ein `backfillRun` DARF NICHT die Debt-Split-Regeln aus §9.3 verletzen.


## 10. retroactive (normativ)

`retroactive: boolean` (in `AddOpts`)

**Norm**
- Wenn `retroactive === true`, MUSS RunTime beim Onboarding einen sofortigen Validierungsdurchlauf durchführen:
  - Signal-less: gegen die aktuelle Flag-Wahrheit (Ermittlung von `referenceFlags` MUSS §6.5 entsprechen).
  - Signal-gebunden: wenn `run.get("seenSignals").map[signal] === true`, als retroaktive Occurrence
- Retroactive verwendet `changedFlags = empty` (kein künstliches Delta).
  - Konsequenz: Expressions mit `required.flags.changed > 0` werden dadurch typischerweise nicht applied.
  - (*nicht normativ*) Wer „fire on onboarding“ will, setzt `required.flags.changed = 0`.


## 11. remove() / Tombstone / GC (normativ)

- `applExpression.remove()` wirkt sofort (tombstone) und verhindert alle zukünftigen Runs/Matches.
- GC bedeutet: tombstone/remove + aus allen Queues entfernen.
- Der aktuell laufende Target-Body wird nicht rückwirkend abgebrochen/rollbacked; ab dem Zeitpunkt werden zukünftige Runs übersprungen.
- Queue-Semantik (MUSS):
  - Tombstoned Expressions MÜSSEN in allen Iterationen übersprungen werden (registeredRun snapshot, workingQ, backfillQ.list).
  - appendIfAbsent(backfillQ, regExpression) DARF NICHT tombstoned Expressions enqueuen.
  - GC DARF eager (sofort) oder lazy (beim nächsten Queue-touch) erfolgen; in beiden Fällen MUSS das beobachtbare Verhalten
    “keine weiteren Realisationen” sein.


## 12. Fehlerbehandlung & Diagnostics (normativ)

### 12.1 Diagnostic Code Schema

Ein Diagnostic `code` ist ein stabiler, maschinenlesbarer Identifier für ein Ereignis, das über `run.onDiagnostic` publiziert wird.

Norm
- Ein Diagnostic `code` MUSS dem Schema `<source>.<domain>.<event>` entsprechen.
- Ein Diagnostic `code` MUSS exakt drei Segmente enthalten: `<source>`, `<domain>`, `<event>`.
- Ein Diagnostic `code` MUSS exakt zwei `.` Zeichen als Segmenttrenner enthalten.
- Ein Diagnostic `code` MUSS dem folgenden Pattern entsprechen: `^[a-z][A-Za-z0-9]*\.[a-z][A-Za-z0-9]*\.[a-z][A-Za-z0-9]*$`.

- `<source>` MUSS die Ursprungskomponente oder API-Fläche bezeichnen, in der der Diagnostic erzeugt wird (z. B. `add`, `set`, `impulse`, `matchExpression`).
- `<domain>` MUSS den fachlichen Teilbereich bezeichnen, auf den sich der Diagnostic bezieht (z. B. `flags`, `signals`, `objectTarget`, `reference`).
- `<event>` MUSS das Ereignis oder den Validierungsfehler bezeichnen.

- Wenn dasselbe `<domain>.<event>` in mehreren Ursprungskomponenten auftreten kann, MUSS der Diagnostic `code` sich ausschließlich im `<source>` Segment unterscheiden.
- Ein Diagnostic `code` MUSS stabil sein.
- Jedes zusätzliche Detail eines Ereignisses MUSS über `diagnostic.data` transportiert werden.
- Jedes zusätzliche Detail eines Ereignisses DARF NICHT durch Variation von `<domain>` oder `<event>` kodiert werden.

Nicht normativ
- Beispiele: `set.flags.addRemoveConflict`, `impulse.input.empty`, `matchExpression.reference.invalid`

### 12.2 Diagnostic Minimum Contract

Shape:

```ts
type Diagnostic = {
  code: string;
  severity: "info" | "warn" | "error";
  message?: string;
  data?: unknown;
}
```

**Norm**
- `severity` ist Pflicht.


### 12.3 Empfohlene Diagnostic Codes (SOLL)

- `add.flags.invalidToken`
- `add.flags.invalidValue`
- `add.signals.dedup`
- `add.objectTarget.missingEntrypoint`
- `add.objectTarget.missingHandler`
- `add.objectTarget.nonCallableHandler`

- `impulse.input.empty`
- `impulse.flags.addRemoveConflict`
- `impulse.flags.removeNotPresent`
- `set.flags.addRemoveConflict`
- `set.flags.removeNotPresent`

- `matchExpression.reference.invalid`


## 13. Defaults (normativ)

- `onError` Default: MUSS `"report"` sein.
- `backfill.signal.runs.max` Default: MUSS `0` sein. (disabled; kanonisch zu 0)
- `backfill.flags.runs.max` Default: MUSS `0` sein. (disabled; kanonisch zu 0)
- `required.flags` Defaults: MÜSSEN `min=specCount`, `max=Infinity`, `changed=1` sein.


## 14. Conformance (normativ)

### 14.1 Top-Level Invarianten

1. Eine Implementierung MUSS deterministisch sein: gleiche Inputs MÜSSEN zu gleicher Reihenfolge der Target-Aufrufe und gleichen State-Übergängen führen (keine Wallclock-Order).
2. `registeredQ` MUSS kanonische Insert-Order (FIFO der Registrierungen) sein und DARF NICHT durch Backfill verändert werden (siehe §7.1).
3. `backfillQ` MUSS FIFO nach Debt-Entry (`<=0 → >0`) sein und MUSS id-dedupe erzwingen; Backfill-Order DARF NICHT aus `registeredQ` abgeleitet werden (siehe §2.13, §9.2).
4. Debt DARF nur in `registeredRun` wachsen und DARF nur in `backfillRun` schrumpfen (siehe §7.2.1, §9.3).
5. Pro actImpulse-Occurrence MUSS das Run-Sequencing deterministisch sein: wenn `backfillQ` nicht leer ist, dann genau einmal `backfillRun` und danach genau einmal `registeredRun`, sonst nur `registeredRun` (siehe §7.2.2).
6. Backfill MUSS SSOT-konform zu §9 sein:
   - Backfill-Verarbeitung (Debt-Abbau, Attempts, Gate-Wahl, Deploy-Mechanik, Multi-fire) MUSS ausschließlich in `backfillRun` stattfinden, während Debt-Entry/Enqueue in `registeredRun` stattfindet (siehe §9.1).
   - Der Backfill-Rundenstart MUSS `workingQ = snapshot(backfillQ.list)` bilden und danach `backfillQ` als harte Neuinstanz leeren (siehe §9.5).
   - Die Gate-Wahl MUSS debt-weighted sein (Tie = signal), pro Iteration DARF höchstens ein Deploy erfolgen, Reject MUSS genau einen opposite attempt auslösen, und jeder Attempt MUSS das opposite Gate explizit `false` setzen (siehe §9.6, §9.7).
   - Multi-fire MUSS als outer-loop mit FIFO-Rotation ausgedrückt werden: deploy+pending ⇒ Rotation ans Ende von `workingQ`; Reject ⇒ kein Retry und keine Rotation innerhalb derselben Runde; pending am Run-Ende ⇒ re-enqueue für späteren Impuls (siehe §9.8, §9.9).
7. `i.q` MUSS pro Target-Aufruf gesetzt sein und exakt `"backfill"` oder `"registered"` sein; `i.expression` MUSS den Minimalshape liefern und `inBackfillQ` als post-state (Impuls) korrekt reflektieren (siehe §6.4).
8. Eine Implementierung MUSS in ihrer Entwickler-Dokumentation den empfohlenen Hydration-Workflow nennen: *Instanz instanzieren → alle Expressions via `run.add(...)` registrieren → `run.set(hydrationSnapshot)` aufrufen*. Außerdem MUSS dokumentiert sein, dass unbekannte `regExpression.id`s beim Hydration-Import von `backfillQ.list` via `onError` behandelt und (falls danach weiterhin unbekannt) gedroppt werden.


### 14.2 Muss-Tests

#### 14.2.1 FIFO by Debt-Entry (<=0 → >0) + id-dedupe

**Norm**
- Eine Conformance-Suite MUSS testen, dass Backfill-Order FIFO nach Debt-Entry ist.
- Der Debt-Entry-Trigger MUSS für diesen Test als Transition `<= 0 → > 0` verstanden werden (keine +1-Annahme; siehe §2.13/§9.2).
- Die Suite MUSS eine Sequenz konstruieren, in der mehrere Expressions Debt-Entry in definierter Visit-Order erreichen, und MUSS verifizieren, dass `backfillQ.list` genau diese FIFO-Order widerspiegelt.
- Die Suite MUSS id-dedupe testen: wenn derselbe `regExpression.id` mehrfach enqueued werden soll, dann MUSS `backfillQ.list` die `regExpression.id` höchstens einmal enthalten (siehe §2.13).

#### 14.2.2 Kein doppeltes Enqueue pro Expression bei Debt-Entry (id-dedupe / Ein-Insert-Pfad)

**Norm**
- Eine Conformance-Suite MUSS testen, dass pro Expression und pro Impuls ein Debt-Entry höchstens ein Enqueue in `backfillQ` erzeugt.
- Die Suite MUSS verifizieren, dass `appendIfAbsent(backfillQ, regExpression)` id-dedupe erzwingt (siehe §2.13), d. h. mehrere Trigger-/Update-Pfade innerhalb derselben deterministischen Verarbeitung DÜRFEN NICHT zu mehreren Einträgen derselben `regExpression.id` in `backfillQ.list` führen.
- Die Suite MUSS verifizieren, dass spätere Debt-Inkremente bei bestehender Backfill-Teilnahme (`>0 → >0`) kein Re-Enqueue auslösen (siehe §2.13/§9.2).

#### 14.2.3 Debt-Split (wächst nur registered / schrumpft nur backfill)

**Norm**
- Eine Conformance-Suite MUSS testen, dass Debt nur in `registeredRun` wächst und nur in `backfillRun` schrumpft (siehe §9.3).
- Die Suite MUSS mindestens einen Fall abdecken, in dem `registeredRun` Debt erzeugt und Debt-Entry enqueued.
- Die Suite MUSS mindestens einen Fall abdecken, in dem `backfillRun` Debt abbaut und dabei pro Deploy das Debt exakt um `1` dekrementiert (siehe §9.7).
- Die Suite MUSS verifizieren, dass:
  - in `registeredRun` kein Debt dekrementiert wird,
  - in `backfillRun` kein Debt inkrementiert wird.

#### 14.2.4 2-run Determinism pro Occurrence + `i.q` + `i.expression` (inkl. backfillRuns Summe)

**Norm**
- Eine Conformance-Suite MUSS testen, dass pro actImpulse-Occurrence deterministisch genau die folgenden Runs stattfinden (siehe §7.2.2):
  - wenn `backfillQ` nicht leer ist: genau einmal `backfillRun`, danach genau einmal `registeredRun`,
  - sonst: genau einmal `registeredRun`.
- Die Suite MUSS testen, dass `i.q` in Backfill-Targets stets `"backfill"` ist und in Registered-Targets stets `"registered"` (siehe §6.4.1).
- Die Suite MUSS testen, dass `i.expression` den Minimalshape trägt (siehe §6.4.2) und dass:
  - `i.expression.backfillSignalRuns` und `i.expression.backfillFlagsRuns` nur in Backfill-Targets inkrementieren,
  - `i.expression.backfillRuns` ein derived value ist und als Summe gilt: `backfillRuns = backfillSignalRuns + backfillFlagsRuns`, sofern gesetzt.
- Die Suite MUSS testen, dass `i.expression.actBackfillGate` nur bei Backfill-Deploys gesetzt ist und sonst `undefined` ist.
- Die Suite MUSS testen, dass `i.expression.inBackfillQ` im Registered-Run immer boolean ist und dass es `true` ist genau dann, wenn die Expression nach Abschluss des Impulses pending bleibt (siehe §6.4.2.4).

#### 14.2.5 Gate-Wahl & Attempt-Shape (debt-weighted, Tie=signal, opposite=false)

**Norm**
- Eine Conformance-Suite MUSS testen, dass die primäre Gate-Wahl debt-weighted ist (siehe §9.6):
  - `signalDebt > flagsDebt` ⇒ primär `"signal"`,
  - `flagsDebt > signalDebt` ⇒ primär `"flags"`,
  - `signalDebt === flagsDebt` ⇒ primär `"signal"`.
- Die Suite MUSS testen, dass jeder Attempt `coreRun` mit explizit deaktiviertem opposite Gate aufruft (siehe §9.6):
  - Attempt `"signal"` ⇒ `gate: { flags: false }`,
  - Attempt `"flags"` ⇒ `gate: { signal: false }`.
- Die Suite MUSS testen, dass bei Reject des primären Attempts genau ein opposite attempt ausgeführt wird (siehe §9.7).

#### 14.2.6 Max 1 Deploy pro Iteration + Reject-Semantik

**Norm**
- Eine Conformance-Suite MUSS testen, dass eine Iteration (siehe §9.1 Begriff „Iteration“) höchstens einen Deploy auslöst (siehe §9.7).
- Die Suite MUSS testen, dass wenn der primäre Attempt einen Deploy auslöst, kein opposite attempt ausgeführt wird (siehe §9.7).
- Die Suite MUSS testen, dass wenn der primäre Attempt als Reject endet, genau ein opposite attempt ausgeführt wird und insgesamt höchstens ein Deploy erfolgt (siehe §9.7).
- Die Suite MUSS testen, dass bei Deploy das Debt des deployenden Gates exakt um `1` dekrementiert wird (siehe §9.7).

#### 14.2.7 Multi-fire als outer-loop + FIFO-Rotation

**Norm**
- Eine Conformance-Suite MUSS testen, dass `backfillRun` als outer-loop über `workingQ` ausgeführt wird (siehe §9.9).
- Die Suite MUSS testen, dass Deploy+pending innerhalb derselben Runde zu deterministischer Rotation ans Ende von `workingQ` führt (siehe §9.9).
- Die Suite MUSS testen, dass Reject in derselben Runde kein Retry und keine Rotation auslöst (siehe §9.9).
- Die Suite MUSS testen, dass pending Expressions am Run-Ende via `appendIfAbsent(backfillQ, regExpression)` für einen späteren Impuls re-enqueued werden (siehe §9.8).

#### 14.2.8 Kein gleichzeitiges Debt-Entry beider Kanäle (optional)

**Norm**
- Eine Conformance-Suite DARF testen, dass für eine einzelne Expression innerhalb derselben deterministischen Visit-Situation nicht beide Backfill-Debts gleichzeitig von `<=0 → >0` wechseln.
- Wenn dieser Test implementiert wird, dann MUSS die Suite die Erwartung ausschließlich an eine explizit normierte Debt-Erzeugungsregel koppeln und DARF NICHT aus §14 allein eine neue Norm ableiten.

#### 14.2.9 as:"snapshot" vs as:"reference" (Aliasing)
**Norm**
- Eine Conformance-Suite MUSS testen, dass as:"snapshot" keine Live-Referenzen leakt:
  spätere interne State-Änderungen DÜRFEN den alten Rückgabewert nicht verändern.
- Die Suite MUSS testen, dass as:"reference" eine Aliasing-Form sein DARF (Änderungen dürfen sichtbar werden),
  aber dass externe Mutation als Contract-Verstoß behandelt wird (throw oder Diagnostic, je nach Implementierungsvorgabe).

#### 14.2.10 defaults.force:false ist invalid
**Norm**
- Die Suite MUSS testen, dass force:false einen invalid-input Pfad auslöst (throw).

#### 14.2.11 Tombstone skip
**Norm**
- Die Suite MUSS testen, dass eine tombstoned Expression nicht mehr applied wird,
  selbst wenn sie in workingQ/backfillQ/potential snapshots noch vorhanden war.

#### 14.2.12 Hydration-Roundtrip über `run.get("*")` und `run.set(...)`

Norm
- Eine Conformance-Suite MUSS testen, dass `run.get("*", { as: "snapshot" })` ein Objekt `s` liefert, das die own property `backfillQ` trägt.
- Eine Conformance-Suite MUSS testen, dass `run.get("*", { as: "snapshot" })` nach `run.set(s)` deep-equal zu `s` ist.
- Eine Conformance-Suite MUSS testen, dass `run.get("*", { scope: "pendingOnly", as: "snapshot" })` deep-equal zu `run.get("*", { as: "snapshot" })` ist.
- Eine Conformance-Suite MUSS deep-equal gemäß der JS/TS-Definition in §4.1 verstehen.


#### 14.2.13 `add.signals` Fail-fast Validierung für Objekt-Targets

**Norm**
- Eine Conformance-Suite MUSS testen, dass `run.add(opts)` bei `opts.signals` (own property, nicht leer) Fail-fast gemäß §4.4.1 validiert, bevor irgendein `regExpression` aus diesem Call registriert wird; messbar daran, dass nach einem Throw aus §4.4.1 der beobachtbare Registrierungszustand (z.B. `registeredQ`, oder eine äquivalente API-View wie `run.list()`) unverändert bleibt.
- Die Suite MUSS die Entrypoint-Fehlerfälle separat testen:
  - Wenn `t.target.on === undefined` gilt, MUSS `run.add(opts)` throwen und MUSS mindestens einen Diagnostic mit `code: "add.objectTarget.missingEntrypoint"` emittieren (und dieser Diagnostic MUSS vor dem Throw emittiert werden).
  - Wenn `t.target.on` vorhanden ist, aber `isObjectNonNull(t.target.on)` nicht erfüllt ist (z.B. `null`, `42`, `"x"`), MUSS `run.add(opts)` throwen und MUSS mindestens einen Diagnostic mit `code: "add.objectTarget.missingEntrypoint"` emittieren (und dieser Diagnostic MUSS vor dem Throw emittiert werden).
- Die Suite MUSS die Handler-Checks pro deklariertem `sig` (aus der kanonischen `sigList`-Order gemäß §4.4) testen, inkl. der normativen Check-Reihenfolge:
  - Wenn `sig === "everyRun"` ist, MUSS `run.add(opts)` throwen und MUSS mindestens einen Diagnostic mit `code: "add.objectTarget.missingHandler"` emittieren.
  - Wenn `sig !== "everyRun"` ist und `hasOwn(t.target.on, sig)` nicht erfüllt ist, MUSS `run.add(opts)` throwen und MUSS mindestens einen Diagnostic mit `code: "add.objectTarget.missingHandler"` emittieren.
  - Wenn `sig !== "everyRun"` ist und `hasOwn(t.target.on, sig)` erfüllt ist, aber `isCallable(t.target.on[sig])` nicht erfüllt ist, MUSS `run.add(opts)` throwen und MUSS mindestens einen Diagnostic mit `code: "add.objectTarget.nonCallableHandler"` emittieren.
  - Die Suite MUSS explizit absichern, dass bei `sig !== "everyRun"` ein fehlender own-property Handler **immer** zu `add.objectTarget.missingHandler` führt (und nicht zu `add.objectTarget.nonCallableHandler`), selbst wenn ein gleichnamiger Handler über die Prototype-Kette vorhanden wäre.
- Die Suite MUSS testen, dass Fail-fast deterministisch ist (“first violation wins”): Objekt-Targets werden in `targets`-Order geprüft; pro Objekt-Target werden `sig` in `sigList`-Order geprüft; und der **erste** (zeitlich zuerst emittierte) Diagnostic mit einem der Codes `ObjectTarget.*` entspricht **genau** der ersten Verletzung gemäß dieser Ordnung.
- Die Suite MUSS testen, dass der Call atomar ist: wenn `run.add(opts)` gemäß §4.4.1 throwt, dann DARF keine partielle Registrierung stattfinden (kein `regExpression` aus diesem Call registriert).
- Die Suite MUSS den `add.signals.dedup`-Ordering-Contract testen: Wenn §4.4 die Emission von `add.signals.dedup` verlangt, MUSS `add.signals.dedup` nach der `sigList`-Kanonisierung emittiert werden und MUSS sichtbar sein, selbst wenn die Kanonisierung von `opts.targets` gemäß §4.7 anschließend throwt (z.B. durch Wahl von `opts.targets`, das gemäß §4.7 deterministisch zu einem Throw führt).

#### 14.2.14 Objekt-Target Dispatch ist silent bei fehlenden / non-callable Handlern

**Norm**
- Eine Conformance-Suite MUSS testen, dass bei Objekt-Targets im Dispatch (§8.3.2) fehlende Handler (weder `on.everyRun` noch `on[i.signal]` vorhanden/callable) als No-Op behandelt werden.
- Die Suite MUSS testen, dass im Dispatch-Fall (nach Match) für fehlende Handler **kein** `onError` aufgerufen wird und **kein** Diagnostic mit `code: "add.objectTarget.missingHandler"` oder `code: "add.objectTarget.nonCallableHandler"` emittiert wird.
- Die Suite MUSS testen, dass ein non-callable Handler wie “nicht vorhanden” behandelt wird (silent):
  - `t.target.on.everyRun` ist own property, aber nicht callable ⇒ wie abwesend; **kein** `onError`; **kein** Diagnostic mit `code: "add.objectTarget.missingHandler"` oder `code: "add.objectTarget.nonCallableHandler"`.
  - `t.target.on[i.signal]` ist own property, aber nicht callable ⇒ wie abwesend; **kein** `onError`; **kein** Diagnostic mit `code: "add.objectTarget.missingHandler"` oder `code: "add.objectTarget.nonCallableHandler"`.
- Die Suite MUSS testen, dass “vorhanden” im Dispatch an `hasOwn` gebunden ist:
  - Ein Handler, der nur über die Prototype-Kette vorhanden ist (kein own property), MUSS so behandelt werden, als wäre er nicht vorhanden (No-Op; bzw. es wird nur `everyRun` ausgeführt, falls dieses als own+callable vorhanden ist).
- Die Suite MUSS die Sonderfälle von `i.signal` testen:
  - `i.signal === undefined` ⇒ `on[i.signal]` wird nicht geprüft/aufgerufen; höchstens `on.everyRun` (falls own+callable).
  - `i.signal === "everyRun"` ⇒ `on[i.signal]` wird nicht aufgerufen; höchstens `on.everyRun` (falls own+callable).
- Die Suite MUSS testen, dass die Aufrufreihenfolge eingehalten wird: `on.everyRun` (falls own+callable) wird vor `on[i.signal]` (falls `i.signal !== undefined` und `i.signal !== "everyRun"` und own+callable) synchron aufgerufen.
- Die Suite MUSS die Synchronität messbar testen (z.B. über deterministische Mutation/Append in ein Array ohne `await`/microtasks), sodass die beobachtete Reihenfolge dem synchronen Aufruf entspricht.

#### 14.2.15 Objekt-Target Dispatch: Entrypoint-Fehlerbehandlung

**Norm**
- Eine Conformance-Suite MUSS testen, dass im Dispatch (§8.3.2) bei Entrypoint-Fehlern:
  - wenn `t.target.on === undefined` gilt oder `isObjectNonNull(t.target.on)` nicht erfüllt ist, RunTime `onError` aufruft (Phase `"target/object"`, `regExpression.id` gesetzt),
  - das Target nicht attempted wird.
- Eine Conformance-Suite SOLL testen, dass RunTime in diesen Fällen (gemäß §8.3.2) einen Diagnostic mit `code: "add.objectTarget.missingEntrypoint"` erzeugt; falls ein solcher Diagnostic erzeugt wird, MUSS dessen `code` `add.objectTarget.missingEntrypoint` sein.


## 15. Beispiele (nicht normativ)

### 15.1 Watch ohne Constraint

```ts
run.add({
    flags: { uiStable: "*" },
    required: { flags: { changed: 1 } },
    targets: [function cb(own, act, r, i) {
    const isStable = r.get("flags").map["uiStable"] === true
    // branch based on truth
    }]
})
```

### 15.2 Co-change (nur wenn zwei Flags wirklich geändert wurden)

```ts
run.add({
    flags: { a: "*", b: "*" },
    required: { flags: { changed: 2 } },
    targets: [function cb(own, act, r, i) { /* ... */ }]
})
```

### 15.3 remove-only smell

```ts
run.impulse({ removeFlags: ["featureX"] })
// wenn featureX nie on war: Diagnostic warn, changedFlags ist leer
```

### 15.4 Hydration-Roundtrip (Snapshot persistieren und wiederherstellen)

```ts
const snapshot = run.get("*", { as: "snapshot" })

// persist snapshot (z. B. JSON, Datei, DB)
// ...

// später (gleiches oder neues RunTime-Objekt, je nach Architektur):
run.set(snapshot)

// Roundtrip-Check (semantisch): Snapshot-Form ist stabil
const snapshot2 = run.get("*", { as: "snapshot" })
// deep-equal(snapshot2, snapshot)  // deep-equal gemäß §4.1
```


## 16. Glossar (nicht normativ)

- applied segment: Die Teilmenge von `impulseQ.q.entries` vor `impulseQ.q.cursor`.
- pending segment: Die Teilmenge von `impulseQ.q.entries` ab `impulseQ.q.cursor` (inklusive Cursor-Position).
- scope: Ein Auswahlparameter für scope-aware Getter (z. B. `"applied"`, `"pending"`, `"pendingOnly"`).
- scope-aware Getter: Ein Getter, dessen Rückgabewert durch `RunGetOpts.scope` beeinflusst werden kann.
- Hydration-Snapshot: Ein Snapshot-Objekt, das als Input für `run.set(...)` verwendet wird und die own property `backfillQ` trägt.
- own property: Eine Property, die direkt auf einem Objekt liegt (nicht über Prototyp-Vererbung), im Sinne von `Object.prototype.hasOwnProperty.call(obj, key)`.
- deep-equal (JS/TS): Gleichheit über gleiche Menge an own enumerable keys und deep-equal Werte pro Key gemäß §4.1.
- Roundtrip: Die Sequenz `s = run.get("*", { as: "snapshot" })` gefolgt von `run.set(s)` und anschließender Snapshot-Validierung über `run.get("*", { as: "snapshot" })`.