import { describe, expect, it, vi } from "vite-plus/test";
import { emit, listen } from "@tauri-apps/api/event";
import { LIVE_THREAD_UPDATE_EVENT, MemoryLiveEventBus, type LiveEvent } from "./events";
import { TauriLiveEventBus } from "./tauri-events";

vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(),
  listen: vi.fn(),
}));

const event: LiveEvent = {
  type: "not-modified",
  threadUrl: "https://bbs.eddibb.cc/liveedge/1000000001/",
  updatedAt: 1,
};

describe("Live thread event contract", () => {
  it("delivers the same event to process-local subscribers", async () => {
    const bus = new MemoryLiveEventBus();
    const received: LiveEvent[] = [];
    const unsubscribe = await bus.subscribe((next) => received.push(next));

    await bus.publish(event);
    unsubscribe();
    await bus.publish({ ...event, updatedAt: 2 });

    expect(bus.events).toEqual([event, { ...event, updatedAt: 2 }]);
    expect(received).toEqual([event]);
  });

  it("publishes and subscribes through the Tauri app-wide event", async () => {
    const unlisten = vi.fn();
    vi.mocked(emit).mockResolvedValueOnce(undefined);
    vi.mocked(listen).mockResolvedValueOnce(unlisten);
    const bus = new TauriLiveEventBus();
    const listener = vi.fn();

    await bus.publish(event);
    const unsubscribe = await bus.subscribe(listener);
    unsubscribe();

    expect(emit).toHaveBeenCalledWith(LIVE_THREAD_UPDATE_EVENT, event);
    expect(listen).toHaveBeenCalledWith(LIVE_THREAD_UPDATE_EVENT, expect.any(Function));
    expect(unlisten).toHaveBeenCalledOnce();
  });
});
