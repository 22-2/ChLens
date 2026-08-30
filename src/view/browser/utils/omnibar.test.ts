import { buildOmnibarSuggestions, mergeOmnibarSources } from "src/view/browser/utils/omnibar";
import { describe, expect, it } from "vite-plus/test";

describe("omnibar utils", () => {
  it("ブックマークと履歴をURL単位で統合しブックマークタイトルを優先する", () => {
    const merged = mergeOmnibarSources(
      [
        {
          url: "https://egg.5ch.io/test/read.cgi/software/1/",
          title: "BM タイトル",
          boardTitle: "Software",
        },
      ],
      [
        {
          url: "https://egg.5ch.io/test/read.cgi/software/1/",
          title: "History タイトル",
          boardTitle: "履歴板",
          viewedDate: 1000000001000,
        },
      ],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      title: "BM タイトル",
      isBookmark: true,
      historyRank: 0,
      viewedDate: 1000000001000,
      sources: ["history", "bookmark"],
    });
  });

  it("履歴・お気に入り・板が同じURLでも出典を保持して1件にまとめる", () => {
    const merged = mergeOmnibarSources(
      [
        {
          url: "https://egg.5ch.io/software/",
          title: "お気に入りの板",
        },
      ],
      [
        {
          url: "https://egg.5ch.io/software/",
          title: "履歴の板",
        },
      ],
      [
        {
          url: "https://egg.5ch.io/software/",
          name: "bbsmenuの板",
        },
      ],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]?.sources).toEqual(["history", "bookmark", "board"]);
  });

  it("同一クエリならブックマークを履歴より上位に出す", () => {
    const merged = mergeOmnibarSources(
      [
        {
          url: "https://egg.5ch.io/test/read.cgi/software/111/",
          title: "openai thread",
          boardTitle: "Software",
        },
      ],
      [
        {
          url: "https://egg.5ch.io/test/read.cgi/software/222/",
          title: "openai thread",
          boardTitle: "Software",
          viewedDate: 1000000001000,
        },
      ],
    );

    const suggestions = buildOmnibarSuggestions(merged, "openai", 5);

    expect(suggestions).toHaveLength(2);
    expect(suggestions[0]?.isBookmark).toBe(true);
  });

  it("空クエリでも直近履歴を優先して候補を返す", () => {
    const merged = mergeOmnibarSources(
      [],
      [
        {
          url: "https://egg.5ch.io/test/read.cgi/software/1/",
          title: "new",
          viewedDate: 1700000010000,
        },
        {
          url: "https://egg.5ch.io/test/read.cgi/software/2/",
          title: "old",
          viewedDate: 1000000001000,
        },
      ],
    );

    const suggestions = buildOmnibarSuggestions(merged, "", 5);

    expect(suggestions[0]?.title).toBe("new");
    expect(suggestions[1]?.title).toBe("old");
  });
});
