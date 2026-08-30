import { emit, listen } from "@tauri-apps/api/event";
import {
  MemoryCommentOverlayEventBus,
  type CommentOverlayEvent,
  type CommentOverlayEventBus,
} from "../domain";
import { isTauriRuntime } from "src/app/platform/runtime";

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
  const candidate = payload as Partial<CommentOverlayEvent>;
  return (
    candidate.version === 1 &&
    (candidate.type === "batch" || candidate.type === "reset") &&
    candidate.batch != null
  );
}

export function createCommentOverlayEventBus(): CommentOverlayEventBus {
  return isTauriRuntime() ? new TauriCommentOverlayEventBus() : new MemoryCommentOverlayEventBus();
}
