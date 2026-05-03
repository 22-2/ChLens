import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { WriteHistoryListPage } from "src/view/browser/pages/WriteHistoryListPage";
import { QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE } from "src/view/browser/utils/filter-toolbar-events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockUseTabStore = vi.fn();

vi.mock("src/view/browser/hooks/use-tab-store", () => ({
  useTabStore: () => mockUseTabStore(),
}));

interface WriteHistoryService {
  get: (offset?: number, count?: number) => Promise<unknown[]>;
}

interface AppLikeWindow extends Window {
  app?: {
    WriteHistory?: WriteHistoryService;
  };
}

describe("WriteHistoryListPage", () => {
  const writeHistoryGet = vi.fn<WriteHistoryService["get"]>();

  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mockUseTabStore.mockReset();
    writeHistoryGet.mockReset();

    mockUseTabStore.mockReturnValue({
      dispatch: vi.fn(),
      state: {
        tabs: [],
        activeTabId: "tab-1",
        closedTabs: [],
      },
      currentPage: {
        type: "writeHistoryList",
        title: "書き込み履歴",
      },
    });

    (window as AppLikeWindow).app = {
      WriteHistory: {
        get: writeHistoryGet,
      },
    };
  });

  it("本文列と短い日時表記を表示する", async () => {
    writeHistoryGet.mockResolvedValueOnce([
      {
        url: "https://example.com/test/read.cgi/live/1/",
        title: "スレ1",
        writtenRes: 42,
        name: "風吹けば名無し",
        mail: "sage",
        message: "これは書き込み本文です",
        date: new Date(2026, 4, 3, 9, 8).getTime(),
      },
    ]);

    render(<WriteHistoryListPage tabId="tab-1" />);

    expect(await screen.findByText("本文")).toBeInTheDocument();
    expect(screen.getByText("これは書き込み本文です")).toBeInTheDocument();
    expect(screen.getByText("2026/05/03 09:08")).toBeInTheDocument();
  });

  it("書き込み履歴フィルターバーをメニューイベントで開閉できる", async () => {
    writeHistoryGet.mockResolvedValueOnce([
      {
        url: "https://example.com/test/read.cgi/live/1/",
        title: "スレ1",
        writtenRes: 42,
        name: "風吹けば名無し",
        mail: "sage",
        message: "これは書き込み本文です",
        date: new Date(2026, 4, 3, 9, 8).getTime(),
      },
    ]);

    render(<WriteHistoryListPage tabId="tab-1" />);

    await screen.findByText("本文");
    expect(screen.queryByPlaceholderText("検索...")).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(
        new window.CustomEvent(
          QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE.writeHistoryList,
          {
            detail: { tabId: "tab-1" },
          },
        ),
      );
    });

    const input = screen.getByPlaceholderText("検索...");
    expect(input).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "本文" } });
    fireEvent.click(screen.getByRole("button", { name: "✕" }));

    expect(screen.queryByPlaceholderText("検索...")).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(
        new window.CustomEvent(
          QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE.writeHistoryList,
          {
            detail: { tabId: "tab-1" },
          },
        ),
      );
    });

    expect(screen.getByPlaceholderText("検索...")).toHaveValue("");
  });
});
