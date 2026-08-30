import { describe, expect, it } from "vite-plus/test";
import type { IRes } from "src/service-container/interfaces";
import { MemoryCommentOverlayEventBus } from "../domain";
import { createBrowserCommentOverlayPlatform } from "../platform/browser";
import { CommentOverlayController } from "./controller";

function response(num: number, message: string): IRes {
  return {
    num,
    name: "名無し",
    mail: "",
    date: "2026/08/30(日) 12:00:00",
    message,
  };
}

async function waitForPublishedEvents(): Promise<void> {
  // controllerはイベント順序を直列化するため、キューのmicrotaskが完了するまで待つ。
  await Promise.resolve();
  await Promise.resolve();
}

describe("CommentOverlayController", () => {
  it("開始時の既存レスをbaselineにして、新着だけをeventへ送る", async () => {
    const eventBus = new MemoryCommentOverlayEventBus();
    const controller = new CommentOverlayController({
      eventBus,
      platform: createBrowserCommentOverlayPlatform(),
    });
    const threadUrl = "https://example.test/thread/1";

    controller.syncThread(threadUrl, [response(1, "既存レス")]);
    await controller.start(threadUrl);
    expect(eventBus.events[0]?.batch.comments).toEqual([]);

    controller.syncThread(threadUrl, [response(1, "既存レス"), response(2, "新着レス")]);
    await waitForPublishedEvents();

    expect(eventBus.events).toHaveLength(2);
    expect(eventBus.events[1]?.batch.comments.map((comment) => comment.responseNumber)).toEqual([
      2,
    ]);

    controller.syncThread(threadUrl, [response(1, "既存レス"), response(2, "新着レス")]);
    await waitForPublishedEvents();
    expect(eventBus.events).toHaveLength(2);
  });

  it("対象外のスレッドを同期しても実況対象を切り替えない", async () => {
    const eventBus = new MemoryCommentOverlayEventBus();
    const controller = new CommentOverlayController({
      eventBus,
      platform: createBrowserCommentOverlayPlatform(),
    });
    const targetUrl = "https://example.test/thread/1";
    const otherUrl = "https://example.test/thread/2";

    await controller.start(targetUrl, [response(4, "対象スレ")]);
    controller.syncThread(otherUrl, [response(1, "別スレ")]);
    await waitForPublishedEvents();

    expect(controller.getSnapshot().state.targetThreadUrl).toBe(targetUrl);
    expect(eventBus.events).toHaveLength(1);
  });

  it("停止後は新着を送らず、Overlayを非表示にする", async () => {
    const eventBus = new MemoryCommentOverlayEventBus();
    const controller = new CommentOverlayController({
      eventBus,
      platform: createBrowserCommentOverlayPlatform(),
    });
    const threadUrl = "https://example.test/thread/1";

    await controller.start(threadUrl, [response(1, "既存レス")]);
    await controller.stop();
    controller.syncThread(threadUrl, [response(1, "既存レス"), response(2, "停止後")]);
    await waitForPublishedEvents();

    expect(controller.getSnapshot().state.status).toBe("stopped");
    expect(controller.getSnapshot().visible).toBe(false);
    expect(eventBus.events).toHaveLength(1);
  });

  it("実況開始時の設定を正規化してreset eventへ含める", async () => {
    const eventBus = new MemoryCommentOverlayEventBus();
    const controller = new CommentOverlayController({
      eventBus,
      platform: createBrowserCommentOverlayPlatform(),
      getSettings: () => ({
        baseSpeedPxPerSecond: 1_000,
        fontSize: 1,
        opacity: -1,
        maxQueueSize: 12.6,
      }),
    });

    await controller.start("https://example.test/thread/1", [response(1, "既存レス")]);

    expect(eventBus.events[0]).toMatchObject({
      type: "reset",
      settings: {
        baseSpeedPxPerSecond: 600,
        fontSize: 10,
        opacity: 0.1,
        maxQueueSize: 13,
      },
    });
  });
});
