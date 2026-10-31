import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { setupTestPageTypes } from "src/test-support/page-types-test-setup";
import { useThreadAutoRefreshActions } from "src/view/browser/pages/thread/use-thread-auto-refresh-actions";
import { getAutoRefreshPageKey } from "src/view/browser/state/tabs/auto-refresh-pages";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import type { ThreadPage as ThreadPageType } from "src/view/browser/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { loggerError } = vi.hoisted(() => ({ loggerError: vi.fn() }));
vi.mock("src/app/logger", () => ({
  createLogger: () => ({ error: loggerError, warn: vi.fn(), debug: vi.fn() }),
}));

const THREAD_URL = "https://example.com/test/read.cgi/board/1000000001/";
const NEXT_URL = "https://example.com/test/read.cgi/board/1000000002/";

const page: ThreadPageType = { type: "thread", title: "テストスレ", threadUrl: THREAD_URL };

type Options = Parameters<typeof useThreadAutoRefreshActions>[0];

/** ページキーは種別の登録後にだけ解決できるため、テストの本体で取得する。 */
function getPageKey(): string {
  const key = getAutoRefreshPageKey(page);
  if (key == null) throw new Error("自動更新できるページキーを取得できませんでした");
  return key;
}

// 呼び出し先のメソッドを式で参照すると、this の束縛を外して渡すものとして検査されるため、モックは変数で持つ。
const toastInfo = vi.fn();
const publishSystemMessage = vi.fn();

function createOptions(overrides: Partial<Options> = {}) {
  publishSystemMessage.mockResolvedValue(undefined);
  return {
    page,
    autoRefreshPageKey: getPageKey(),
    canAutoRefresh: true,
    isAutoRefreshEnabled: false,
    isNextThreadWaiting: false,
    dispatch: vi.fn(),
    toast: { info: toastInfo } as unknown as Options["toast"],
    commentOverlayController: {
      publishSystemMessage,
    } as unknown as Options["commentOverlayController"],
    ...overrides,
  };
}

function renderActions(options: ReturnType<typeof createOptions>) {
  return renderHook(() => useThreadAutoRefreshActions(options));
}

describe("useThreadAutoRefreshActions", () => {
  setupTestPageTypes();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("自動更新を停止すると、ページの自動更新をOFFにして停止理由を通知する", () => {
    const pageKey = getPageKey();
    const options = createOptions({ isAutoRefreshEnabled: true });
    const { result } = renderActions(options);

    result.current.handleAutoRefreshStop("接続が切れたため自動更新を停止しました");

    expect(options.dispatch).toHaveBeenCalledWith(tabActions.setAutoRefreshEnabled(false, pageKey));
    expect(toastInfo).toHaveBeenCalledWith("接続が切れたため自動更新を停止しました");
  });

  it("自動更新を開始できる状態なら、ページの自動更新をONにする", () => {
    const pageKey = getPageKey();
    const options = createOptions();
    const { result } = renderActions(options);

    result.current.handleEnableAutoRefresh();

    expect(options.dispatch).toHaveBeenCalledWith(tabActions.setAutoRefreshEnabled(true, pageKey));
  });

  it("自動更新できない状態では、開始しない", () => {
    const options = createOptions({ canAutoRefresh: false });
    const { result } = renderActions(options);

    result.current.handleEnableAutoRefresh();

    expect(options.dispatch).not.toHaveBeenCalled();
  });

  it("次スレが見つからなければ、停止したページを記録して通知する", () => {
    const pageKey = getPageKey();
    const options = createOptions({ isAutoRefreshEnabled: true });
    const { result } = renderActions(options);

    result.current.handleNextThreadSearchExhausted();

    expect(options.dispatch).toHaveBeenCalledWith(tabActions.setAutoRefreshStoppedPageKey(pageKey));
    expect(toastInfo).toHaveBeenCalledWith("次スレが見つからなかったため自動更新を停止しました");
  });

  it("次スレ探索の対象ページがなければ、何もしない", () => {
    const options = createOptions({ autoRefreshPageKey: null });
    const { result } = renderActions(options);

    result.current.handleNextThreadSearchExhausted();

    expect(options.dispatch).not.toHaveBeenCalled();
    expect(toastInfo).not.toHaveBeenCalled();
  });

  it("次スレへ移動すると、Overlayに通知を流してから、自動更新の状態を引き継いで移動する", () => {
    const options = createOptions({ isAutoRefreshEnabled: true });
    const { result } = renderActions(options);

    result.current.handleFollowNextThread({ title: "次のスレ", url: NEXT_URL });

    expect(publishSystemMessage).toHaveBeenCalledWith(THREAD_URL, "スレ「次のスレ」へ移動します。");
    expect(options.dispatch).toHaveBeenCalledWith(
      tabActions.followNextThread(
        { type: "thread", title: "次のスレ", threadUrl: NEXT_URL },
        { keepAutoRefresh: true },
      ),
    );
  });

  it("自動更新が止まっている状態で次スレへ移動すると、自動更新を引き継がない", () => {
    const options = createOptions({ isAutoRefreshEnabled: false });
    const { result } = renderActions(options);

    result.current.handleFollowNextThread({ title: "次のスレ", url: NEXT_URL });

    expect(options.dispatch).toHaveBeenCalledWith(
      tabActions.followNextThread(
        { type: "thread", title: "次のスレ", threadUrl: NEXT_URL },
        { keepAutoRefresh: false },
      ),
    );
  });

  it("次スレ探索の待機中に移動しても、待機前の自動更新を引き継ぐ", () => {
    // 待機中は自動更新のONを外しているため、引き継ぎの判定に待機の状態を含める必要がある。
    const options = createOptions({ isAutoRefreshEnabled: false, isNextThreadWaiting: true });
    const { result } = renderActions(options);

    result.current.handleFollowNextThread({ title: "次のスレ", url: NEXT_URL });

    expect(options.dispatch).toHaveBeenCalledWith(
      tabActions.followNextThread(
        { type: "thread", title: "次のスレ", threadUrl: NEXT_URL },
        { keepAutoRefresh: true },
      ),
    );
  });

  it("通知の送信に失敗しても、エラーをログに残して次スレへの移動は続ける", async () => {
    const error = new Error("送信できません");
    const options = createOptions();
    vi.mocked(publishSystemMessage).mockRejectedValue(error);
    const { result } = renderActions(options);

    result.current.handleFollowNextThread({ title: "次のスレ", url: NEXT_URL });

    await waitFor(() => {
      expect(loggerError).toHaveBeenCalledWith(
        "次スレ移動の通知コメント送信に失敗しました:",
        error,
      );
    });
    expect(options.dispatch).toHaveBeenCalledWith(
      tabActions.followNextThread(
        { type: "thread", title: "次のスレ", threadUrl: NEXT_URL },
        { keepAutoRefresh: false },
      ),
    );
  });
});
