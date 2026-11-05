import { setupTestPageTypes } from "src/test-support/page-types-test-setup";
import { setBrowserSessionJson } from "src/view/browser/state/tabs/browser-session-storage";
import {
  loadTabStoreSession,
  saveTabStoreSession,
} from "src/view/browser/state/tabs/tab-store-session";
import { createHomeTab, getCurrentPage, type Tab } from "src/view/browser/types";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const storage = vi.hoisted(() => ({ json: "" }));
vi.mock("src/view/browser/state/tabs/browser-session-storage", () => ({
  getBrowserSessionJson: () => storage.json,
  setBrowserSessionJson: vi.fn(async () => undefined),
}));

const boardPage = {
  type: "threadList",
  title: "サンプル板",
  boardUrl: "https://example.com/sample/",
  boardTitle: "サンプル板",
};

describe("ホーム統合後のセッション移行", () => {
  beforeEach(() => {
    storage.json = "";
  });

  it("窓付き形式を保存し、別窓の構成と位置を保ったまま復元する", () => {
    const main = createHomeTab("main-tab");
    const aux = createHomeTab("aux-tab");
    saveTabStoreSession({
      panes: [
        { id: "main-pane", tabs: [main], activeTabId: main.id },
        { id: "aux-pane", windowId: "aux", tabs: [aux], activeTabId: aux.id },
      ],
      windows: [
        { id: "main", kind: "main", activePaneId: "main-pane" },
        {
          id: "aux",
          kind: "aux",
          activePaneId: "aux-pane",
          bounds: { left: -1200, top: 40, width: 900, height: 700 },
        },
      ],
      activePaneId: "aux-pane",
      closedTabs: [],
    });
    storage.json = vi.mocked(setBrowserSessionJson).mock.lastCall![0];
    expect(JSON.parse(storage.json)).toMatchObject({
      version: 2,
      panes: [{ windowId: "main" }, { windowId: "aux" }],
      windows: [{ id: "main" }, { id: "aux" }],
    });
    const restored = loadTabStoreSession()!;
    expect(restored.panes.map((pane) => [pane.id, pane.windowId ?? "main"])).toEqual([
      ["main-pane", "main"],
      ["aux-pane", "aux"],
    ]);
    expect(restored.panes[0].tabs.map((tab) => tab.id)).toEqual(["main-tab"]);
    expect(restored.panes[1].tabs.map((tab) => tab.id)).toEqual(["aux-tab"]);
    expect(restored.activePaneId).toBe("main-pane");
    expect(restored.windows).toEqual([
      { id: "main", kind: "main", activePaneId: "main-pane" },
      {
        id: "aux",
        kind: "aux",
        activePaneId: "aux-pane",
        bounds: { left: -1200, top: 40, width: 900, height: 700 },
      },
    ]);
  });

  it("使えない位置情報は捨て、窓の定義がない別窓のペインは本窓へ集める", () => {
    const main = createHomeTab("main-tab");
    storage.json = JSON.stringify({
      version: 2,
      panes: [
        { id: "main-pane", windowId: "main", tabs: [main], activeTabId: main.id },
        {
          id: "aux-pane",
          windowId: "aux",
          tabs: [createHomeTab("aux-tab")],
          activeTabId: "aux-tab",
        },
        {
          id: "lost-pane",
          windowId: "lost",
          tabs: [createHomeTab("lost-tab")],
          activeTabId: "lost-tab",
        },
      ],
      windows: [
        { id: "main", kind: "main", activePaneId: "main-pane" },
        {
          id: "aux",
          kind: "aux",
          activePaneId: "aux-pane",
          bounds: { left: 0, top: 0, width: 0, height: 10 },
        },
      ],
      activePaneId: "main-pane",
      closedTabs: [],
    });
    const restored = loadTabStoreSession()!;
    expect(restored.windows.find((item) => item.id === "aux")).toEqual({
      id: "aux",
      kind: "aux",
      activePaneId: "aux-pane",
    });
    expect(restored.panes.map((pane) => pane.id)).toEqual(["main-pane", "aux-pane"]);
    expect(restored.panes[0].tabs.map((tab) => tab.id)).toEqual(["main-tab", "lost-tab"]);
  });

  it("本窓のペインがない保存状態でもタブを失わずに復元する", () => {
    storage.json = JSON.stringify({
      panes: [
        { id: "aux-pane", windowId: "aux", activeTabId: "tab", tabs: [createHomeTab("tab")] },
      ],
      activePaneId: "aux-pane",
    });
    expect(loadTabStoreSession()).toMatchObject({
      panes: [{ id: "aux-pane", windowId: "main", tabs: [{ id: "tab" }] }],
      activePaneId: "aux-pane",
    });
  });

  it("旧セッションのタブ単位の表示形式は読み捨て、自動更新は開始しない", () => {
    storage.json = JSON.stringify({
      panes: [
        {
          id: "pane",
          activeTabId: "tab",
          tabs: [
            { ...createHomeTab("tab"), threadDisplayMode: "live-chat", autoRefreshEnabled: true },
          ],
        },
      ],
      activePaneId: "pane",
      closedTabs: [],
    });
    const restoredTab = loadTabStoreSession()!.panes[0].tabs[0];
    expect(restoredTab).toMatchObject({ autoRefreshEnabled: false });
    expect(restoredTab).not.toHaveProperty("threadDisplayMode");
  });

  it.each([0, 1, 2, 3])(
    "旧階層の選択位置%sを保ち、板一覧への二重の戻る操作をなくす",
    (currentIndex) => {
      storage.json = JSON.stringify({
        panes: [
          {
            id: "pane",
            activeTabId: "tab",
            tabs: [
              {
                ...createHomeTab("tab"),
                locked: false,
                pinned: false,
                currentIndex,
                history: [
                  { type: "boardTree", title: "板ツリー" },
                  { type: "boardList", title: "板一覧" },
                  boardPage,
                  {
                    type: "thread",
                    title: "サンプルスレ",
                    threadUrl: "https://example.com/test/read.cgi/sample/1/",
                  },
                ],
              },
            ],
          },
        ],
        activePaneId: "pane",
        closedTabs: [],
      });
      const state = loadTabStoreSession()!;
      const tab = state.panes[0].tabs.find((item) => item.id === "tab")!;
      expect(tab.history.map((page) => page.type)).toEqual(
        currentIndex === 1
          ? ["home", "boardList", "threadList", "thread"]
          : ["home", "threadList", "thread"],
      );
      expect(tab.currentIndex).toBe(currentIndex === 1 ? 1 : Math.max(0, currentIndex - 1));
      expect(state.panes[0].activeTabId).toBe("tab");
      expect(state.panes[0].tabs).toHaveLength(1);
      expect(getCurrentPage(tab).type).toBe(
        ["home", "boardList", "threadList", "thread"][currentIndex],
      );
    },
  );

  it.each(["home", "boardTree"])("旧形式%sの通常タブと閉じたタブをホームへ移行する", (type) => {
    const tab = { ...createHomeTab("tab"), locked: false, history: [{ type, title: "ホーム" }] };
    storage.json = JSON.stringify({ tabs: [tab], activeTabId: "tab", closedTabs: [tab] });
    const state = loadTabStoreSession()!;
    expect(state.panes[0].tabs[0].history).toEqual([{ type: "home", title: "ホーム" }]);
    expect(state.closedTabs[0].history).toEqual([{ type: "home", title: "ホーム" }]);
  });

  it("旧常設ホームのIDと選択を保ち、専用homeページへ移行する", () => {
    storage.json = JSON.stringify({
      tabs: [
        {
          ...createHomeTab("home-tab"),
          locked: true,
          pinned: true,
          history: [{ type: "boardTree", title: "ホーム" }],
        },
      ],
      activeTabId: "home-tab",
      closedTabs: [],
    });
    const pane = loadTabStoreSession()!.panes[0];
    expect(pane.tabs).toHaveLength(1);
    expect(pane.activeTabId).toBe("home-tab");
    expect(pane.tabs[0]).not.toHaveProperty("locked");
    expect(pane.tabs[0]).toMatchObject({
      pinned: false,
      history: [{ type: "home", title: "ホーム" }],
    });
  });
});

describe("セッション保存形式", () => {
  it("未登録ページの履歴と表示状態を再登録まで失わない", async () => {
    const { toPersistedTab } = await import("src/view/browser/state/tabs/tab-store-session");
    const unknownPage = {
      type: "futurePage",
      title: "未登録",
      location: "example",
    } as unknown as Tab["history"][number];
    const viewStates = { "futurePage:example": { searchQuery: "再登録後に復元" } };
    const tab = { ...createHomeTab("tab"), history: [unknownPage], viewStates };
    const persisted = toPersistedTab(tab);
    expect(persisted.history).toEqual([unknownPage]);
    expect(persisted.viewStates).toEqual(viewStates);
    storage.json = JSON.stringify({
      panes: [{ id: "pane", tabs: [persisted], activeTabId: "tab" }],
      activePaneId: "pane",
      closedTabs: [],
    });
    const restored = loadTabStoreSession()!.panes[0].tabs[0];
    expect(restored.history).toContainEqual(unknownPage);
    expect(restored.viewStates).toEqual(viewStates);
  });

  it("一時状態を書き出さず、履歴から外れたページの表示状態を切り捨てる", async () => {
    const { toPersistedTab } = await import("src/view/browser/state/tabs/tab-store-session");
    const threadPage = {
      type: "thread" as const,
      title: "サンプルスレ",
      threadUrl: "https://example.com/test/read.cgi/sample/1/",
    };
    const tab: Tab = {
      ...createHomeTab("tab"),
      history: [{ type: "home", title: "ホーム" }, boardPage as never, threadPage],
      currentIndex: 2,
      reloadKey: 5,
      autoRefreshEnabled: true,
      autoRefreshPageKey: "thread:https://example.com/test/read.cgi/sample/1/",
      viewStates: {
        "thread:https://example.com/test/read.cgi/sample/1/": { searchQuery: "残す" },
        "thread:https://example.com/test/read.cgi/sample/99/": { searchQuery: "捨てる" },
      },
    };
    const persisted = toPersistedTab(tab);

    expect(persisted).toEqual({
      id: "tab",
      history: [{ type: "home", title: "ホーム" }, boardPage, threadPage],
      currentIndex: 2,
      pinned: false,
      viewStates: {
        "thread:https://example.com/test/read.cgi/sample/1/": { searchQuery: "残す" },
      },
    });
  });
});

describe("サイドパネルのセッション", () => {
  it("タブと一緒に保存したビューの順序と選択を復元する", () => {
    storage.json = JSON.stringify({
      panes: [{ id: "pane", activeTabId: "tab", tabs: [createHomeTab("tab")] }],
      activePaneId: "pane",
      closedTabs: [],
      sidePanel: {
        isOpen: true,
        width: 360,
        views: ["images", "boards"],
        hiddenViews: ["write"],
        activeView: "images",
      },
    });
    const restored = loadTabStoreSession();
    expect(restored?.sidePanel?.isOpen).toBe(true);
    expect(restored?.sidePanel?.width).toBe(360);
    expect(restored?.sidePanel?.views.slice(0, 2)).toEqual(["images", "boards"]);
    expect(restored?.sidePanel?.activeView).toBe("images");
    expect(restored?.sidePanel?.hiddenViews).toEqual(["write"]);
  });
});

describe("下部パネルのセッション", () => {
  it("各ペインの表示状態を復元し、存在しないペインを除く", () => {
    storage.json = JSON.stringify({
      panes: [{ id: "pane", activeTabId: "tab", tabs: [createHomeTab("tab")] }],
      activePaneId: "pane",
      closedTabs: [],
      bottomPanels: {
        pane: { isOpen: true, height: 320, activeTabId: "write" },
        removed: { isOpen: true },
      },
    });
    expect(loadTabStoreSession()?.bottomPanels).toEqual({
      pane: { isOpen: true, height: 320, activeTabId: "write" },
    });
  });
});

setupTestPageTypes();
