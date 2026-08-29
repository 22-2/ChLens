import { MemoryLiveEventBus, type LiveEventBus } from "./events";
import { TauriLiveEventBus } from "./tauri-events";

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * MainとOverlayは別WebViewなので、Tauri実行時だけnative event busを共有する。
 * Storybookやブラウザの単一プロセスではMemory busを使い、Tauri APIなしでも境界を検証できる。
 */
export function createLiveEventBus(): LiveEventBus {
  return isTauriRuntime() ? new TauriLiveEventBus() : new MemoryLiveEventBus();
}
