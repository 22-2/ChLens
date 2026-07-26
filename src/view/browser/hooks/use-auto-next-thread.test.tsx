import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { container } from "src/service-container/index";
import type { IThread } from "src/service-container/interfaces";
import { useAutoNextThread } from "src/view/browser/hooks/use-auto-next-thread";
import type { AutoNextThreadMode } from "src/view/browser/utils/next-thread-search";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

function createThread(
  overrides: Partial<IThread> & Pick<IThread, "title" | "url" | "resCount" | "createdAt">,
): IThread {
  return {
    title: overrides.title,
    url: overrides.url,
    resCount: overrides.resCount,
    createdAt: overrides.createdAt,
    ng: undefined,
    highlight: undefined,
    isNet: null,
    readState: undefined,
    threadNumber: overrides.threadNumber,
  };
}

function AutoNextThreadHarness({
  autoRefreshEnabled = true,
  featureEnabled = true,
  expired = false,
  responseCount = 1000,
  canAutoScroll = true,
  mode = "balanced",
  responseMessages = [],
  onFollowThread,
}: {
  autoRefreshEnabled?: boolean;
  featureEnabled?: boolean;
  expired?: boolean;
  responseCount?: number;
  canAutoScroll?: boolean;
  mode?: AutoNextThreadMode;
  responseMessages?: readonly string[];
  onFollowThread: (thread: Pick<IThread, "title" | "url">) => void;
}) {
  const { status } = useAutoNextThread({
    autoRefreshEnabled,
    featureEnabled,
    threadUrl: "https://example.com/test/read.cgi/live/1700000200/",
    threadTitle: "実況スレ Part.20",
    responseCount,
    expired,
    mode,
    responseMessages,
    canAutoScroll,
    followThread: onFollowThread,
  });

  return <output data-testid="status">{status}</output>;
}

async function flushPromises(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("useAutoNextThread", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    container.toast = {
      notify: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    };
    container.board = {
      getThreads: vi.fn().mockResolvedValue({ threads: [], message: null }),
      getCachedResCount: vi.fn(),
    };
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("標準判定では同じ候補を2回確認してから次スレへ移動する", async () => {
    const onFollowThread = vi.fn();
    const boardGetThreads = vi
      .fn()
      .mockResolvedValueOnce({
        threads: [
          createThread({
            title: "実況スレ Part.20",
            url: "https://example.com/test/read.cgi/live/1700000200/",
            resCount: 1000,
            createdAt: 1_700_000_200_000,
          }),
        ],
        message: null,
      })
      .mockResolvedValue({
        threads: [
          createThread({
            title: "実況スレ Part.20",
            url: "https://example.com/test/read.cgi/live/1700000200/",
            resCount: 1000,
            createdAt: 1_700_000_200_000,
          }),
          createThread({
            title: "実況スレ Part.21",
            url: "https://example.com/test/read.cgi/live/1700000201/",
            resCount: 24,
            createdAt: 1_700_000_201_000,
          }),
        ],
        message: null,
      });

    container.board = {
      getThreads: boardGetThreads,
      getCachedResCount: vi.fn(),
    };

    render(<AutoNextThreadHarness onFollowThread={onFollowThread} />);

    await flushPromises();
    expect(screen.getByTestId("status")).toHaveTextContent("searching");
    expect(boardGetThreads).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    await flushPromises();

    expect(boardGetThreads).toHaveBeenCalledTimes(2);
    expect(onFollowThread).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    await flushPromises();

    expect(boardGetThreads).toHaveBeenCalledTimes(3);
    expect(onFollowThread).toHaveBeenCalledWith({
      title: "実況スレ Part.21",
      url: "https://example.com/test/read.cgi/live/1700000201/",
      resCount: 24,
      createdAt: 1_700_000_201_000,
      ng: undefined,
      highlight: undefined,
      isNet: null,
      readState: undefined,
      threadNumber: undefined,
    });
    // oxlint-disable-next-line unbound-method
    expect(container.toast.info).toHaveBeenCalledWith("次スレへ移動しました: 実況スレ Part.21");
  });

  it("慎重判定でも本文で案内された次スレは待たずに移動する", async () => {
    const onFollowThread = vi.fn();
    const nextThreadUrl = "https://example.com/test/read.cgi/live/1700000201/";
    const boardGetThreads = vi.fn().mockResolvedValue({
      threads: [
        createThread({
          title: "試合終了後の緊急特番",
          url: nextThreadUrl,
          resCount: 24,
          createdAt: 1_700_000_201_000,
        }),
      ],
      message: null,
    });

    container.board = {
      getThreads: boardGetThreads,
      getCachedResCount: vi.fn(),
    };

    render(
      <AutoNextThreadHarness
        mode="cautious"
        responseMessages={[`次スレはこちら <a href="${nextThreadUrl}">${nextThreadUrl}</a>`]}
        onFollowThread={onFollowThread}
      />,
    );

    await flushPromises();

    expect(boardGetThreads).toHaveBeenCalledTimes(1);
    expect(onFollowThread).toHaveBeenCalledWith(expect.objectContaining({ url: nextThreadUrl }));
    expect(screen.getByTestId("status")).toHaveTextContent("idle");
  });

  it("機能が無効な間は検索を開始しない", async () => {
    const onFollowThread = vi.fn();
    const boardGetThreads = vi.fn();

    container.board = {
      getThreads: boardGetThreads,
      getCachedResCount: vi.fn(),
    };

    render(<AutoNextThreadHarness featureEnabled={false} onFollowThread={onFollowThread} />);

    await flushPromises();

    expect(screen.getByTestId("status")).toHaveTextContent("idle");
    expect(boardGetThreads).not.toHaveBeenCalled();
    expect(onFollowThread).not.toHaveBeenCalled();
  });
});
