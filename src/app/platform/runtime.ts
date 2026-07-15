const TAURI_INTERNALS_KEY = "__TAURI_INTERNALS__";

function hasTauriInternals(target: unknown): target is Record<string, unknown> {
  return target != null && TAURI_INTERNALS_KEY in (target as Record<string, unknown>);
}

// Why: keep Tauri runtime detection logic in one place so feature branches do not drift.
export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && hasTauriInternals(window);
}

// Why: iframe on Tauri does not always receive injected internals; copy from same-origin top window once.
export function inheritTauriInternalsFromTopWindow(): void {
  if (typeof window === "undefined" || self === top || hasTauriInternals(window)) {
    return;
  }

  try {
    if (top != null && hasTauriInternals(top)) {
      (window as unknown as Record<string, unknown>)[TAURI_INTERNALS_KEY] = (
        top as unknown as Record<string, unknown>
      )[TAURI_INTERNALS_KEY];
    }
  } catch {
    // Ignore cross-origin iframe access errors.
  }
}
