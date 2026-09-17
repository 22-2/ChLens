import { emitTo, listen } from "@tauri-apps/api/event";
import { isTauriRuntime } from "src/app/platform/runtime";

import type { CommentCandidate } from "../domain";
import { COMMENT_OVERLAY_WINDOW_LABEL } from "./tauri";

export const ARCHIVE_REPLAY_OVERLAY_EVENT_NAME = "chlens://archive-replay-overlay";

export type ArchiveReplayOverlayEvent =
  | {
      version: 1;
      type: "reset";
      sessionId: string;
    }
  | {
      version: 1;
      type: "comment";
      sessionId: string;
      comment: CommentCandidate;
    }
  | {
      version: 1;
      type: "playback";
      sessionId: string;
      playing: boolean;
    }
  | {
      version: 1;
      type: "stop";
      sessionId: string;
    };

export interface ArchiveReplayOverlayEventBus {
  publish(event: ArchiveReplayOverlayEvent): Promise<void>;
  subscribe(listener: (event: ArchiveReplayOverlayEvent) => void): Promise<() => void>;
}

/** Mainのlive実況とは別のevent名で、再生窓から表示専用Overlayへ通知する。 */
export class TauriArchiveReplayOverlayEventBus implements ArchiveReplayOverlayEventBus {
  async publish(event: ArchiveReplayOverlayEvent): Promise<void> {
    await emitTo(COMMENT_OVERLAY_WINDOW_LABEL, ARCHIVE_REPLAY_OVERLAY_EVENT_NAME, event);
  }

  async subscribe(listener: (event: ArchiveReplayOverlayEvent) => void): Promise<() => void> {
    return listen<unknown>(ARCHIVE_REPLAY_OVERLAY_EVENT_NAME, ({ payload }) => {
      if (!isArchiveReplayOverlayEvent(payload)) {
        console.error("[ArchiveReplay] 不正なOverlay eventを受信しました:", payload);
        return;
      }
      listener(payload);
    });
  }
}

/** Storybook・単体テストではnative eventを起動せず、同じ契約を同期的に検証する。 */
export class MemoryArchiveReplayOverlayEventBus implements ArchiveReplayOverlayEventBus {
  readonly events: ArchiveReplayOverlayEvent[] = [];
  private readonly listeners = new Set<(event: ArchiveReplayOverlayEvent) => void>();

  async publish(event: ArchiveReplayOverlayEvent): Promise<void> {
    this.events.push(event);
    for (const listener of this.listeners) listener(event);
  }

  async subscribe(listener: (event: ArchiveReplayOverlayEvent) => void): Promise<() => void> {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export function createArchiveReplayOverlayEventBus(): ArchiveReplayOverlayEventBus {
  return isTauriRuntime()
    ? new TauriArchiveReplayOverlayEventBus()
    : new MemoryArchiveReplayOverlayEventBus();
}

export function isArchiveReplayOverlayEvent(
  payload: unknown,
): payload is ArchiveReplayOverlayEvent {
  if (typeof payload !== "object" || payload === null) return false;
  const candidate = payload as {
    version?: unknown;
    type?: unknown;
    sessionId?: unknown;
    comment?: unknown;
    playing?: unknown;
  };
  if (candidate.version !== 1 || typeof candidate.sessionId !== "string") return false;
  if (candidate.type === "reset" || candidate.type === "stop") return true;
  if (candidate.type === "playback") {
    return typeof candidate.playing === "boolean";
  }
  return candidate.type === "comment" && candidate.comment != null;
}
