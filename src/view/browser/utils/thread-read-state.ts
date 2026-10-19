import { emit, listen } from "@tauri-apps/api/event";
import { createLogger } from "src/app/logger";
import { isTauriRuntime } from "src/app/platform/runtime";
import { isHTMLElementInWindow } from "src/view/browser/utils/dom";

const logger = createLogger("view/browser");

const THREAD_RES_JUMP_EVENT = "thread-res-jump";
const THREAD_RES_JUMP_TAURI_EVENT = "chlens://thread-res-jump";
const threadJumpEventTarget = new EventTarget();
const pendingThreadJumpByUrl = new Map<string, PendingThreadJump>();

export interface PendingThreadJump {
  threadUrl: string;
  resNum: number;
  token: string;
  targetTabId?: string;
  clearFilter?: boolean;
}

function normalizeThreadJumpKey(threadUrl: string): string {
  try {
    return new window.URL(threadUrl).href;
  } catch {
    return threadUrl;
  }
}

export function findThreadScrollContainer(host: HTMLElement | null): HTMLElement | null {
  const container = host?.closest(".content-area__tab-panel");
  // 別窓のスクロール領域は主窓のHTMLElementと異なるため、hostの文書に属する
  // Windowのコンストラクタで判定し、既読位置とレスジャンプの対象を失わない。
  const targetWindow = host?.ownerDocument.defaultView ?? globalThis.window;
  return isHTMLElementInWindow(container, targetWindow) ? container : null;
}

export function requestThreadResJump(
  threadUrl: string,
  resNum: number,
  targetTabId?: string,
  clearFilter?: boolean,
  notifyOtherWebViews = false,
): PendingThreadJump | null {
  const normalizedResNum = Math.trunc(resNum);
  if (!Number.isFinite(normalizedResNum) || normalizedResNum <= 0) {
    return null;
  }

  const jump = {
    threadUrl: normalizeThreadJumpKey(threadUrl),
    resNum: normalizedResNum,
    token: `${Date.now()}:${Math.random()}`,
    ...(targetTabId ? { targetTabId } : {}),
    ...(clearFilter ? { clearFilter } : {}),
  } satisfies PendingThreadJump;

  // 変更理由: 同一スレを既に開いている時はタブ遷移が no-op になりうるため、
  // レスジャンプ要求だけは別経路で保持しておき、後から表示された ThreadPage でも回収できるようにする。
  pendingThreadJumpByUrl.set(jump.threadUrl, jump);
  threadJumpEventTarget.dispatchEvent(
    new CustomEvent<PendingThreadJump>(THREAD_RES_JUMP_EVENT, {
      detail: jump,
    }),
  );
  if (isTauriRuntime() && targetTabId && notifyOtherWebViews) {
    // 変更理由: 切り離したタブは別WebViewでEventTargetを共有しないため、
    // 同じ要求をTauri eventでも配信して、表示先のWebViewで回収できるようにする。
    void emit(THREAD_RES_JUMP_TAURI_EVENT, jump).catch((error: unknown) => {
      logger.error("WebView間のレスジャンプ通知に失敗しました:", {
        threadUrl,
        resNum: normalizedResNum,
        error,
      });
    });
  }

  return jump;
}

export function peekPendingThreadResJump(threadUrl: string): PendingThreadJump | null {
  return pendingThreadJumpByUrl.get(normalizeThreadJumpKey(threadUrl)) ?? null;
}

export function consumePendingThreadResJump(
  threadUrl: string,
  token?: string,
): PendingThreadJump | null {
  const key = normalizeThreadJumpKey(threadUrl);
  const pendingJump = pendingThreadJumpByUrl.get(key) ?? null;
  if (!pendingJump) {
    return null;
  }
  if (token && pendingJump.token !== token) {
    return null;
  }

  pendingThreadJumpByUrl.delete(key);
  return pendingJump;
}

export function subscribeThreadResJump(listener: (jump: PendingThreadJump) => void): () => void {
  const handleJump = (event: Event) => {
    const detail = (event as CustomEvent<PendingThreadJump>).detail;
    listener(detail);
  };

  threadJumpEventTarget.addEventListener(THREAD_RES_JUMP_EVENT, handleJump);
  let disposed = false;
  let unlistenTauri: (() => void) | null = null;
  if (isTauriRuntime()) {
    void listen<unknown>(THREAD_RES_JUMP_TAURI_EVENT, ({ payload }) => {
      if (!isPendingThreadJump(payload)) {
        logger.error("WebView間のレスジャンプ要求を検証できません:", payload);
        return;
      }
      listener(payload);
    })
      .then((unlisten) => {
        if (disposed) unlisten();
        else unlistenTauri = unlisten;
      })
      .catch((error: unknown) => {
        logger.error("WebView間のレスジャンプ監視に失敗しました:", error);
      });
  }
  return () => {
    disposed = true;
    threadJumpEventTarget.removeEventListener(THREAD_RES_JUMP_EVENT, handleJump);
    unlistenTauri?.();
  };
}

function isPendingThreadJump(value: unknown): value is PendingThreadJump {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<PendingThreadJump>;
  return (
    typeof candidate.threadUrl === "string" &&
    typeof candidate.resNum === "number" &&
    Number.isInteger(candidate.resNum) &&
    candidate.resNum > 0 &&
    typeof candidate.token === "string" &&
    (candidate.targetTabId === undefined || typeof candidate.targetTabId === "string") &&
    (candidate.clearFilter === undefined || typeof candidate.clearFilter === "boolean")
  );
}
