import type { LiveThreadSessionEvent } from "./session";
import type { LiveBoardSessionEvent } from "./board-session";
import type { LiveBoardSnapshot, LiveThreadSnapshot } from "./cache";

export const LIVE_THREAD_UPDATE_EVENT = "chlens-live://thread-update";

export interface LiveThreadErrorPayload {
  name: string;
  message: string;
  status?: number;
}

export type LiveThreadEvent =
  | {
      type: "snapshot";
      threadUrl: string;
      changed: boolean;
      snapshot: LiveThreadSnapshot;
    }
  | {
      type: "not-modified";
      threadUrl: string;
      updatedAt: number;
    }
  | {
      type: "error";
      threadUrl: string;
      error: LiveThreadErrorPayload;
      snapshot?: LiveThreadSnapshot;
    };

export type LiveBoardEvent =
  | {
      type: "board-snapshot";
      boardUrl: string;
      changed: boolean;
      snapshot: LiveBoardSnapshot;
    }
  | {
      type: "board-not-modified";
      boardUrl: string;
      updatedAt: number;
    }
  | {
      type: "board-error";
      boardUrl: string;
      error: LiveThreadErrorPayload;
      snapshot?: LiveBoardSnapshot;
    };

export type LiveEvent = LiveThreadEvent | LiveBoardEvent;

export interface LiveEventBus {
  publish(event: LiveEvent): Promise<void>;
  subscribe(listener: (event: LiveEvent) => void): Promise<() => void>;
}

function serializeError(error: unknown): LiveThreadErrorPayload {
  if (error instanceof Error) {
    const status =
      typeof error === "object" && error !== null && "status" in error ? error.status : undefined;
    return {
      name: error.name,
      message: error.message,
      ...(typeof status === "number" ? { status } : {}),
    };
  }
  return { name: "UnknownError", message: String(error) };
}

export function toLiveThreadEvent(
  threadUrl: string,
  event: LiveThreadSessionEvent,
): LiveThreadEvent {
  switch (event.type) {
    case "snapshot":
      return { type: "snapshot", threadUrl, changed: event.changed, snapshot: event.snapshot };
    case "not-modified":
      return { type: "not-modified", threadUrl, updatedAt: event.snapshot.updatedAt };
    case "error":
      return {
        type: "error",
        threadUrl,
        error: serializeError(event.error),
        snapshot: event.snapshot,
      };
  }
}

export function toLiveBoardEvent(boardUrl: string, event: LiveBoardSessionEvent): LiveBoardEvent {
  switch (event.type) {
    case "snapshot":
      return { type: "board-snapshot", boardUrl, changed: event.changed, snapshot: event.snapshot };
    case "not-modified":
      return { type: "board-not-modified", boardUrl, updatedAt: event.snapshot.updatedAt };
    case "error":
      return {
        type: "board-error",
        boardUrl,
        error: serializeError(event.error),
        snapshot: event.snapshot,
      };
  }
}

/**
 * Process-local bus used by browser previews and tests.
 *
 * Keeping this implementation in the same contract lets Main and Overlay be exercised without
 * requiring a Tauri runtime, while the production bus can use app-wide native events.
 */
export class MemoryLiveEventBus implements LiveEventBus {
  readonly events: LiveEvent[] = [];
  private readonly listeners = new Set<(event: LiveEvent) => void>();

  async publish(event: LiveEvent): Promise<void> {
    this.events.push(event);
    for (const listener of this.listeners) listener(event);
  }

  async subscribe(listener: (event: LiveEvent) => void): Promise<() => void> {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
