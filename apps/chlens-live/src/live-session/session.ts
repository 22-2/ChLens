import { HttpStatusError, type ThreadData } from "@chlen/ch-lib";
import type { ChLensLiveSource } from "./source";
import { MemoryLiveThreadCache, type LiveThreadCache, type LiveThreadSnapshot } from "./cache";
import { toLiveThreadEvent, type LiveEventBus } from "./events";
import { LiveSessionBusyError, type LiveSessionLease, type LiveSessionOwner } from "./owner";

export type LiveThreadSessionEvent =
  | { type: "snapshot"; changed: boolean; snapshot: LiveThreadSnapshot }
  | { type: "not-modified"; snapshot: LiveThreadSnapshot }
  | { type: "error"; error: unknown; snapshot?: LiveThreadSnapshot };

export interface LiveThreadSessionOptions {
  source: ChLensLiveSource;
  cache?: LiveThreadCache;
  eventBus?: LiveEventBus;
  owner?: LiveSessionOwner;
  intervalMs?: number;
}

export type LiveThreadSessionListener = (event: LiveThreadSessionEvent) => void;

function threadDataChanged(previous: ThreadData, current: ThreadData): boolean {
// 解析結果はプロパティ順が安定したJSONで十分であり、将来の共有Threadモデルから
// この境界を独立させられる。
  return JSON.stringify(previous) !== JSON.stringify(current);
}

function conditionalHeaders(snapshot: LiveThreadSnapshot | null): Record<string, string> {
  if (!snapshot) return {};

  const headers: Record<string, string> = {};
  if (snapshot.metadata.etag) headers["If-None-Match"] = snapshot.metadata.etag;
  if (snapshot.metadata.lastModified) {
    headers["If-Modified-Since"] = snapshot.metadata.lastModified;
  }
  return headers;
}

export class LiveThreadSession {
  private readonly cache: LiveThreadCache;
  private readonly intervalMs: number;
  private readonly listeners = new Set<LiveThreadSessionListener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private requestController: AbortController | null = null;
  private refreshPromise: Promise<LiveThreadSnapshot | null> | null = null;
  private lease: LiveSessionLease | null = null;
  private running = false;

  constructor(
    private readonly threadUrl: string,
    private readonly options: LiveThreadSessionOptions,
  ) {
    this.cache = options.cache ?? new MemoryLiveThreadCache();
    // Thread本文は一覧より更新頻度を上げ、実況表示の遅延を10秒以内に抑える。
    this.intervalMs = Math.max(1_000, options.intervalMs ?? 10_000);
  }

  get isRunning(): boolean {
    return this.running;
  }

  subscribe(listener: LiveThreadSessionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async start(): Promise<void> {
    if (this.running) return;
    const lease = this.options.owner?.tryAcquire("live");
    if (this.options.owner && !lease) {
      throw new LiveSessionBusyError("live", this.options.owner.currentMode ?? "playback");
    }
    this.lease = lease ?? null;
    this.running = true;
    try {
      await this.refresh();
    } catch (error: unknown) {
      this.running = false;
      this.releaseLease();
      throw error;
    }
// 初回リクエスト中にstop()が呼ばれることがあるため、呼び出し側がLiveセッションを
// 明示的に解放した後にタイマーを復活させない。
    if (!this.running) return;
    this.timer = setInterval(() => {
      void this.refresh();
    }, this.intervalMs);
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.requestController?.abort();
    this.requestController = null;
    this.releaseLease();
  }

  async refresh(): Promise<LiveThreadSnapshot | null> {
    if (this.refreshPromise) return this.refreshPromise;

    const promise = this.refreshInternal();
    this.refreshPromise = promise;
    try {
      return await promise;
    } finally {
      if (this.refreshPromise === promise) this.refreshPromise = null;
    }
  }

  private async refreshInternal(): Promise<LiveThreadSnapshot | null> {
    const previous = await this.cache.get(this.threadUrl);
    const controller = new AbortController();
    this.requestController = controller;

    try {
      const result = await this.options.source.loadThreadWithMetadata(this.threadUrl, {
        headers: conditionalHeaders(previous),
        signal: controller.signal,
      });
      const snapshot: LiveThreadSnapshot = {
        url: this.threadUrl,
        data: result.data,
        metadata: result.metadata,
        updatedAt: Date.now(),
      };
      await this.cache.set(this.threadUrl, snapshot);
      this.emit({
        type: "snapshot",
        changed: previous ? threadDataChanged(previous.data, snapshot.data) : true,
        snapshot,
      });
      return snapshot;
    } catch (error: unknown) {
      if (error instanceof HttpStatusError && error.status === 304 && previous) {
        this.emit({ type: "not-modified", snapshot: previous });
        return previous;
      }
      if (controller.signal.aborted && !this.running) return previous;

      console.error(`[Chlens Live] thread refresh failed: ${this.threadUrl}`, error);
      this.emit({ type: "error", error, snapshot: previous ?? undefined });
      return previous;
    } finally {
      if (this.requestController === controller) this.requestController = null;
    }
  }

  private emit(event: LiveThreadSessionEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error: unknown) {
        console.error("[Chlens Live] thread session listener failed:", error);
      }
    }
    if (this.options.eventBus) {
      void this.options.eventBus
        .publish(toLiveThreadEvent(this.threadUrl, event))
        .catch((error: unknown) => {
          console.error("[Chlens Live] thread event publish failed:", error);
        });
    }
  }

  private releaseLease(): void {
    this.lease?.release();
    this.lease = null;
  }
}
