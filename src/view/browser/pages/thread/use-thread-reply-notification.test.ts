import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { IRes } from "src/service-container/interfaces";
import { useThreadReplyNotification } from "src/view/browser/pages/thread/use-thread-reply-notification";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { notifyMock, isSupportedMock, loggerError } = vi.hoisted(() => ({
  notifyMock: vi.fn(),
  isSupportedMock: vi.fn(),
  loggerError: vi.fn(),
}));
vi.mock("src/app/logger", () => ({
  createLogger: () => ({ error: loggerError, warn: vi.fn(), debug: vi.fn() }),
}));
vi.mock("src/service-container/index", () => ({
  container: {
    notification: { isSupported: isSupportedMock, notify: notifyMock },
  },
}));

const THREAD_URL = "https://example.com/test/read.cgi/board/1000000001/";

function createRes(num: number): IRes {
  return {
    num,
    name: "名無しさん",
    mail: "",
    date: "2026/09/30 12:00:00",
    message: `レス${num}`,
  };
}

const responses = [1, 2, 3, 4, 5].map(createRes);

function renderReplyNotification(
  options: {
    ownResNums?: ReadonlySet<number>;
    replyToOwnResNums?: ReadonlySet<number>;
    viewWindow?: Window;
  } = {},
) {
  return renderHook(() =>
    useThreadReplyNotification({
      page: { type: "thread", title: "テストスレ", threadUrl: THREAD_URL },
      responses,
      ownResNums: options.ownResNums ?? new Set([2]),
      replyToOwnResNums: options.replyToOwnResNums ?? new Set([4]),
      viewWindow: options.viewWindow ?? window,
    }),
  );
}

describe("useThreadReplyNotification", () => {
  beforeEach(() => {
    isSupportedMock.mockReturnValue(true);
    notifyMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("新着レスに自分のレスへの返信があれば、スレッド単位の通知を出す", () => {
    const { result } = renderReplyNotification();

    result.current(2, 3);

    expect(notifyMock).toHaveBeenCalledWith("自分のレスへの返信: テストスレ", {
      message: "1件の返信があります",
      url: THREAD_URL,
      tag: `thread-reply-to-own:${THREAD_URL}`,
      targetWindow: window,
    });
  });

  it("返信が複数あれば、その件数を通知に含める", () => {
    const { result } = renderReplyNotification({ replyToOwnResNums: new Set([4, 5]) });

    result.current(2, 3);

    expect(notifyMock).toHaveBeenCalledWith(
      "自分のレスへの返信: テストスレ",
      expect.objectContaining({ message: "2件の返信があります" }),
    );
  });

  it("自分の投稿への返信は数えず、通知を出さない", () => {
    const { result } = renderReplyNotification({
      ownResNums: new Set([4]),
      replyToOwnResNums: new Set([4]),
    });

    result.current(2, 3);

    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("新着レスが0件なら、通知を出さない", () => {
    const { result } = renderReplyNotification();

    result.current(0, 3);

    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("通知機能が利用できない環境では、通知を出さない", () => {
    isSupportedMock.mockReturnValue(false);
    const { result } = renderReplyNotification();

    result.current(2, 3);

    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("通知の表示に失敗したら、エラーをログに残す", async () => {
    const error = new Error("通知が拒否されました");
    notifyMock.mockRejectedValue(error);
    const { result } = renderReplyNotification();

    result.current(2, 3);

    await waitFor(() => {
      expect(loggerError).toHaveBeenCalledWith("新着レス通知の表示に失敗しました:", error);
    });
  });
});
