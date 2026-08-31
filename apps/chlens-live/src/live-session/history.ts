import {
  ChURL,
  type ChFetchMetadata,
  type ChFetchResult,
  type HttpRequest,
  type ThreadData,
} from "@chlen/ch-lib";
import type { LiveThreadSnapshot } from "./cache";
import { LiveSessionBusyError, type LiveSessionLease, type LiveSessionOwner } from "./owner";

export type LiveThreadSourceKind = "live" | "archive";

/**
 * Archive detection belongs to the shared URL model so that playback does not grow a second
 * set of host/path regular expressions beside ChURL.
 */
export function classifyLiveThreadSource(url: string): LiveThreadSourceKind {
  return new ChURL(url).isArchive ? "archive" : "live";
}

/** Narrow source contract for playback and future history adapters. */
export interface LivePlaybackSource {
  loadThreadWithMetadata(url: string, request?: HttpRequest): Promise<ChFetchResult<ThreadData>>;
}

export interface LivePlaybackCursor {
  startPost: number;
  endPost?: number;
}

export interface LivePlaybackSnapshot {
  mode: "playback";
  sourceKind: LiveThreadSourceKind;
  url: string;
  data: ThreadData;
  metadata: ChFetchMetadata;
  updatedAt: number;
  cursor: LivePlaybackCursor;
  totalResCount: number;
}

export interface LiveThreadPlaybackSessionOptions {
  source?: LivePlaybackSource;
  snapshot?: LiveThreadSnapshot;
  owner?: LiveSessionOwner;
  cursor?: LivePlaybackCursor;
}

function validateCursor(cursor: LivePlaybackCursor): LivePlaybackCursor {
  if (!Number.isInteger(cursor.startPost) || cursor.startPost < 1) {
    throw new RangeError("Playback startPost must be a positive integer");
  }
  if (
    cursor.endPost !== undefined &&
    (!Number.isInteger(cursor.endPost) || cursor.endPost < cursor.startPost)
  ) {
    throw new RangeError("Playback endPost must be an integer greater than or equal to startPost");
  }
  return { ...cursor };
}

function projectThreadData(data: ThreadData, cursor: LivePlaybackCursor): ThreadData {
  return {
    title: data.title,
    posts: data.posts.filter(
      (post) =>
        post.number >= cursor.startPost &&
        (cursor.endPost === undefined || post.number <= cursor.endPost),
    ),
  };
}

export class LiveThreadPlaybackSession {
  private readonly source?: LivePlaybackSource;
  private readonly owner?: LiveSessionOwner;
  private readonly initialSnapshot?: LiveThreadSnapshot;
  private cursor: LivePlaybackCursor;
  private fullSnapshot: LiveThreadSnapshot | null = null;
  private playbackSnapshot: LivePlaybackSnapshot | null = null;
  private requestController: AbortController | null = null;
  private loadPromise: Promise<LivePlaybackSnapshot | null> | null = null;
  private lease: LiveSessionLease | null = null;
  private stopped = false;

  constructor(
    private readonly threadUrl: string,
    options: LiveThreadPlaybackSessionOptions,
  ) {
    this.source = options.source;
    this.owner = options.owner;
    this.initialSnapshot = options.snapshot;
    this.cursor = validateCursor(options.cursor ?? { startPost: 1 });

    if (this.initialSnapshot && this.initialSnapshot.url !== threadUrl) {
      throw new Error("Playback snapshot URL does not match the requested thread URL");
    }
    if (!this.initialSnapshot && !this.source) {
      throw new Error("Playback requires a source or a cached thread snapshot");
    }
  }

  get isRunning(): boolean {
    return this.loadPromise !== null || this.lease !== null;
  }

  get snapshot(): LivePlaybackSnapshot | null {
    return this.playbackSnapshot;
  }

  /**
   * Loads exactly one immutable input snapshot. There is intentionally no timer or conditional
   * validator here: a playback run must not mutate while the user is replaying old responses.
   */
  async load(): Promise<LivePlaybackSnapshot | null> {
    if (this.stopped) return null;
    if (this.playbackSnapshot) return this.playbackSnapshot;
    if (this.loadPromise) return this.loadPromise;

    this.acquireLease();
    const promise = this.loadInternal();
    this.loadPromise = promise;
    try {
      return await promise;
    } finally {
      if (this.loadPromise === promise) this.loadPromise = null;
    }
  }

  /** Changes the visible response window without fetching or starting a polling loop. */
  seek(cursor: LivePlaybackCursor): LivePlaybackSnapshot | null {
    this.cursor = validateCursor(cursor);
    if (!this.fullSnapshot) return null;
    this.playbackSnapshot = this.createPlaybackSnapshot(this.fullSnapshot);
    return this.playbackSnapshot;
  }

  stop(): void {
    this.stopped = true;
    this.requestController?.abort();
    this.requestController = null;
    this.releaseLease();
  }

  private async loadInternal(): Promise<LivePlaybackSnapshot | null> {
    try {
      const fullSnapshot = this.initialSnapshot ?? (await this.loadFromSource());
      if (!fullSnapshot || this.stopped) return null;
      this.fullSnapshot = fullSnapshot;
      this.playbackSnapshot = this.createPlaybackSnapshot(fullSnapshot);
      return this.playbackSnapshot;
    } catch (error: unknown) {
      if (this.requestController?.signal.aborted && this.stopped) return null;
      console.error(`[Chlens Live] playback load failed: ${this.threadUrl}`, error);
      this.releaseLease();
      throw error;
    } finally {
      this.requestController = null;
    }
  }

  private async loadFromSource(): Promise<LiveThreadSnapshot> {
    const controller = new AbortController();
    this.requestController = controller;
    const result = await this.source!.loadThreadWithMetadata(this.threadUrl, {
      signal: controller.signal,
    });
    return {
      url: this.threadUrl,
      data: result.data,
      metadata: result.metadata,
      updatedAt: Date.now(),
    };
  }

  private createPlaybackSnapshot(fullSnapshot: LiveThreadSnapshot): LivePlaybackSnapshot {
    const data = projectThreadData(fullSnapshot.data, this.cursor);
    return {
      mode: "playback",
      sourceKind: classifyLiveThreadSource(fullSnapshot.url),
      url: fullSnapshot.url,
      data,
      metadata: { ...fullSnapshot.metadata, parsedResCount: data.posts.length },
      updatedAt: fullSnapshot.updatedAt,
      cursor: { ...this.cursor },
      totalResCount: fullSnapshot.data.posts.length,
    };
  }

  private acquireLease(): void {
    if (this.lease || !this.owner) return;
    const lease = this.owner.tryAcquire("playback");
    if (!lease) {
      throw new LiveSessionBusyError("playback", this.owner.currentMode ?? "live");
    }
    this.lease = lease;
  }

  private releaseLease(): void {
    this.lease?.release();
    this.lease = null;
  }
}
