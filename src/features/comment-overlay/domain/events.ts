import type { CommentBatch } from "./comment-types";
import type { CommentOverlaySettings } from "./settings";

export type CommentOverlayEvent =
  | {
      version: 1;
      type: "batch";
      batch: CommentBatch;
    }
  | {
      version: 1;
      type: "reset";
      batch: CommentBatch;
      settings?: CommentOverlaySettings;
    }
  | {
      version: 1;
      type: "settings";
      settings: CommentOverlaySettings;
    }
  | {
      version: 1;
      type: "source-filter";
      /** Overlayのストリームを識別する開始元スレッド。 */
      threadUrl: string;
      /** 本流として残す取得元スレッド。 */
      keepSourceThreadUrl: string;
    };

export interface CommentOverlayEventBus {
  publish(event: CommentOverlayEvent): Promise<void>;
  subscribe(listener: (event: CommentOverlayEvent) => void): Promise<() => void>;
}

/**
 * StorybookとdomainテストでTauriを起動せずイベント契約を確認するためのprocess-local bus。
 * 本番のTauri event adapterは同じCommentOverlayEventを送受信する。
 */
export class MemoryCommentOverlayEventBus implements CommentOverlayEventBus {
  readonly events: CommentOverlayEvent[] = [];
  private readonly listeners = new Set<(event: CommentOverlayEvent) => void>();

  async publish(event: CommentOverlayEvent): Promise<void> {
    this.events.push(event);
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  async subscribe(listener: (event: CommentOverlayEvent) => void): Promise<() => void> {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
