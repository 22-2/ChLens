import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { CommentOverlayEvent } from "../domain";

const tauriEventMocks = vi.hoisted(() => ({
  emit: vi.fn(async (_eventName: string, _payload: unknown) => undefined),
  listen: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  emit: tauriEventMocks.emit,
  listen: tauriEventMocks.listen,
}));

import { COMMENT_OVERLAY_EVENT_NAME, TauriCommentOverlayEventBus } from "./events";

const batchEvent: CommentOverlayEvent = {
  version: 1,
  type: "batch",
  batch: {
    threadUrl: "https://example.test/live/1",
    comments: [
      {
        responseNumber: 1,
        text: "実況レス",
        author: "名無し",
      },
    ],
    latestResponseNumber: 1,
  },
};

const settingsEvent: CommentOverlayEvent = {
  version: 1,
  type: "settings",
  settings: {
    durationSeconds: 6,
    fontSize: 24,
    opacity: 0.5,
    maxQueueSize: 32,
  },
};

describe("TauriCommentOverlayEventBus", () => {
  beforeEach(() => {
    tauriEventMocks.emit.mockClear();
    tauriEventMocks.listen.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("共通のevent名とpayloadでTauriへ送信する", async () => {
    const bus = new TauriCommentOverlayEventBus();

    await bus.publish(batchEvent);

    expect(tauriEventMocks.emit).toHaveBeenCalledWith(COMMENT_OVERLAY_EVENT_NAME, batchEvent);
  });

  it("契約に合うpayloadだけを購読者へ渡す", async () => {
    let registeredHandler: ((event: { payload: unknown }) => void) | undefined;
    const unsubscribe = vi.fn();
    tauriEventMocks.listen.mockImplementationOnce(
      async (_eventName: string, handler: (event: { payload: unknown }) => void) => {
        registeredHandler = handler;
        return unsubscribe;
      },
    );
    const listener = vi.fn();
    const bus = new TauriCommentOverlayEventBus();

    const cleanup = await bus.subscribe(listener);
    registeredHandler?.({ payload: batchEvent });
    registeredHandler?.({ payload: settingsEvent });
    registeredHandler?.({ payload: { version: 2, type: "batch", batch: {} } });

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledWith(batchEvent);
    expect(listener).toHaveBeenCalledWith(settingsEvent);
    expect(cleanup).toBe(unsubscribe);
  });

  it("Tauriのunsubscribe関数をそのまま返す", async () => {
    const unsubscribe = vi.fn();
    tauriEventMocks.listen.mockResolvedValueOnce(unsubscribe);
    const bus = new TauriCommentOverlayEventBus();

    const cleanup = await bus.subscribe(vi.fn());

    cleanup();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
