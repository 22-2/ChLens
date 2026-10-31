import type { ReactNode } from "react";
import { afterEach, vi } from "vite-plus/test";

// TabBar の表示テストで共通に使うモック。
// vi.mock の工場関数から遅延して読み込むため、テストファイルが import の順序に依存しない。
// 各テストファイルは vi.mock で対応する create*Module を呼ぶだけでよい。

export const dispatchMock = vi.fn();

export const mocks = {
  tabStore: {
    state: {
      tabs: [
        {
          id: "tab-1",
          history: [{ type: "boardList", title: "ホーム" }],
          currentIndex: 0,
          pinned: false,
          reloadKey: 0,
          autoRefreshEnabled: false,
          autoRefreshPageKey: null as string | null,
        },
        {
          id: "tab-2",
          history: [{ type: "boardList", title: "板一覧" }],
          currentIndex: 0,
          pinned: false,
          reloadKey: 0,
          autoRefreshEnabled: false,
          autoRefreshPageKey: null as string | null,
        },
      ],
      selectedTabId: "tab-1",
      closedTabs: [],
    },
  },
  autoScrollState: {
    canAutoScroll: false,
    isAutoScrolling: false,
    isPaused: false,
  },
  detachedTabIds: new Set<string>(),
};

// DragDropProvider はテスト環境ではシムで置き換え、onDragEnd を外部から呼べるようにする。
export const dragState: { onDragEnd?: (event: Record<string, unknown>) => void } = {};

export const resizeObserverState: { callback?: () => void } = {};

export class ResizeObserverStub {
  constructor(callback: () => void) {
    resizeObserverState.callback = callback;
  }

  observe() {}
  disconnect() {}
  unobserve() {}
}

/** テストごとに、切り離し中のタブの一覧を空に戻す。 */
export function setupTabBarTest(): void {
  afterEach(() => {
    mocks.detachedTabIds.clear();
  });
}

export function createContextMenuModule() {
  return {
    ContextMenu: ({
      items,
    }: {
      items: Array<{
        id: string;
        label?: string;
        icon?: ReactNode;
        onSelect?: () => void;
      }>;
    }) => (
      <div data-testid="bar-context-menu">
        {items.map((item) => (
          <span key={item.id} data-menu-item={item.id} onClick={() => item.onSelect?.()}>
            {item.icon}
            {item.label}
          </span>
        ))}
      </div>
    ),
  };
}

export function createTabContextMenuModule() {
  return {
    TabContextMenu: () => null,
  };
}

export function createTabStoreModule() {
  return {
    useTabStore: () => ({
      state: mocks.tabStore.state,
      // 本物同様、ホイールハンドラが常に最新 state を同期参照できる ref を模す。
      // stateRef はグローバル状態（panes 配列）を指すので、単一ペインに包んで返す。
      stateRef: {
        get current() {
          const slice = mocks.tabStore.state;
          return {
            panes: [
              {
                id: "pane-1",
                tabs: slice.tabs,
                activeTabId: slice.selectedTabId,
              },
            ],
            activePaneId: "pane-1",
            closedTabs: slice.closedTabs,
          };
        },
      },
      dispatch: dispatchMock,
      paneId: "pane-1",
    }),
  };
}

export function createAutoScrollStateModule() {
  return {
    usePaneAutoScrollState: () => mocks.autoScrollState,
  };
}

export function createDetachedTabControllerModule() {
  return {
    useDetachedTabController: () => ({
      isDetachedTab: (tabId: string) => mocks.detachedTabIds.has(tabId),
    }),
  };
}

export function createDndKitModule() {
  return {
    DragDropProvider: ({
      children,
      onDragEnd,
    }: {
      children: ReactNode;
      onDragEnd?: (event: Record<string, unknown>) => void;
    }) => {
      dragState.onDragEnd = onDragEnd;
      return <>{children}</>;
    },
  };
}

export function createDndKitSortableModule() {
  return {
    useSortable: ({ id: _id }: { id: string; index: number; group?: string }) => ({
      // ref は DOM アタッチ不要なためノーオプとして返す。
      ref: vi.fn(),
      isDragSource: false,
      isDropTarget: false,
      isDragging: false,
      isDropping: false,
    }),
    // テスト用モックでは operation が object であれば sortable 操作として扱う。
    isSortableOperation: (op: unknown) => op !== null && typeof op === "object",
  };
}
