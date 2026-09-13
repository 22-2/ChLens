import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { RefObject } from "react";
import { container } from "src/service-container/index";
import type {
  IMessage,
  INGService,
  IRes,
  IThreadDetail,
  IThreadService,
} from "src/service-container/interfaces";
import { useThreadData } from "src/view/browser/hooks/use-thread-data";
import { useThreadRefreshController } from "src/view/browser/hooks/use-thread-refresh-controller";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { dispatchMock, updateViewStateMock, viewStateMock, cacheGetMock, cachePutMock } = vi.hoisted(
  () => ({
    dispatchMock: vi.fn(),
    updateViewStateMock: vi.fn(),
    viewStateMock: {} as { filter?: "popular"; popularReplyThreshold?: number },
    cacheGetMock: vi.fn(),
    cachePutMock: vi.fn(),
  }),
);

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
  useTabViewState: () => ({ state: viewStateMock, update: updateViewStateMock }),
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

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("useThreadData Phase 0 contracts", () => {
  beforeEach(() => {
    cacheGetMock.mockReset();
    cacheGetMock.mockResolvedValue(undefined);
    cachePutMock.mockReset();
    dispatchMock.mockReset();
    updateViewStateMock.mockReset();
    delete viewStateMock.filter;
    delete viewStateMock.popularReplyThreshold;

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
    const { result } = renderHook(() => {
      const refreshController = useThreadRefreshController(0);
      return useThreadData(
        "tab-1",
        createPage(),
        { current: null } as RefObject<HTMLDivElement | null>,
        refreshController,
      );
    });

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

  it("人気レス閾値をviewStateから読み込み、指定件数以上だけを残す", async () => {
    viewStateMock.filter = "popular";
    viewStateMock.popularReplyThreshold = 5;

    const { result } = renderHook(() => {
      const refreshController = useThreadRefreshController(0);
      return useThreadData(
        "tab-1",
        createPage(),
        { current: null } as RefObject<HTMLDivElement | null>,
        refreshController,
      );
    });

    await waitFor(() => expect(result.current.responses).toHaveLength(RESPONSES.length));

    expect(result.current.filteredResponses).toHaveLength(0);
  });

  it("本文・名前・ID検索をfilterと組み合わせても対象レスを失わない", async () => {
    const { result } = renderHook(() => {
      const refreshController = useThreadRefreshController(0);
      return useThreadData(
        "tab-1",
        createPage(),
        { current: null } as RefObject<HTMLDivElement | null>,
        refreshController,
      );
    });

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

  it("重なった取得では古い結果の完了で最新レスとloading状態を巻き戻さない", async () => {
    const firstRequest = createDeferred<{
      url: string;
      title: string;
      res: IRes[];
    }>();
    const secondRequest = createDeferred<{
      url: string;
      title: string;
      res: IRes[];
    }>();
    const thirdRequest = createDeferred<{
      url: string;
      title: string;
      res: IRes[];
    }>();
    const getThreadMock = vi
      .fn()
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise)
      .mockReturnValueOnce(thirdRequest.promise);
    container.thread = { getThread: getThreadMock } as IThreadService;
    const page = createPage();
    const rootRef = { current: null } as RefObject<HTMLDivElement | null>;

    const { result, rerender } = renderHook(
      ({ refreshKey }: { refreshKey: number }) => {
        const refreshController = useThreadRefreshController(refreshKey);
        return useThreadData("tab-1", page, rootRef, refreshController);
      },
      { initialProps: { refreshKey: 0 } },
    );

    await waitFor(() => expect(getThreadMock).toHaveBeenCalledOnce());
    act(() => {
      firstRequest.resolve({
        url: THREAD_URL,
        title: "Fixture thread",
        res: RESPONSES.slice(0, 1),
      });
    });
    await waitFor(() => expect(result.current.responses).toHaveLength(1));

    rerender({ refreshKey: 1 });
    await waitFor(() => expect(getThreadMock).toHaveBeenCalledTimes(2));
    rerender({ refreshKey: 2 });
    await waitFor(() => expect(getThreadMock).toHaveBeenCalledTimes(3));

    // 変更理由: RELOADはThreadPageを再マウントせずrefreshKeyだけを進めるため、
    // 更新世代のeffectがsubject.txt再確認を明示的に指定する契約を固定する。
    expect(getThreadMock.mock.calls[0][1]).toMatchObject({ forceUpdate: false });
    expect(getThreadMock.mock.calls[1][1]).toMatchObject({ forceUpdate: true });
    expect(getThreadMock.mock.calls[2][1]).toMatchObject({ forceUpdate: true });

    act(() => {
      secondRequest.resolve({ url: THREAD_URL, title: "Fixture thread", res: RESPONSES });
    });
    await waitFor(() => expect(result.current.loading).toBe(true));
    expect(result.current.responses).toHaveLength(1);

    act(() => {
      thirdRequest.resolve({
        url: THREAD_URL,
        title: "Fixture thread",
        res: [...RESPONSES, { ...RESPONSES[0], num: 6 }],
      });
    });
    await waitFor(() => expect(result.current.responses.at(-1)?.num).toBe(6));
    expect(result.current.loading).toBe(false);
  });

  it("更新中は表示中のレスを古いキャッシュで巻き戻さない", async () => {
    const refreshedResult = createDeferred<{
      url: string;
      title: string;
      res: IRes[];
    }>();
    const getThreadMock = vi
      .fn()
      .mockResolvedValueOnce({
        url: THREAD_URL,
        title: "Fixture thread",
        res: RESPONSES,
      })
      .mockImplementationOnce(async (_url, options) => {
        options?.onCache?.({
          url: THREAD_URL,
          title: "Fixture thread",
          res: RESPONSES.slice(0, 1),
        });
        return refreshedResult.promise;
      });
    container.thread = { getThread: getThreadMock } as IThreadService;
    const page = createPage();
    const rootRef = { current: null } as RefObject<HTMLDivElement | null>;

    const { result, rerender } = renderHook(
      ({ refreshKey }: { refreshKey: number }) => {
        const refreshController = useThreadRefreshController(refreshKey);
        return useThreadData("tab-1", page, rootRef, refreshController);
      },
      { initialProps: { refreshKey: 0 } },
    );

    await waitFor(() => expect(result.current.responses).toHaveLength(RESPONSES.length));

    rerender({ refreshKey: 1 });

    await waitFor(() => expect(getThreadMock).toHaveBeenCalledTimes(2));
    expect(result.current.responses).toHaveLength(RESPONSES.length);

    act(() => {
      refreshedResult.resolve({
        url: THREAD_URL,
        title: "Fixture thread",
        res: [...RESPONSES, { ...RESPONSES[0], num: 6 }],
      });
    });
    await waitFor(() => expect(result.current.responses.at(-1)?.num).toBe(6));
    expect(result.current.responses).toHaveLength(RESPONSES.length + 1);
  });

  it("forceUpdateの最終結果が一時的に短くても表示中のsnapshotを巻き戻さない", async () => {
    const refreshedResult = createDeferred<IThreadDetail>();
    const getThreadMock = vi
      .fn()
      .mockResolvedValueOnce({
        url: THREAD_URL,
        title: "Fixture thread",
        res: RESPONSES,
      })
      .mockReturnValueOnce(refreshedResult.promise);
    container.thread = { getThread: getThreadMock } as IThreadService;
    const page = createPage();
    const rootRef = { current: null } as RefObject<HTMLDivElement | null>;

    const { result, rerender } = renderHook(
      ({ refreshKey }: { refreshKey: number }) => {
        const refreshController = useThreadRefreshController(refreshKey);
        return useThreadData("tab-1", page, rootRef, refreshController);
      },
      { initialProps: { refreshKey: 0 } },
    );

    await waitFor(() => expect(result.current.responses).toHaveLength(RESPONSES.length));
    rerender({ refreshKey: 1 });
    await waitFor(() => expect(getThreadMock).toHaveBeenCalledTimes(2));

    act(() => {
      refreshedResult.resolve({
        url: THREAD_URL,
        title: "Fixture thread",
        res: RESPONSES.slice(0, 1),
      });
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.responses).toHaveLength(RESPONSES.length);
    expect(result.current.responses.at(-1)?.num).toBe(RESPONSES.at(-1)?.num);
  });

  it("同じスレの更新中は通知状態を保持し、取得完了時に最新状態へ置き換える", async () => {
    const refreshedResult = createDeferred<IThreadDetail>();
    const getThreadMock = vi
      .fn()
      .mockResolvedValueOnce({
        url: THREAD_URL,
        title: "Fixture thread",
        res: RESPONSES,
        expired: true,
        missingFromSubject: true,
        message: "更新前の通知",
      })
      .mockReturnValueOnce(refreshedResult.promise);
    container.thread = { getThread: getThreadMock } as IThreadService;
    const page = createPage();
    const rootRef = { current: null } as RefObject<HTMLDivElement | null>;

    const { result, rerender } = renderHook(
      ({ refreshKey }: { refreshKey: number }) => {
        const refreshController = useThreadRefreshController(refreshKey);
        return useThreadData("tab-1", page, rootRef, refreshController);
      },
      { initialProps: { refreshKey: 0 } },
    );

    await waitFor(() => expect(result.current.error).toBe("更新前の通知"));
    expect(result.current.expired).toBe(true);
    expect(result.current.missingFromSubject).toBe(true);

    rerender({ refreshKey: 1 });
    await waitFor(() => expect(getThreadMock).toHaveBeenCalledTimes(2));
    expect(result.current.error).toBe("更新前の通知");
    expect(result.current.expired).toBe(true);
    expect(result.current.missingFromSubject).toBe(true);

    act(() => {
      refreshedResult.resolve({
        url: THREAD_URL,
        title: "Fixture thread",
        res: RESPONSES,
        expired: false,
        missingFromSubject: false,
      });
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.expired).toBe(false);
    expect(result.current.missingFromSubject).toBe(false);
  });
});
