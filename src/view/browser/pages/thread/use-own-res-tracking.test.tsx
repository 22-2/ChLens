import { act, cleanup, renderHook } from "@testing-library/react";
import { createIdleCommentOverlayState } from "src/features/comment-overlay/domain";
import type { IRes } from "src/service-container/interfaces";
import { useCommentOverlaySync } from "src/view/browser/pages/thread/use-comment-overlay-sync";
import { useOwnResTracking } from "src/view/browser/pages/thread/use-own-res-tracking";
import {
  notifyThreadWriteCompleted,
  notifyThreadWriteStarted,
} from "src/view/browser/utils/thread-write-sync";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { addHistory, updateHistory } = vi.hoisted(() => ({
  addHistory: vi.fn(),
  updateHistory: vi.fn(),
}));
vi.mock("src/service-container/index", () => ({
  container: {
    config: { get: () => "" },
    // core/history/WriteHistory はサービスコンテナの writeHistory から使う。
    writeHistory: { getByUrl: async () => [], add: addHistory, update: updateHistory },
  },
}));

const threadUrl = "https://example.com/test/read.cgi/board/123/";
const firstResponse: IRes = {
  num: 1,
  name: "名無しさん",
  mail: "",
  date: "2026/09/30 12:00:00",
  message: "既存レス",
};
const postedResponse: IRes = { ...firstResponse, num: 2, message: "投稿した本文" };

describe("投稿直後の自分レス表示", () => {
  beforeEach(() => {
    // 変更理由: DBが遅くても表示の確定を妨げないことを確認するため、保存を保留する。
    addHistory.mockReset().mockImplementation(() => new Promise(() => {}));
    updateHistory.mockReset();
  });
  afterEach(cleanup);

  it.each([false, true])(
    "自動更新の先着有無にかかわらず保存を待たず自分レスを表示する（先着: %s）",
    async (responseArrivesFirst) => {
      const { result, rerender } = renderHook(
        ({ responses }) =>
          useOwnResTracking({
            threadUrl,
            threadTitle: "テストスレ",
            responses,
          }),
        { initialProps: { responses: [firstResponse] } },
      );
      await act(async () => {});
      act(() => notifyThreadWriteStarted({ threadUrl, submittedAt: 123 }));
      if (responseArrivesFirst) {
        rerender({ responses: [firstResponse, postedResponse] });
        expect(result.current.ownResNums.has(2)).toBe(false);
      }
      act(() =>
        notifyThreadWriteCompleted({
          threadUrl,
          submittedAt: 123,
          message: postedResponse.message,
          inputName: "",
          inputMail: "",
        }),
      );
      if (!responseArrivesFirst) rerender({ responses: [firstResponse, postedResponse] });
      expect(result.current.ownResNums.has(2)).toBe(true);
      expect(addHistory).toHaveBeenCalledTimes(1);
      expect(updateHistory).not.toHaveBeenCalled();
    },
  );
});

describe("自動更新で届いた自分レスの実況Overlay判定", () => {
  beforeEach(() => {
    addHistory.mockReset().mockImplementation(() => new Promise(() => {}));
    updateHistory.mockReset();
  });
  afterEach(cleanup);

  it("投稿を取り込んだ描画で、Overlayへの初回送信から自分のレスとして渡す", async () => {
    const controller = {
      syncThread: vi.fn(),
      getSnapshot: vi.fn(() => ({
        state: createIdleCommentOverlayState(),
        visible: false,
        error: null,
      })),
      stop: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    };
    const { rerender } = renderHook(
      ({ responses }) => {
        const { ownResNums } = useOwnResTracking({
          threadUrl,
          threadTitle: "テストスレ",
          responses,
        });
        useCommentOverlaySync({
          controller,
          threadUrl,
          responses,
          isActive: true,
          isAutoRefreshEnabled: true,
          ownResponseNumbers: ownResNums,
        });
      },
      { initialProps: { responses: [firstResponse] } },
    );
    await act(async () => {});
    act(() => notifyThreadWriteStarted({ threadUrl, submittedAt: 123 }));
    act(() =>
      notifyThreadWriteCompleted({
        threadUrl,
        submittedAt: 123,
        message: postedResponse.message,
        inputName: "",
        inputMail: "",
      }),
    );
    rerender({ responses: [firstResponse, postedResponse] });

    // Overlayは同じレスを二度送らないため、初回送信が自分のレスとして判定されている必要がある。
    const firstSharedWithPosted = controller.syncThread.mock.calls.find(([, responses]) =>
      responses.some((res: IRes) => res.num === postedResponse.num),
    );
    expect(firstSharedWithPosted?.[2]?.ownResponseNumbers).toEqual(new Set([postedResponse.num]));
  });
});
