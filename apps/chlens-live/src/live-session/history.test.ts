import { describe, expect, it, vi } from "vite-plus/test";
import type { ThreadData } from "@chlen/ch-lib";
import { MemoryLiveSessionOwner } from "./owner";
import type { LiveThreadSnapshot } from "./cache";
import {
  classifyLiveThreadSource,
  LiveThreadPlaybackSession,
  type LivePlaybackSource,
} from "./history";

const archiveUrl = "https://jbbs.shitaraba.net/bbs/read_archive.cgi/computer/12345/100/";

function thread(): ThreadData {
  return {
    title: "過去ログ",
    posts: [1, 2, 3].map((number) => ({
      number,
      name: `name-${number}`,
      mail: "",
      date: `2026/08/23 12:0${number}:00`,
      message: `message-${number}`,
    })),
  };
}

type FixtureSource = LivePlaybackSource & {
  load: ReturnType<typeof vi.fn>;
};

function sourceFor(data: ThreadData): FixtureSource {
  const load = vi.fn(async () => ({
    data,
    metadata: { bodyBytes: 10, parsedResCount: data.posts.length },
  }));
  return { loadThreadWithMetadata: load, load };
}

describe("Live playback contract", () => {
  it("classifies archive URLs through ChURL", () => {
    expect(classifyLiveThreadSource(archiveUrl)).toBe("archive");
    expect(classifyLiveThreadSource("https://bbs.eddibb.cc/liveedge/1000000001/")).toBe("live");
  });

  it("loads one source snapshot and projects a requested response range", async () => {
    const source = sourceFor(thread());
    const session = new LiveThreadPlaybackSession(archiveUrl, {
      source,
      cursor: { startPost: 2, endPost: 3 },
    });

    const first = await session.load();
    const second = await session.load();

    expect(first).toMatchObject({
      mode: "playback",
      sourceKind: "archive",
      cursor: { startPost: 2, endPost: 3 },
      totalResCount: 3,
      data: { posts: [{ number: 2 }, { number: 3 }] },
    });
    expect(second).toBe(first);
    expect(source.load).toHaveBeenCalledOnce();

    expect(session.seek({ startPost: 1, endPost: 1 })).toMatchObject({
      data: { posts: [{ number: 1 }] },
      totalResCount: 3,
    });
  });

  it("can replay a cached snapshot without a network source", async () => {
    const snapshot: LiveThreadSnapshot = {
      url: archiveUrl,
      data: thread(),
      metadata: { bodyBytes: 10, parsedResCount: 3 },
      updatedAt: 123,
    };
    const session = new LiveThreadPlaybackSession(archiveUrl, {
      snapshot,
      cursor: { startPost: 3 },
    });

    await expect(session.load()).resolves.toMatchObject({
      updatedAt: 123,
      data: { posts: [{ number: 3 }] },
    });
  });

  it("does not allow playback to overlap an active live owner", async () => {
    const owner = new MemoryLiveSessionOwner();
    const liveLease = owner.tryAcquire("live");
    const session = new LiveThreadPlaybackSession(archiveUrl, {
      source: sourceFor(thread()),
      owner,
    });

    await expect(session.load()).rejects.toMatchObject({
      name: "LiveSessionBusyError",
      requestedMode: "playback",
      activeMode: "live",
    });
    liveLease?.release();
    await expect(session.load()).resolves.toBeTruthy();
  });

  it("rejects an invalid playback range", () => {
    expect(
      () =>
        new LiveThreadPlaybackSession(archiveUrl, {
          source: sourceFor(thread()),
          cursor: { startPost: 3, endPost: 2 },
        }),
    ).toThrow(RangeError);
  });
});
