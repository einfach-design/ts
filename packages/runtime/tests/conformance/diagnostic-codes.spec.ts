/**
 * @file packages/runtime/tests/conformance/diagnostic-codes.spec.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package test code.
 * @description Conformance smoke tests for stable diagnostic codes.
 */

import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import * as ts from "typescript";
import { DIAGNOSTIC_CODES } from "../../src/diagnostics/index.js";
import { createRuntime } from "../../src/index.js";
import { RUNTIME_PKG_ROOT, fromRuntimePkgRoot } from "../_utils/paths.js";

describe("conformance/diagnostic-codes", () => {
  it("all DIAGNOSTIC_CODES use dot-separated non-empty segments", () => {
    for (const code of Object.keys(DIAGNOSTIC_CODES)) {
      const segments = code.split(".");
      expect(segments.length).toBeGreaterThanOrEqual(3);
      for (const segment of segments) {
        expect(segment.length).toBeGreaterThan(0);
      }
    }
  });

  it("all emitted diagnostic codes in runtime sources are registered", () => {
    const runtimeSourceRoot = fromRuntimePkgRoot("src");
    const knownCodes = new Set(Object.keys(DIAGNOSTIC_CODES));
    const runtimeErrorCode = ["runtime", "error"].join(".");

    const listRuntimeSourceFiles = (directory: string): string[] => {
      const entries = readdirSync(directory, { withFileTypes: true }).sort(
        (left, right) => left.name.localeCompare(right.name),
      );
      const files: string[] = [];

      for (const entry of entries) {
        const absolutePath = resolve(directory, entry.name);

        if (entry.isDirectory()) {
          files.push(...listRuntimeSourceFiles(absolutePath));
          continue;
        }

        if (entry.isSymbolicLink()) {
          const stats = statSync(absolutePath);
          if (stats.isDirectory()) {
            files.push(...listRuntimeSourceFiles(absolutePath));
            continue;
          }
        }

        if (entry.isFile() && absolutePath.endsWith(".ts")) {
          files.push(absolutePath);
        }
      }

      return files;
    };

    const files = listRuntimeSourceFiles(runtimeSourceRoot).sort((a, b) =>
      a.localeCompare(b),
    );

    const program = ts.createProgram(files, {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    });
    const checker = program.getTypeChecker();

    const evalStaticString = (
      expression: ts.Expression,
      sourceFile: ts.SourceFile,
      seen = new Set<ts.Node>(),
    ): string | undefined => {
      if (seen.has(expression)) {
        return undefined;
      }
      seen.add(expression);

      if (
        ts.isStringLiteralLike(expression) ||
        ts.isNoSubstitutionTemplateLiteral(expression)
      ) {
        return expression.text;
      }

      if (ts.isParenthesizedExpression(expression)) {
        return evalStaticString(expression.expression, sourceFile, seen);
      }

      if (
        ts.isBinaryExpression(expression) &&
        expression.operatorToken.kind === ts.SyntaxKind.PlusToken
      ) {
        const left = evalStaticString(expression.left, sourceFile, seen);
        const right = evalStaticString(expression.right, sourceFile, seen);
        if (left !== undefined && right !== undefined) {
          return `${left}${right}`;
        }
      }

      if (ts.isArrayLiteralExpression(expression)) {
        const parts: string[] = [];
        for (const element of expression.elements) {
          if (!ts.isExpression(element)) {
            return undefined;
          }
          const value = evalStaticString(element, sourceFile, seen);
          if (value === undefined) {
            return undefined;
          }
          parts.push(value);
        }
        return parts.join(",");
      }

      if (
        ts.isCallExpression(expression) &&
        ts.isPropertyAccessExpression(expression.expression) &&
        expression.expression.name.text === "join" &&
        expression.arguments.length === 1
      ) {
        const target = expression.expression.expression;
        if (!ts.isArrayLiteralExpression(target)) {
          return undefined;
        }

        const separator = evalStaticString(
          expression.arguments[0] as ts.Expression,
          sourceFile,
          seen,
        );
        if (separator === undefined) {
          return undefined;
        }

        const items: string[] = [];
        for (const element of target.elements) {
          if (!ts.isExpression(element)) {
            return undefined;
          }
          const value = evalStaticString(element, sourceFile, seen);
          if (value === undefined) {
            return undefined;
          }
          items.push(value);
        }

        return items.join(separator);
      }

      if (ts.isIdentifier(expression)) {
        const symbol = checker.getSymbolAtLocation(expression);
        const declaration = symbol?.valueDeclaration;
        if (
          declaration !== undefined &&
          ts.isVariableDeclaration(declaration) &&
          declaration.initializer !== undefined
        ) {
          return evalStaticString(declaration.initializer, sourceFile, seen);
        }
      }

      return undefined;
    };

    const extractCodesFromType = (type: ts.Type): string[] => {
      if (type.isUnion()) {
        const values = type.types
          .map((memberType) =>
            memberType.isStringLiteral() ? memberType.value : undefined,
          )
          .filter((value): value is string => value !== undefined);
        return Array.from(new Set(values));
      }

      if (type.isStringLiteral()) {
        return [type.value];
      }

      return [];
    };

    for (const sourceFile of program.getSourceFiles()) {
      if (
        sourceFile.isDeclarationFile ||
        !files.includes(sourceFile.fileName)
      ) {
        continue;
      }

      const relativePath = relative(RUNTIME_PKG_ROOT, sourceFile.fileName);

      const visit = (node: ts.Node): void => {
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === "emit"
        ) {
          const firstArg = node.arguments[0];
          if (
            firstArg !== undefined &&
            ts.isObjectLiteralExpression(firstArg)
          ) {
            const codeProperty = firstArg.properties.find(
              (property) =>
                ts.isPropertyAssignment(property) &&
                ((ts.isIdentifier(property.name) &&
                  property.name.text === "code") ||
                  (ts.isStringLiteral(property.name) &&
                    property.name.text === "code")),
            );

            if (
              codeProperty !== undefined &&
              ts.isPropertyAssignment(codeProperty)
            ) {
              const initializer = codeProperty.initializer;
              const extracted = new Set<string>();

              if (ts.isStringLiteralLike(initializer)) {
                extracted.add(initializer.text);
              }

              const staticValue = evalStaticString(initializer, sourceFile);
              if (staticValue !== undefined) {
                extracted.add(staticValue);
              }

              if (extracted.size === 0) {
                const fromType = extractCodesFromType(
                  checker.getTypeAtLocation(initializer),
                );
                for (const code of fromType) {
                  extracted.add(code);
                }
              }

              if (extracted.size === 0) {
                expect.fail(
                  `${relativePath} -> unable to resolve emitted diagnostic code expression: ${initializer.getText(sourceFile)}`,
                );
              }

              for (const code of extracted) {
                expect(
                  knownCodes.has(code) || code === runtimeErrorCode,
                  `${relativePath} -> ${code}`,
                ).toBe(true);
              }
            }
          }
        }

        ts.forEachChild(node, visit);
      };

      visit(sourceFile);
    }
  });

  it("emits add.signals.invalid when add.signals contains non-strings", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    expect(() =>
      run.add({
        targets: [() => undefined],
        signals: ["ok", 1] as unknown as string[],
      }),
    ).toThrow("add.signals.invalid");
    expect(codes).toContain("add.signals.invalid");
  });

  it("emits add.id.invalid when run.add id is an empty/blank string", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    expect(() =>
      run.add({
        id: "   ",
        targets: [() => undefined],
      } as never),
    ).toThrow("add.id.invalid");

    expect(codes).toContain("add.id.invalid");
  });

  it("emits add.signals.dedup when add.signals contains duplicates", () => {
    const run = createRuntime();

    expect(() =>
      run.add({
        targets: [() => undefined],
        signals: ["a", "a", "b", "b", "a"],
      }),
    ).not.toThrow();

    const diagnostics = run.get("diagnostics", { as: "snapshot" }) as Array<{
      code: string;
      data?: { deduped?: string[] };
    }>;
    const dedupDiagnostic = diagnostics.find(
      (diagnostic) => diagnostic.code === "add.signals.dedup",
    );

    expect(dedupDiagnostic).toBeDefined();
    expect(dedupDiagnostic?.data?.deduped).toEqual(["a", "b"]);
  });

  it("emits add.required.invalid when required is not an object", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    expect(() =>
      run.add({
        targets: [() => undefined],
        required: null,
      } as unknown as Record<string, unknown>),
    ).toThrow("add.required.invalid");
    expect(codes).toContain("add.required.invalid");
  });

  it("emits add.required.flags.invalid when required.flags is invalid", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    expect(() =>
      run.add({
        targets: [() => undefined],
        required: { flags: [] },
      } as unknown as Record<string, unknown>),
    ).toThrow("add.required.flags.invalid");
    expect(codes).toContain("add.required.flags.invalid");
  });

  it("emits add.required.flags.minInvalid when min is not finite", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    expect(() =>
      run.add({
        targets: [() => undefined],
        required: { flags: { min: Number.NEGATIVE_INFINITY } },
      }),
    ).toThrow("add.required.flags.minInvalid");
    expect(codes).toContain("add.required.flags.minInvalid");
  });

  it("emits add.required.flags.maxInvalid when max is not finite", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    expect(() =>
      run.add({
        targets: [() => undefined],
        required: { flags: { max: Number.POSITIVE_INFINITY } },
      }),
    ).toThrow("add.required.flags.maxInvalid");
    expect(codes).toContain("add.required.flags.maxInvalid");
  });

  it("emits add.required.flags.changedInvalid when changed is not finite", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    expect(() =>
      run.add({
        targets: [() => undefined],
        required: { flags: { changed: Number.NaN } },
      }),
    ).toThrow("add.required.flags.changedInvalid");
    expect(codes).toContain("add.required.flags.changedInvalid");
  });

  it("emits add.onError.invalid when onError is invalid", () => {
    const run = createRuntime();

    expect(() =>
      run.add({
        targets: [() => undefined],
        onError: "nope" as never,
      }),
    ).toThrow("add.onError.invalid");

    const diagnostics = run.get("diagnostics", { as: "snapshot" }) as Array<{
      code: string;
    }>;

    expect(
      diagnostics.some(
        (diagnostic) => diagnostic.code === "add.onError.invalid",
      ),
    ).toBe(true);
  });
  it("emits add.runs.invalid when runs is not an object", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    expect(() =>
      run.add({
        targets: [() => undefined],
        runs: [],
      } as unknown as Record<string, unknown>),
    ).toThrow("add.runs.invalid");
    expect(codes).toContain("add.runs.invalid");
  });

  it("emits add.runs.max.invalid when runs.max is negative infinity", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    expect(() =>
      run.add({
        targets: [() => undefined],
        runs: { max: Number.NEGATIVE_INFINITY },
      }),
    ).toThrow("add.runs.max.invalid");
    expect(codes).toContain("add.runs.max.invalid");
  });

  it("emits add.backfill.invalid for invalid backfill root", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    expect(() =>
      run.add({
        targets: [() => undefined],
        backfill: [],
      } as unknown as Record<string, unknown>),
    ).toThrow("add.backfill.invalid");
    expect(codes).toContain("add.backfill.invalid");
  });

  it("emits add.backfill.signal.invalid for invalid backfill signal gate", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    expect(() =>
      run.add({
        targets: [() => undefined],
        backfill: { signal: null },
      } as unknown as Record<string, unknown>),
    ).toThrow("add.backfill.signal.invalid");
    expect(codes).toContain("add.backfill.signal.invalid");
  });

  it("emits add.backfill.flags.invalid for invalid backfill flags gate", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    expect(() =>
      run.add({
        targets: [() => undefined],
        backfill: { flags: [] },
      } as unknown as Record<string, unknown>),
    ).toThrow("add.backfill.flags.invalid");
    expect(codes).toContain("add.backfill.flags.invalid");
  });

  it("emits add.backfill.signal.debt.invalid for non-finite backfill signal debt", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    expect(() =>
      run.add({
        targets: [() => undefined],
        backfill: { signal: { debt: Number.POSITIVE_INFINITY } },
      }),
    ).toThrow("add.backfill.signal.debt.invalid");
    expect(codes).toContain("add.backfill.signal.debt.invalid");
  });

  it("emits add.backfill.flags.debt.invalid for non-number backfill flags debt", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    expect(() =>
      run.add({
        targets: [() => undefined],
        backfill: { flags: { debt: "1" } },
      } as unknown as Record<string, unknown>),
    ).toThrow("add.backfill.flags.debt.invalid");
    expect(codes).toContain("add.backfill.flags.debt.invalid");
  });

  it("emits add.backfill.signal.runs.max.invalid for non-number backfill signal runs.max", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    expect(() =>
      run.add({
        targets: [() => undefined],
        backfill: { signal: { runs: { max: "3" } } },
      } as unknown as Record<string, unknown>),
    ).toThrow("add.backfill.signal.runs.max.invalid");
    expect(codes).toContain("add.backfill.signal.runs.max.invalid");
  });

  it("emits add.backfill.flags.runs.invalid for invalid backfill flags runs", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    expect(() =>
      run.add({
        targets: [() => undefined],
        backfill: { flags: { runs: null } },
      } as unknown as Record<string, unknown>),
    ).toThrow("add.backfill.flags.runs.invalid");
    expect(codes).toContain("add.backfill.flags.runs.invalid");
  });
  it("emits set.impulseQ.configInvalid and throws for non-object config patch", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    expect(() =>
      run.set({ impulseQ: { config: 123 } } as unknown as Record<
        string,
        unknown
      >),
    ).toThrow("set.impulseQ.configInvalid");
    expect(codes).toContain("set.impulseQ.configInvalid");
  });

  it("emits set.patch.invalid and throws for array root patch", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    expect(() => run.set([] as unknown as Record<string, unknown>)).toThrow(
      "set.patch.invalid",
    );
    expect(codes).toContain("set.patch.invalid");
  });

  it("emits set.defaults.invalid and throws for array defaults patch", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    expect(() =>
      run.set({ defaults: [] } as unknown as Record<string, unknown>),
    ).toThrow("set.defaults.invalid");
    expect(codes).toContain("set.defaults.invalid");
  });

  it("emits set.defaults.invalid and throws for invalid defaults patch shape", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    expect(() =>
      run.set({
        defaults: { scope: { signal: { force: true } } },
      } as unknown as Record<string, unknown>),
    ).toThrow("set.defaults.invalid");
    expect(codes).toContain("set.defaults.invalid");
  });
  it("emits set.defaults.invalid and throws for invalid defaults.gate value", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    expect(() =>
      run.set({
        defaults: { gate: { signal: { value: "banana" } } },
      } as unknown as Record<string, unknown>),
    ).toThrow("set.defaults.invalid");
    expect(codes).toContain("set.defaults.invalid");
  });

  it("emits set.defaults.invalid and throws for hydration with invalid defaults", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    const snapshot = run.get("*", { as: "snapshot" }) as Record<
      string,
      unknown
    >;
    (snapshot as { defaults: unknown }).defaults = [];

    expect(() => run.set(snapshot)).toThrow("set.defaults.invalid");
    expect(codes).toContain("set.defaults.invalid");
  });

  it("emits set.flags.invalid and throws for inconsistent flags map", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    expect(() =>
      run.set({ flags: { list: ["a"], map: {} } } as unknown as Record<
        string,
        unknown
      >),
    ).toThrow("set.flags.invalid");
    expect(codes).toContain("set.flags.invalid");
  });

  it("emits set.flags.invalid and throws for array flags map", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    expect(() =>
      run.set({ flags: { list: ["a"], map: [] } } as unknown as Record<
        string,
        unknown
      >),
    ).toThrow("set.flags.invalid");
    expect(codes).toContain("set.flags.invalid");
  });

  it("emits set.impulseQ.invalid and throws for array impulseQ patch", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    expect(() =>
      run.set({ impulseQ: [] } as unknown as Record<string, unknown>),
    ).toThrow("set.impulseQ.invalid");
    expect(codes).toContain("set.impulseQ.invalid");
  });

  it("emits set.impulseQ.configInvalid and throws for array config patch", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    expect(() =>
      run.set({ impulseQ: { config: [] } } as unknown as Record<
        string,
        unknown
      >),
    ).toThrow("set.impulseQ.configInvalid");
    expect(codes).toContain("set.impulseQ.configInvalid");
  });

  it("emits set.impulseQ.invalid and throws for hydration with non-object impulseQ", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    const snapshot = run.get("*", { as: "snapshot" }) as Record<
      string,
      unknown
    >;
    (snapshot as { impulseQ: unknown }).impulseQ = null;

    expect(() => run.set(snapshot)).toThrow("set.impulseQ.invalid");
    expect(codes).toContain("set.impulseQ.invalid");
  });

  it("emits set.impulseQ.configInvalid and throws for hydration with non-object config", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    const snapshot = run.get("*", { as: "snapshot" }) as Record<
      string,
      unknown
    >;
    (snapshot.impulseQ as { config: unknown }).config = null;

    expect(() => run.set(snapshot)).toThrow("set.impulseQ.configInvalid");
    expect(codes).toContain("set.impulseQ.configInvalid");
  });

  it("emits set.impulseQ.configInvalid and throws for hydration with array config", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    const snapshot = run.get("*", { as: "snapshot" }) as Record<
      string,
      unknown
    >;
    (snapshot.impulseQ as { config: unknown }).config = [];

    expect(() => run.set(snapshot)).toThrow("set.impulseQ.configInvalid");
    expect(codes).toContain("set.impulseQ.configInvalid");
  });

  it("emits set.impulseQ.retainInvalid and throws for NaN retain", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    expect(() =>
      run.set({ impulseQ: { config: { retain: Number.NaN } } }),
    ).toThrow("set.impulseQ.retainInvalid");
    expect(codes).toContain("set.impulseQ.retainInvalid");
  });

  it("emits set.impulseQ.maxBytesInvalid and throws for NaN maxBytes", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    expect(() =>
      run.set({ impulseQ: { config: { maxBytes: Number.NaN } } }),
    ).toThrow("set.impulseQ.maxBytesInvalid");
    expect(codes).toContain("set.impulseQ.maxBytesInvalid");
  });

  it("emits set.impulseQ.retainInvalid and throws for -Infinity retain", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    expect(() =>
      run.set({ impulseQ: { config: { retain: Number.NEGATIVE_INFINITY } } }),
    ).toThrow("set.impulseQ.retainInvalid");
    expect(codes).toContain("set.impulseQ.retainInvalid");
  });

  it("emits set.impulseQ.maxBytesInvalid and throws for -Infinity maxBytes", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    expect(() =>
      run.set({ impulseQ: { config: { maxBytes: Number.NEGATIVE_INFINITY } } }),
    ).toThrow("set.impulseQ.maxBytesInvalid");
    expect(codes).toContain("set.impulseQ.maxBytesInvalid");
  });
  it("emits set.impulseQ.onTrimInvalid and throws for invalid onTrim patch", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    expect(() =>
      run.set({ impulseQ: { config: { onTrim: 123 } } } as unknown as Record<
        string,
        unknown
      >),
    ).toThrow("set.impulseQ.onTrimInvalid");
    expect(codes).toContain("set.impulseQ.onTrimInvalid");
  });

  it("emits set.impulseQ.onErrorInvalid and throws for invalid onError patch", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    expect(() =>
      run.set({
        impulseQ: { config: { onError: "banana" } },
      } as unknown as Record<string, unknown>),
    ).toThrow("set.impulseQ.onErrorInvalid");
    expect(codes).toContain("set.impulseQ.onErrorInvalid");
  });

  it("emits set.impulseQ.qInvalid and throws for hydration with out-of-range cursor", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    const snapshot = run.get("*", { as: "snapshot" }) as Record<
      string,
      unknown
    >;
    const impulseQ = snapshot.impulseQ as { q: { cursor: number } };
    impulseQ.q.cursor = 999;

    expect(() => run.set(snapshot)).toThrow("set.impulseQ.qInvalid");
    expect(codes).toContain("set.impulseQ.qInvalid");
  });

  it("emits set.impulseQ.entryInvalid and throws for hydration with invalid entry", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    const snapshot = run.get("*", { as: "snapshot" }) as Record<
      string,
      unknown
    >;
    const impulseQ = snapshot.impulseQ as {
      q: { entries: unknown[]; cursor: number };
    };
    impulseQ.q.entries = [{ signals: "nope" }];
    impulseQ.q.cursor = 1;

    expect(() => run.set(snapshot)).toThrow("set.impulseQ.entryInvalid");
    expect(codes).toContain("set.impulseQ.entryInvalid");
  });

  it("emits set.hydration.incomplete and throws for incomplete hydration patches", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    const snapshot = run.get("*", { as: "snapshot" }) as Record<
      string,
      unknown
    >;
    const incompleteHydration = { ...snapshot };
    delete incompleteHydration.flags;

    expect(() => run.set(incompleteHydration)).toThrow(
      "set.hydration.incomplete",
    );
    expect(codes).toContain("set.hydration.incomplete");
  });

  it("emits set.flags.deltaInvalid and throws for invalid addFlags payload", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    expect(() =>
      run.set({ addFlags: 123 } as unknown as Record<string, unknown>),
    ).toThrow("set.flags.deltaInvalid");
    expect(codes).toContain("set.flags.deltaInvalid");
  });

  it("emits set.flags.deltaInvalid and throws for invalid removeFlags payload", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    expect(() =>
      run.set({ removeFlags: null } as unknown as Record<string, unknown>),
    ).toThrow("set.flags.deltaInvalid");
    expect(codes).toContain("set.flags.deltaInvalid");
  });

  it("emits set.hydration.flagsViewInvalid and throws for hydration with invalid flags", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    const s = run.get("*", { as: "snapshot" }) as Record<string, unknown>;
    s.flags = [];

    expect(() => run.set(s)).toThrow("set.hydration.flagsViewInvalid");
    expect(codes).toContain("set.hydration.flagsViewInvalid");
  });

  it("emits set.hydration.seenSignalsInvalid and throws for hydration with invalid seenSignals", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    const s = run.get("*", { as: "snapshot" }) as Record<string, unknown>;
    s.seenSignals = [];

    expect(() => run.set(s)).toThrow("set.hydration.seenSignalsInvalid");
    expect(codes).toContain("set.hydration.seenSignalsInvalid");
  });

  it("emits set.hydration.flagsViewInvalid and throws for hydration with duplicate flags.list entries", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    const s = run.get("*", { as: "snapshot" }) as Record<string, unknown> & {
      flags: { list: string[]; map: Record<string, true> };
    };
    s.flags = { list: ["dup", "dup"], map: { dup: true } };

    expect(() => run.set(s)).toThrow("set.hydration.flagsViewInvalid");
    expect(codes).toContain("set.hydration.flagsViewInvalid");
  });

  it("emits set.hydration.seenSignalsInvalid and throws for hydration with duplicate seenSignals.list entries", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    const s = run.get("*", { as: "snapshot" }) as Record<string, unknown> & {
      seenSignals: { list: string[]; map: Record<string, true> };
    };
    s.seenSignals = { list: ["dup", "dup"], map: { dup: true } };

    expect(() => run.set(s)).toThrow("set.hydration.seenSignalsInvalid");
    expect(codes).toContain("set.hydration.seenSignalsInvalid");
  });

  it("emits set.hydration.signalInvalid and throws for hydration with invalid signal", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    const s = run.get("*", { as: "snapshot" }) as Record<string, unknown>;
    s.signal = 123;

    expect(() => run.set(s)).toThrow("set.hydration.signalInvalid");
    expect(codes).toContain("set.hydration.signalInvalid");
  });

  it("emits set.hydration.backfillQInvalid and throws for hydration with invalid backfillQ", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    const s = run.get("*", { as: "snapshot" }) as Record<string, unknown>;
    s.backfillQ = null;

    expect(() => run.set(s)).toThrow("set.hydration.backfillQInvalid");
    expect(codes).toContain("set.hydration.backfillQInvalid");
  });

  it("emits set.flags.deltaInvalid and throws for inconsistent FlagsView delta", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    expect(() =>
      run.set({ addFlags: { list: ["a"], map: {} } } as unknown as Record<
        string,
        unknown
      >),
    ).toThrow("set.flags.deltaInvalid");
    expect(codes).toContain("set.flags.deltaInvalid");
  });
  it("emits set.flags.invalid and throws for invalid flags payload", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    expect(() =>
      run.set({ flags: ["x"] as unknown as { list: string[] } }),
    ).toThrow("set.flags.invalid");
    expect(codes).toContain("set.flags.invalid");
  });
});
