import { describe, expect, it, vi } from "vite-plus/test";
import { HttpStatusError, type ChFetchResult, type ThreadData } from "@chlen/ch-lib";
import { MemoryLiveThreadCache } from "./cache";
import { MemoryLiveEventBus } from "./events";
import { LiveThreadSession, type LiveThreadSessionEvent } from "./session";
import type { ChLensLiveSource } from "./source";

const threadUrl = "https://bbs.eddibb.cc/liveedge/1000000001/";

function thread(title: string, message: string): ThreadData {
  return {
    title,
    posts: [
      {
        number: 1,
        name: "name",
        mail: "",
        date: "2026/08/23",
        message,
      },
    ],
  };
}

function result(data: ThreadData, etag: string): ChFetchResult<ThreadData> {
  return {
    data,
    metadata: {
      etag,
      lastModified: "Sun, 23 Aug 2026 00:00:00 GMT",
      contentLength: 100,
      bodyBytes: 100,
      parsedResCount: data.posts.length,
    },
  };
}

function sourceFor(
  fetchThreadWithMetadata: ChLensLiveSource["loadThreadWithMetadata"],
): ChLensLiveSource {
  return {
    loadBoard: vi.fn(),
    loadBoardWithMetadata: vi.fn(),
    loadThread: vi.fn(),
    loadThreadWithMetadata: fetchThreadWithMetadata,
  };
}

describe("LiveThreadSession", () => {
  it("refreshes snapshots and sends validators from the cached response", async () => {
    const requests: Array<{ headers?: Readonly<Record<string, string>>; signal?: AbortSignal }> =
      [];
    const responses = [
      result(thread("title", "first"), '"v1"'),
      result(thread("title", "second"), '"v2"'),
    ];
    const source = sourceFor(async (_url, request) => {
      requests.push(request ?? {});
      return responses.shift()!;
    });
    const events: LiveThreadSessionEvent[] = [];
    const session = new LiveThreadSession(threadUrl, {
      source,
      cache: new MemoryLiveThreadCache(),
    });
    session.subscribe((event) => events.push(event));

    await session.refresh();
    await session.refresh();

    expect(requests[0].headers).toEqual({});
    expect(requests[1].headers).toEqual({
      "If-None-Match": '"v1"',
      "If-Modified-Since": "Sun, 23 Aug 2026 00:00:00 GMT",
    });
    expect(requests[0].signal).toBeInstanceOf(AbortSignal);
    expect(events).toEqual([
      {
        type: "snapshot",
        changed: true,
        snapshot: expect.objectContaining({ data: thread("title", "first") }),
      },
      {
        type: "snapshot",
        changed: true,
        snapshot: expect.objectContaining({ data: thread("title", "second") }),
      },
    ]);
  });

  it("keeps the cached snapshot when the server returns 304", async () => {
    let callCount = 0;
    const source = sourceFor(async () => {
      callCount += 1;
      if (callCount === 1) return result(thread("title", "same"), '"v1"');
      throw new HttpStatusError(threadUrl, 304);
    });
    const events: LiveThreadSessionEvent[] = [];
    const session = new LiveThreadSession(threadUrl, { source });
    session.subscribe((event) => events.push(event));

    const first = await session.refresh();
    const second = await session.refresh();

    expect(second).toEqual(first);
    expect(events[1]).toEqual({ type: "not-modified", snapshot: first });
  });

  it("emits an error while retaining a previous snapshot", async () => {
    let callCount = 0;
    const source = sourceFor(async () => {
      callCount += 1;
      if (callCount === 1) {
        return result(thread("title", "same"), '"v1"');
      }
      throw new Error("network unavailable");
    });
    const events: LiveThreadSessionEvent[] = [];
    const session = new LiveThreadSession(threadUrl, { source });
    session.subscribe((event) => events.push(event));

    await session.refresh();
    const retained = await session.refresh();

    expect(retained?.data).toEqual(thread("title", "same"));
    expect(events[1]).toMatchObject({ type: "error", snapshot: retained });
  });

  it("publishes serializable updates through the shared event bus", async () => {
    const eventBus = new MemoryLiveEventBus();
    const source = sourceFor(async () => result(thread("title", "same"), '"v1"'));
    const session = new LiveThreadSession(threadUrl, { source, eventBus });

    await session.refresh();

    expect(eventBus.events).toHaveLength(1);
    expect(eventBus.events[0]).toMatchObject({
      type: "snapshot",
      threadUrl,
      changed: true,
    });
  });

  it("polls while started and stops scheduling after stop", async () => {
    vi.useFakeTimers();
    try {
      let callCount = 0;
      const source = sourceFor(async () => {
        callCount += 1;
        return result(thread("title", `refresh-${callCount}`), `"v${callCount}"`);
      });
      const session = new LiveThreadSession(threadUrl, { source, intervalMs: 1_000 });

      await session.start();
      expect(callCount).toBe(1);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(callCount).toBe(2);

      session.stop();
      await vi.advanceTimersByTimeAsync(2_000);
      expect(callCount).toBe(2);
      expect(session.isRunning).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("exposes dat-removed status through the error event contract", async () => {
    const source = sourceFor(async () => {
      throw new HttpStatusError(threadUrl, 410);
    });
    const events: LiveThreadSessionEvent[] = [];
    const session = new LiveThreadSession(threadUrl, { source });
    session.subscribe((event) => events.push(event));

    const result = await session.refresh();

    expect(result).toBeNull();
    expect(events[0]).toMatchObject({
      type: "error",
      error: { status: 410, name: "HttpStatusError" },
    });
  });
});
