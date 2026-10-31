import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  type DisplayThread,
  THREAD_LIST_COLUMNS,
} from "src/features/thread-list/ui/thread-list-shared";
import { container as serviceContainer } from "src/service-container/index";
import { setupTestPageTypes } from "src/test-support/page-types-test-setup";
import {
  askBoardTitle,
  bookmarkGetMock,
  cacheGetMock,
  dispatchMock,
  updateViewStateMock,
  viewStateRef,
} from "src/test-support/thread-list-page-mocks";
import {
  getRenderedThreadTitles,
  setupThreadListPageTest,
  THREADS,
} from "src/test-support/thread-list-page-test-support";
import { ThreadListPage } from "src/view/browser/pages/ThreadListPage";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("src/app/logger", async () =>
  (await import("src/test-support/thread-list-page-mocks")).createLoggerModule(),
);
vi.mock("src/features/thread-list/ui/thread-list-shared", async (importOriginal) =>
  (await import("src/test-support/thread-list-page-mocks")).createThreadListSharedModule(
    await importOriginal<typeof import("src/features/thread-list/ui/thread-list-shared")>(),
  ),
);
vi.mock("src/core/board/BoardUrlNormalizer", async (importOriginal) =>
  (await import("src/test-support/thread-list-page-mocks")).createBoardUrlNormalizerModule(
    await importOriginal<typeof import("src/core/board/BoardUrlNormalizer")>(),
  ),
);
vi.mock("src/view/browser/state/tabs/use-tab-store", async () =>
  (await import("src/test-support/thread-list-page-mocks")).createUseTabStoreModule(),
);

describe("ThreadListPage", () => {
  const pageState = setupThreadListPageTest();

  it("スレ一覧のフィルタを板ごとに復元し、保存更新で入力中の値を巻き戻さない", async () => {
    vi.useRealTimers();
    viewStateRef.current = { searchQuery: "A Thread" };

    const softwarePage = {
      type: "threadList" as const,
      title: "Software",
      boardUrl: "https://egg.5ch.net/software/",
      boardTitle: "Software",
    };
    const { rerender } = render(
      <ThreadListPage tabId="tab-1" page={softwarePage} refreshKey={0} isActive={true} />,
    );

    await waitFor(() => {
      expect(screen.getByRole("textbox")).toHaveValue("A Thread");
    });

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "B Thread" } });
    expect(updateViewStateMock).toHaveBeenCalledWith(
      expect.objectContaining({ searchQuery: "B Thread" }),
    );

    // タブストアの再描画が入力イベントより先に届いても、同じ板の入力値は維持する。
    viewStateRef.current = { searchQuery: "" };
    rerender(<ThreadListPage tabId="tab-1" page={softwarePage} refreshKey={0} isActive={true} />);
    expect(screen.getByRole("textbox")).toHaveValue("B Thread");

    // 板を切り替えたときだけ、切り替え先の板に保存された値を復元する。
    viewStateRef.current = { searchQuery: "C Thread" };
    rerender(
      <ThreadListPage
        tabId="tab-1"
        page={{
          type: "threadList",
          title: "News",
          boardUrl: "https://egg.5ch.net/news/",
          boardTitle: "News",
        }}
        refreshKey={0}
        isActive={true}
      />,
    );
    await waitFor(() => {
      expect(screen.getByRole("textbox")).toHaveValue("C Thread");
    });
  });

  it("同じsiteでは保存したソート順を復元し、別siteには持ち込まない", async () => {
    vi.useRealTimers();

    const { rerender } = render(
      <ThreadListPage
        tabId="tab-1"
        page={{
          type: "threadList",
          title: "Software",
          boardUrl: "https://egg.5ch.net/software/",
          boardTitle: "Software",
        }}
        refreshKey={0}
        isActive={true}
      />,
    );

    await waitFor(() => {
      expect(getRenderedThreadTitles()).toEqual(["B Thread", "A Thread", "C Thread"]);
    });

    fireEvent.click(screen.getByRole("columnheader", { name: /レス/ }));

    await waitFor(() => {
      expect(getRenderedThreadTitles()).toEqual(["A Thread", "C Thread", "B Thread"]);
    });

    rerender(
      <ThreadListPage
        tabId="tab-1"
        page={{
          type: "threadList",
          title: "VIP",
          boardUrl: "https://itest.5ch.net/news4vip/",
          boardTitle: "VIP",
        }}
        refreshKey={0}
        isActive={true}
      />,
    );

    await waitFor(() => {
      expect(pageState.getThreadsMock).toHaveBeenCalledTimes(2);
      expect(getRenderedThreadTitles()).toEqual(["A Thread", "C Thread", "B Thread"]);
    });

    rerender(
      <ThreadListPage
        tabId="tab-1"
        page={{
          type: "threadList",
          title: "Open2ch",
          boardUrl: "https://hayabusa.open2ch.net/livejupiter/",
          boardTitle: "Open2ch",
        }}
        refreshKey={0}
        isActive={true}
      />,
    );

    await waitFor(() => {
      expect(pageState.getThreadsMock).toHaveBeenCalledTimes(3);
      expect(getRenderedThreadTitles()).toEqual(["B Thread", "A Thread", "C Thread"]);
    });
  });

  it("一覧データがある場合はresult.messageをエラー表示しない", async () => {
    vi.useRealTimers();

    pageState.getThreadsMock.mockResolvedValueOnce({
      threads: THREADS,
      message: "板の読み込みに失敗しました",
    });

    render(
      <ThreadListPage
        tabId="tab-1"
        page={{
          type: "threadList",
          title: "Software",
          boardUrl: "https://egg.5ch.net/software/",
          boardTitle: "Software",
        }}
        refreshKey={0}
        isActive={true}
      />,
    );

    await waitFor(() => {
      expect(getRenderedThreadTitles()).toEqual(["B Thread", "A Thread", "C Thread"]);
    });

    expect(screen.queryByText("板の読み込みに失敗しました")).toBeNull();
  });

  it("取得結果が空でもキャッシュを復元できれば警告を表示しない", async () => {
    vi.useRealTimers();
    cacheGetMock.mockResolvedValue(THREADS);
    pageState.getThreadsMock.mockResolvedValueOnce({
      threads: [],
      message: "板の読み込みに失敗しました",
    });

    render(
      <ThreadListPage
        tabId="tab-1"
        page={{
          type: "threadList",
          title: "Software",
          boardUrl: "https://example.com/software/",
          boardTitle: "Software",
        }}
        refreshKey={0}
        isActive={true}
      />,
    );

    await waitFor(() => {
      expect(getRenderedThreadTitles()).toEqual(["B Thread", "A Thread", "C Thread"]);
    });
    expect(screen.queryByText("板の読み込みに失敗しました")).toBeNull();
  });

  it("未読数列を表示して未読数でソートできる", async () => {
    vi.useRealTimers();

    render(
      <ThreadListPage
        tabId="tab-1"
        page={{
          type: "threadList",
          title: "Software",
          boardUrl: "https://egg.5ch.net/software/",
          boardTitle: "Software",
        }}
        refreshKey={0}
        isActive={true}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("columnheader", { name: /未読/ })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("columnheader", { name: /未読/ }));

    await waitFor(() => {
      expect(getRenderedThreadTitles()).toEqual(["A Thread", "B Thread", "C Thread"]);
    });

    fireEvent.click(screen.getByRole("columnheader", { name: /未読/ }));

    await waitFor(() => {
      expect(getRenderedThreadTitles()).toEqual(["C Thread", "B Thread", "A Thread"]);
    });
  });

  it("未読数は閲覧済みスレだけに青いバッジで表示する", async () => {
    vi.useRealTimers();
    pageState.getThreadsMock.mockResolvedValueOnce({
      threads: [THREADS[0], { ...THREADS[1], readState: undefined }],
      message: null,
    });

    render(
      <ThreadListPage
        tabId="tab-1"
        page={{
          type: "threadList",
          title: "Software",
          boardUrl: "https://egg.5ch.net/software/",
          boardTitle: "Software",
        }}
        refreshKey={0}
        isActive={true}
      />,
    );

    await waitFor(() => {
      expect(getRenderedThreadTitles()).toEqual(["B Thread", "A Thread"]);
    });

    const badges = document.querySelectorAll(".thread-list__unread-badge");
    expect(badges).toHaveLength(1);
    expect(badges[0]).toHaveTextContent("6");
    expect(badges[0]).toHaveClass("thread-list__unread-badge");

    const unseenRow = Array.from(document.querySelectorAll(".simple-data-table__row")).find((row) =>
      row.textContent?.includes("A Thread"),
    );
    expect(unseenRow?.querySelector(".thread-list__unread-badge")).toBeNull();
  });

  it("一度開いたスレの一覧文字色を控えめにする", async () => {
    vi.useRealTimers();
    pageState.getThreadsMock.mockResolvedValueOnce({
      threads: [THREADS[0], { ...THREADS[1], readState: undefined }],
      message: null,
    });

    render(
      <ThreadListPage
        tabId="tab-1"
        page={{
          type: "threadList",
          title: "Software",
          boardUrl: "https://egg.5ch.net/software/",
          boardTitle: "Software",
        }}
        refreshKey={0}
        isActive={true}
      />,
    );

    await waitFor(() => {
      expect(getRenderedThreadTitles()).toEqual(["B Thread", "A Thread"]);
    });

    const findRowByTitle = (title: string) =>
      Array.from(document.querySelectorAll(".simple-data-table__row")).find((row) =>
        row.textContent?.includes(title),
      );

    expect(findRowByTitle("B Thread")).toHaveClass("thread-list__row--visited");
    expect(findRowByTitle("A Thread")).not.toHaveClass("thread-list__row--visited");
  });

  it("ハイライトスレのタイトル横にバッヂを表示しない", () => {
    const titleColumn = THREAD_LIST_COLUMNS.find((column) => column.key === "title");
    if (!titleColumn) throw new Error("タイトル列が見つかりません");

    const highlightedThread: DisplayThread = {
      thread: {
        ...THREADS[0],
        highlight: {
          type: "HighlightTitle",
          action: "highlight",
          params: { label: "注目", bgColor: "yellow" },
        },
      },
      originalIndex: 0,
      unreadCount: 3,
      heat: 1,
      isBookmarked: false,
    };

    render(<>{titleColumn.cell(highlightedThread)}</>);

    expect(screen.queryByText("注目")).toBeNull();
    expect(document.querySelector(".thread-list__label")).toBeNull();
  });

  it("ブックマーク済みスレに星を表示し、右クリック項目にアイコンを付ける", async () => {
    vi.useRealTimers();
    bookmarkGetMock.mockImplementation((url: string) =>
      url === THREADS[0].url ? { url, title: THREADS[0].title, type: "thread" } : undefined,
    );

    render(
      <ThreadListPage
        tabId="tab-1"
        tab={{
          id: "tab-1",
          history: [
            {
              type: "threadList",
              title: "Software",
              boardUrl: "https://egg.5ch.net/software/",
              boardTitle: "Software",
            },
          ],
          currentIndex: 0,
          pinned: false,
          reloadKey: 0,
          autoRefreshEnabled: false,
          autoRefreshPageKey: null,
        }}
        page={{
          type: "threadList",
          title: "Software",
          boardUrl: "https://egg.5ch.net/software/",
          boardTitle: "Software",
        }}
        refreshKey={0}
        isActive={true}
      />,
    );

    await waitFor(() => {
      expect(document.querySelectorAll(".thread-list__bookmark-star")).toHaveLength(1);
    });

    bookmarkGetMock.mockReturnValue(undefined);
    for (const handler of pageState.messageListeners.get("bookmark_updated") ?? []) {
      handler({} as never);
    }
    await waitFor(() => {
      expect(document.querySelectorAll(".thread-list__bookmark-star")).toHaveLength(0);
    });

    const firstRow = document.querySelector(".simple-data-table__row");
    expect(firstRow).not.toBeNull();
    fireEvent.contextMenu(firstRow as HTMLElement, { clientX: 20, clientY: 20 });

    await waitFor(() => {
      const menu = document.querySelector(".context-menu");
      expect(menu).not.toBeNull();
      // このタブは履歴先頭のため、戻る先が存在しない。
      expect(menu?.querySelector('[aria-label="戻る"]')).toBeDisabled();
      expect(menu?.querySelector('[aria-label="進む"]')).not.toBeNull();
      expect(menu?.querySelector('[aria-label="更新"]')).not.toBeNull();
      expect(menu?.querySelector(".context-menu__header-actions")).not.toBeNull();
      // NG・ブックマーク・ログ/履歴削除と3種類のコピーにアイコンを表示する。
      expect(menu?.querySelectorAll(".context-menu__item .context-menu__icon")).toHaveLength(6);
    });
  });

  it("板URLが変わったらタイトル解決を再実行する", async () => {
    vi.useRealTimers();

    const askBoardTitleMock = vi.mocked(askBoardTitle);
    askBoardTitleMock.mockResolvedValueOnce("Software");
    askBoardTitleMock.mockResolvedValueOnce("News");

    const { rerender } = render(
      <ThreadListPage
        tabId="tab-1"
        page={{
          type: "threadList",
          title: "https://egg.5ch.net/software/",
          boardUrl: "https://egg.5ch.net/software/",
          boardTitle: "https://egg.5ch.net/software/",
        }}
        refreshKey={0}
        isActive={true}
      />,
    );

    await waitFor(() => {
      expect(dispatchMock).toHaveBeenCalledWith({
        type: "UPDATE_TITLE_FOR_TAB",
        tabId: "tab-1",
        title: "Software",
        boardUrl: "https://egg.5ch.net/software/",
      });
    });

    rerender(
      <ThreadListPage
        tabId="tab-1"
        page={{
          type: "threadList",
          title: "https://egg.5ch.net/news/",
          boardUrl: "https://egg.5ch.net/news/",
          boardTitle: "https://egg.5ch.net/news/",
        }}
        refreshKey={0}
        isActive={true}
      />,
    );

    await waitFor(() => {
      expect(dispatchMock).toHaveBeenCalledWith({
        type: "UPDATE_TITLE_FOR_TAB",
        tabId: "tab-1",
        title: "News",
        boardUrl: "https://egg.5ch.net/news/",
      });
    });

    expect(askBoardTitleMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    {
      boardUrl: "http://bbs.eddibb.cc/liveedge/",
      placeholderTitle: "bbs.eddibb.cc/liveedge",
      resolvedTitle: "エッヂ",
    },
    {
      boardUrl: "https://tulip-garden.net/garden/",
      placeholderTitle: "tulip-garden.net/garden",
      resolvedTitle: "チューリップ庭園",
    },
  ])(
    "URL由来の仮タイトルでは板名再解決をスキップしない: $boardUrl",
    async ({ boardUrl, placeholderTitle, resolvedTitle }) => {
      vi.useRealTimers();

      const askBoardTitleMock = vi.mocked(askBoardTitle);
      askBoardTitleMock.mockResolvedValueOnce(resolvedTitle);

      render(
        <ThreadListPage
          tabId="tab-1"
          page={{
            type: "threadList",
            title: boardUrl,
            boardUrl,
            boardTitle: placeholderTitle,
          }}
          refreshKey={0}
          isActive={true}
        />,
      );

      await waitFor(() => {
        expect(dispatchMock).toHaveBeenCalledWith({
          type: "UPDATE_TITLE_FOR_TAB",
          tabId: "tab-1",
          title: resolvedTitle,
          boardUrl,
        });
      });

      expect(askBoardTitleMock).toHaveBeenCalledTimes(1);
    },
  );

  it("既に解決済みの title があるときは URL由来 boardTitle で上書きしない", async () => {
    vi.useRealTimers();

    const askBoardTitleMock = vi.mocked(askBoardTitle);

    render(
      <ThreadListPage
        tabId="tab-1"
        page={{
          type: "threadList",
          title: "チューリップ庭園",
          boardUrl: "https://tulip-garden.net/garden/",
          boardTitle: "tulip-garden.net/garden",
        }}
        refreshKey={0}
        isActive={true}
      />,
    );

    await waitFor(() => {
      // oxlint-disable-next-line unbound-method
      expect(serviceContainer.board.getThreads).toHaveBeenCalled();
    });

    expect(askBoardTitleMock).not.toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalledWith({
      type: "UPDATE_TITLE_FOR_TAB",
      tabId: "tab-1",
      title: "tulip-garden.net/garden",
    });
  });
});

setupTestPageTypes();
