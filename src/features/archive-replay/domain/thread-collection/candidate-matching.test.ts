import { describe, expect, it } from "vite-plus/test";

import { collectThreadCandidates, defaultCollectionQuery } from "./candidate-matching";
import {
  collectionWindowFromSeed,
  createCollectionWindow,
  threadKeyToEpochSeconds,
} from "./collection-window";
import { DEFAULT_THREAD_COLLECTION_PARAMS as params } from "./types";

const listing = (id: number, title: string) => ({
  threadUrl: `https://example.com/test/read.cgi/board/${id}/`,
  title,
  createdAtSeconds: id,
});

describe("スレ収集の範囲", () => {
  it("種の前後と小数秒をキーの範囲に変換する", () => {
    expect(collectionWindowFromSeed(listing(1601000000, "番組"), params)).toEqual({
      startSeconds: 1600998200,
      endSeconds: 1601010800,
    });
    expect(createCollectionWindow(1.2, 3.8)).toEqual({ startSeconds: 2, endSeconds: 3 });
    expect(() => createCollectionWindow(4, 3)).toThrow();
    expect(threadKeyToEpochSeconds("1601000000")).toBe(1601000000);
    expect(threadKeyToEpochSeconds("12345")).toBeNull();
  });
});

describe("スレ収集の候補判定", () => {
  it("検索語を正規化し、重複と範囲外を除いて時刻順に並べる", () => {
    const first = listing(1601000001, "番組 Ｐａｒｔ.１");
    const second = listing(1601000002, "番組 Part.2");
    const candidates = collectThreadCandidates(
      [
        second,
        first,
        { ...first, threadUrl: first.threadUrl.slice(0, -1) },
        listing(1601000100, "番組"),
      ],
      "番組",
      { startSeconds: 1601000000, endSeconds: 1601000003 },
      params,
    );
    expect(candidates.map((candidate) => candidate.listing.createdAtSeconds)).toEqual([
      1601000001, 1601000002,
    ]);
    expect(candidates.every((candidate) => candidate.kind === "search-match")).toBe(true);
    expect(defaultCollectionQuery(first.title)).toBe("番組");
  });

  it("種を起点に類似題名を連鎖し、探索回数を制限する", () => {
    const seed = listing(1601000000, "あいうえお ★1");
    const entries = [listing(1601000002, "あいうかき ★3"), listing(1601000001, "あいうえか ★2")];
    const window = { startSeconds: 1601000000, endSeconds: 1601000002 };
    const options = { ...params, followSimilarityThreshold: 0.7 };
    expect(
      collectThreadCandidates(entries, "", window, { ...options, maxFollowPasses: 1 }, seed),
    ).toHaveLength(2);
    const candidates = collectThreadCandidates(entries, "", window, options, seed);
    expect(candidates).toHaveLength(3);
    expect(candidates[1].reasons).toContain("連番が進行");
  });
});
