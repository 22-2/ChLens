import { emit, listen } from "@tauri-apps/api/event";
import { isTauriRuntime } from "src/app/platform/runtime";

import {
  type CommentOverlayEvent,
  type CommentOverlayEventBus,
  MemoryCommentOverlayEventBus,
} from "../domain";

export const COMMENT_OVERLAY_EVENT_NAME = "chlens://comment-overlay-update";

/**
 * MainとOverlayは別WebViewなので、window参照ではなくTauri app eventでbatchを共有する。
 * Browser版ではMemory busへフォールバックし、Tauri APIを実行しない。
 */
export class TauriCommentOverlayEventBus implements CommentOverlayEventBus {
  async publish(event: CommentOverlayEvent): Promise<void> {
    await emit(COMMENT_OVERLAY_EVENT_NAME, event);
  }

  async subscribe(listener: (event: CommentOverlayEvent) => void): Promise<() => void> {
    return listen<CommentOverlayEvent>(COMMENT_OVERLAY_EVENT_NAME, ({ payload }) => {
      if (!isCommentOverlayEvent(payload)) {
        console.error("[ChLens] 未対応のコメントOverlay eventを受信しました:", payload);
        return;
      }
      listener(payload);
    });
  }
}

function isCommentOverlayEvent(payload: unknown): payload is CommentOverlayEvent {
  if (typeof payload !== "object" || payload === null) return false;
  const candidate = payload as {
    version?: unknown;
    type?: unknown;
    batch?: unknown;
    settings?: unknown;
    threadUrl?: unknown;
    keepSourceThreadUrl?: unknown;
  };
  if (candidate.version !== 1) return false;
  if (candidate.type === "settings") return candidate.settings != null;
  if (candidate.type === "source-filter") {
    return (
      typeof candidate.threadUrl === "string" && typeof candidate.keepSourceThreadUrl === "string"
    );
  }
  return (candidate.type === "batch" || candidate.type === "reset") && candidate.batch != null;
}

export function createCommentOverlayEventBus(): CommentOverlayEventBus {
  return isTauriRuntime() ? new TauriCommentOverlayEventBus() : new MemoryCommentOverlayEventBus();
}
