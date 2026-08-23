import type { LiveThreadSessionEvent } from "./session";
import type { LiveThreadSnapshot } from "./cache";

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

export interface LiveEventBus {
  publish(event: LiveThreadEvent): Promise<void>;
  subscribe(listener: (event: LiveThreadEvent) => void): Promise<() => void>;
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

/**
 * Process-local bus used by browser previews and tests.
 *
 * Keeping this implementation in the same contract lets Main and Overlay be exercised without
 * requiring a Tauri runtime, while the production bus can use app-wide native events.
 */
export class MemoryLiveEventBus implements LiveEventBus {
  readonly events: LiveThreadEvent[] = [];
  private readonly listeners = new Set<(event: LiveThreadEvent) => void>();

  async publish(event: LiveThreadEvent): Promise<void> {
    this.events.push(event);
    for (const listener of this.listeners) listener(event);
  }

  async subscribe(listener: (event: LiveThreadEvent) => void): Promise<() => void> {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
