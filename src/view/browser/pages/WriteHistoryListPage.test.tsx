import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  navigateToWriteHistoryEntry,
  WriteHistoryListPage,
} from "src/view/browser/pages/WriteHistoryListPage";
import { QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE } from "src/view/browser/utils/filter-toolbar-events";
import {
  consumePendingThreadResJump,
  peekPendingThreadResJump,
} from "src/view/browser/utils/thread-read-state";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mockUseTabStore = vi.fn();
const { messageOn, messageOff, writeHistoryGet, writeHistoryGetAll, toastSuccess, toastError } =
  vi.hoisted(() => ({
    messageOn: vi.fn(),
    messageOff: vi.fn(),
    writeHistoryGet: vi.fn<(offset?: number, count?: number) => Promise<unknown[]>>(),
    writeHistoryGetAll: vi.fn<() => Promise<unknown[]>>(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
  }));
const { cacheGetMock, cachePutMock } = vi.hoisted(() => ({
  cacheGetMock: vi.fn(),
  cachePutMock: vi.fn(),
}));
let originalCreateObjectURLDescriptor: PropertyDescriptor | undefined;
let originalRevokeObjectURLDescriptor: PropertyDescriptor | undefined;

vi.mock("src/app", () => ({
  platform: {
    storage: {
      // UIキャッシュの検証はページ表示の責務と分け、拡張機能APIを読まずに単体テストできるようにする。
      getStore: () => ({
        get: cacheGetMock,
        put: cachePutMock,
      }),
    },
  },
}));

vi.mock("src/view/browser/state/tabs/use-tab-store", () => ({
  useTabStore: () => mockUseTabStore(),
  // useTabDispatch は dispatch のみを返す安定した関数。ページのフル状態購読回避後もdispatchが使える。
  useTabDispatch: () => vi.fn(),
  useTabViewState: () => ({ state: {}, update: vi.fn() }),
}));

vi.mock("src/service-container/index", () => ({
  container: {
    config: {
      get: vi.fn(() => "on"),
      ready: (callback: () => void) => callback(),
    },
    message: {
      on: messageOn,
      off: messageOff,
    },
    // 画面は書き込み履歴をサービスコンテナから読む。
    writeHistory: {
      get: writeHistoryGet,
      getAll: writeHistoryGetAll,
    },
    toast: {
      success: toastSuccess,
      error: toastError,
    },
  },
}));

describe("WriteHistoryListPage", () => {
  afterEach(() => {
    consumePendingThreadResJump("https://egg.5ch.io/test/read.cgi/software/1/");
    cleanup();
    vi.restoreAllMocks();
    if (originalCreateObjectURLDescriptor) {
      Object.defineProperty(URL, "createObjectURL", originalCreateObjectURLDescriptor);
    } else {
      Reflect.deleteProperty(URL, "createObjectURL");
    }
    if (originalRevokeObjectURLDescriptor) {
      Object.defineProperty(URL, "revokeObjectURL", originalRevokeObjectURLDescriptor);
    } else {
      Reflect.deleteProperty(URL, "revokeObjectURL");
    }
  });

  beforeEach(() => {
    originalCreateObjectURLDescriptor = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
    originalRevokeObjectURLDescriptor = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
    cacheGetMock.mockReset();
    cacheGetMock.mockResolvedValue(undefined);
    cachePutMock.mockReset();
    mockUseTabStore.mockReset();
    writeHistoryGet.mockReset();
    writeHistoryGetAll.mockReset();
    writeHistoryGetAll.mockResolvedValue([]);
    toastSuccess.mockReset();
    toastError.mockReset();
    messageOn.mockReset();
    messageOff.mockReset();

    mockUseTabStore.mockReturnValue({
      dispatch: vi.fn(),
      state: {
        tabs: [],
        selectedTabId: "tab-1",
        closedTabs: [],
      },
      viewPage: {
        type: "writeHistoryList",
        title: "書き込み履歴",
      },
    });
  });

  it("本文列と短い日時表記を表示する", async () => {
    writeHistoryGet.mockResolvedValueOnce([
      {
        url: "https://egg.5ch.io/test/read.cgi/software/1/",
        title: "スレ1",
        writtenRes: 42,
        name: "風吹けば名無し",
        mail: "sage",
        message: "これは書き込み本文です",
        date: new Date(2026, 4, 3, 9, 8).getTime(),
      },
    ]);

    render(<WriteHistoryListPage tabId="tab-1" isActive={true} refreshKey={0} />);

    expect(await screen.findByText("本文")).toBeInTheDocument();
    expect(screen.getByText("これは書き込み本文です")).toBeInTheDocument();
    expect(screen.getByText("2026/05/03 09:08")).toBeInTheDocument();
  });

  it("すべての書き込み履歴をkakikomi.txtとしてダウンロードする", async () => {
    writeHistoryGet.mockResolvedValueOnce([]);
    writeHistoryGetAll.mockResolvedValueOnce([
      {
        url: "http://example.com/test/read.cgi/sample/1/",
        title: "サンプルスレ",
        name: "名無しさん",
        mail: "sage",
        message: "本文です",
        date: new Date(2026, 4, 3, 9, 8, 7).getTime(),
      },
    ]);
    const createObjectURL = vi.fn(() => "blob:kakikomi");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    const createElement = vi.spyOn(document, "createElement");

    render(<WriteHistoryListPage tabId="tab-1" isActive={true} refreshKey={0} />);

    const exportButton = await screen.findByRole("button", {
      name: "kakikomi.txtをエクスポート",
    });
    await act(async () => fireEvent.click(exportButton));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledOnce());

    const anchor = createElement.mock.results
      .map(({ value }) => value)
      .find(
        (element): element is HTMLAnchorElement =>
          element instanceof HTMLAnchorElement && element.download === "kakikomi.txt",
      );
    expect(writeHistoryGetAll).toHaveBeenCalledOnce();
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(anchor).toBeDefined();
    expect(anchor?.href).toBe("blob:kakikomi");
    expect(anchorClick).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:kakikomi");
    expect(toastSuccess).toHaveBeenCalledWith("書き込み履歴をkakikomi.txtへエクスポートしました");
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

    render(<WriteHistoryListPage tabId="tab-1" isActive={true} refreshKey={0} />);

    await screen.findByText("本文");
    expect(screen.queryByPlaceholderText("検索...")).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(
        new window.CustomEvent(QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE.writeHistoryList, {
          detail: { tabId: "tab-1" },
        }),
      );
    });

    const input = screen.getByPlaceholderText("検索...");
    expect(input).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "本文" } });
    fireEvent.click(screen.getByRole("button", { name: "✕" }));

    expect(screen.queryByPlaceholderText("検索...")).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(
        new window.CustomEvent(QUICK_ACCESS_FILTER_TOGGLE_EVENT_BY_PAGE_TYPE.writeHistoryList, {
          detail: { tabId: "tab-1" },
        }),
      );
    });

    expect(screen.getByPlaceholderText("検索...")).toHaveValue("");
  });

  it("書き込み履歴の遷移ヘルパーがjump予約と遷移先を組み立てる", () => {
    const dispatch = vi.fn();
    navigateToWriteHistoryEntry(
      dispatch,
      {
        url: "https://egg.5ch.io/test/read.cgi/software/1/",
        title: "スレ1",
        writtenRes: 42,
      },
      "current",
    );

    expect(peekPendingThreadResJump("https://egg.5ch.io/test/read.cgi/software/1/")).toMatchObject({
      resNum: 42,
      threadUrl: "https://egg.5ch.io/test/read.cgi/software/1/",
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "NAVIGATE",
      page: {
        type: "thread",
        title: "スレ1",
        threadUrl: "https://egg.5ch.io/test/read.cgi/software/1/",
      },
    });
  });

  it("対応外URLはjumpを積まずに遷移もしない", async () => {
    const dispatch = vi.fn();
    mockUseTabStore.mockReturnValue({
      dispatch,
      state: {
        tabs: [],
        selectedTabId: "tab-1",
        closedTabs: [],
      },
      viewPage: {
        type: "writeHistoryList",
        title: "書き込み履歴",
      },
    });
    writeHistoryGet.mockResolvedValueOnce([
      {
        url: "https://example.com/not-thread/1/",
        title: "外部URL",
        writtenRes: 10,
        name: "風吹けば名無し",
        mail: "sage",
        message: "本文",
        date: new Date(2026, 4, 3, 9, 8).getTime(),
      },
    ]);

    render(<WriteHistoryListPage tabId="tab-1" isActive={true} refreshKey={0} />);

    const row = (await screen.findByText("外部URL")).closest("tr");
    expect(row).not.toBeNull();
    fireEvent.click(row!);

    expect(peekPendingThreadResJump("https://example.com/not-thread/1/")).toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("refreshKey が変わった時に一覧を再読込する", async () => {
    writeHistoryGet
      .mockResolvedValueOnce([
        {
          url: "https://egg.5ch.io/test/read.cgi/software/1/",
          title: "スレ1",
          writtenRes: 42,
          name: "風吹けば名無し",
          mail: "sage",
          message: "本文1",
          date: new Date(2026, 4, 3, 9, 8).getTime(),
        },
      ])
      .mockResolvedValueOnce([
        {
          url: "https://egg.5ch.io/test/read.cgi/software/2/",
          title: "スレ2",
          writtenRes: 24,
          name: "風吹けば名無し",
          mail: "sage",
          message: "本文2",
          date: new Date(2026, 4, 3, 9, 9).getTime(),
        },
      ]);

    const { rerender } = render(
      <WriteHistoryListPage tabId="tab-1" isActive={true} refreshKey={0} />,
    );

    await screen.findByText("スレ1");

    rerender(<WriteHistoryListPage tabId="tab-1" isActive={true} refreshKey={1} />);

    await waitFor(() => {
      expect(writeHistoryGet).toHaveBeenCalledTimes(2);
    });

    expect(screen.getByText("スレ2")).toBeInTheDocument();
    expect(screen.queryByText("スレ1")).not.toBeInTheDocument();
  });

  it("write_history_updated 通知で一覧を再読込する", async () => {
    writeHistoryGet
      .mockResolvedValueOnce([
        {
          url: "https://egg.5ch.io/test/read.cgi/software/1/",
          title: "スレ1",
          writtenRes: 0,
          name: "風吹けば名無し",
          mail: "sage",
          message: "本文1",
          date: new Date(2026, 4, 3, 9, 8).getTime(),
        },
      ])
      .mockResolvedValueOnce([
        {
          url: "https://egg.5ch.io/test/read.cgi/software/1/",
          title: "スレ1",
          writtenRes: 42,
          name: "風吹けば名無し",
          mail: "sage",
          message: "本文1",
          date: new Date(2026, 4, 3, 9, 9).getTime(),
        },
      ]);

    render(<WriteHistoryListPage tabId="tab-1" isActive={true} refreshKey={0} />);

    expect(await screen.findByText("スレ1")).toBeInTheDocument();
    expect(screen.getByText("-")).toBeInTheDocument();

    const handler = messageOn.mock.calls.find(
      ([eventName]) => eventName === "write_history_updated",
    )?.[1] as (() => void) | undefined;

    expect(handler).toBeTypeOf("function");

    await act(async () => {
      handler?.();
    });

    await waitFor(() => {
      expect(writeHistoryGet).toHaveBeenCalledTimes(2);
    });

    expect(screen.getByText("42")).toBeInTheDocument();
  });
});
