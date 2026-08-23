import { HttpStatusError } from "@chlen/ch-lib";
import type { ChLensLiveSource } from "./source";
import { MemoryLiveBoardCache, type LiveBoardCache, type LiveBoardSnapshot } from "./cache";
import { toLiveBoardEvent, type LiveEventBus } from "./events";

export type LiveBoardSessionEvent =
  | { type: "snapshot"; changed: boolean; snapshot: LiveBoardSnapshot }
  | { type: "not-modified"; snapshot: LiveBoardSnapshot }
  | { type: "error"; error: unknown; snapshot?: LiveBoardSnapshot };

export interface LiveBoardSessionOptions {
  source: ChLensLiveSource;
  cache?: LiveBoardCache;
  eventBus?: LiveEventBus;
  intervalMs?: number;
}

export type LiveBoardSessionListener = (event: LiveBoardSessionEvent) => void;

function conditionalHeaders(snapshot: LiveBoardSnapshot | null): Record<string, string> {
  if (!snapshot) return {};

  const headers: Record<string, string> = {};
  if (snapshot.metadata.etag) headers["If-None-Match"] = snapshot.metadata.etag;
  if (snapshot.metadata.lastModified) {
    headers["If-Modified-Since"] = snapshot.metadata.lastModified;
  }
  return headers;
}

function boardChanged(previous: LiveBoardSnapshot, current: LiveBoardSnapshot): boolean {
  // Subject parsing returns stable plain objects, so this comparison catches title/count changes
  // without making the cache depend on a UI-specific row model.
  return JSON.stringify(previous.data) !== JSON.stringify(current.data);
}

export class LiveBoardSession {
  private readonly cache: LiveBoardCache;
  private readonly intervalMs: number;
  private readonly listeners = new Set<LiveBoardSessionListener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private requestController: AbortController | null = null;
  private refreshPromise: Promise<LiveBoardSnapshot | null> | null = null;
  private running = false;

  constructor(
    private readonly boardUrl: string,
    private readonly options: LiveBoardSessionOptions,
  ) {
    this.cache = options.cache ?? new MemoryLiveBoardCache();
    this.intervalMs = Math.max(1_000, options.intervalMs ?? 30_000);
  }

  get isRunning(): boolean {
    return this.running;
  }

  subscribe(listener: LiveBoardSessionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    await this.refresh();
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
  }

  async refresh(): Promise<LiveBoardSnapshot | null> {
    if (this.refreshPromise) return this.refreshPromise;

    const promise = this.refreshInternal();
    this.refreshPromise = promise;
    try {
      return await promise;
    } finally {
      if (this.refreshPromise === promise) this.refreshPromise = null;
    }
  }

  private async refreshInternal(): Promise<LiveBoardSnapshot | null> {
    const previous = await this.cache.get(this.boardUrl);
    const controller = new AbortController();
    this.requestController = controller;

    try {
      const result = await this.options.source.loadBoardWithMetadata(this.boardUrl, {
        headers: conditionalHeaders(previous),
        signal: controller.signal,
      });
      const snapshot: LiveBoardSnapshot = {
        url: this.boardUrl,
        data: result.data,
        metadata: result.metadata,
        updatedAt: Date.now(),
      };
      await this.cache.set(this.boardUrl, snapshot);
      this.emit({
        type: "snapshot",
        changed: previous ? boardChanged(previous, snapshot) : true,
        snapshot,
      });
      return snapshot;
    } catch (error: unknown) {
      if (error instanceof HttpStatusError && error.status === 304 && previous) {
        this.emit({ type: "not-modified", snapshot: previous });
        return previous;
      }
      if (controller.signal.aborted && !this.running) return previous;

      console.error(`[Chlens Live] board refresh failed: ${this.boardUrl}`, error);
      this.emit({ type: "error", error, snapshot: previous ?? undefined });
      return previous;
    } finally {
      if (this.requestController === controller) this.requestController = null;
    }
  }

  private emit(event: LiveBoardSessionEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error: unknown) {
        console.error("[Chlens Live] board session listener failed:", error);
      }
    }
    if (this.options.eventBus) {
      void this.options.eventBus
        .publish(toLiveBoardEvent(this.boardUrl, event))
        .catch((error: unknown) => {
          console.error("[Chlens Live] board event publish failed:", error);
        });
    }
  }
}
