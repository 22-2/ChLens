import { describe, expect, it, vi } from "vite-plus/test";
import {
  collectNewCommentBatch,
  createIdleCommentOverlayState,
  latestResponseNumber,
  projectCommentResponse,
  startCommentOverlay,
  stopCommentOverlay,
  toCommentText,
} from "./index";
import type { CommentResponse } from "./comment-types";

function response(
  num: number,
  message: string,
  extra: Partial<CommentResponse> = {},
): CommentResponse {
  return {
    num,
    name: "名無し",
    message,
    ...extra,
  };
}

describe("コメントオーバーレイdomain", () => {
  it("HTML、br、文字参照を表示用テキストへ変換する", () => {
    expect(toCommentText(" <b>速報</b><br>猫 &amp; 犬 &#x1F63A; ")).toBe("速報\n猫 & 犬 😺");
  });

  it("空本文とNGレスを既定ではコメントへ投影しない", () => {
    expect(projectCommentResponse(response(1, "<br>"))).toBeNull();
    expect(projectCommentResponse(response(1, "&nbsp;"))).toBeNull();
    expect(projectCommentResponse(response(2, "NG本文", { ng: { type: "word" } }))).toBeNull();
    expect(
      projectCommentResponse(response(2, "NG本文", { ng: { type: "word" } }), { includeNg: true }),
    ).toMatchObject({ responseNumber: 2, text: "NG本文" });
  });

  it("取得順に関係なく最大レス番号をbaselineへ使う", () => {
    expect(latestResponseNumber([response(8, "8"), response(3, "3"), response(12, "12")])).toBe(12);
  });

  it("開始時の既存レスを流さず、後から増えたレスを番号順に一度だけ返す", () => {
    const initial = [response(1, "既存1"), response(3, "既存3")];
    const running = startCommentOverlay("https://example.test/thread/1", initial);
    const first = collectNewCommentBatch(running, "https://example.test/thread/1", [
      response(5, "新着5"),
      response(4, "新着4"),
      response(3, "既存3"),
      response(4, "重複4"),
    ]);

    expect(first.batch?.comments.map((comment) => comment.responseNumber)).toEqual([4, 5]);

    const second = collectNewCommentBatch(first.state, "https://example.test/thread/1", [
      response(1, "既存1"),
      response(4, "新着4"),
      response(5, "新着5"),
    ]);
    expect(second.batch).toBeNull();
    expect(second.state.cursor?.lastResponseNumber).toBe(5);
  });

  it("投影されないレスもcursorを進めて再取得時に再判定しない", () => {
    const running = startCommentOverlay("https://example.test/thread/1", [response(1, "既存")]);
    const result = collectNewCommentBatch(running, "https://example.test/thread/1", [
      response(2, "<br>"),
      response(3, "NG", { class: ["ng"] }),
    ]);

    expect(result.batch).toBeNull();
    expect(result.state.cursor?.lastResponseNumber).toBe(3);
    expect(
      collectNewCommentBatch(result.state, "https://example.test/thread/1", [
        response(2, "空本文"),
        response(3, "NG", { class: ["ng"] }),
      ]).batch,
    ).toBeNull();
  });

  it("実況対象と異なるスレのsnapshotを採用しない", () => {
    const running = startCommentOverlay("https://example.test/thread/1", [response(5, "前スレ")]);
    const result = collectNewCommentBatch(running, "https://example.test/thread/2", [
      response(1, "新スレ"),
    ]);

    expect(result.batch).toBeNull();
    expect(result.state).toBe(running);
    expect(
      startCommentOverlay("https://example.test/thread/2", [response(1, "新スレ")]).cursor,
    ).toEqual({
      threadUrl: "https://example.test/thread/2",
      lastResponseNumber: 1,
    });
  });

  it("停止中は新着を返さず、再開時のbaselineを作り直せる", () => {
    const running = startCommentOverlay("https://example.test/thread/1", [response(1, "既存")]);
    const stopped = stopCommentOverlay(running);
    const stoppedResult = collectNewCommentBatch(stopped, "https://example.test/thread/1", [
      response(2, "停止中"),
    ]);

    expect(stoppedResult.batch).toBeNull();
    expect(stopped.status).toBe("stopped");
    expect(
      startCommentOverlay("https://example.test/thread/1", [response(2, "停止中")]).cursor,
    ).toEqual({ threadUrl: "https://example.test/thread/1", lastResponseNumber: 2 });
  });

  it("idle stateは誤ってコメントを送らない", () => {
    const result = collectNewCommentBatch(
      createIdleCommentOverlayState(),
      "https://example.test/thread/1",
      [response(1, "本文")],
    );

    expect(result.batch).toBeNull();
    expect(result.state).toEqual(createIdleCommentOverlayState());
  });

  it("レスの付加情報をコメント候補へ引き継ぐ", () => {
    expect(
      projectCommentResponse(
        response(1, "本文", { name: "<b>配信者</b>", id: "ABC", date: "2026/08/29" }),
      ),
    ).toEqual({
      responseNumber: 1,
      text: "本文",
      author: "配信者",
      id: "ABC",
      date: "2026/08/29",
    });
  });

  it("不正なレス番号をbaselineや新着へ混ぜない", () => {
    const running = startCommentOverlay("https://example.test/thread/1", [response(1, "既存")]);
    const result = collectNewCommentBatch(running, "https://example.test/thread/1", [
      response(Number.NaN, "不正"),
      response(2, "新着"),
    ]);

    expect(result.batch?.comments.map((comment) => comment.responseNumber)).toEqual([2]);
    expect(Number.isNaN(result.state.cursor?.lastResponseNumber ?? Number.NaN)).toBe(false);
  });
});

describe("MemoryCommentOverlayEventBus", () => {
  it("イベントを記録し、購読解除後は通知しない", async () => {
    const { MemoryCommentOverlayEventBus } = await import("./index");
    const bus = new MemoryCommentOverlayEventBus();
    const listener = vi.fn();
    const unsubscribe = await bus.subscribe(listener);
    const event = {
      type: "batch" as const,
      batch: {
        threadUrl: "https://example.test/thread/1",
        comments: [{ responseNumber: 1, text: "本文", author: "名無し" }],
        latestResponseNumber: 1,
      },
    };

    await bus.publish(event);
    unsubscribe();
    await bus.publish(event);

    expect(bus.events).toEqual([event, event]);
    expect(listener).toHaveBeenCalledOnce();
  });
});
