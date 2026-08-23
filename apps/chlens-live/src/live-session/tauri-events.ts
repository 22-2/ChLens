import { emit, listen } from "@tauri-apps/api/event";
import { LIVE_THREAD_UPDATE_EVENT, type LiveEventBus, type LiveThreadEvent } from "./events";

/**
 * App-wide event bridge for Main and Overlay.
 *
 * Tauri events are used instead of direct window references so the session can own fetching while
 * either frontend consumes the same serializable snapshot contract.
 */
export class TauriLiveEventBus implements LiveEventBus {
  async publish(event: LiveThreadEvent): Promise<void> {
    await emit(LIVE_THREAD_UPDATE_EVENT, event);
  }

  async subscribe(listener: (event: LiveThreadEvent) => void): Promise<() => void> {
    return listen<LiveThreadEvent>(LIVE_THREAD_UPDATE_EVENT, ({ payload }) => listener(payload));
  }
}
