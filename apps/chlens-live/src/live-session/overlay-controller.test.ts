import { describe, expect, it } from "vite-plus/test";
import type { IRes } from "@chlen/ch-lib";
import { LiveCommentOverlayController } from "./overlay-controller";
import type { LiveEvent } from "./events";

const threadUrl = "https://bbs.eddibb.cc/liveedge/1000000001/";

function post(number: number, message: string): IRes {
  return {
    number,
    name: "名無し",
    mail: "",
    date: "2026/08/30",
    id: `id-${number}`,
    message,
  };
}

function snapshot(url: string, posts: IRes[]): LiveEvent {
  return {
    type: "snapshot",
    threadUrl: url,
    changed: true,
    snapshot: {
      url,
      data: { title: "テストスレ", posts },
      metadata: { bodyBytes: 0, parsedResCount: posts.length },
      updatedAt: 1,
    },
  };
}

describe("LiveCommentOverlayController", () => {
  it("初回snapshotをbaselineにし、次の新着だけをコメントbatchへ変換する", () => {
    const controller = new LiveCommentOverlayController();

    expect(controller.consume(snapshot(threadUrl, [post(1, "既存")]))).toEqual({
      threadUrl,
      reset: true,
      batch: null,
    });
    const update = controller.consume(snapshot(threadUrl, [post(1, "既存"), post(2, "新着")]))!;

    expect(update.reset).toBe(false);
    expect(update.batch?.comments).toEqual([
      {
        responseNumber: 2,
        text: "新着",
        author: "名無し",
        id: "id-2",
        date: "2026/08/30",
      },
    ]);
  });

  it("別スレの初回snapshotではstageをresetし、既存レスを流さない", () => {
    const controller = new LiveCommentOverlayController();
    controller.consume(snapshot(threadUrl, [post(1, "前のスレ")]));

    const nextUrl = "https://bbs.eddibb.cc/liveedge/1000000002/";
    const reset = controller.consume(snapshot(nextUrl, [post(1, "新しいスレ")]))!;

    expect(reset).toEqual({ threadUrl: nextUrl, reset: true, batch: null });
    expect(
      controller.consume(snapshot(nextUrl, [post(1, "新しいスレ"), post(2, "新着")]))?.batch,
    ).toMatchObject({ comments: [{ responseNumber: 2 }] });
  });

  it("snapshot以外のboardやerrorイベントをOverlayへ送らない", () => {
    const controller = new LiveCommentOverlayController();

    expect(
      controller.consume({
        type: "board-error",
        boardUrl: "https://bbs.eddibb.cc/liveedge/",
        error: { name: "Error", message: "failed" },
      }),
    ).toBeNull();
  });
});
