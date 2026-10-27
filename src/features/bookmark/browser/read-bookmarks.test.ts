import { describe, expect, it } from "vite-plus/test";

import { type BookmarkEntry, toBookmarkPage } from "./read-bookmarks";

function entry(patch: Partial<BookmarkEntry>): BookmarkEntry {
  return {
    url: "",
    title: "",
    pageType: "thread",
    boardTitle: "",
    resCount: 0,
    unreadCount: 0,
    heat: 0,
    createdAt: 0,
    originalIndex: 0,
    ...patch,
  };
}

describe("お気に入りから開くページ", () => {
  it("スレは保存されている題名で開く", () => {
    const threadUrl = "https://example.com/test/read.cgi/board/1/";
    expect(toBookmarkPage(entry({ url: threadUrl, title: "保存したスレ" }))).toEqual(
      expect.objectContaining({ type: "thread", threadUrl, title: "保存したスレ" }),
    );
  });

  it("板は板名を引き継ぎ、板名がなければ題名を使う", () => {
    const boardUrl = "https://example.com/board/";
    const base = { url: boardUrl, title: "保存した板", pageType: "threadList" as const };
    expect(toBookmarkPage(entry({ ...base, boardTitle: "板名" }))).toEqual(
      expect.objectContaining({ type: "threadList", boardUrl, boardTitle: "板名" }),
    );
    expect(toBookmarkPage(entry(base))).toEqual(
      expect.objectContaining({ boardTitle: "保存した板" }),
    );
  });

  it("開けない URL なら null を返す", () => {
    expect(toBookmarkPage(entry({ url: "not a url" }))).toBeNull();
  });
});
