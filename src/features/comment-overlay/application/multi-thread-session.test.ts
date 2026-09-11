import type { IThread, IThreadDetail } from "src/service-container/interfaces";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  CommentOverlayMultiThreadSession,
  type CommentOverlayMultiThreadSource,
  findCommentOverlayCandidateThreads,
} from "./multi-thread-session";

const targetUrl = "https://example.com/test/read.cgi/live/1700000000/";
const candidateUrl = "https://example.com/test/read.cgi/live/1700000001/";

function thread(url: string, title: string, resCount: number): IThread {
  return {
    url,
    title,
    resCount,
    createdAt: Number(url.match(/(\d+)\/$/)?.[1] ?? 0) * 1_000,
  };
}

function detail(title: string, count: number): IThreadDetail {
  return {
    url: candidateUrl,
    title,
    res: Array.from({ length: count }, (_, index) => ({
      num: index + 1,
      name: "名無し",
      mail: "",
      date: "2026/09/11(金) 12:00:00",
      message: `候補レス${index + 1}`,
    })),
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("コメントOverlayの候補スレセッション", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("同じ板の近い連番だけを候補として列挙する", () => {
    const candidates = findCommentOverlayCandidateThreads(
      [
        thread(targetUrl, "番組実況 ★5", 500),
        thread(candidateUrl, "番組実況 ★5", 100),
        thread("https://example.com/test/read.cgi/live/1700000002/", "番組実況 ★1", 100),
        thread("https://example.com/test/read.cgi/news/1700000003/", "番組実況 ★5", 100),
      ],
      { url: targetUrl, title: "番組実況 ★5" },
    );

    expect(candidates.map((candidate) => candidate.url)).toEqual([candidateUrl]);
  });

  it("候補の初回は直近レスを流し、停止時に現在の取得元を返す", async () => {
    const getThread = vi.fn(async () => detail("番組実況 ★5", 5));
    const source: CommentOverlayMultiThreadSource = {
      getThreads: vi.fn(async () => ({
        threads: [thread(targetUrl, "番組実況 ★5", 500), thread(candidateUrl, "番組実況 ★5", 5)],
        message: null,
      })),
      getThread,
    };
    const batches: Array<{ source: string; count: number }> = [];
    const finished = vi.fn();
    const session = new CommentOverlayMultiThreadSession({
      threadUrl: targetUrl,
      source,
      onBatch: (sourceThreadUrl, responses) =>
        batches.push({ source: sourceThreadUrl, count: responses.length }),
      onMainstream: vi.fn(),
      onFinished: finished,
    });

    session.start();
    await flushPromises();
    session.stop();

    expect(getThread).toHaveBeenCalledWith(candidateUrl);
    expect(batches).toEqual([{ source: candidateUrl, count: 5 }]);
    expect(finished).toHaveBeenCalledWith(targetUrl);
  });

  it("猶予期間後に勢いが高い候補へ本流を切り替える", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-11T12:00:00.000Z"));
    let boardCall = 0;
    const source: CommentOverlayMultiThreadSource = {
      getThreads: vi.fn(async () => {
        boardCall += 1;
        const candidateCount = boardCall >= 3 ? 100 : 1;
        return {
          threads: [
            thread(targetUrl, "番組実況 ★5", boardCall >= 3 ? 11 : 10),
            thread(candidateUrl, "番組実況 ★5", candidateCount),
          ],
          message: null,
        };
      }),
      getThread: vi.fn(async () => detail("番組実況 ★5", boardCall >= 3 ? 100 : 1)),
    };
    const mainstream = vi.fn();
    const session = new CommentOverlayMultiThreadSession({
      threadUrl: targetUrl,
      source,
      onBatch: vi.fn(),
      onMainstream: mainstream,
      onFinished: vi.fn(),
    });

    session.start();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(mainstream).toHaveBeenCalledWith(expect.objectContaining({ url: candidateUrl }));
    session.stop();
  });
});
