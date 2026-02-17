import type { RuntimeDiagnostic, DiagnosticCollector } from "../../diagnostics/index.js";
import type { RuntimeStore } from "../store.js";

export function runOnDiagnostic(
  store: RuntimeStore,
  { diagnostics }: { diagnostics: DiagnosticCollector },
  handler: (diagnostic: RuntimeDiagnostic) => void,
): () => void {
      return store.withRuntimeStack(() => {
        const prev = diagnostics.list();
        diagnostics.clear();
        for (const item of prev) {
          handler(item);
          diagnostics.emit(item);
        }

        return () => undefined;
      });
}