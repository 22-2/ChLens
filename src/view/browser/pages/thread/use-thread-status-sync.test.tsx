import { cleanup, renderHook } from "@testing-library/react";
import type { IRes } from "src/service-container/interfaces";
import {
  countDisplayedResponses,
  useThreadStatusSync,
} from "src/view/browser/pages/thread/use-thread-status-sync";
import { afterEach, describe, expect, it } from "vite-plus/test";

const createRes = (num: number, overrides: Partial<IRes> = {}): IRes => ({
  num,
  name: "名無しさん",
  mail: "",
  date: "2026/09/30 12:00:00",
  message: `レス${num}`,
  ...overrides,
});

describe("useThreadStatusSync", () => {
  afterEach(() => {
    cleanup();
  });

  it("NG判定されたレス番号だけを返す", () => {
    const responses = [createRes(1), createRes(2, { class: ["ng"] }), createRes(3)];

    const { result } = renderHook(() =>
      useThreadStatusSync({
        tabId: "tab-1",
        threadUrl: "https://example.com/test/read.cgi/board/123/",
        loading: false,
        responses,
        ownResNums: new Set(),
        displayedResponses: responses,
        replyToOwnResNums: new Set(),
      }),
    );

    expect([...result.current.ngResNums]).toEqual([2]);
  });

  it("レスがなければNG番号は空になる", () => {
    const { result } = renderHook(() =>
      useThreadStatusSync({
        tabId: "tab-1",
        threadUrl: "https://example.com/test/read.cgi/board/123/",
        loading: true,
        responses: [],
        ownResNums: new Set(),
        displayedResponses: [],
        replyToOwnResNums: new Set(),
      }),
    );

    expect(result.current.ngResNums.size).toBe(0);
  });

  it("hard-ngのみを表示数から除き、折りたたみと一時解除を反映する", () => {
    const responses = [
      createRes(1),
      createRes(2, { class: ["ng"] }),
      createRes(3, { ng: { type: "word", action: "collapse" } }),
    ];
    expect(countDisplayedResponses(responses, "hard-ng", false)).toBe(2);
    expect(countDisplayedResponses(responses, "soft-ng", false)).toBe(3);
    expect(countDisplayedResponses(responses, "hard-ng", true)).toBe(3);
    expect(countDisplayedResponses(responses.slice(1, 2), "hard-ng", false)).toBe(0);
  });
});
