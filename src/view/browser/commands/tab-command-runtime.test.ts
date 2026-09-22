import {
  executeTabCommandRequest,
  TAB_COMMAND_IDS,
  type TabCommandRuntime,
} from "src/view/browser/commands/tab-command-runtime";
import { tabActions } from "src/view/browser/hooks/tab-store-actions";
import type { TabStoreState } from "src/view/browser/hooks/tab-store-types";
import type { Tab } from "src/view/browser/types";
import { describe, expect, it, vi } from "vite-plus/test";

function createTab(overrides: Partial<Tab> = {}): Tab {
  const page = { type: "home" as const, title: "ホーム" };
  return {
    id: "tab-1",
    history: [page, { type: "settings", title: "設定" }],
    currentIndex: 1,
    pinned: false,
    reloadKey: 0,
    autoRefreshEnabled: false,
    autoRefreshPageKey: null,
    ...overrides,
  };
}

function createRuntime(tab: Tab): TabCommandRuntime {
  const state: TabStoreState = {
    panes: [
      {
        id: "pane-1",
        tabs: [tab],
        activeTabId: tab.id,
      },
    ],
    activePaneId: "pane-1",
    closedTabs: [],
  };
  return { state, dispatch: vi.fn() };
}

describe("tab-command-runtime", () => {
  it("指定タブの履歴だけを戻す", () => {
    const tab = createTab();
    const runtime = createRuntime(tab);

    expect(
      executeTabCommandRequest({ id: TAB_COMMAND_IDS.BACK, args: { tabId: tab.id } }, runtime),
    ).toBe(true);
    expect(runtime.dispatch).toHaveBeenCalledWith({ ...tabActions.goBack(), tabId: tab.id });
  });

  it("再取得も指定タブへ限定する", () => {
    const tab = createTab({
      history: [{ type: "thread", title: "スレッド", threadUrl: "https://example.com/thread/" }],
      currentIndex: 0,
    });
    const runtime = createRuntime(tab);

    expect(
      executeTabCommandRequest({ id: TAB_COMMAND_IDS.RELOAD, args: { tabId: tab.id } }, runtime),
    ).toBe(true);
    expect(runtime.dispatch).toHaveBeenCalledWith({ ...tabActions.reload(), tabId: tab.id });
  });

  it("閉じたタブへ暗黙にフォールバックしない", () => {
    const runtime = createRuntime(createTab({ id: "other-tab" }));

    expect(
      executeTabCommandRequest(
        { id: TAB_COMMAND_IDS.BACK, args: { tabId: "closed-tab" } },
        runtime,
      ),
    ).toBe(false);
    expect(runtime.dispatch).not.toHaveBeenCalled();
  });

  it("更新できないページでは再取得をdispatchしない", () => {
    const tab = createTab();
    const runtime = createRuntime(tab);

    expect(
      executeTabCommandRequest({ id: TAB_COMMAND_IDS.RELOAD, args: { tabId: tab.id } }, runtime),
    ).toBe(false);
    expect(runtime.dispatch).not.toHaveBeenCalled();
  });
});
