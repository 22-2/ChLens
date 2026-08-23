import { HttpStatusError, type ThreadData } from "@chlen/ch-lib";
import type { ChLensLiveSource } from "./source";
import { MemoryLiveThreadCache, type LiveThreadCache, type LiveThreadSnapshot } from "./cache";
import { toLiveThreadEvent, type LiveEventBus } from "./events";

export type LiveThreadSessionEvent =
  | { type: "snapshot"; changed: boolean; snapshot: LiveThreadSnapshot }
  | { type: "not-modified"; snapshot: LiveThreadSnapshot }
  | { type: "error"; error: unknown; snapshot?: LiveThreadSnapshot };

export interface LiveThreadSessionOptions {
  source: ChLensLiveSource;
  cache?: LiveThreadCache;
  eventBus?: LiveEventBus;
  intervalMs?: number;
}

export type LiveThreadSessionListener = (event: LiveThreadSessionEvent) => void;

function threadDataChanged(previous: ThreadData, current: ThreadData): boolean {
  // JSON is sufficient for parser output, whose property order is stable, and keeps this
  // boundary independent from the eventual shared Thread model.
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
  private running = false;

  constructor(
    private readonly threadUrl: string,
    private readonly options: LiveThreadSessionOptions,
  ) {
    this.cache = options.cache ?? new MemoryLiveThreadCache();
    this.intervalMs = Math.max(1_000, options.intervalMs ?? 15_000);
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
}
