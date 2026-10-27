import { act, cleanup, renderHook } from "@testing-library/react";
import type { RefObject } from "react";
import { container } from "src/service-container/index";
import type {
  IBookmark,
  IReadState,
  IReadStateService,
  IRes,
  IUtil,
} from "src/service-container/interfaces";
import { useThreadReadState } from "src/view/browser/pages/thread/use-thread-read-state";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const THREAD_URL = "https://bbs.eddibb.cc/test/read.cgi/liveedge/1742132339/";

function createResponse(num: number): IRes {
  return {
    num,
    name: `name-${num}`,
    mail: "",
    date: `2026/08/23(日) 12:00:${String(num).padStart(2, "0")}.000`,
    message: `message-${num}`,
  };
}

function createThreadRoot(): HTMLDivElement {
  const panel = document.createElement("div");
  panel.className = "content-area__tab-panel";
  const host = document.createElement("div");
  host.className = "thread-page";
  panel.appendChild(host);
  return host;
}

describe("useThreadReadState Phase 0 contracts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", ((callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(0), 0)) as typeof requestAnimationFrame);
    vi.stubGlobal("cancelAnimationFrame", ((id: number) =>
      window.clearTimeout(id)) as typeof cancelAnimationFrame);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it.each([true, false])(
    "URL指定を優先し、対象がない場合は保存位置へ戻す（存在: %s）",
    async (exists) => {
      const scrollToResponse = vi.fn((num: number) => num !== 3 || exists);
      container.bookmark = { get: () => undefined } as unknown as IBookmark;
      container.readState = {
        get: vi.fn(async () => ({ url: THREAD_URL, last: 1, read: 2, received: 3, offset: 10 })),
        set: vi.fn(async () => undefined),
      } as unknown as IReadStateService;
      container.util = { isNewerReadState: () => false } as unknown as IUtil;
      const host = createThreadRoot();
      renderHook(() =>
        useThreadReadState({
          tabId: "thread-tab",
          threadUrl: THREAD_URL,
          isActive: true,
          responses: [createResponse(1), createResponse(2), createResponse(3)],
          loading: false,
          rootRef: { current: host },
          initialResNum: 3,
          scrollToResponse,
          measureReadState: () => null,
        }),
      );
      await act(async () => {
        await Promise.resolve();
        await vi.runAllTimersAsync();
      });
      expect(scrollToResponse).toHaveBeenCalledWith(3);
      if (exists) expect(scrollToResponse).toHaveBeenCalledTimes(1);
      else expect(scrollToResponse).toHaveBeenCalledWith(1, { highlight: false, offset: 10 });
    },
  );

  it("新着レス取得で表示位置が上へ移動しても既読番号を巻き戻さない", async () => {
    const readStateSet = vi.fn<IReadStateService["set"]>(async () => undefined);
    const initialReadState: IReadState = {
      url: THREAD_URL,
      last: 1,
      read: 2,
      received: 2,
      offset: 10,
    };
    const host = createThreadRoot();
    // 表示領域の計測はレス一覧の位置計算が担うため、計測結果だけを差し替えられるようにする。
    let visible = { last: 1, read: 2 };
    const measureReadState = (received: number) => ({ ...visible, received, offset: 10 });

    container.bookmark = {
      get: () => undefined,
    } as unknown as IBookmark;
    container.readState = {
      get: vi.fn(async () => initialReadState),
      getByBoard: vi.fn(async () => []),
      getAll: vi.fn(async () => []),
      set: readStateSet,
    } as unknown as IReadStateService;
    container.util = {
      isNewerReadState: () => false,
    } as unknown as IUtil;

    const { result, rerender } = renderHook(
      ({ responses }: { responses: IRes[] }) =>
        useThreadReadState({
          tabId: "thread-tab",
          threadUrl: THREAD_URL,
          isActive: true,
          responses,
          loading: false,
          rootRef: { current: host } as RefObject<HTMLDivElement | null>,
          scrollToResponse: () => true,
          measureReadState,
        }),
      { initialProps: { responses: [createResponse(1), createResponse(2)] } },
    );

    await act(async () => {
      await Promise.resolve();
      await vi.runAllTimersAsync();
      await Promise.resolve();
      await vi.runAllTimersAsync();
    });
    expect(result.current.isInitialReadStateResolved).toBe(true);
    expect(readStateSet).not.toHaveBeenCalled();

    // 変更理由: pollingでレスが増えた際にviewportが上へ戻るケースでも、
    // 既に保存したread値をMath.maxで維持する契約をfixtureで固定する。
    visible = { last: 1, read: 1 };
    rerender({ responses: [createResponse(1), createResponse(2), createResponse(3)] });

    await act(async () => {
      await vi.runAllTimersAsync();
      await Promise.resolve();
    });

    expect(readStateSet).toHaveBeenCalled();
    expect(readStateSet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: THREAD_URL,
        last: 1,
        read: 2,
        received: 3,
      }),
    );
  });
});
