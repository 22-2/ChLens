import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import React from "react";
import { TabBar } from "src/view/browser/components/TabBar";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dispatchMock = vi.fn();

vi.mock("src/view/browser/components/ContextMenu", () => ({
  ContextMenu: () => null,
}));

vi.mock("src/view/browser/components/TabContextMenu", () => ({
  TabContextMenu: () => null,
}));

vi.mock("src/view/browser/hooks/use-tab-store", () => ({
  useTabStore: () => ({
    state: {
      tabs: [
        {
          id: "tab-1",
          history: [{ type: "home", title: "ホーム" }],
          currentIndex: 0,
          pinned: false,
          reloadKey: 0,
          autoRefreshEnabled: false,
          autoRefreshThreadUrl: null,
        },
        {
          id: "tab-2",
          history: [{ type: "boardList", title: "板一覧" }],
          currentIndex: 0,
          pinned: false,
          reloadKey: 0,
          autoRefreshEnabled: false,
          autoRefreshThreadUrl: null,
        },
      ],
      activeTabId: "tab-1",
      closedTabs: [],
    },
    dispatch: dispatchMock,
  }),
}));

// DragDropProvider はテスト環境ではシムで置き換え、onDragEnd を外部から呼べるようにする。
let capturedOnDragEnd: ((event: Record<string, unknown>) => void) | undefined;
let capturedPlugins:
  | ((
      defaults: Array<
        | { plugin: (...args: unknown[]) => unknown; options?: Record<string, unknown> }
        | ((...args: unknown[]) => unknown)
      >,
    ) => Array<{ plugin: (...args: unknown[]) => unknown; options?: Record<string, unknown> }>)
  | undefined;

vi.mock("@dnd-kit/react", () => ({
  DragDropProvider: ({
    children,
    onDragEnd,
    plugins,
  }: {
    children: React.ReactNode;
    onDragEnd?: (event: Record<string, unknown>) => void;
    plugins?: (
      defaults: Array<
        | { plugin: (...args: unknown[]) => unknown; options?: Record<string, unknown> }
        | ((...args: unknown[]) => unknown)
      >,
    ) => Array<{ plugin: (...args: unknown[]) => unknown; options?: Record<string, unknown> }>;
  }) => {
    capturedOnDragEnd = onDragEnd;
    capturedPlugins = plugins;
    return <>{children}</>;
  },
}));

vi.mock("@dnd-kit/react/sortable", () => ({
  useSortable: ({ id }: { id: string; index: number; group?: string }) => ({
    // ref は DOM アタッチ不要なためノーオプとして返す。
    ref: vi.fn(),
    isDragSource: false,
    isDropTarget: false,
    isDragging: false,
    isDropping: false,
  }),
  // テスト用モックでは operation が object であれば sortable 操作として扱う。
  isSortableOperation: (op: unknown) => op !== null && typeof op === "object",
}));

describe("TabBar wheel switching", () => {
  beforeEach(() => {
    dispatchMock.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-20T00:00:00.000Z"));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("deltaY が極小/0 のホイールではタブを切り替えない", () => {
    const { container } = render(<TabBar />);
    const tabBar = container.querySelector(".tab-bar") as HTMLDivElement;

    fireEvent.wheel(tabBar, { deltaY: 0 });
    fireEvent.wheel(tabBar, { deltaY: 4 });

    expect(dispatchMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "SELECT_TAB" }),
    );
  });

  it("短時間に連続したホイール入力では1回だけ切り替える", () => {
    const { container } = render(<TabBar />);
    const tabBar = container.querySelector(".tab-bar") as HTMLDivElement;

    fireEvent.wheel(tabBar, { deltaY: 40 });
    fireEvent.wheel(tabBar, { deltaY: 50 });

    const selectCalls = dispatchMock.mock.calls.filter(
      ([action]) => action?.type === "SELECT_TAB",
    );

    expect(selectCalls).toHaveLength(1);
    expect(selectCalls[0][0]).toEqual({ type: "SELECT_TAB", tabId: "tab-2" });
  });
});

describe("TabBar drag-to-reorder", () => {
  beforeEach(() => {
    dispatchMock.mockReset();
    capturedOnDragEnd = undefined;
    capturedPlugins = undefined;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    cleanup();
  });

  it("ドラッグ終了時に MOVE_TAB が dispatch される", () => {
    render(<TabBar />);

    const feedbackLikePlugin = () => undefined;
    const transformed = capturedPlugins?.([
      feedbackLikePlugin,
      { plugin: feedbackLikePlugin, options: { foo: 1 } },
    ]);

    // placeholder cleanup race を避けるため、Feedback plugin の dropAnimation は常に無効化する。
    expect(transformed).toEqual([
      { plugin: feedbackLikePlugin, options: { dropAnimation: null } },
      { plugin: feedbackLikePlugin, options: { foo: 1, dropAnimation: null } },
    ]);

    // DragDropProvider の onDragEnd を直接呼び出してドラッグ完了をシミュレートする。
    capturedOnDragEnd?.({
      canceled: false,
      operation: {
        source: { id: "tab-1" },
        target: { id: "tab-2" },
      },
    });

    // MOVE_TAB は dnd cleanup と競合しないよう次ティックで dispatch される。
    vi.runAllTimers();

    expect(dispatchMock).toHaveBeenCalledWith({
      type: "MOVE_TAB",
      dragTabId: "tab-1",
      targetTabId: "tab-2",
    });
  });

  it("canceled なドラッグでは MOVE_TAB を dispatch しない", () => {
    render(<TabBar />);

    capturedOnDragEnd?.({
      canceled: true,
      operation: {
        source: { id: "tab-1" },
        target: { id: "tab-2" },
      },
    });

    expect(dispatchMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "MOVE_TAB" }),
    );
  });

  it("ドラッグ終了直後の click ではタブ選択を誤発火しない", () => {
    const { container } = render(<TabBar />);

    // ドラッグ完了イベントを発火して wasDraggingRef を立てる。
    capturedOnDragEnd?.({
      canceled: false,
      operation: {
        source: { id: "tab-1" },
        target: { id: "tab-2" },
      },
    });

    dispatchMock.mockClear();

    // ドラッグ直後の click は1回だけ抑止される。
    const tabs = container.querySelectorAll(".tab");
    fireEvent.click(tabs[1]);

    expect(dispatchMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "SELECT_TAB" }),
    );
  });
});

describe("TabBar tab interactions", () => {
  beforeEach(() => {
    dispatchMock.mockReset();
    capturedOnDragEnd = undefined;
  });

  afterEach(() => {
    cleanup();
  });

  it("タブをクリックすると SELECT_TAB が dispatch される", () => {
    const { container } = render(<TabBar />);
    const tabs = container.querySelectorAll(".tab");

    fireEvent.click(tabs[1]);

    expect(dispatchMock).toHaveBeenCalledWith({
      type: "SELECT_TAB",
      tabId: "tab-2",
    });
  });

  it("× ボタンをクリックすると CLOSE_TAB が dispatch される", () => {
    const { container } = render(<TabBar />);
    const closeBtn = container.querySelectorAll(
      ".tab__close",
    )[0] as HTMLButtonElement;

    fireEvent.click(closeBtn);

    expect(dispatchMock).toHaveBeenCalledWith({
      type: "CLOSE_TAB",
      tabId: "tab-1",
    });
  });
});
