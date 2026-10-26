import { useSyncExternalStore } from "react";
import { createLogger } from "src/app/logger";
import { getStore2String, setStore2String } from "src/app/Store2Storage";

const logger = createLogger("view/browser");
const STORAGE_KEY = "chlens_browser_zen_mode";
const listeners = new Set<() => void>();
let enabled = false;

try {
  enabled = getStore2String(STORAGE_KEY) === "on";
} catch (error) {
  logger.error("Zenモードの状態を読み込めませんでした", { error });
}

function notify(): void {
  for (const listener of listeners) listener();
}

export function getZenModeEnabled(): boolean {
  return enabled;
}

export function setZenModeEnabled(nextEnabled: boolean): void {
  if (enabled === nextEnabled) return;

  enabled = nextEnabled;
  notify();
  try {
    void setStore2String(STORAGE_KEY, enabled ? "on" : "off").catch((error: unknown) => {
      logger.error("Zenモードの状態を保存できませんでした", { error });
    });
  } catch (error) {
    logger.error("Zenモードの状態を保存できませんでした", { error });
  }
}

export function toggleZenMode(): void {
  setZenModeEnabled(!enabled);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    const nextEnabled = event.newValue === "on";
    if (enabled === nextEnabled) return;
    enabled = nextEnabled;
    notify();
  });
}

export function useZenMode(): boolean {
  return useSyncExternalStore(subscribe, getZenModeEnabled, () => false);
}
