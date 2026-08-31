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

  it("通常URLとMarkdownリンクのコピーをタブメニューから実行できる", () => {
    render(<TabContextMenu tab={threadTab} position={{ x: 10, y: 10 }} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "URLをコピー" }));
    expect(copyTextMock).toHaveBeenLastCalledWith(
      "https://egg.5ch.net/test/read.cgi/software/123/",
    );

    expect(screen.getByRole("button", { name: "スレタイ&URLをコピー" })).toBeInTheDocument();
    const markdownButton = screen.getByRole("button", {
      name: "スレタイ&URLをMarkdownでコピー",
    });
    expect(markdownButton).toBeInTheDocument();

    fireEvent.click(markdownButton);
    expect(copyTextMock).toHaveBeenLastCalledWith(
      "[Current Thread](https://egg.5ch.net/test/read.cgi/software/123/)",
    );
    expect(screen.queryByRole("button", { name: "datのURLをコピー" })).not.toBeInTheDocument();
  });
});
