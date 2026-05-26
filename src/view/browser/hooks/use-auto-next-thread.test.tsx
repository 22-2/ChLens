import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { container } from "src/service-container/index";
import type { IThread } from "src/service-container/interfaces";
import { useAutoNextThread } from "src/view/browser/hooks/use-auto-next-thread";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function createThread(
  overrides: Partial<IThread> &
    Pick<IThread, "title" | "url" | "resCount" | "createdAt">,
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
  onFollowThread,
}: {
  autoRefreshEnabled?: boolean;
  featureEnabled?: boolean;
  expired?: boolean;
  responseCount?: number;
  canAutoScroll?: boolean;
  onFollowThread: (thread: Pick<IThread, "title" | "url">) => void;
}) {
  const { status } = useAutoNextThread({
    autoRefreshEnabled,
    featureEnabled,
    threadUrl: "https://example.com/test/read.cgi/live/1700000200/",
    threadTitle: "実況スレ Part.20",
    responseCount,
    expired,
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

  it("満了後は見つかるまで3秒ごとに次スレ検索を続ける", async () => {
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
      .mockResolvedValueOnce({
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
    expect(container.toast.info).toHaveBeenCalledWith(
      "次スレへ移動しました: 実況スレ Part.21",
    );
  });

  it("機能が無効な間は検索を開始しない", async () => {
    const onFollowThread = vi.fn();
    const boardGetThreads = vi.fn();

    container.board = {
      getThreads: boardGetThreads,
      getCachedResCount: vi.fn(),
    };

    render(
      <AutoNextThreadHarness
        featureEnabled={false}
        onFollowThread={onFollowThread}
      />,
    );

    await flushPromises();

    expect(screen.getByTestId("status")).toHaveTextContent("idle");
    expect(boardGetThreads).not.toHaveBeenCalled();
    expect(onFollowThread).not.toHaveBeenCalled();
  });
});
