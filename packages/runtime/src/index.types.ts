/**
 * @file packages/runtime/src/index.types.ts
 * @version 0.12.0
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package source code.
 * @description Public contract entrypoint for the runtime package.
 */

import type {
  FlagSpecValue,
  FlagSpec,
  FlagsView as MatchEngineFlagsView,
  MatchExpressionInput,
} from "./match/matchExpression.js";
import type { RuntimeTarget, RegisteredExpression } from "./runs/coreRun.js";
import type { ScopeProjectionBaseline, RuntimeStore } from "./runtime/store.js";
import type { BackfillQSnapshot } from "./state/backfillQ.js";
import type { Defaults } from "./state/defaults.js";
import type { FlagsView } from "./state/flagsView.js";
import type { Signal, SeenSignals } from "./state/signals.js";

export type { FlagsView } from "./state/flagsView.js";
export type { Signal, SeenSignals } from "./state/signals.js";
export type { BackfillQSnapshot } from "./state/backfillQ.js";
export type { RegisteredExpression } from "./runs/coreRun.js";
export type { ScopeProjectionBaseline } from "./runtime/store.js";
export type { ImpulseQEntryCanonical } from "./canon/impulseEntry.js";

export type RunScope = "applied" | "pending" | "pendingOnly";

export type Diagnostic = Readonly<{
  code: string;
  message: string;
  severity?: "info" | "warn" | "error";
  data?: Record<string, unknown>;
}>;

export type TargetToken = RuntimeTarget;

export type RuntimeErrorContext = Readonly<{
  phase: string;
  expressionId?: string;
  occurrenceKind?: "registered" | "backfill";
  targetKind?: "callback" | "object";
  handler?: string;
  signal?: string;
}>;

export type OnError =
  | "throw"
  | "report"
  | "swallow"
  | ((error: unknown, ctx: RuntimeErrorContext) => void);

export type AddOpts = Readonly<{
  id?: string;
  signal?: string;
  signals?: readonly string[];
  flags?: unknown;
  required?: { flags?: { min?: number; max?: number; changed?: number } };
  target?: TargetToken;
  targets?: readonly TargetToken[];
  backfill?: {
    signal?: { debt?: number; runs?: { max?: number } };
    flags?: { debt?: number; runs?: { max?: number } };
  };
  runs?: { max: number };
  onError?: OnError;
  retroactive?: boolean;
}>;

export type ImpulseOpts = Readonly<{
  signals?: readonly string[];
  addFlags?: readonly string[];
  removeFlags?: readonly string[];
  useFixedFlags?:
    | false
    | { list: readonly string[]; map: Record<string, true> };
  livePayload?: unknown;
  onError?: OnError;
}>;

export type RunGetKey =
  | "*"
  | "defaults"
  | "flags"
  | "changedFlags"
  | "seenFlags"
  | "signal"
  | "seenSignals"
  | "scopeProjectionBaseline"
  | "impulseQ"
  | "backfillQ"
  | "registeredQ"
  | "registeredById"
  | "diagnostics";

export type RunSetInput = Readonly<Record<string, unknown>>;

type MutableDeep<T> = T extends readonly (infer U)[]
  ? MutableDeep<U>[]
  : T extends ReadonlyMap<infer K, infer V>
    ? Map<MutableDeep<K>, MutableDeep<V>>
    : T extends object
      ? { -readonly [K in keyof T]: MutableDeep<T[K]> }
      : T;

export type RunGetReturnMap = {
  defaults: Defaults;
  flags: MutableDeep<FlagsView>;
  changedFlags: MutableDeep<FlagsView> | undefined;
  seenFlags: MutableDeep<FlagsView>;
  signal: Signal | undefined;
  seenSignals: MutableDeep<SeenSignals>;
  scopeProjectionBaseline: MutableDeep<ScopeProjectionBaseline>;
  impulseQ: MutableDeep<RuntimeStore["impulseQ"]>;
  backfillQ: BackfillQSnapshot;
  registeredQ: MutableDeep<RegisteredExpression>[];
  registeredById: Map<string, MutableDeep<RegisteredExpression>>;
  diagnostics: MutableDeep<Diagnostic>[];
};

export type RunGetAllReturn = RunGetReturnMap & { "*": never };

export type MatchFlagSpecValue = FlagSpecValue;

export type MatchFlagSpec = FlagSpec;

export type MatchFlagsView = Readonly<MatchEngineFlagsView>;

type MatchExpressionEngineInput = Omit<
  MatchExpressionInput,
  "defaults" | "fallbackReference" | "reference" | "changedFlags"
>;

type MatchExpressionReference = Omit<
  NonNullable<MatchExpressionInput["reference"]>,
  "flags" | "changedFlags"
> & {
  flags?: MatchFlagsView;
  changedFlags?: MatchFlagsView | undefined;
};

export type MatchExpressionOpts = Readonly<
  MatchExpressionEngineInput & {
    defaults?: MatchExpressionInput["defaults"];
    reference?: Readonly<MatchExpressionReference>;
    changedFlags?: MatchFlagsView | undefined;
  }
>;

export type RunTime = Readonly<{
  add: (opts: AddOpts) => () => void;
  on: (opts: AddOpts) => () => void;
  when: (opts: AddOpts) => () => void;
  impulse: (opts?: ImpulseOpts) => void;
  get(): RunGetAllReturn;
  get(
    key: "*",
    opts?: {
      as?: "snapshot" | "reference" | "unsafeAlias";
      scope?: RunScope;
    },
  ): RunGetAllReturn;
  get<K extends Exclude<RunGetKey, "*">>(
    key: K,
    opts?: {
      as?: "snapshot" | "reference" | "unsafeAlias";
      scope?: RunScope;
    },
  ): RunGetReturnMap[K];
  set: (patch: RunSetInput) => void;
  matchExpression: (opts: MatchExpressionOpts) => boolean;
  onDiagnostic: (handler: (diagnostic: Diagnostic) => void) => () => void;
}>;
