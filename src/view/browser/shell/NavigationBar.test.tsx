import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import * as snapshots from "src/features/thread-list/ui/thread-list-snapshots";
import { container } from "src/service-container";
import type { BookmarkUpdatedHandler } from "src/test-support/navigation-bar-mocks";
import {
  bookmarkAddMock,
  bookmarkGetAllMock,
  bookmarkGetMock,
  bookmarkRemoveMock,
  bookmarkState,
  defaultHistory,
  dispatchMock,
  historyGetMock,
  loadRecentCommandIdsMock,
  longTitle,
  orientationHolder,
  paneHolder,
  requestThreadResJumpMock,
  saveRecentCommandIdsMock,
  toastErrorMock,
  toastInfoMock,
  viewTab,
} from "src/test-support/navigation-bar-mocks";
import {
  openUrlBar,
  setupNavigationBarCommands,
} from "src/test-support/navigation-bar-test-support";
import { setupTestPageTypes } from "src/test-support/page-types-test-setup";
import {
  commandPalette,
  commandPaletteStore,
} from "src/view/browser/commands/command-palette-store";
import { registerFilterToggle } from "src/view/browser/extension/page-actions";
import { NavigationBar } from "src/view/browser/shell/NavigationBar";
import {
  setFilterToolbarOpen,
  setFilterToolbarPinned,
} from "src/view/browser/utils/filter-toolbar-open-state";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

// browser-commands は拡張機能向け依存を含むため、DOM単体テストではAPIモジュールを差し替える。
vi.mock("webextension-polyfill", () => ({ default: {} }));
vi.mock("src/view/browser/utils/thread-read-state", async () =>
  (await import("src/test-support/navigation-bar-mocks")).createThreadReadStateModule(),
);
vi.mock("src/view/browser/commands/command-palette-history", async () =>
  (await import("src/test-support/navigation-bar-mocks")).createCommandPaletteHistoryModule(),
);
vi.mock("src/view/browser/state/tabs/use-tab-store", async () =>
  (await import("src/test-support/navigation-bar-mocks")).createTabStoreModule(),
);
vi.mock("src/features/tabs/browser/use-tab-bar-orientation", async () =>
  (await import("src/test-support/navigation-bar-mocks")).createTabBarOrientationModule(),
);
vi.mock("src/view/browser/hooks/use-bottom-panel", async () =>
  (await import("src/test-support/navigation-bar-mocks")).createBottomPanelModule(),
);

setupNavigationBarCommands();

describe("NavigationBar", () => {
  beforeEach(() => {
    bookmarkState.urls = new Set<string>();
    bookmarkState.updatedHandler = null;
    orientationHolder.value = "horizontal";
    paneHolder.panes = [{ id: "pane-1" }];
    paneHolder.activePaneId = "pane-1";

    bookmarkGetMock.mockImplementation((url: string) =>
      bookmarkState.urls.has(url)
        ? {
            url,
            title: url,
            type: url.includes("/test/read.cgi/") ? "thread" : "board",
          }
        : undefined,
    );
    bookmarkAddMock.mockImplementation(
      (item: { url: string; title: string; type: "thread" | "board" }) => {
        bookmarkState.urls.add(item.url);
        bookmarkState.updatedHandler?.({ bookmark: { url: item.url } });
      },
    );
    bookmarkRemoveMock.mockImplementation((url: string) => {
      bookmarkState.urls.delete(url);
      bookmarkState.updatedHandler?.({ bookmark: { url } });
    });

    bookmarkGetAllMock.mockReturnValue([]);
    // URLバー候補の閲覧履歴はサービスコンテナから読む（legacy-window-app-plan の Phase 1）。
    container.history = { get: historyGetMock } as unknown as typeof container.history;
    container.bookmark = {
      promiseFirstScan: Promise.resolve(true),
      ready: vi.fn(async () => undefined),
      // URLバー候補のブックマークは window.app ではなくサービスコンテナから読む（legacy-window-app-plan の Phase 2）。
      getAll: bookmarkGetAllMock,
      import: vi.fn(async () => true),
      get: bookmarkGetMock,
      add: bookmarkAddMock,
      remove: bookmarkRemoveMock,
      clearReadState: vi.fn(),
      updateResCount: vi.fn(),
      updateExpired: vi.fn(),
      getByBoard: vi.fn(),
      getAllBoards: vi.fn(() => []),
    };
    container.message = {
      send: vi.fn(),
      on: (type, callback) => {
        if (type === "bookmark_updated") {
          bookmarkState.updatedHandler = callback as BookmarkUpdatedHandler | null;
        }
      },
      off: (type, callback) => {
        if (type === "bookmark_updated" && bookmarkState.updatedHandler === callback) {
          bookmarkState.updatedHandler = null;
        }
      },
    };
    container.toast = {
      notify: vi.fn(),
      success: vi.fn(),
      error: toastErrorMock,
      info: toastInfoMock,
    };
  });

  afterEach(() => {
    cleanup();
    commandPalette.close();
    commandPaletteStore.updateState((current) => ({ ...current, selected: -1 }));
    dispatchMock.mockReset();
    bookmarkGetAllMock.mockReset();
    historyGetMock.mockReset();
    bookmarkGetMock.mockReset();
    bookmarkAddMock.mockReset();
    bookmarkRemoveMock.mockReset();
    toastInfoMock.mockReset();
    toastErrorMock.mockReset();
    requestThreadResJumpMock.mockReset();
    loadRecentCommandIdsMock.mockClear();
    saveRecentCommandIdsMock.mockReset();
    bookmarkState.updatedHandler = null;
    bookmarkState.urls = new Set<string>();
    viewTab.history = [...defaultHistory];
    viewTab.currentIndex = 1;
  });

  it("URLバー候補は『タイトル URL』の並びで表示し、お気に入りを優先する", async () => {
    bookmarkGetAllMock.mockReturnValue([
      {
        url: "https://egg.5ch.io/test/read.cgi/software/111/",
        title: "openai bookmark",
      },
    ]);
    historyGetMock.mockResolvedValue([
      {
        url: "https://egg.5ch.io/test/read.cgi/software/222/",
        // 最短一致の優先度を揃え、お気に入りの加点だけで並び順を検証する。
        title: "openai archived",
        viewedDate: 1000000001000,
      },
    ]);

    render(<NavigationBar />);

    openUrlBar();
    const input = screen.getByPlaceholderText("URLを入力");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "openai" } });

    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent("openai bookmark");
    expect(options[0]).toHaveTextContent("https://egg.5ch.io/test/read.cgi/software/111/");
  });

  it("URLバー候補は同じ項目の複数の出典をアイコンで示す", async () => {
    const url = "https://egg.5ch.io/test/read.cgi/software/111/";
    bookmarkGetAllMock.mockReturnValue([{ url, title: "openai bookmark" }]);
    historyGetMock.mockResolvedValue([{ url, title: "openai history" }]);

    render(<NavigationBar />);

    openUrlBar();
    const input = screen.getByPlaceholderText("URLを入力");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "openai" } });

    const option = await screen.findByRole("option");
    expect(within(option).getByRole("img", { name: "閲覧履歴・ブックマーク" })).toBeInTheDocument();
  });

  it("> prefixでコマンドを検索し、Ctrl+Shift+Pでコマンドモードを開く", async () => {
    render(<NavigationBar />);

    fireEvent.keyDown(window, { key: "P", ctrlKey: true, shiftKey: true });

    const input = await screen.findByPlaceholderText("コマンドを検索...");
    expect(input).toHaveValue(">");
    expect(screen.getByRole("listbox", { name: "コマンド候補" })).toBeInTheDocument();

    fireEvent.change(input, { target: { value: ">設定" } });
    expect(screen.getByRole("option", { name: /設定を開く/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("option", { name: /設定を開く/ }));
    await waitFor(() => {
      expect(dispatchMock).toHaveBeenNthCalledWith(1, {
        type: "OPEN_IN_NEW_TAB_FORCE",
        focus: true,
        page: { type: "settings", title: "設定" },
      });
    });
  });

  it("コマンドパレットはフォーカスアウトで閉じる", async () => {
    render(<NavigationBar />);

    fireEvent.keyDown(window, { key: "p", ctrlKey: true, shiftKey: true });
    const input = await screen.findByPlaceholderText("コマンドを検索...");
    expect(screen.getByRole("listbox", { name: "コマンド候補" })).toBeInTheDocument();

    const outside = document.createElement("button");
    document.body.append(outside);
    fireEvent.blur(input, { relatedTarget: outside });

    await waitFor(() => {
      expect(commandPaletteStore.getState().opened).toBe(false);
    });
    expect(screen.queryByRole("listbox", { name: "コマンド候補" })).not.toBeInTheDocument();
    outside.remove();
  });

  it("コマンドパレットはウィンドウのフォーカスアウトでも閉じる", async () => {
    render(<NavigationBar />);

    fireEvent.keyDown(window, { key: "p", ctrlKey: true, shiftKey: true });
    await screen.findByPlaceholderText("コマンドを検索...");
    expect(commandPaletteStore.getState().opened).toBe(true);

    window.dispatchEvent(new Event("blur"));

    await waitFor(() => {
      expect(commandPaletteStore.getState().opened).toBe(false);
    });
    expect(screen.queryByRole("listbox", { name: "コマンド候補" })).not.toBeInTheDocument();
  });

  it("コマンド候補からレス番号ジャンプの入力へ移行する", async () => {
    render(<NavigationBar />);

    fireEvent.keyDown(window, { key: "p", ctrlKey: true, shiftKey: true });
    const input = await screen.findByPlaceholderText("コマンドを検索...");
    fireEvent.change(input, { target: { value: ">レス番号" } });
    fireEvent.click(screen.getByRole("option", { name: /レス番号を指定してジャンプ/ }));

    const responseNumber = await screen.findByLabelText("レス番号");
    fireEvent.change(responseNumber, { target: { value: "42" } });
    fireEvent.click(screen.getByRole("button", { name: "ジャンプ" }));

    expect(requestThreadResJumpMock).toHaveBeenCalledWith(
      "https://egg.5ch.net/test/read.cgi/software/1/",
      42,
    );
  });

  it("数字入力のレス番号ジャンプ候補を最上位から直接実行する", async () => {
    render(<NavigationBar />);

    fireEvent.keyDown(window, { key: "p", ctrlKey: true, shiftKey: true });
    const input = await screen.findByPlaceholderText("コマンドを検索...");
    fireEvent.change(input, { target: { value: ">42" } });

    const jumpOption = await screen.findByRole("option", { name: /レス42へジャンプ/ });
    expect(screen.getAllByRole("option")[0]).toBe(jumpOption);
    fireEvent.click(jumpOption);

    await waitFor(() => {
      expect(requestThreadResJumpMock).toHaveBeenCalledWith(
        "https://egg.5ch.net/test/read.cgi/software/1/",
        42,
      );
    });
    expect(screen.queryByLabelText("レス番号")).not.toBeInTheDocument();
  });

  it("コマンドモードのURL入力を最上位の開く候補から直接実行する", async () => {
    render(<NavigationBar />);

    fireEvent.keyDown(window, { key: "p", ctrlKey: true, shiftKey: true });
    const input = await screen.findByPlaceholderText("コマンドを検索...");
    fireEvent.change(input, {
      target: { value: ">https://example.com/test/read.cgi/software/1788743729/" },
    });

    const openOption = await screen.findByRole("option", { name: /このURLを開く/ });
    expect(screen.getAllByRole("option")[0]).toBe(openOption);
    fireEvent.click(openOption);

    await waitFor(() => {
      expect(dispatchMock).toHaveBeenCalledWith({
        type: "NAVIGATE",
        page: {
          type: "thread",
          title: "https://example.com/test/read.cgi/software/1788743729/",
          threadUrl: "https://example.com/test/read.cgi/software/1788743729/",
        },
      });
    });
  });

  it.each([{ ctrlKey: true }, { metaKey: true }])(
    "Ctrl/Cmd+Lを横取りせずomnibarを開かない: %j",
    (modifier) => {
      render(<NavigationBar />);
      const event = new KeyboardEvent("keydown", {
        key: "l",
        ...modifier,
        bubbles: true,
        cancelable: true,
      });
      fireEvent(window, event);
      expect(event.defaultPrevented).toBe(false);
      expect(commandPaletteStore.getState().opened).toBe(false);
      expect(screen.queryByPlaceholderText("URLを入力")).not.toBeInTheDocument();
    },
  );

  it("認識したURLを『URLを開く』操作として候補に表示する", async () => {
    historyGetMock.mockResolvedValue([]);

    render(<NavigationBar />);

    openUrlBar();
    const input = screen.getByPlaceholderText("URLを入力");
    fireEvent.focus(input);
    fireEvent.change(input, {
      target: { value: "https://egg.5ch.io/test/read.cgi/board-b/123/" },
    });

    const openUrlButton = await screen.findByRole("option", { name: /URLを開く/ });
    fireEvent.click(openUrlButton);

    // 変更理由: 前居た場所へ戻れるよう、対象板の補完なしで単一遷移する。
    expect(dispatchMock).toHaveBeenCalledTimes(1);
    expect(dispatchMock).toHaveBeenNthCalledWith(1, {
      type: "NAVIGATE",
      page: {
        type: "thread",
        title: "https://egg.5ch.io/test/read.cgi/board-b/123/",
        threadUrl: "https://egg.5ch.io/test/read.cgi/board-b/123/",
      },
    });
  });

  it("認識したURLに『URLを新しいタブで開く』候補を表示する", async () => {
    historyGetMock.mockResolvedValue([]);

    render(<NavigationBar />);

    openUrlBar();
    const input = screen.getByPlaceholderText("URLを入力");
    fireEvent.focus(input);
    fireEvent.change(input, {
      target: { value: "https://egg.5ch.io/test/read.cgi/board-b/123/" },
    });

    const openInNewTabButton = await screen.findByRole("option", {
      name: /URLを新しいタブで開く/,
    });
    fireEvent.click(openInNewTabButton);

    expect(dispatchMock).toHaveBeenCalledTimes(1);
    expect(dispatchMock).toHaveBeenNthCalledWith(1, {
      type: "OPEN_IN_NEW_TAB_FORCE",
      focus: true,
      page: {
        type: "thread",
        title: "https://egg.5ch.io/test/read.cgi/board-b/123/",
        threadUrl: "https://egg.5ch.io/test/read.cgi/board-b/123/",
      },
    });
  });

  it("URL欄から別板のスレを開くと、前居た場所へ戻れるよう単一遷移する", () => {
    render(<NavigationBar />);

    openUrlBar();
    const input = screen.getByPlaceholderText("URLを入力");
    fireEvent.change(input, {
      target: { value: "https://egg.5ch.io/test/read.cgi/board-b/123/" },
    });
    fireEvent.keyDown(input, { key: "Enter" });

    // 変更理由: 対象板を履歴へ補完すると戻る先が前居た場所ではなくなるため、単一遷移にする。
    expect(dispatchMock).toHaveBeenCalledTimes(1);
    expect(dispatchMock).toHaveBeenNthCalledWith(1, {
      type: "NAVIGATE",
      page: {
        type: "thread",
        title: "https://egg.5ch.io/test/read.cgi/board-b/123/",
        threadUrl: "https://egg.5ch.io/test/read.cgi/board-b/123/",
      },
    });
  });

  it("URL入力はタイトルのピルを開いている間だけ表示し、フォーカスが外れたら閉じる", () => {
    render(<NavigationBar />);

    // 変更理由: 展開用のボタンは廃止し、常時の入力行も持たない。
    expect(screen.queryByTitle("URLバーを表示")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("URLを入力")).not.toBeInTheDocument();

    openUrlBar();

    const input = screen.getByPlaceholderText("URLを入力");
    expect(input).toHaveFocus();

    fireEvent.blur(input);

    expect(screen.queryByPlaceholderText("URLを入力")).not.toBeInTheDocument();
    expect(commandPaletteStore.getState().opened).toBe(false);
  });

  it("Escapeを押すと入力を閉じてピルへ戻す", () => {
    render(<NavigationBar />);

    openUrlBar();
    fireEvent.keyDown(screen.getByPlaceholderText("URLを入力"), { key: "Escape" });

    expect(screen.queryByPlaceholderText("URLを入力")).not.toBeInTheDocument();
  });

  it("下矢印でURLバーを開くと入力にフォーカスして候補を展開する", async () => {
    historyGetMock.mockResolvedValue([
      {
        url: "https://egg.5ch.net/test/read.cgi/software/1/",
        title: "Current Thread",
        viewedDate: 1000,
      },
    ]);

    render(<NavigationBar />);

    openUrlBar();
    const input = screen.getByPlaceholderText("URLを入力");
    expect(input).toHaveFocus();
    expect(await screen.findByRole("option", { name: /Current Thread/ })).toBeInTheDocument();
  });

  it("URLバー右端にも現在ページのブックマーク操作を表示する", async () => {
    render(<NavigationBar />);

    expect(
      screen.queryByRole("button", { name: "このページをブックマークに追加" }),
    ).not.toBeInTheDocument();

    openUrlBar();
    const bookmarkButton = screen.getByRole("button", {
      name: "このページをブックマークに追加",
    });

    expect(bookmarkButton).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(bookmarkButton);

    await waitFor(() => {
      expect(bookmarkAddMock).toHaveBeenCalledWith({
        url: "https://egg.5ch.net/test/read.cgi/software/1/",
        title: "Current Thread",
        type: "thread",
      });
    });

    // URLバー側に複製しても、既存のメニュー操作は引き続き表示する。
    fireEvent.click(screen.getByTitle("メニュー"));
    expect(
      screen.getByRole("button", {
        name: "お気に入りから削除",
      }),
    ).toBeInTheDocument();
  });

  it("設定ボタンをメニューのアイコン操作列に表示する", () => {
    render(<NavigationBar />);

    expect(screen.queryByRole("button", { name: "設定を開く" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByTitle("メニュー"));

    const settingsButton = screen.getByRole("button", { name: "設定を開く" });
    expect(settingsButton).toHaveClass("nav-bar__menu-action");

    fireEvent.click(settingsButton);

    expect(dispatchMock).toHaveBeenNthCalledWith(1, {
      type: "OPEN_IN_NEW_TAB_FORCE",
      focus: true,
      page: { type: "settings", title: "設定" },
    });
    expect(screen.queryByRole("button", { name: "設定を開く" })).not.toBeInTheDocument();
  });

  it("既存の設定タブを選択するときもメニューを閉じる", () => {
    viewTab.history = [{ type: "settings", title: "設定" }];
    viewTab.currentIndex = 0;

    render(<NavigationBar />);

    fireEvent.click(screen.getByTitle("メニュー"));
    fireEvent.click(screen.getByRole("button", { name: "設定を開く" }));

    expect(dispatchMock).toHaveBeenCalledWith({ type: "SELECT_TAB", tabId: "tab-1" });
    expect(screen.queryByRole("button", { name: "設定を開く" })).not.toBeInTheDocument();
  });

  it("2ペイン切替をタイトルバーへ移し、ナビゲーションバーには表示しない", () => {
    render(<NavigationBar />);

    const buttons = [...document.querySelectorAll(".nav-bar > button")].map((button) =>
      button.getAttribute("title"),
    );

    expect(buttons).toEqual(["フィルターを開閉", "メニュー"]);
    expect(screen.queryByTitle("2ペインで表示")).not.toBeInTheDocument();
  });

  it("頻繁なナビゲーション操作をハンバーガーメニューの最上段に表示する", () => {
    render(<NavigationBar />);

    fireEvent.click(screen.getByTitle("メニュー"));

    const actions = screen.getByRole("group", { name: "ナビゲーション操作" });
    expect(actions).toBeInTheDocument();
    expect(within(actions).getByTitle("戻る")).toBeInTheDocument();
    expect(within(actions).getByTitle("進む")).toBeInTheDocument();
    expect(within(actions).getByTitle("更新")).toBeInTheDocument();
    expect(within(actions).getByTitle("お気に入りに追加")).toBeInTheDocument();
  });

  it("更新の右クリックメニューから過去の一覧と最新の一覧を切り替える", async () => {
    viewTab.currentIndex = 0;
    const snapshot = {
      url: "snapshot:test",
      last_modified: "https://example.com/board/",
      last_updated: Date.now() - 5 * 60_000,
      threads: [],
    };
    const getSnapshots = vi
      .spyOn(snapshots, "getThreadListSnapshots")
      .mockResolvedValue([snapshot]);
    function Selection() {
      return (
        <span data-testid="selection">
          {snapshots.useSelectedThreadListSnapshot(viewTab.id)?.url ?? "latest"}
        </span>
      );
    }
    render(
      <>
        <NavigationBar />
        <Selection />
      </>,
    );
    fireEvent.click(screen.getByTitle("メニュー"));
    fireEvent.contextMenu(screen.getByTitle("更新"));
    expect(screen.getByText(/自動更新を開始/)).toBeInTheDocument();
    fireEvent.click(await screen.findByText("5 分前（0件）"));
    expect(screen.getByTestId("selection")).toHaveTextContent("snapshot:test");
    fireEvent.click(screen.getByTitle("メニュー"));
    fireEvent.contextMenu(screen.getByTitle("更新"));
    fireEvent.click(screen.getByText("最新の一覧"));
    expect(screen.getByTestId("selection")).toHaveTextContent("latest");
    getSnapshots.mockRestore();
  });

  it("更新の右クリックメニューは開くたびに履歴の経過時間を計算し直す", async () => {
    viewTab.currentIndex = 0;
    const now = Date.now();
    const getSnapshots = vi.spyOn(snapshots, "getThreadListSnapshots").mockResolvedValue([
      {
        url: "snapshot:test",
        last_modified: "https://example.com/board/",
        last_updated: now - 1000,
        threads: [],
      },
    ]);
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now);
    render(<NavigationBar />);
    fireEvent.click(screen.getByTitle("メニュー"));

    fireEvent.contextMenu(screen.getByTitle("更新"));
    expect(await screen.findByText("1秒前（0件）")).toBeInTheDocument();

    // 履歴の中身が同じでも、時間が進んだ後に開き直せば表示が変わる。
    nowSpy.mockReturnValue(now + 5 * 60_000);
    fireEvent.click(screen.getByTitle("メニュー"));
    fireEvent.contextMenu(screen.getByTitle("更新"));
    expect(await screen.findByText("5 分前（0件）")).toBeInTheDocument();
    nowSpy.mockRestore();
    getSnapshots.mockRestore();
  });

  it("戻る履歴メニューのタイトルを複数行表示にする", () => {
    render(<NavigationBar />);

    fireEvent.click(screen.getByTitle("メニュー"));
    fireEvent.contextMenu(screen.getByTitle("戻る"));

    const item = screen.getByRole("button", { name: longTitle });
    const label = document.querySelector(".context-menu__label--multiline") as HTMLSpanElement;

    expect(item).toHaveClass("context-menu__item--multiline");
    expect(label).toHaveTextContent(longTitle);
  });

  it("メニューを開いている間に同じボタンを押すと閉じる", () => {
    render(<NavigationBar />);

    const menuButton = screen.getByTitle("メニュー");

    fireEvent.click(menuButton);
    expect(screen.getByRole("button", { name: "コマンドパレット" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "設定を開く" })).toBeInTheDocument();

    // mousedown で先に close してしまうと click トグルで再オープンするため、
    // トリガー上の mousedown は無視して click 側で閉じることを保証する。
    fireEvent.mouseDown(menuButton);
    fireEvent.click(menuButton);

    expect(screen.queryByRole("button", { name: "コマンドパレット" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "設定を開く" })).not.toBeInTheDocument();
  });

  it("実ブラウザの押下順序でも同じボタンの2回目でメニューが閉じる", async () => {
    // 変更理由: 実ブラウザは mousedown の前に pointerdown を発し、Radix の
    // DismissableLayer がトリガー上でも先に閉じてしまう。閉じた後の click トグルで
    // 再オープンしないよう、トリガー上の pointerdown では閉じないことを保証する。
    render(<NavigationBar />);

    const menuButton = screen.getByTitle("メニュー");

    fireEvent.click(menuButton);
    const paletteButton = await screen.findByRole("button", { name: "コマンドパレット" });
    expect(paletteButton).toBeInTheDocument();

    menuButton.dispatchEvent(
      new window.MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }),
    );
    fireEvent.mouseDown(menuButton);
    fireEvent.click(menuButton);

    expect(screen.queryByRole("button", { name: "コマンドパレット" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "設定を開く" })).not.toBeInTheDocument();
  });

  it("URLバーの開閉ボタンの左にあるフィルタボタンで対象タブのフィルターを切り替える", () => {
    const toggle = vi.fn();
    const dispose = registerFilterToggle(window, viewTab.id, toggle);
    render(<NavigationBar />);

    fireEvent.click(screen.getByRole("button", { name: "フィルターを開閉" }));

    expect(toggle).toHaveBeenCalledOnce();
    dispose();
  });

  it("フィルタバーが開いている間はフィルタボタンを押下状態にして色を変える", () => {
    render(<NavigationBar />);
    const filterButton = screen.getByRole("button", { name: "フィルターを開閉" });

    expect(filterButton).toHaveAttribute("aria-pressed", "false");
    expect(filterButton).not.toHaveClass("nav-bar__filter-toggle--active");

    act(() => setFilterToolbarOpen(viewTab.id, true));
    expect(filterButton).toHaveAttribute("aria-pressed", "true");
    expect(filterButton).toHaveClass("nav-bar__filter-toggle--active");

    act(() => setFilterToolbarOpen(viewTab.id, false));
    expect(filterButton).toHaveAttribute("aria-pressed", "false");
  });

  it("フィルタバーが常時表示のスレではフィルタボタンを出さない", () => {
    render(<NavigationBar />);
    expect(screen.getByRole("button", { name: "フィルターを開閉" })).toBeInTheDocument();

    act(() => setFilterToolbarPinned(viewTab.id, true));
    expect(screen.queryByRole("button", { name: "フィルターを開閉" })).not.toBeInTheDocument();

    act(() => setFilterToolbarPinned(viewTab.id, false));
    expect(screen.getByRole("button", { name: "フィルターを開閉" })).toBeInTheDocument();
  });

  it("メニュー項目の『フィルターを開く』で対象タブのフィルターを切り替える", () => {
    const toggle = vi.fn();
    const dispose = registerFilterToggle(window, viewTab.id, toggle);
    render(<NavigationBar />);

    fireEvent.click(screen.getByTitle("メニュー"));
    fireEvent.click(screen.getByRole("button", { name: "フィルター" }));

    expect(toggle).toHaveBeenCalledOnce();
    dispose();
  });

  it("閲覧履歴ではメニュー項目の『フィルターを開く』で履歴用トグルイベントを送る", () => {
    const toggle = vi.fn();
    const dispose = registerFilterToggle(window, "tab-1", toggle);
    viewTab.history = [
      {
        type: "historyList" as const,
        title: "閲覧履歴",
      },
    ];
    viewTab.currentIndex = 0;

    render(<NavigationBar />);

    fireEvent.click(screen.getByTitle("メニュー"));
    fireEvent.click(screen.getByRole("button", { name: "フィルター" }));

    expect(toggle).toHaveBeenCalledOnce();
    dispose();
  });

  it("板一覧ではメニュー項目の『フィルターを開く』で板一覧用トグルイベントを送る", () => {
    const toggle = vi.fn();
    const dispose = registerFilterToggle(window, "tab-1", toggle);
    viewTab.history = [
      {
        type: "boardList" as const,
        title: "板一覧",
      },
    ];
    viewTab.currentIndex = 0;

    render(<NavigationBar />);

    fireEvent.click(screen.getByTitle("メニュー"));
    fireEvent.click(screen.getByRole("button", { name: "フィルター" }));

    expect(toggle).toHaveBeenCalledOnce();
    dispose();
  });

  it("ブックマークリストではメニュー項目の『フィルターを開く』でブックマーク用トグルイベントを送る", () => {
    const toggle = vi.fn();
    const dispose = registerFilterToggle(window, "tab-1", toggle);
    viewTab.history = [
      {
        type: "bookmarkList" as const,
        title: "ブックマークリスト",
      },
    ];
    viewTab.currentIndex = 0;

    render(<NavigationBar />);

    fireEvent.click(screen.getByTitle("メニュー"));
    fireEvent.click(screen.getByRole("button", { name: "フィルター" }));

    expect(toggle).toHaveBeenCalledOnce();
    dispose();
  });

  it("メニュー上部のお気に入りで現在スレッドのブックマークを切り替える", async () => {
    render(<NavigationBar />);

    fireEvent.click(screen.getByTitle("メニュー"));
    const starButton = screen.getByRole("button", {
      name: "お気に入りに追加",
    });

    expect(starButton).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(starButton);

    await waitFor(() => {
      expect(bookmarkAddMock).toHaveBeenCalledWith({
        url: "https://egg.5ch.net/test/read.cgi/software/1/",
        title: "Current Thread",
        type: "thread",
      });
    });
    await waitFor(() => {
      expect(toastInfoMock).toHaveBeenCalledWith(
        "ブックマークに追加しました",
        expect.objectContaining({ targetWindow: expect.any(Object) }),
      );
    });
    fireEvent.click(screen.getByTitle("メニュー"));
    expect(
      screen.getByRole("button", {
        name: "お気に入りから削除",
      }),
    ).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(
      screen.getByRole("button", {
        name: "お気に入りから削除",
      }),
    );

    await waitFor(() => {
      expect(bookmarkRemoveMock).toHaveBeenCalledWith(
        "https://egg.5ch.net/test/read.cgi/software/1/",
      );
    });
    await waitFor(() => {
      expect(toastInfoMock).toHaveBeenCalledWith(
        "ブックマークを削除しました",
        expect.objectContaining({ targetWindow: expect.any(Object) }),
      );
    });
  });

  it("板一覧ページでもメニュー上部のお気に入りから板をブックマークできる", async () => {
    viewTab.history = [
      {
        type: "threadList",
        title: "Software",
        boardUrl: "https://egg.5ch.net/software/",
        boardTitle: "Software",
      },
    ];
    viewTab.currentIndex = 0;

    render(<NavigationBar />);

    fireEvent.click(screen.getByTitle("メニュー"));
    fireEvent.click(
      screen.getByRole("button", {
        name: "お気に入りに追加",
      }),
    );

    await waitFor(() => {
      expect(bookmarkAddMock).toHaveBeenCalledWith({
        url: "https://egg.5ch.net/software/",
        title: "Software",
        type: "board",
      });
    });
  });

  it("bookmark反映が遅れても同期失敗toastを出さず、後から星状態が揃う", async () => {
    bookmarkAddMock.mockImplementation(
      async (item: { url: string; title: string; type: "thread" | "board" }) => {
        setTimeout(() => {
          bookmarkState.urls.add(item.url);
          bookmarkState.updatedHandler?.({ bookmark: { url: item.url } });
        }, 0);
      },
    );

    render(<NavigationBar />);

    fireEvent.click(screen.getByTitle("メニュー"));
    fireEvent.click(
      screen.getByRole("button", {
        name: "お気に入りに追加",
      }),
    );

    await waitFor(() => {
      expect(toastInfoMock).toHaveBeenCalledWith(
        "ブックマークに追加しました",
        expect.objectContaining({ targetWindow: expect.any(Object) }),
      );
    });
    expect(toastErrorMock).not.toHaveBeenCalledWith("ブックマーク状態の同期に失敗しました");

    fireEvent.click(screen.getByTitle("メニュー"));
    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "お気に入りから削除",
        }),
      ).toHaveAttribute("aria-pressed", "true");
    });
  });
});

setupTestPageTypes();
