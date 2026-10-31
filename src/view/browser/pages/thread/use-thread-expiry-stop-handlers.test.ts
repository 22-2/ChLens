import { renderHook } from "@testing-library/react";
import { useThreadExpiryStopHandlers } from "src/view/browser/pages/thread/use-thread-expiry-stop-handlers";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import type { Tab } from "src/view/browser/types";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const PAGE_KEY = "thread:https://example.com/test/read.cgi/board/1000000001/";
const STOP_MESSAGE = "dat落ちを検知したため自動更新を停止しました";

type Options = Parameters<typeof useThreadExpiryStopHandlers>[0];

function createTab(overrides: Partial<Tab> = {}): Tab {
  return {
    id: "tab-a",
    autoRefreshEnabled: false,
    autoRefreshPageKey: null,
    autoRefreshStoppedPageKey: null,
    ...overrides,
  } as Tab;
}

function createOptions(overrides: Partial<Options> = {}): Options {
  return {
    tabId: "tab-a",
    tab: createTab(),
    autoRefreshPageKey: PAGE_KEY,
    expired: true,
    missingFromSubject: false,
    responseCount: 10,
    isAutoRefreshEnabled: true,
    isCommentOverlayFlowing: false,
    stopMessage: STOP_MESSAGE,
    canEnterNextThreadWait: false,
    handleAutoRefreshStop: vi.fn(),
    dispatch: vi.fn(),
    ...overrides,
  };
}

describe("dat落ちの停止通知と次スレ待機", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("次スレ移動がONの自動更新中なら、停止記録ではなく次スレ待機を一度だけ始める", () => {
    const options = createOptions({ canEnterNextThreadWait: true });
    const { rerender } = renderHook((props: Options) => useThreadExpiryStopHandlers(props), {
      initialProps: options,
    });

    rerender(options);

    expect(options.dispatch).toHaveBeenCalledTimes(1);
    expect(options.dispatch).toHaveBeenCalledWith(tabActions.startNextThreadWait(PAGE_KEY));
  });

  it("自動更新がOFFなら、次スレ待機を始めない", () => {
    const options = createOptions({ canEnterNextThreadWait: true, isAutoRefreshEnabled: false });

    renderHook(() => useThreadExpiryStopHandlers(options));

    expect(options.dispatch).not.toHaveBeenCalled();
  });

  it("次スレ移動がOFFなら、次スレ待機を始めない", () => {
    const options = createOptions({ canEnterNextThreadWait: false });

    renderHook(() => useThreadExpiryStopHandlers(options));

    expect(options.dispatch).not.toHaveBeenCalled();
  });

  it("停止記録を付けるときは、まだ記録がなければ一度だけ dispatch する", () => {
    const options = createOptions();
    const { result } = renderHook(() => useThreadExpiryStopHandlers(options));

    result.current.onThreadExpiredDetected();

    expect(options.dispatch).toHaveBeenCalledWith(
      tabActions.setAutoRefreshStoppedPageKey(PAGE_KEY),
    );
  });

  it("停止記録が既に付いていれば、記録を重ねない", () => {
    const options = createOptions({ tab: createTab({ autoRefreshStoppedPageKey: PAGE_KEY }) });
    const { result } = renderHook(() => useThreadExpiryStopHandlers(options));

    result.current.onThreadExpiredDetected();

    expect(options.dispatch).not.toHaveBeenCalled();
  });

  it("dat落ちで止まるときは、自動更新を止めて理由を通知する", () => {
    const options = createOptions();
    const { result } = renderHook(() => useThreadExpiryStopHandlers(options));

    result.current.onThreadExpired();

    expect(options.handleAutoRefreshStop).toHaveBeenCalledWith(STOP_MESSAGE);
  });

  it("停止記録済みで自動更新がOFFなら、停止の通知を重ねない", () => {
    const options = createOptions({
      isAutoRefreshEnabled: false,
      tab: createTab({ autoRefreshStoppedPageKey: PAGE_KEY }),
    });
    const { result } = renderHook(() => useThreadExpiryStopHandlers(options));

    result.current.onThreadExpired();

    expect(options.handleAutoRefreshStop).not.toHaveBeenCalled();
  });
});
