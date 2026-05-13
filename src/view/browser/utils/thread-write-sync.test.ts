import type { IRes } from "src/service-container/interfaces";
import {
  findLatestWrittenRes,
  notifyThreadWriteCompleted,
  resolveWriteSuccessDelayMs,
  resolveWrittenResTimestamp,
  subscribeThreadWriteCompleted,
} from "src/view/browser/utils/thread-write-sync";
import { describe, expect, it, vi } from "vitest";

function createRes(
  num: number,
  message: string,
  extra: Partial<IRes> = {},
): IRes {
  return {
    num,
    name: "名無しさん",
    mail: "sage",
    date: "2026/05/04 00:00:00",
    message,
    ...extra,
  };
}

describe("thread-write-sync", () => {
  it("投稿完了通知は同期的に配信される", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeThreadWriteCompleted(listener);

    notifyThreadWriteCompleted({
      threadUrl: "https://example.com/test/read.cgi/software/1/",
      message: "本文",
      inputName: "name",
      inputMail: "sage",
      submittedAt: 123,
    });

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("投稿完了待ち時間は旧UI互換で解釈する", () => {
    expect(resolveWriteSuccessDelayMs("3000")).toBe(3000);
    expect(resolveWriteSuccessDelayMs(-50)).toBe(0);
    expect(resolveWriteSuccessDelayMs("invalid")).toBe(3000);
  });

  it("投稿本文に一致する最新レスだけを自分のレス候補にする", () => {
    const matched = findLatestWrittenRes(
      [
        createRes(1, "てすと"),
        createRes(2, "別レス"),
        createRes(3, "<b>てすと</b>"),
      ],
      "て す と\n",
      new Set([3]),
    );

    expect(matched?.num).toBe(1);
  });

  it("書込履歴保存用の日時は other の旧書式から復元する", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-04T00:00:00.000Z"));

    expect(
      resolveWrittenResTimestamp(
        createRes(1, "本文", {
          other: "2026/05/04(月) 12:34:56 ID:abcd",
        }),
      ),
    ).toBe(new Date(2026, 4, 4, 12, 34, 56).valueOf());

    expect(
      resolveWrittenResTimestamp(
        createRes(2, "本文", {
          other: "日付不明",
          date: "",
        }),
      ),
    ).toBe(Date.now());

    vi.useRealTimers();
  });
});
