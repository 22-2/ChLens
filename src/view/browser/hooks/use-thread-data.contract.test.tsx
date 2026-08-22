import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { RefObject } from "react";
import { container } from "src/service-container/index";
import type { IRes, IThreadService, IMessage, INGService } from "src/service-container/interfaces";
import { useThreadData } from "src/view/browser/hooks/use-thread-data";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { dispatchMock, updateViewStateMock, cacheGetMock, cachePutMock } = vi.hoisted(() => ({
  dispatchMock: vi.fn(),
  updateViewStateMock: vi.fn(),
  cacheGetMock: vi.fn(),
  cachePutMock: vi.fn(),
}));

vi.mock("src/app", () => ({
  platform: {
    storage: {
      getStore: () => ({
        get: cacheGetMock,
        put: cachePutMock,
      }),
    },
  },
}));

vi.mock("src/view/browser/hooks/use-tab-store", () => ({
  useTabDispatch: () => dispatchMock,
  useTabViewState: () => ({ state: {}, update: updateViewStateMock }),
}));

const THREAD_URL = "http://bbs.eddibb.cc/test/read.cgi/liveedge/1742132339/";

// 変更理由: ThreadPageをcontrollerと共有viewへ分割する前に、取得結果から5種filterと検索を
// 切り替えても対象レスが変わらない契約をfixtureで固定し、分割後の回帰を検出できるようにする。
const RESPONSES: IRes[] = [
  {
    num: 1,
    name: "root",
    mail: "",
    date: "2026/08/23(日) 12:00:00.000",
    id: "root-id",
    message: "root response",
  },
  {
    num: 2,
    name: "image-user",
    mail: "",
    date: "2026/08/23(日) 12:00:01.000",
    id: "image-id",
    message: "&gt;&gt;1 https://example.test/photo.jpg",
  },
  {
    num: 3,
    name: "video-user",
    mail: "",
    date: "2026/08/23(日) 12:00:02.000",
    id: "video-id",
    message: "&gt;&gt;1 https://example.test/movie.mp4",
  },
  {
    num: 4,
    name: "link-user",
    mail: "",
    date: "2026/08/23(日) 12:00:03.000",
    id: "link-id",
    message: "&gt;&gt;1 https://example.test/article",
  },
  {
    num: 5,
    name: "searchable-user",
    mail: "",
    date: "2026/08/23(日) 12:00:04.000",
    id: "search-id",
    message: "&gt;&gt;1 searchable body",
  },
];

function createPage() {
  return {
    type: "thread" as const,
    title: "Fixture thread",
    threadUrl: THREAD_URL,
  };
}

describe("useThreadData Phase 0 contracts", () => {
  beforeEach(() => {
    cacheGetMock.mockReset();
    cacheGetMock.mockResolvedValue(undefined);
    cachePutMock.mockReset();
    dispatchMock.mockReset();
    updateViewStateMock.mockReset();

    container.thread = {
      getThread: vi.fn(async () => ({
        url: THREAD_URL,
        title: "Fixture thread",
        res: RESPONSES,
      })),
    } as IThreadService;
    container.message = {
      send: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    } as IMessage;
    const ngService: INGService = {
      isNGBoard: (_title, _url, _resCount) => null,
      isNGThread: (_res, _title, _url) => null,
      add: async (_ruleDsl) => undefined,
      invalidateCache: () => undefined,
      execExpire: () => undefined,
    };
    container.ng = ngService;
  });

  afterEach(() => {
    cleanup();
  });

  it("全て／多レス／画像／動画／リンクの5種filterが同じ取得結果から切り替わる", async () => {
    const { result } = renderHook(() =>
      useThreadData("tab-1", createPage(), 0, {
        current: null,
      } as RefObject<HTMLDivElement | null>),
    );

    await waitFor(() => expect(result.current.responses).toHaveLength(RESPONSES.length));

    expect(result.current.filteredResponses.map((res) => res.num)).toEqual([1, 2, 3, 4, 5]);

    act(() => result.current.setFilter("popular"));
    expect(result.current.filteredResponses.map((res) => res.num)).toEqual([1]);

    act(() => result.current.setFilter("image"));
    expect(result.current.filteredResponses.map((res) => res.num)).toEqual([2]);

    act(() => result.current.setFilter("video"));
    expect(result.current.filteredResponses.map((res) => res.num)).toEqual([3]);

    act(() => result.current.setFilter("link"));
    expect(result.current.filteredResponses.map((res) => res.num)).toEqual([2, 3, 4]);
  });

  it("本文・名前・ID検索をfilterと組み合わせても対象レスを失わない", async () => {
    const { result } = renderHook(() =>
      useThreadData("tab-1", createPage(), 0, {
        current: null,
      } as RefObject<HTMLDivElement | null>),
    );

    await waitFor(() => expect(result.current.responses).toHaveLength(RESPONSES.length));

    act(() => {
      result.current.setFilter("image");
      result.current.setSearchQuery("image-user");
    });
    expect(result.current.filteredResponses.map((res) => res.num)).toEqual([2]);

    act(() => result.current.setFilter("all"));
    act(() => result.current.setSearchQuery("searchable"));
    expect(result.current.filteredResponses.map((res) => res.num)).toEqual([5]);

    act(() => result.current.setSearchQuery("search-id"));
    expect(result.current.filteredResponses.map((res) => res.num)).toEqual([5]);
  });
});
