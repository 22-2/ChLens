import { describe, expect, it } from "vite-plus/test";
import type { ChFetchResult, ThreadData } from "@chlen/ch-lib";
import { MemoryLiveBoardCache } from "./cache";
import { MemoryLiveEventBus } from "./events";
import { LiveBoardSession, type LiveBoardSessionEvent } from "./board-session";
import type { ChLensLiveSource } from "./source";

const boardUrl = "https://bbs.eddibb.cc/liveedge/";

function sourceFor(
  loadBoardWithMetadata: ChLensLiveSource["loadBoardWithMetadata"],
): ChLensLiveSource {
  const emptyThread: ThreadData = { posts: [] };
  const emptyThreadResult: ChFetchResult<ThreadData> = {
    data: emptyThread,
    metadata: { bodyBytes: 0, parsedResCount: 0 },
  };
  return {
    loadBoard: async () => [],
    loadBoardWithMetadata,
    loadThread: async () => emptyThread,
    loadThreadWithMetadata: async () => emptyThreadResult,
  };
}

describe("LiveBoardSession", () => {
  it("caches subject snapshots and sends conditional validators", async () => {
    const requests: Array<{ headers?: Readonly<Record<string, string>> }> = [];
    let count = 0;
    const source = sourceFor(async (_url, request) => {
      requests.push(request ?? {});
      count += 1;
      return {
        data: [
          {
            url: "https://bbs.eddibb.cc/test/read.cgi/liveedge/1000000001/",
            title: count === 1 ? "first" : "second",
            resCount: count,
            createdAt: 1000000001000,
          },
        ],
        metadata: {
          etag: `"v${count}"`,
          lastModified: "Sun, 23 Aug 2026 00:00:00 GMT",
          bodyBytes: 100,
        },
      };
    });
    const events: LiveBoardSessionEvent[] = [];
    const session = new LiveBoardSession(boardUrl, {
      source,
      cache: new MemoryLiveBoardCache(),
    });
    session.subscribe((event) => events.push(event));

    await session.refresh();
    await session.refresh();

    expect(requests[0].headers).toEqual({});
    expect(requests[1].headers).toEqual({
      "If-None-Match": '"v1"',
      "If-Modified-Since": "Sun, 23 Aug 2026 00:00:00 GMT",
    });
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ type: "snapshot", changed: true });
  });

  it("publishes subject snapshots through the shared event bus", async () => {
    const eventBus = new MemoryLiveEventBus();
    const source = sourceFor(async () => ({
      data: [],
      metadata: { bodyBytes: 0 },
    }));
    const session = new LiveBoardSession(boardUrl, { source, eventBus });

    await session.refresh();

    expect(eventBus.events[0]).toMatchObject({
      type: "board-snapshot",
      boardUrl,
      changed: true,
    });
  });
});
