import { cleanup } from "@testing-library/react";
import { container } from "src/service-container/index";
import type { IHistoryService } from "src/service-container/interfaces";
import { stubService } from "src/service-container/test-stubs";
import { afterEach, beforeEach, vi } from "vite-plus/test";

// 履歴サービスの呼び出しを検査できるよう、モックは変数で持つ。
export const historyAddMock = vi.fn().mockResolvedValue(undefined);
export const historyGetByUrlMock = vi.fn().mockResolvedValue([]);
export const historyRemoveMock = vi.fn().mockResolvedValue(undefined);

// 実装は src/core/history/History ではなくサービスコンテナの history から使うため、テスト用のサービスを登録する。
container.history = stubService<IHistoryService>("history", {
  add: historyAddMock,
  getByUrl: historyGetByUrlMock,
  remove: historyRemoveMock,
});

function createMemoryStorage(): Storage {
  const items = new Map<string, string>();

  return {
    get length() {
      return items.size;
    },
    clear() {
      items.clear();
    },
    getItem(key: string) {
      return items.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(items.keys())[index] ?? null;
    },
    removeItem(key: string) {
      items.delete(key);
    },
    setItem(key: string, value: string) {
      items.set(key, value);
    },
  };
}

const afterTestPageTypes: Array<() => void> = [];

export async function resetModulesWithPageTypes() {
  vi.resetModules();
  const { registerTestPageTypes } = await import("src/test-support/page-types-test-setup");
  afterTestPageTypes.push(registerTestPageTypes());
}

/** タブ操作のテストが共通に使う前提（localStorage のセッション、履歴サービスのモック）をそろえる。 */
export function setupTabStoreTest(): void {
  beforeEach(() => {
    const localStorageMock = createMemoryStorage();
    vi.stubGlobal("localStorage", localStorageMock);
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: localStorageMock,
    });
    localStorage.removeItem("chlens_browser_session");
    // 履歴・タブ操作の既存テストは、ホームから明示的に開いた板一覧があるセッションで検証する。
    localStorage.setItem(
      "chlens_browser_session",
      JSON.stringify({
        panes: [
          {
            id: "initial-pane",
            activeTabId: "initial-board-list",
            tabs: [
              {
                id: "initial-board-list",
                history: [{ type: "boardList", title: "板一覧" }],
                currentIndex: 0,
                pinned: false,
                reloadKey: 0,
                autoRefreshEnabled: false,
                autoRefreshPageKey: null,
              },
            ],
          },
        ],
        activePaneId: "initial-pane",
        closedTabs: [],
      }),
    );
    historyAddMock.mockReset();
    historyGetByUrlMock.mockReset();
    historyRemoveMock.mockReset();
    historyAddMock.mockResolvedValue(undefined);
    historyGetByUrlMock.mockResolvedValue([]);
    historyRemoveMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    for (const dispose of afterTestPageTypes.splice(0)) dispose();
    vi.resetModules();
    vi.unstubAllGlobals();
  });
}
