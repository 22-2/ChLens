import type { IRes } from "src/service-container/interfaces";
import {
  DEFAULT_COMMENT_OVERLAY_SETTINGS,
  collectNewCommentBatch,
  createIdleCommentOverlayState,
  latestResponseNumber,
  startCommentOverlay,
  stopCommentOverlay,
  normalizeCommentOverlaySettings,
  type CommentOverlayEvent,
  type CommentOverlayState,
  type CommentResponse,
} from "../domain";
import type { CommentOverlaySettings } from "../domain";
import type { CommentOverlayEventBus } from "../domain/events";
import type { CommentOverlayWindowPlatform } from "../platform/types";

export interface CommentOverlayControllerSnapshot {
  state: CommentOverlayState;
  visible: boolean;
}

export interface CommentOverlayControllerDependencies {
  eventBus: CommentOverlayEventBus;
  platform: CommentOverlayWindowPlatform;
  getSettings?: () => CommentOverlaySettings;
}

function toCommentResponse(response: IRes): CommentResponse {
  return {
    num: response.num,
    name: response.name,
    message: response.message,
    ...(response.date ? { date: response.date } : {}),
    ...(response.id ? { id: response.id } : {}),
    ...(response.ng != null ? { ng: response.ng } : {}),
    ...(response.class ? { class: response.class } : {}),
  };
}

function createResetEvent(
  threadUrl: string,
  responses: readonly IRes[],
  settings: CommentOverlaySettings,
): CommentOverlayEvent {
  const latest = latestResponseNumber(responses.map(toCommentResponse));
  return {
    version: 1,
    type: "reset",
    settings,
    batch: {
      threadUrl,
      comments: [],
      latestResponseNumber: latest,
    },
  };
}

/**
 * ThreadPageとOverlayの間に置く、実況対象と差分送信だけを担当するcontroller。
 * 取得・NG判定・描画は既存の各層へ残し、同じレスを別経路で二重取得しない境界にする。
 */
export class CommentOverlayController {
  private readonly eventBus: CommentOverlayEventBus;

  private readonly platform: CommentOverlayWindowPlatform;

  private readonly getSettings: () => CommentOverlaySettings;

  private readonly listeners = new Set<() => void>();

  private readonly responseSnapshots = new Map<string, readonly IRes[]>();

  private state: CommentOverlayState = createIdleCommentOverlayState();

  private visible = false;

  private snapshot: CommentOverlayControllerSnapshot = {
    state: this.state,
    visible: this.visible,
  };

  private publishQueue: Promise<void> = Promise.resolve();

  constructor({ eventBus, platform, getSettings }: CommentOverlayControllerDependencies) {
    this.eventBus = eventBus;
    this.platform = platform;
    const readSettings = getSettings ?? (() => ({ ...DEFAULT_COMMENT_OVERLAY_SETTINGS }));
    // 設定の保存元が将来増えても、Mainから出るeventは必ず正規化済みの値にする。
    this.getSettings = () => normalizeCommentOverlaySettings(readSettings());
  }

  getSnapshot = (): CommentOverlayControllerSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getThreadResponses(threadUrl: string): readonly IRes[] | null {
    return this.responseSnapshots.get(threadUrl) ?? null;
  }

  /** ThreadPageの確定済みsnapshotを受け取り、実況中だけ新着差分を送信する。 */
  syncThread(threadUrl: string, responses: readonly IRes[]): void {
    this.responseSnapshots.set(threadUrl, responses);
    if (this.state.status !== "running" || this.state.targetThreadUrl !== threadUrl) return;

    const result = collectNewCommentBatch(this.state, threadUrl, responses.map(toCommentResponse));
    this.state = result.state;
    if (this.state.cursor?.lastResponseNumber !== this.snapshot.state.cursor?.lastResponseNumber) {
      this.notify();
    }
    if (result.batch) {
      void this.publish({ version: 1, type: "batch", batch: result.batch }).catch(
        (error: unknown) => {
          console.error("[ChLens] コメントOverlay eventの送信に失敗しました:", error);
        },
      );
    }
  }

  async start(threadUrl: string, responses?: readonly IRes[]): Promise<void> {
    const snapshot = responses ?? this.getThreadResponses(threadUrl) ?? [];
    this.responseSnapshots.set(threadUrl, snapshot);
    this.state = startCommentOverlay(threadUrl, snapshot.map(toCommentResponse));
    this.notify();

    try {
      await this.setVisible(true);
      // Overlayが前スレの表示履歴を持っていても、開始したスレを境に表示を切り替える。
      await this.publish(createResetEvent(threadUrl, snapshot, this.getSettings()));
    } catch (error: unknown) {
      console.error("[ChLens] コメント実況の開始に失敗しました:", error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.state = stopCommentOverlay(this.state);
    this.notify();
    try {
      await this.setVisible(false);
    } catch (error: unknown) {
      console.error("[ChLens] コメント実況Overlayの停止に失敗しました:", error);
      throw error;
    }
  }

  async setVisible(visible: boolean): Promise<void> {
    if (visible === this.visible) return;

    if (visible) {
      await this.platform.show();
    } else {
      await this.platform.hide();
    }
    this.visible = visible;
    this.notify();
  }

  private notify(): void {
    this.snapshot = {
      state: this.state,
      visible: this.visible,
    };
    for (const listener of this.listeners) listener();
  }

  private publish(event: CommentOverlayEvent): Promise<void> {
    const next = this.publishQueue.then(() => this.eventBus.publish(event));
    // 送信失敗後も次の新着eventを送れるよう、内部queueだけは解決状態へ戻す。
    this.publishQueue = next.catch(() => undefined);
    return next;
  }
}
