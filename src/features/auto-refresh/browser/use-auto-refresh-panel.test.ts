import { renderHook } from "@testing-library/react";
import { useAutoRefreshPanel } from "src/features/auto-refresh/browser/use-auto-refresh-panel";
import { setupTestPageTypes } from "src/test-support/page-types-test-setup";
import { getAutoRefreshPageKey } from "src/view/browser/state/tabs/auto-refresh-pages";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import type { Page, Tab } from "src/view/browser/types";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  viewPage: null as unknown as Page,
  viewTab: null as unknown as Tab,
  dispatch: vi.fn(),
}));

vi.mock("src/view/browser/state/tabs/use-tab-store", () => ({
  useTabStore: () => ({
    viewPage: mocks.viewPage,
    viewTab: mocks.viewTab,
    dispatch: mocks.dispatch,
  }),
}));

vi.mock("src/features/archive-replay/browser/position-store", () => ({
  useArchiveReplayPositionStore: (selector: (state: { position: null }) => unknown) =>
    selector({ position: null }),
  getArchiveReplayThreadCapabilities: () => ({ canAutoRefresh: true }),
}));

const THREAD_PAGE: Extract<Page, { type: "thread" }> = {
  type: "thread",
  title: "スレ",
  threadUrl: "https://example.com/test/read.cgi/board/1000000001/",
};

function createTab(overrides: Partial<Tab> = {}): Tab {
  return {
    id: "tab-a",
    history: [THREAD_PAGE],
    currentIndex: 0,
    autoRefreshEnabled: false,
    autoRefreshPageKey: null,
    autoRefreshStoppedPageKey: null,
    nextThreadWaitPageKey: null,
    ...overrides,
  } as Tab;
}

describe("自動更新パネルの切り替え", () => {
  setupTestPageTypes();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.viewPage = THREAD_PAGE;
  });

  it("次スレ待機中は、ONにせず停止を要求する", () => {
    const pageKey = getAutoRefreshPageKey(THREAD_PAGE)!;
    mocks.viewTab = createTab({ nextThreadWaitPageKey: pageKey });
    const { result } = renderHook(() => useAutoRefreshPanel());

    expect(result.current.isNextThreadWaiting).toBe(true);
    expect(result.current.isEnabled).toBe(false);

    result.current.toggle();

    expect(mocks.dispatch).toHaveBeenCalledWith(tabActions.setAutoRefreshEnabled(false, pageKey));
  });

  it("待機していないOFFの自動更新は、ONにする", () => {
    const pageKey = getAutoRefreshPageKey(THREAD_PAGE)!;
    mocks.viewTab = createTab();
    const { result } = renderHook(() => useAutoRefreshPanel());

    expect(result.current.isNextThreadWaiting).toBe(false);

    result.current.toggle();

    expect(mocks.dispatch).toHaveBeenCalledWith(tabActions.setAutoRefreshEnabled(true, pageKey));
  });

  it("自動更新中のONは、OFFにする", () => {
    const pageKey = getAutoRefreshPageKey(THREAD_PAGE)!;
    mocks.viewTab = createTab({ autoRefreshEnabled: true, autoRefreshPageKey: pageKey });
    const { result } = renderHook(() => useAutoRefreshPanel());

    expect(result.current.isEnabled).toBe(true);

    result.current.toggle();

    expect(mocks.dispatch).toHaveBeenCalledWith(tabActions.setAutoRefreshEnabled(false, pageKey));
  });
});
