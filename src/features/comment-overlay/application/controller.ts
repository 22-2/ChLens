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

const MAX_RESPONSE_SNAPSHOT_COUNT = 8;

export interface CommentOverlayControllerSnapshot {
  state: CommentOverlayState;
  visible: boolean;
  error: string | null;
}

export interface CommentOverlayControllerDependencies {
  eventBus: CommentOverlayEventBus;
  platform: CommentOverlayWindowPlatform;
  getSettings?: () => CommentOverlaySettings;
  subscribeSettings?: (listener: () => void) => () => void;
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

  private readonly subscribeSettings: ((listener: () => void) => () => void) | null;

  private readonly listeners = new Set<() => void>();

  private readonly responseSnapshots = new Map<string, readonly IRes[]>();

  private state: CommentOverlayState = createIdleCommentOverlayState();

  private visible = false;

  private error: string | null = null;

  private snapshot: CommentOverlayControllerSnapshot = {
    state: this.state,
    visible: this.visible,
    error: this.error,
  };

  private publishQueue: Promise<void> = Promise.resolve();

  private settingsUnsubscribe: (() => void) | null = null;

  private visibilityUnsubscribe: (() => void) | null = null;

  constructor({
    eventBus,
    platform,
    getSettings,
    subscribeSettings,
  }: CommentOverlayControllerDependencies) {
    this.eventBus = eventBus;
    this.platform = platform;
    this.subscribeSettings = subscribeSettings ?? null;
    const readSettings = getSettings ?? (() => ({ ...DEFAULT_COMMENT_OVERLAY_SETTINGS }));
    // 設定の保存元が将来増えても、Mainから出るeventは必ず正規化済みの値にする。
    this.getSettings = () => normalizeCommentOverlaySettings(readSettings());
    this.subscribeToVisibility();
  }

  getSnapshot = (): CommentOverlayControllerSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getThreadResponses(threadUrl: string): readonly IRes[] | null {
    return this.responseSnapshots.get(threadUrl) ?? null;
  }

  private rememberThreadResponses(threadUrl: string, responses: readonly IRes[]): void {
    this.responseSnapshots.delete(threadUrl);
    this.responseSnapshots.set(threadUrl, responses);

    // 変更理由: スレッドを移動するたびに全レス配列をMapへ残すと、長時間利用で
    // Overlayを表示していなくてもcontroller側のsnapshotが増え続けるため、直近だけ保持する。
    while (this.responseSnapshots.size > MAX_RESPONSE_SNAPSHOT_COUNT) {
      const oldestThreadUrl = this.responseSnapshots.keys().next().value;
      if (oldestThreadUrl === undefined) break;
      this.responseSnapshots.delete(oldestThreadUrl);
    }
  }

  /** ThreadPageの確定済みsnapshotを受け取り、実況中だけ新着差分を送信する。 */
  syncThread(threadUrl: string, responses: readonly IRes[]): void {
    this.rememberThreadResponses(threadUrl, responses);
    if (this.state.status !== "running" || this.state.targetThreadUrl !== threadUrl) return;

    const result = collectNewCommentBatch(this.state, threadUrl, responses.map(toCommentResponse));
    this.state = result.state;
    if (this.state.cursor?.lastResponseNumber !== this.snapshot.state.cursor?.lastResponseNumber) {
      this.notify();
    }
    if (result.batch) {
      void this.publish({ version: 1, type: "batch", batch: result.batch }).catch(
        (error: unknown) => {
          this.reportError("[ChLens] コメントOverlay eventの送信に失敗しました:", error);
        },
      );
    }
  }

  async start(threadUrl: string, responses?: readonly IRes[]): Promise<void> {
    const snapshot = responses ?? this.getThreadResponses(threadUrl) ?? [];
    // 変更理由: 前回の一時的な送信失敗を、再試行できた開始状態へ持ち越さない。
    this.error = null;
    this.rememberThreadResponses(threadUrl, snapshot);
    this.state = startCommentOverlay(threadUrl, snapshot.map(toCommentResponse));
    this.notify();

    try {
      await this.setVisible(true);
      // Overlayが前スレの表示履歴を持っていても、開始したスレを境に表示を切り替える。
      await this.publish(createResetEvent(threadUrl, snapshot, this.getSettings()));
      this.subscribeToSettings();
    } catch (error: unknown) {
      this.unsubscribeFromSettings();
      this.state = stopCommentOverlay(this.state);
      if (this.visible) {
        try {
          // reset送信に失敗した場合も、表示だけが残って操作不能にならないよう戻す。
          await this.setVisible(false);
        } catch (rollbackError: unknown) {
          console.error(
            "[ChLens] コメント実況の開始失敗後のOverlay非表示に失敗しました:",
            rollbackError,
          );
        }
      }
      this.reportError("[ChLens] コメント実況の開始に失敗しました:", error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.unsubscribeFromSettings();
    this.error = null;
    this.state = stopCommentOverlay(this.state);
    this.notify();
    try {
      await this.setVisible(false);
    } catch (error: unknown) {
      this.reportError("[ChLens] コメント実況Overlayの停止に失敗しました:", error);
      throw error;
    }
  }

  async setVisible(visible: boolean): Promise<void> {
    if (visible === this.visible) return;

    try {
      if (visible) {
        await this.platform.show();
      } else {
        await this.platform.hide();
      }
    } catch (error: unknown) {
      this.reportError(
        `[ChLens] コメントOverlayの${visible ? "表示" : "非表示"}に失敗しました:`,
        error,
      );
      throw error;
    }

    this.visible = visible;
    this.error = null;
    this.notify();
  }

  async updateSettings(): Promise<void> {
    if (this.state.status !== "running" || this.state.targetThreadUrl == null) return;

    try {
      await this.publish({
        version: 1,
        type: "settings",
        settings: this.getSettings(),
      });
    } catch (error: unknown) {
      this.reportError("[ChLens] コメントOverlay設定の送信に失敗しました:", error);
      throw error;
    }
  }

  private notify(): void {
    this.snapshot = {
      state: this.state,
      visible: this.visible,
      error: this.error,
    };
    for (const listener of this.listeners) listener();
  }

  private reportError(message: string, error: unknown): void {
    console.error(message, error);
    this.error = message;
    this.notify();
  }

  private subscribeToSettings(): void {
    if (this.subscribeSettings == null || this.settingsUnsubscribe != null) return;

    try {
      this.settingsUnsubscribe = this.subscribeSettings(() => {
        void this.updateSettings().catch(() => undefined);
      });
    } catch (error: unknown) {
      console.error("[ChLens] コメントOverlay設定の変更監視登録に失敗しました:", error);
    }
  }

  private subscribeToVisibility(): void {
    if (this.visibilityUnsubscribe != null) return;

    void this.platform
      .watchVisibility((visible) => {
        if (this.visible === visible) return;

        // MainとOverlayは別WebViewなので、Overlayの閉じる操作後もMain側の
        // ステータスバーから正しく再表示できるよう、native状態をcontrollerへ戻す。
        this.visible = visible;
        this.notify();
      })
      .then((unsubscribe) => {
        this.visibilityUnsubscribe = unsubscribe;
      })
      .catch((error: unknown) => {
        console.error("[ChLens] コメントOverlayの表示状態監視開始に失敗しました:", error);
      });
  }

  private unsubscribeFromSettings(): void {
    const unsubscribe = this.settingsUnsubscribe;
    this.settingsUnsubscribe = null;
    if (unsubscribe == null) return;

    try {
      unsubscribe();
    } catch (error: unknown) {
      console.error("[ChLens] コメントOverlay設定の変更監視解除に失敗しました:", error);
    }
  }

  private publish(event: CommentOverlayEvent): Promise<void> {
    const next = this.publishQueue.then(() => this.eventBus.publish(event));
    // 送信失敗後も次の新着eventを送れるよう、内部queueだけは解決状態へ戻す。
    this.publishQueue = next.catch(() => undefined);
    return next;
  }
}
