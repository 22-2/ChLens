import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { container } from "src/service-container";
import { TabContextMenu } from "src/view/browser/components/TabContextMenu";
import type { Tab } from "src/view/browser/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { copyTextMock, dispatchMock, threadTab } = vi.hoisted(() => ({
  copyTextMock: vi.fn<() => Promise<void>>(),
  dispatchMock: vi.fn(),
  threadTab: {
    id: "tab-1",
    history: [
      {
        type: "thread" as const,
        title: "Current Thread",
        threadUrl: "https://egg.5ch.net/test/read.cgi/software/123/",
      },
    ],
    currentIndex: 0,
    pinned: false,
    reloadKey: 0,
    autoRefreshEnabled: false,
    autoRefreshPageKey: null,
  } satisfies Tab,
}));

vi.mock("src/view/browser/utils/clipboard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("src/view/browser/utils/clipboard")>();
  return { ...actual, copyText: copyTextMock };
});

vi.mock("src/view/browser/hooks/use-tab-store", () => ({
  useTabStore: () => ({
    state: {
      tabs: [threadTab],
      closedTabs: [],
    },
    dispatch: dispatchMock,
  }),
}));

describe("TabContextMenu", () => {
  beforeEach(() => {
    copyTextMock.mockResolvedValue();
    container.bookmark = {
      get: vi.fn(),
      add: vi.fn(),
      remove: vi.fn(),
      updateResCount: vi.fn(),
      updateExpired: vi.fn(),
      getByBoard: vi.fn(),
    };
  });

  afterEach(() => {
    cleanup();
    copyTextMock.mockReset();
    dispatchMock.mockReset();
  });

  it("コマンドへ移動した項目をタブメニューに表示しない", () => {
    render(<TabContextMenu tab={threadTab} position={{ x: 10, y: 10 }} onClose={vi.fn()} />);

    // 変更理由: 他・右側・すべてのタブを閉じる、右ペインで開く、URLとMarkdownのコピーは
    // コマンドパレットへ移動したため、タブメニューには置かない。
    expect(screen.queryByRole("button", { name: "他のタブを閉じる" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "右側のタブを閉じる" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "すべて閉じる" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "右のペインで開く" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "URLをコピー" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "スレタイ&URLをMarkdownでコピー" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "datのURLをコピー" })).not.toBeInTheDocument();
  });

  it("残したスレタイ&URLのコピーをタブメニューから実行できる", () => {
    render(<TabContextMenu tab={threadTab} position={{ x: 10, y: 10 }} onClose={vi.fn()} />);

    expect(screen.getByRole("button", { name: "タブを閉じる" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "スレタイ&URLをコピー" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "スレタイ&URLをコピー" }));
    expect(copyTextMock).toHaveBeenLastCalledWith(
      "Current Thread\nhttps://egg.5ch.net/test/read.cgi/software/123/",
    );
  });
});
