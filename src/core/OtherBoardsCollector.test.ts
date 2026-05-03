import { describe, expect, it, vi } from "vitest";
import { OtherBoardsCollector, IOtherBoardsDeps } from "src/core/OtherBoardsCollector";
import { BBSMenu } from "src/core/parseBBSMenu";

// src/core/URL は BroadcastChannel に依存する src/app を間接的にインポートするため、
// jsdom 環境では動作しない。OtherBoardsCollector が使う機能のみをモックする。
vi.mock("src/core/URL", () => {
  class MockURL {
    href: string;
    private _pathname: string;
    private _hostname: string;

    constructor(url: string) {
      const match = url.match(/^(https?):\/\/([^/]+)(\/.*)?$/);
      if (!match) throw new Error(`Invalid URL: ${url}`);
      this._hostname = match[2];
      this._pathname = match[3] ?? "/";
      this.href = `${match[1]}://${this._hostname}${this._pathname}`;
    }

    guessType(): { type: string } {
      // /test/read.cgi/BOARD/NUMBER/ 形式をスレッドと判定
      if (/\/test\/read\.cgi\/\w+\/\d+\//.test(this._pathname)) {
        return { type: "thread" };
      }
      return { type: "board" };
    }

    toBoard(): MockURL {
      const match = this._pathname.match(/\/test\/read\.cgi\/(\w+)\/\d+\//);
      if (!match) throw new Error("toBoard() はスレッドURLにのみ使用できます");
      return new MockURL(`https://${this._hostname}/${match[1]}/`);
    }

    getTsld(): string {
      const parts = this._hostname.split(".");
      const len = parts.length;
      return len >= 2 ? `${parts[len - 2]}.${parts[len - 1]}` : "";
    }
  }
  return { URL: MockURL };
});

// ---- テスト用ヘルパー ----

/** デフォルトの deps モックを生成する */
function makeDeps(overrides: Partial<IOtherBoardsDeps> = {}): IOtherBoardsDeps {
  return {
    getAllReadStates: vi.fn().mockResolvedValue([]),
    getUniqueHistory: vi.fn().mockResolvedValue([]),
    getCachedBoardTitles: vi.fn().mockReturnValue({}),
    saveBoardTitles: vi.fn(),
    resolveBoardTitle: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

/** 最小限のBBSMenuを生成する */
function makeMenu(
  name: string,
  boards: { name: string; url: string }[],
): BBSMenu {
  return {
    name,
    categories: [{ name: "カテゴリ", boards }],
  };
}

// ---- テスト ----

describe("OtherBoardsCollector.collect", () => {
  it("ReadStateにも履歴にも未登録板がない場合はmenusを変更しない", async () => {
    const deps = makeDeps();
    const collector = new OtherBoardsCollector(deps);
    const menus: BBSMenu[] = [
      makeMenu("メニュー1", [{ name: "板1", url: "https://foo.5ch.io/board1/" }]),
    ];

    await collector.collect(menus);

    expect(menus).toHaveLength(1);
    expect(menus[0].categories).toHaveLength(1);
  });

  it("ReadStateに未登録のスレッドURLがある場合、板URLを「その他」に追加する", async () => {
    const deps = makeDeps({
      getAllReadStates: vi.fn().mockResolvedValue([
        { url: "https://foo.5ch.io/test/read.cgi/board1/1000000010/" },
      ]),
    });
    const collector = new OtherBoardsCollector(deps);
    const menus: BBSMenu[] = [];

    await collector.collect(menus);

    const otherMenu = menus.find((m) => m.name === "その他");
    expect(otherMenu).toBeDefined();
    const boards = otherMenu!.categories.flatMap((c) => c.boards);
    expect(boards.some((b) => b.url.includes("board1"))).toBe(true);
  });

  it("ReadStateに board_url が保存されている場合はそれを使用する", async () => {
    const deps = makeDeps({
      getAllReadStates: vi.fn().mockResolvedValue([
        {
          url: "https://foo.5ch.io/test/read.cgi/board1/1000000010/",
          board_url: "https://foo.5ch.io/board1/",
        },
      ]),
    });
    const collector = new OtherBoardsCollector(deps);
    const menus: BBSMenu[] = [];

    await collector.collect(menus);

    const otherMenu = menus.find((m) => m.name === "その他");
    const boards = otherMenu!.categories.flatMap((c) => c.boards);
    expect(boards[0].url).toBe("https://foo.5ch.io/board1/");
  });

  it("履歴に未登録のスレッドURLがある場合、板URLを「その他」に追加する", async () => {
    const deps = makeDeps({
      getUniqueHistory: vi.fn().mockResolvedValue([
        {
          url: "https://foo.5ch.io/test/read.cgi/news/1000000011/",
          boardTitle: "ニュース板",
        },
      ]),
    });
    const collector = new OtherBoardsCollector(deps);
    const menus: BBSMenu[] = [];

    await collector.collect(menus);

    const otherMenu = menus.find((m) => m.name === "その他");
    const boards = otherMenu!.categories.flatMap((c) => c.boards);
    expect(boards[0].name).toBe("ニュース板");
  });

  it("既にメニューに登録済みの板はその他に追加しない", async () => {
    const registeredUrl = "https://foo.5ch.io/board1/";
    const deps = makeDeps({
      getAllReadStates: vi.fn().mockResolvedValue([
        { url: "https://foo.5ch.io/test/read.cgi/board1/1000000010/" },
      ]),
    });
    const collector = new OtherBoardsCollector(deps);
    const menus: BBSMenu[] = [
      makeMenu("メニュー1", [{ name: "板1", url: registeredUrl }]),
    ];

    await collector.collect(menus);

    // 「その他」メニューが追加されていないか、追加されていても board1 は含まれない
    const otherMenu = menus.find((m) => m.name === "その他");
    if (otherMenu) {
      const boards = otherMenu.categories.flatMap((c) => c.boards);
      expect(boards.every((b) => !b.url.includes("board1"))).toBe(true);
    } else {
      expect(menus).toHaveLength(1);
    }
  });

  it("同じ板URLが複数ソースに存在しても重複して追加しない", async () => {
    const threadUrl = "https://foo.5ch.io/test/read.cgi/board1/1000000010/";
    const deps = makeDeps({
      getAllReadStates: vi.fn().mockResolvedValue([{ url: threadUrl }]),
      getUniqueHistory: vi.fn().mockResolvedValue([
        { url: threadUrl, boardTitle: "板1" },
      ]),
    });
    const collector = new OtherBoardsCollector(deps);
    const menus: BBSMenu[] = [];

    await collector.collect(menus);

    const otherMenu = menus.find((m) => m.name === "その他");
    const boards = otherMenu!.categories.flatMap((c) => c.boards);
    const board1Entries = boards.filter((b) => b.url.includes("board1"));
    expect(board1Entries).toHaveLength(1);
  });

  it("キャッシュ済みの板名を即座に適用する", async () => {
    const boardUrl = "https://foo.5ch.io/board1/";
    const deps = makeDeps({
      getAllReadStates: vi.fn().mockResolvedValue([
        { url: "https://foo.5ch.io/test/read.cgi/board1/1000000010/" },
      ]),
      getCachedBoardTitles: vi.fn().mockReturnValue({
        [boardUrl]: "キャッシュ済み板名",
      }),
    });
    const collector = new OtherBoardsCollector(deps);
    const menus: BBSMenu[] = [];

    await collector.collect(menus);

    const otherMenu = menus.find((m) => m.name === "その他");
    const boards = otherMenu!.categories.flatMap((c) => c.boards);
    expect(boards[0].name).toBe("キャッシュ済み板名");
  });

  it("既存の「その他」メニューがある場合は新規作成せず既存に追加する", async () => {
    const deps = makeDeps({
      getUniqueHistory: vi.fn().mockResolvedValue([
        { url: "https://foo.5ch.io/test/read.cgi/news/1000000011/" },
      ]),
    });
    const collector = new OtherBoardsCollector(deps);
    const existingOtherMenu: BBSMenu = {
      name: "その他",
      categories: [{ name: "既存カテゴリ", boards: [] }],
    };
    const menus: BBSMenu[] = [existingOtherMenu];

    await collector.collect(menus);

    // 「その他」メニューが増えていないこと
    const otherMenus = menus.filter((m) => m.name === "その他");
    expect(otherMenus).toHaveLength(1);
    // 「一度開いた板」カテゴリが追加されていること
    expect(otherMenus[0].categories.some((c) => c.name === "一度開いた板")).toBe(true);
  });

  it("ReadStateの取得が失敗してもエラーをスローせず処理を続ける", async () => {
    const deps = makeDeps({
      getAllReadStates: vi.fn().mockRejectedValue(new Error("DB error")),
      getUniqueHistory: vi.fn().mockResolvedValue([
        { url: "https://foo.5ch.io/test/read.cgi/news/1000000011/" },
      ]),
    });
    const collector = new OtherBoardsCollector(deps);
    const menus: BBSMenu[] = [];

    // エラーをスローしないこと
    await expect(collector.collect(menus)).resolves.toBeUndefined();

    // 履歴からは追加されていること
    const otherMenu = menus.find((m) => m.name === "その他");
    expect(otherMenu).toBeDefined();
  });

  it("履歴の取得が失敗してもエラーをスローせず処理を続ける", async () => {
    const deps = makeDeps({
      getAllReadStates: vi.fn().mockResolvedValue([
        { url: "https://foo.5ch.io/test/read.cgi/board1/1000000010/" },
      ]),
      getUniqueHistory: vi.fn().mockRejectedValue(new Error("History error")),
    });
    const collector = new OtherBoardsCollector(deps);
    const menus: BBSMenu[] = [];

    await expect(collector.collect(menus)).resolves.toBeUndefined();

    const otherMenu = menus.find((m) => m.name === "その他");
    expect(otherMenu).toBeDefined();
  });

  it("板URLではないURLはReadStateから無視する", async () => {
    const deps = makeDeps({
      // board タイプのURLを渡す（スレッドではない）
      getAllReadStates: vi.fn().mockResolvedValue([
        { url: "https://foo.5ch.io/board1/" },
      ]),
    });
    const collector = new OtherBoardsCollector(deps);
    const menus: BBSMenu[] = [];

    await collector.collect(menus);

    // board タイプのURLは toBoard() を呼ばないので「その他」に追加されない
    const otherMenu = menus.find((m) => m.name === "その他");
    expect(otherMenu).toBeUndefined();
  });
});
