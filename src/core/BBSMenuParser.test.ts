import { BBSMenuParser } from "src/core/BBSMenuParser";
import { describe, expect, it, vi } from "vite-plus/test";

// src/core/URL は BroadcastChannel に依存する src/app を間接的にインポートするため、
// jsdom 環境では動作しない。BBSMenuParser が使う機能（hostname, getTsld）のみをモックする。
vi.mock("src/core/URL", () => {
  class MockURL {
    hostname: string;
    href: string;
    constructor(url: string) {
      // 最小限のURL解析（テスト用）
      const match = url.match(/^https?:\/\/([^/]+)(.*)/);
      if (!match) throw new Error(`Invalid URL: ${url}`);
      this.hostname = match[1];
      this.href = url.endsWith("/") ? url : url + "/";
    }
    getTsld(): string {
      const parts = this.hostname.split(".");
      const len = parts.length;
      return len >= 2 ? `${parts[len - 2]}.${parts[len - 1]}` : "";
    }
  }
  return { URL: MockURL };
});

// ---- テスト用ヘルパー ----

/** 最小限のBBSMenu HTML を生成する */
function buildHtml(
  title: string,
  categories: { name: string; boards: { name: string; url: string }[] }[],
): string {
  const cats = categories
    .map(
      (cat) =>
        `<BR><BR><B>${cat.name}</B><BR>\n` +
        cat.boards.map((b) => `<A HREF=${b.url}>${b.name}</A><BR>`).join("\n"),
    )
    .join("\n");
  return `<HTML><HEAD><TITLE>${title}</TITLE></HEAD><BODY>\n${cats}\n</BODY></HTML>`;
}

// ---- parseExcludeOptions ----

describe("BBSMenuParser.parseExcludeOptions", () => {
  it("空文字列を渡すと空のSetを返す", () => {
    const result = BBSMenuParser.parseExcludeOptions("");
    expect(result.size).toBe(0);
  });

  it("コメント行（//）と空行を無視する", () => {
    const input = "// これはコメント\n\nhttps://example.5ch.io/\n// 別コメント";
    const result = BBSMenuParser.parseExcludeOptions(input);
    // https://example.5ch.io/ → getTsld() = "5ch.io"
    expect(result).toContain("5ch.io");
    expect(result.size).toBe(1);
  });

  it("有効なURLからTLDを抽出する", () => {
    const input = "https://foo.bbspink.com/\nhttps://bar.2ch.sc/";
    const result = BBSMenuParser.parseExcludeOptions(input);
    expect(result).toContain("bbspink.com");
    expect(result).toContain("2ch.sc");
  });

  it("URLとして解釈できない文字列はそのまま追加する", () => {
    const input = "not-a-url";
    const result = BBSMenuParser.parseExcludeOptions(input);
    expect(result).toContain("not-a-url");
  });
});

// ---- parse ----

describe("BBSMenuParser.parse", () => {
  it("HTMLをパースしてBBSMenuを返す", () => {
    const html = buildHtml("テスト板一覧", [
      {
        name: "カテゴリA",
        boards: [
          { name: "板1", url: "https://foo.5ch.io/board1/" },
          { name: "板2", url: "https://bar.5ch.io/board2/" },
        ],
      },
    ]);

    const menu = BBSMenuParser.parse(html, "https://menu.5ch.io/bbsmenu.html", new Set());

    expect(menu.name).toBe("テスト板一覧");
    expect(menu.categories).toHaveLength(1);
    expect(menu.categories[0].boards).toHaveLength(2);
  });

  it("メニュー名が無い場合はURLのホスト名をフォールバックとして使用する", () => {
    // TITLEタグなしのHTML
    const html = buildHtml("", [
      {
        name: "カテゴリA",
        boards: [{ name: "板1", url: "https://foo.5ch.io/board1/" }],
      },
    ]).replace("<TITLE></TITLE>", "");

    const menu = BBSMenuParser.parse(html, "https://menu.5ch.io/bbsmenu.html", new Set());

    expect(menu.name).toBe("menu.5ch.io");
  });

  it("bbsmenuの相対hrefを取得元URL基準の絶対URLへ変換する", () => {
    const html = buildHtml("板一覧", [
      {
        name: "カテゴリA",
        boards: [
          { name: "ルート相対板", url: "/board1/" },
          { name: "ホスト相対板", url: "//foo.5ch.io/board2/" },
        ],
      },
    ]);

    const menu = BBSMenuParser.parse(html, "https://menu.5ch.io/bbsmenu.html", new Set());
    const boards = menu.categories[0].boards;

    expect(boards[0].url).toBe("https://menu.5ch.io/board1/");
    expect(boards[1].url).toBe("https://foo.5ch.io/board2/");
  });

  it("除外TLDに一致する板をフィルタリングする（bbspink.comは例外で除外されない）", () => {
    const html = buildHtml("板一覧", [
      {
        name: "カテゴリA",
        boards: [
          { name: "5ch板", url: "https://foo.5ch.io/board1/" },
          { name: "bbspink板", url: "https://foo.bbspink.com/board2/" },
          { name: "2ch.sc板", url: "https://foo.2ch.sc/board3/" },
        ],
      },
    ]);

    // bbspink.com と 2ch.sc を除外オプションに指定
    const excludeTslds = new Set(["bbspink.com", "2ch.sc"]);
    const menu = BBSMenuParser.parse(html, "https://menu.5ch.io/bbsmenu.html", excludeTslds);

    const boards = menu.categories.flatMap((c) => c.boards);
    // bbspink.com は例外扱いで除外されない
    expect(boards.some((b) => b.url.includes("bbspink.com"))).toBe(true);
    // 2ch.sc は除外される
    expect(boards.some((b) => b.url.includes("2ch.sc"))).toBe(false);
    // 5ch.io は残る
    expect(boards.some((b) => b.url.includes("5ch.io"))).toBe(true);
  });

  it("除外後に板が0件になったカテゴリは削除される", () => {
    const html = buildHtml("板一覧", [
      {
        name: "全除外カテゴリ",
        boards: [{ name: "2ch.sc板", url: "https://foo.2ch.sc/board1/" }],
      },
      {
        name: "残るカテゴリ",
        boards: [{ name: "5ch板", url: "https://foo.5ch.io/board2/" }],
      },
    ]);

    const excludeTslds = new Set(["2ch.sc"]);
    const menu = BBSMenuParser.parse(html, "https://menu.5ch.io/bbsmenu.html", excludeTslds);

    expect(menu.categories).toHaveLength(1);
    expect(menu.categories[0].name).toBe("残るカテゴリ");
  });

  it("除外TLDが空のSetの場合は全ての板を返す", () => {
    const html = buildHtml("板一覧", [
      {
        name: "カテゴリA",
        boards: [
          { name: "5ch板", url: "https://foo.5ch.io/board1/" },
          { name: "bbspink板", url: "https://foo.bbspink.com/board2/" },
          { name: "2ch.sc板", url: "https://foo.2ch.sc/board3/" },
        ],
      },
    ]);

    const menu = BBSMenuParser.parse(html, "https://menu.5ch.io/bbsmenu.html", new Set());

    expect(menu.categories[0].boards).toHaveLength(3);
  });

  it("不正なURLを持つ板は除外せずそのまま残す", () => {
    const html = buildHtml("板一覧", [
      {
        name: "カテゴリA",
        boards: [
          { name: "正常板", url: "https://foo.5ch.io/board1/" },
          { name: "不正URL板", url: "not-a-valid-url" },
        ],
      },
    ]);

    const menu = BBSMenuParser.parse(html, "https://menu.5ch.io/bbsmenu.html", new Set(["5ch.io"]));

    // 不正URLは除外されない（URLパースエラーで除外ロジックをスキップ）
    const boards = menu.categories.flatMap((c) => c.boards);
    expect(boards.some((b) => b.name === "不正URL板")).toBe(true);
  });
});
