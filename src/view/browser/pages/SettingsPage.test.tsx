import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import type { ScopedTabAction, TabStoreState } from "src/features/tabs/browser/tab-store-types";
import type { SettingsPageUiState } from "src/view/browser/pages/settings/settings-types";
import { createHomeTab } from "src/view/browser/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { configReady } = vi.hoisted(() => ({
  configReady: vi.fn((callback: () => void) => callback()),
}));

vi.mock("src/app/platform", () => ({
  platform: { window: { setTitle: vi.fn(async () => undefined) } },
}));
vi.mock("src/core/History", () => ({
  add: vi.fn(async () => undefined),
  getByUrl: vi.fn(async () => []),
  remove: vi.fn(async () => undefined),
}));
vi.mock("webextension-polyfill", () => ({
  default: { runtime: { onMessage: { addListener: vi.fn(), removeListener: vi.fn() } } },
}));
vi.mock("src/service-container/index", () => ({
  container: { config: { get: () => null, ready: configReady } },
}));
vi.mock("src/view/browser/hooks/use-media-query", () => ({ useMediaQuery: () => false }));
vi.mock("src/view/browser/components/NGEditor", () => ({
  NGEditor: () => null,
  NGDslHelpSnippet: () => null,
  NG_DSL_EXAMPLE: "",
  NG_DSL_MULTILINE_EXAMPLE: "",
}));
vi.mock("src/view/browser/pages/settings/SettingsSupplementaryPanels", () => ({
  SettingsSupplementaryPanels: () => null,
}));
vi.mock("src/view/browser/pages/settings/use-settings-maintenance", () => ({
  useSettingsMaintenanceActions: () => ({}),
}));

const SESSION_KEY = "chlens_browser_session";
const settingsPage = { type: "settings" as const, title: "設定", sectionId: "general" };

function storedState(): TabStoreState {
  return JSON.parse(localStorage.getItem(SESSION_KEY)!) as TabStoreState;
}

function settingsUiState(tabId = "settings-tab"): SettingsPageUiState | undefined {
  return storedState()
    .panes.flatMap((pane) => pane.tabs)
    .find((tab) => tab.id === tabId)?.viewStates?.settings?.settingsPage;
}

async function renderViewer() {
  // タブストアはモジュール読込時に復元するため、Chromeの再読み込みと同様に読み直す。
  vi.resetModules();
  const { TabProvider, useTabStore } = await import("src/features/tabs/browser/use-tab-store");
  const { SettingsPage } = await import("src/view/browser/pages/SettingsPage");
  let dispatchForTest: (action: ScopedTabAction) => void = () => {
    throw new Error("未マウントです");
  };
  function Viewer() {
    const { dispatch, viewPage, viewTab } = useTabStore();
    useEffect(() => {
      dispatchForTest = dispatch;
    }, [dispatch]);
    return viewPage.type === "settings" ? (
      <SettingsPage key={viewTab.id} tabId={viewTab.id} page={viewPage} />
    ) : null;
  }
  render(
    <TabProvider>
      <Viewer />
    </TabProvider>,
  );
  return (action: ScopedTabAction) => act(() => dispatchForTest(action));
}

function scrollViewport(): HTMLElement {
  return screen.getByRole("main");
}

function changeNgUiState() {
  fireEvent.click(screen.getByRole("button", { name: /^NG\s*NGワード/ }));
  fireEvent.click(screen.getByRole("button", { name: "NG記法例" }));
  fireEvent.click(screen.getByRole("button", { name: "高度なNG設定" }));
  fireEvent.scroll(scrollViewport(), { target: { scrollTop: 420 } });
}

describe("設定画面のタブ単位の表示状態", () => {
  beforeEach(() => {
    configReady.mockImplementation((callback: () => void) => callback());
    const values = new Map<string, string>();
    const storage: Storage = {
      get length() {
        return values.size;
      },
      clear: () => values.clear(),
      key: (index) => [...values.keys()][index] ?? null,
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
      removeItem: (key) => {
        values.delete(key);
      },
    };
    vi.stubGlobal("localStorage", storage);
    Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
    const state: TabStoreState = {
      panes: [
        {
          id: "pane",
          activeTabId: "settings-tab",
          tabs: [
            createHomeTab("home-tab"),
            {
              ...createHomeTab("settings-tab"),
              history: [{ type: "home", title: "ホーム" }, settingsPage],
              currentIndex: 1,
            },
          ],
        },
      ],
      activePaneId: "pane",
      closedTabs: [],
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(state));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("Chrome側の再読み込みで選択カテゴリ・NGの展開状態・スクロール位置を復元する", async () => {
    await renderViewer();
    changeNgUiState();
    const saved = settingsUiState();
    expect(saved).toEqual({
      activeSectionId: "ng",
      linkedSectionId: "general",
      ngExamplesOpen: true,
      ngAdvancedOpen: true,
      mainScrollTop: 420,
    });

    // ページリンクの初期カテゴリがあっても、再読み込み後は直前の表示状態を優先する。
    cleanup();
    await renderViewer();
    expect(screen.getByRole("heading", { name: "NG", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "NG記法例" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("button", { name: "高度なNG設定" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(scrollViewport().scrollTop).toBe(420);
    expect(settingsUiState()).toEqual(saved);
  });

  it.each<[string, ScopedTabAction]>([
    ["タブを閉じる", { type: "CLOSE_TAB", tabId: "settings-tab" }],
    ["他のタブを閉じる", { type: "CLOSE_OTHER_TABS", tabId: "home-tab" }],
    ["右側のタブを閉じる", { type: "CLOSE_RIGHT_TABS", tabId: "home-tab" }],
    ["すべてのタブを閉じる", { type: "CLOSE_ALL_TABS" }],
  ])(
    "%sの後も新しい設定タブは初期状態で開き、閉じたタブを復元すると表示状態が戻る",
    async (_, action) => {
      const dispatch = await renderViewer();
      changeNgUiState();
      const saved = settingsUiState();
      dispatch(action);
      const closedTab = storedState().closedTabs.find((tab) => tab.id === "settings-tab")!;
      expect(closedTab.viewStates?.settings?.settingsPage).toEqual(saved);

      dispatch({
        type: "OPEN_IN_NEW_TAB_FORCE",
        tabId: "new-settings",
        page: settingsPage,
        focus: true,
      });
      expect(screen.getByRole("heading", { name: "一般", level: 2 })).toBeInTheDocument();
      expect(scrollViewport().scrollTop).toBe(0);
      fireEvent.click(screen.getByRole("button", { name: /^NG\s*NGワード/ }));
      expect(screen.getByRole("button", { name: "NG記法例" })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      expect(screen.getByRole("button", { name: "高度なNG設定" })).toHaveAttribute(
        "aria-expanded",
        "false",
      );

      cleanup();
      const restoredDispatch = await renderViewer();
      restoredDispatch({ type: "REOPEN_CLOSED_TAB" });
      expect(screen.getByRole("heading", { name: "NG", level: 2 })).toBeInTheDocument();
      expect(scrollViewport().scrollTop).toBe(420);
      expect(screen.getByRole("button", { name: "NG記法例" })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      expect(screen.getByRole("button", { name: "高度なNG設定" })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      const pane = storedState().panes[0];
      expect(settingsUiState(pane.activeTabId)).toEqual(saved);
    },
  );

  it("設定タブを閉じた直後に閉じたタブを開くと表示状態を復元する", async () => {
    const dispatch = await renderViewer();
    changeNgUiState();
    const saved = settingsUiState();
    dispatch({ type: "CLOSE_TAB", tabId: "settings-tab" });
    dispatch({ type: "REOPEN_CLOSED_TAB" });
    expect(screen.getByRole("heading", { name: "NG", level: 2 })).toBeInTheDocument();
    expect(scrollViewport().scrollTop).toBe(420);
    const pane = storedState().panes[0];
    expect(settingsUiState(pane.activeTabId)).toEqual(saved);
  });

  it("別の設定タブには表示状態を引き継がず、片方を閉じても残ったタブの状態を保つ", async () => {
    const dispatch = await renderViewer();
    changeNgUiState();
    dispatch({
      type: "OPEN_IN_NEW_TAB_FORCE",
      tabId: "other-settings",
      page: settingsPage,
      focus: true,
    });
    expect(screen.getByRole("heading", { name: "一般", level: 2 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^表示\s*テーマ/ }));
    expect(settingsUiState()?.activeSectionId).toBe("ng");
    expect(settingsUiState("other-settings")?.activeSectionId).toBe("display");

    dispatch({ type: "SELECT_TAB", tabId: "settings-tab" });
    expect(scrollViewport().scrollTop).toBe(420);
    dispatch({ type: "CLOSE_TAB", tabId: "settings-tab" });
    expect(screen.getByRole("heading", { name: "表示", level: 2 })).toBeInTheDocument();
    expect(settingsUiState("other-settings")?.activeSectionId).toBe("display");
  });

  it("設定の読込待ちでも復元するスクロール位置を上書きしない", async () => {
    const state = storedState();
    state.panes[0].tabs[1].viewStates = {
      settings: { settingsPage: { activeSectionId: "ng", mainScrollTop: 420 } },
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(state));
    let completeLoad = () => {};
    configReady.mockImplementation((callback: () => void) => {
      completeLoad = callback;
    });
    await renderViewer();
    expect(settingsUiState()?.mainScrollTop).toBe(420);
    act(() => completeLoad());
    expect(scrollViewport().scrollTop).toBe(420);
    expect(settingsUiState()?.mainScrollTop).toBe(420);
  });

  it("同じタブで別カテゴリへのリンクを開くと保存済みの選択よりリンク先を優先する", async () => {
    const dispatch = await renderViewer();
    fireEvent.click(screen.getByRole("button", { name: /^表示\s*テーマ/ }));
    dispatch({ type: "NAVIGATE", page: { type: "home", title: "ホーム" } });
    dispatch({ type: "NAVIGATE", page: { ...settingsPage, sectionId: "ng" } });
    expect(screen.getByRole("heading", { name: "NG", level: 2 })).toBeInTheDocument();
  });

  it("旧形式の全タブ共通の表示状態を新しい設定タブへ持ち込まない", async () => {
    const state = storedState();
    state.panes[0].tabs[1].history[1] = { type: "settings", title: "設定" };
    localStorage.setItem(SESSION_KEY, JSON.stringify(state));
    localStorage.setItem(
      "chlens.settings-page.state.v1",
      JSON.stringify({ activeSectionId: "ng", mainScrollTop: 420, ngAdvancedOpen: true }),
    );
    await renderViewer();
    expect(screen.getByRole("heading", { name: "一般", level: 2 })).toBeInTheDocument();
    expect(scrollViewport().scrollTop).toBe(0);
  });
});
