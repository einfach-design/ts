/**
 * @file packages/runtime/src/index.types.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package source code.
 * @description Public contract entrypoint for the runtime package.
 */

export type RunScope = "applied" | "pending" | "pendingOnly";

export type Diagnostic = Readonly<{
  code: string;
  message: string;
  severity?: "info" | "warn" | "error";
  data?: Record<string, unknown>;
}>;

export type TargetToken =
  | ((i: unknown, a: unknown, r: unknown) => void)
  | { on: Record<string, unknown> };

export type OnError =
  | "throw"
  | "report"
  | "swallow"
  | ((error: unknown) => void);

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

export type MatchFlagSpecValue = true | false | "*";

export type MatchFlagSpec = Readonly<{
  flag: string;
  value: MatchFlagSpecValue;
}>;

export type MatchFlagsView = Readonly<{
  map: Record<string, true>;
  list?: readonly string[];
}>;

export type MatchExpressionOpts = Readonly<{
  expression: Readonly<{
    signal?: unknown;
    flags?: readonly MatchFlagSpec[];
    required?: Readonly<{
      flags?: Readonly<{
        min?: number;
        max?: number;
        changed?: number;
      }>;
    }>;
  }>;
  defaults?: Readonly<{
    gate: Readonly<{
      signal: Readonly<{ value: boolean }>;
      flags: Readonly<{ value: boolean }>;
    }>;
  }>;
  gate?: Readonly<{
    signal?: boolean;
    flags?: boolean;
  }>;
  reference?: Readonly<{
    signal?: unknown;
    flags?: MatchFlagsView;
    changedFlags?: MatchFlagsView | undefined;
  }>;
  changedFlags?: MatchFlagsView | undefined;
}>;

export type RunTime = Readonly<{
  add: (opts: AddOpts) => () => void;
  on: (opts: AddOpts) => () => void;
  when: (opts: AddOpts) => () => void;
  impulse: (opts?: ImpulseOpts) => void;
  get: (
    key?: RunGetKey,
    opts?: { as?: "snapshot" | "reference"; scope?: RunScope },
  ) => unknown;
  set: (patch: RunSetInput) => void;
  matchExpression: (opts: MatchExpressionOpts) => boolean;
  onDiagnostic: (handler: (diagnostic: Diagnostic) => void) => () => void;
}>;
