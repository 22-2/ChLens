import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TabContextMenu } from "src/features/tabs/ui/TabContextMenu";
import { container } from "src/service-container";
import type { Tab } from "src/view/browser/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { copyTextMock, dispatchMock, threadTab, secondTab, closedTabs, extraPanes } = vi.hoisted(
  () => ({
    closedTabs: [] as Tab[],
    extraPanes: [] as Array<{ id: string; tabs: Tab[]; activeTabId: string }>,
    copyTextMock: vi.fn<() => Promise<void>>(),
    dispatchMock: vi.fn(),
    threadTab: {
      id: "tab-1",
      history: [
        {
          type: "thread" as const,
          title: "Current Thread",
          threadUrl: "https://example.com/test/read.cgi/software/123/",
        },
      ],
      currentIndex: 0,
      pinned: false,
      reloadKey: 0,
      autoRefreshEnabled: false,
      autoRefreshPageKey: null,
    } satisfies Tab,
    secondTab: {
      id: "tab-2",
      history: [
        {
          type: "boardList" as const,
          title: "Other Tab",
        },
      ],
      currentIndex: 0,
      pinned: false,
      reloadKey: 0,
      autoRefreshEnabled: false,
      autoRefreshPageKey: null,
    } satisfies Tab,
  }),
);

vi.mock("src/view/browser/utils/clipboard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("src/view/browser/utils/clipboard")>();
  return { ...actual, copyText: copyTextMock };
});

vi.mock("src/view/browser/state/tabs/use-tab-store", () => ({
  useTabStore: () => ({
    state: {
      tabs: [threadTab, secondTab],
      closedTabs,
    },
    paneId: "pane-1",
    stateRef: {
      current: {
        panes: [
          { id: "pane-1", tabs: [threadTab, secondTab], activeTabId: threadTab.id },
          ...extraPanes,
        ],
        activePaneId: "pane-1",
        windows: [{ id: "main", kind: "main", activePaneId: "pane-1" }],
        closedTabs: [],
      },
    },
    dispatch: dispatchMock,
  }),
}));

describe("TabContextMenu", () => {
  beforeEach(() => {
    // コピー後の通知まで実行されるため、テストでも通知サービスを登録する。
    container.toast = { notify: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() };
    copyTextMock.mockResolvedValue();
    container.bookmark = {
      promiseFirstScan: Promise.resolve(true),
      ready: vi.fn(async () => undefined),
      getAll: vi.fn(() => []),
      import: vi.fn(async () => true),
      get: vi.fn(),
      add: vi.fn(),
      remove: vi.fn(),
      clearReadState: vi.fn(),
      updateResCount: vi.fn(),
      updateExpired: vi.fn(),
      getByBoard: vi.fn(),
      getAllBoards: vi.fn(() => []),
    };
  });

  afterEach(() => {
    cleanup();
    copyTextMock.mockReset();
    dispatchMock.mockReset();
    closedTabs.length = 0;
    extraPanes.length = 0;
  });

  it("閉じた順に履歴を表示し、選択したタブを復元する", () => {
    closedTabs.push(secondTab, threadTab);
    render(<TabContextMenu tab={threadTab} position={{ x: 10, y: 10 }} onClose={vi.fn()} />);
    const labels = Array.from(
      document.querySelectorAll<HTMLButtonElement>(".context-menu__item"),
    ).map((button) => button.textContent?.trim());
    const reopenIndex = labels.indexOf("閉じたタブを開く");
    expect(labels.slice(reopenIndex + 1, reopenIndex + 3)).toEqual(["Other Tab", "Current Thread"]);
    fireEvent.click(screen.getByRole("button", { name: "Current Thread" }));
    expect(dispatchMock).toHaveBeenCalledWith({ type: "REOPEN_CLOSED_TAB", tabId: threadTab.id });
  });

  it("分割中のタブからペインの統合を指示できる", () => {
    extraPanes.push({ id: "pane-2", tabs: [], activeTabId: "" });
    render(<TabContextMenu tab={threadTab} position={{ x: 10, y: 10 }} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "ペインの分割を解除" }));
    expect(dispatchMock).toHaveBeenCalledWith({ type: "CLOSE_PANE", paneId: "pane-1" });
  });

  it("コマンドへ移動した項目をタブメニューに表示しない", () => {
    render(<TabContextMenu tab={threadTab} position={{ x: 10, y: 10 }} onClose={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "すべて閉じる" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "右のペインで開く" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "スレタイ&URLをMarkdownでコピー" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "datのURLをコピー" })).not.toBeInTheDocument();
  });

  it.each([
    ["他のタブを閉じる", "CLOSE_OTHER_TABS"],
    ["下のタブを閉じる", "CLOSE_RIGHT_TABS"],
  ])("%sを対象ペインに実行する", (label, type) => {
    render(<TabContextMenu tab={threadTab} position={{ x: 10, y: 10 }} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(dispatchMock).toHaveBeenCalledWith({ type, tabId: threadTab.id, paneId: "pane-1" });
  });

  it("スレッドのコピー項目を統一された順序とアイコンで表示する", () => {
    render(<TabContextMenu tab={threadTab} position={{ x: 10, y: 10 }} onClose={vi.fn()} />);

    const copyLabels = ["スレタイをコピー", "URLをコピー", "スレタイ＆URLをコピー"];
    const copyButtons = Array.from(
      document.querySelectorAll<HTMLButtonElement>(".context-menu__item"),
    ).filter((button) => copyLabels.includes(button.textContent?.trim() ?? ""));
    expect(copyButtons).toHaveLength(copyLabels.length);
    expect(copyButtons.map((button) => button.textContent?.trim())).toEqual(copyLabels);
    for (const button of copyButtons) {
      expect(button.querySelector("svg")).toHaveClass("lucide-clipboard");
    }

    fireEvent.click(copyButtons[2]!);
    expect(copyTextMock).toHaveBeenLastCalledWith(
      "Current Thread\nhttps://example.com/test/read.cgi/software/123/",
      expect.objectContaining({
        window: expect.any(Object),
        document: expect.any(Object),
      }),
    );
  });

  it("閉じる操作を対象タブのコマンドとして実行する", () => {
    render(<TabContextMenu tab={threadTab} position={{ x: 10, y: 10 }} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "タブを閉じる" }));
    expect(dispatchMock).toHaveBeenCalledWith({
      type: "CLOSE_TAB",
      tabId: threadTab.id,
      paneId: "pane-1",
    });
  });
});
