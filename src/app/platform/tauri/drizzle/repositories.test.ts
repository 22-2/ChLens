// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

// 本番と同じ db.ts（マイグレーションとドリズル変換）を通すため、Tauri の SQL プラグインだけを
// node の組み込み SQLite（:memory:）へ差し替える。Tauri 側の接続先の解決は使わないので空を返す。
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => null),
}));

vi.mock("@tauri-apps/plugin-sql", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const sqlite = new DatabaseSync(":memory:");
  const plugin = {
    execute: async (query: string, bindValues: unknown[] = []) => {
      sqlite.prepare(query).run(...(bindValues as never[]));
      return { rowsAffected: 0, lastInsertId: 0 };
    },
    select: async (query: string, bindValues: unknown[] = []) =>
      sqlite.prepare(query).all(...(bindValues as never[])),
  };
  return { default: { load: async () => plugin } };
});

const BOARD_URL = "https://mevius.5ch.io/livegalileo/";
const THREAD_URL = "https://mevius.5ch.io/test/read.cgi/livegalileo/1000000001/";
const SUBDOMAIN_THREAD_URL = "https://eagle.5ch.io/test/read.cgi/livegalileo/1000000001/";
const STORED_THREAD_URL = "https://*.5ch.io/test/read.cgi/livegalileo/1000000001/";
const OTHER_THREAD_URL = "https://mevius.5ch.io/test/read.cgi/otherboard/1000000002/";

type Repositories = typeof import("src/app/platform/tauri/drizzle/repositories");

// 同じ :memory: データベースを共有するため、各テストの後で全テーブルを空にする。
async function clearAll(repositories: Repositories) {
  await repositories.tauriReadStateRepository.clear();
  await repositories.tauriHistoryRepository.clear(-1);
  await repositories.tauriCacheRepository.clear();
  await repositories.tauriWriteHistoryRepository.clear(-1);
}

describe("Tauri SQLite の既読情報リポジトリ", () => {
  let repositories: Repositories;

  beforeEach(async () => {
    repositories = await import("src/app/platform/tauri/drizzle/repositories");
    await clearAll(repositories);
  });

  afterEach(async () => {
    await clearAll(repositories);
  });

  it("保存すると、呼び出し時のURLと板のURLを返す", async () => {
    const result = await repositories.tauriReadStateRepository.set({
      url: THREAD_URL,
      received: 10,
      read: 5,
      last: 10,
    });

    expect(result).toEqual({ boardUrl: BOARD_URL, normalizedUrl: THREAD_URL });
  });

  it("保存したスレッドの既読情報を、呼び出し時のURLのまま取得できる", async () => {
    const { tauriReadStateRepository } = repositories;
    await tauriReadStateRepository.set({ url: THREAD_URL, received: 10, read: 5, last: 10 });

    expect(await tauriReadStateRepository.get(THREAD_URL)).toEqual({
      url: THREAD_URL,
      received: 10,
      read: 5,
      last: 10,
      offset: undefined,
      date: undefined,
    });
  });

  it("同じスレッドを保存し直すと、既読情報を上書きする", async () => {
    const { tauriReadStateRepository } = repositories;
    await tauriReadStateRepository.set({ url: THREAD_URL, received: 10, read: 5, last: 10 });
    await tauriReadStateRepository.set({ url: THREAD_URL, received: 12, read: 12, last: 12 });

    expect(await tauriReadStateRepository.get(THREAD_URL)).toMatchObject({
      received: 12,
      read: 12,
      last: 12,
    });
    expect(await tauriReadStateRepository.getAll()).toHaveLength(1);
  });

  it("フラグメントは保存キーに含めず、同じスレッドとして扱う", async () => {
    const { tauriReadStateRepository } = repositories;
    await tauriReadStateRepository.set({
      url: `${THREAD_URL}#res-3`,
      received: 10,
      read: 5,
      last: 10,
    });

    expect(await tauriReadStateRepository.get(THREAD_URL)).toMatchObject({
      url: THREAD_URL,
      read: 5,
    });
  });

  it("5ch の別サブドメインでも同じスレッドの既読情報を共有し、そのURLで返す", async () => {
    const { tauriReadStateRepository } = repositories;
    await tauriReadStateRepository.set({ url: THREAD_URL, received: 10, read: 7, last: 10 });

    expect(await tauriReadStateRepository.get(SUBDOMAIN_THREAD_URL)).toMatchObject({
      url: SUBDOMAIN_THREAD_URL,
      read: 7,
    });
  });

  it("未保存のスレッドは null を返す", async () => {
    expect(await repositories.tauriReadStateRepository.get(THREAD_URL)).toBeNull();
  });

  it("全件取得では、保存キーのURLで返す", async () => {
    const { tauriReadStateRepository } = repositories;
    await tauriReadStateRepository.set({ url: THREAD_URL, received: 10, read: 5, last: 10 });

    const all = await tauriReadStateRepository.getAll();

    expect(all.map((item) => item.url)).toEqual([STORED_THREAD_URL]);
  });

  it("板ごとの取得では、その板の既読情報だけを呼び出し元のホストのURLで返す", async () => {
    const { tauriReadStateRepository } = repositories;
    await tauriReadStateRepository.set({ url: THREAD_URL, received: 10, read: 5, last: 10 });
    await tauriReadStateRepository.set({ url: OTHER_THREAD_URL, received: 4, read: 4, last: 4 });

    const result = await tauriReadStateRepository.getByBoard(BOARD_URL);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ url: THREAD_URL, read: 5 });
  });

  it("削除は、呼び出し時のURLを返し、以後は取得できない", async () => {
    const { tauriReadStateRepository } = repositories;
    await tauriReadStateRepository.set({ url: THREAD_URL, received: 10, read: 5, last: 10 });

    expect(await tauriReadStateRepository.remove(THREAD_URL)).toBe(THREAD_URL);

    expect(await tauriReadStateRepository.get(THREAD_URL)).toBeNull();
  });

  it("全件削除で、保存したすべての既読情報を消す", async () => {
    const { tauriReadStateRepository } = repositories;
    await tauriReadStateRepository.set({ url: THREAD_URL, received: 10, read: 5, last: 10 });
    await tauriReadStateRepository.set({ url: OTHER_THREAD_URL, received: 4, read: 4, last: 4 });

    await tauriReadStateRepository.clear();

    expect(await tauriReadStateRepository.getAll()).toEqual([]);
  });
});

describe("Tauri SQLite の閲覧履歴リポジトリ", () => {
  let repositories: Repositories;

  beforeEach(async () => {
    repositories = await import("src/app/platform/tauri/drizzle/repositories");
    await clearAll(repositories);
  });

  afterEach(async () => {
    await clearAll(repositories);
  });

  it("閲覧履歴は、新しい日時のものから順に返す", async () => {
    const { tauriHistoryRepository } = repositories;
    await tauriHistoryRepository.add(THREAD_URL, "古い閲覧", 100, "板A");
    await tauriHistoryRepository.add(OTHER_THREAD_URL, "新しい閲覧", 300, "板B");

    const rows = await tauriHistoryRepository.get(0, 10);

    expect(rows.map((row) => row.date)).toEqual([300, 100]);
    expect(rows[0]).toMatchObject({
      url: OTHER_THREAD_URL,
      title: "新しい閲覧",
      boardTitle: "板B",
    });
  });

  it("重複を除いた一覧では、同じURLの中で最も新しい閲覧を残す", async () => {
    const { tauriHistoryRepository } = repositories;
    await tauriHistoryRepository.add(THREAD_URL, "スレ", 100, "板A");
    await tauriHistoryRepository.add(OTHER_THREAD_URL, "別スレ", 200, "板A");
    await tauriHistoryRepository.add(THREAD_URL, "スレ", 300, "板A");

    const unique = await tauriHistoryRepository.getUnique(0, 10);

    expect(unique.map((row) => [row.url, row.date])).toEqual([
      [THREAD_URL, 300],
      [OTHER_THREAD_URL, 200],
    ]);
  });

  it("URLを指定すると、その閲覧だけを新しい順に返す", async () => {
    const { tauriHistoryRepository } = repositories;
    await tauriHistoryRepository.add(THREAD_URL, "スレ", 100, "板A");
    await tauriHistoryRepository.add(OTHER_THREAD_URL, "別スレ", 200, "板A");
    await tauriHistoryRepository.add(THREAD_URL, "スレ", 300, "板A");

    const rows = await tauriHistoryRepository.getByUrl(THREAD_URL);

    expect(rows.map((row) => row.date)).toEqual([300, 100]);
  });

  it("日時を指定して削除すると、その閲覧だけを消す", async () => {
    const { tauriHistoryRepository } = repositories;
    await tauriHistoryRepository.add(THREAD_URL, "スレ", 100, "板A");
    await tauriHistoryRepository.add(THREAD_URL, "スレ", 300, "板A");

    await tauriHistoryRepository.remove(THREAD_URL, 300);

    expect((await tauriHistoryRepository.getByUrl(THREAD_URL)).map((row) => row.date)).toEqual([
      100,
    ]);
  });

  it("日時を指定しないで削除すると、そのURLの閲覧をすべて消す", async () => {
    const { tauriHistoryRepository } = repositories;
    await tauriHistoryRepository.add(THREAD_URL, "スレ", 100, "板A");
    await tauriHistoryRepository.add(THREAD_URL, "スレ", 300, "板A");
    await tauriHistoryRepository.add(OTHER_THREAD_URL, "別スレ", 200, "板A");

    await tauriHistoryRepository.remove(THREAD_URL, null);

    expect(await tauriHistoryRepository.count()).toBe(1);
    expect(await tauriHistoryRepository.getByUrl(THREAD_URL)).toEqual([]);
  });

  it("指定した日時より前の閲覧だけを期間で消す", async () => {
    const { tauriHistoryRepository } = repositories;
    await tauriHistoryRepository.add(THREAD_URL, "古い", 100, "板A");
    await tauriHistoryRepository.add(OTHER_THREAD_URL, "新しい", 300, "板A");

    await tauriHistoryRepository.clearRange(200);

    expect((await tauriHistoryRepository.getAll()).map((row) => row.title)).toEqual(["新しい"]);
  });

  it("全件削除で、閲覧履歴をすべて消す", async () => {
    const { tauriHistoryRepository } = repositories;
    await tauriHistoryRepository.add(THREAD_URL, "スレ", 100, "板A");

    await tauriHistoryRepository.clear(-1);

    expect(await tauriHistoryRepository.count()).toBe(0);
  });
});

describe("Tauri SQLite のキャッシュリポジトリ", () => {
  let repositories: Repositories;

  beforeEach(async () => {
    repositories = await import("src/app/platform/tauri/drizzle/repositories");
    await clearAll(repositories);
  });

  afterEach(async () => {
    await clearAll(repositories);
  });

  function createCacheRecord(
    overrides: Partial<Parameters<Repositories["tauriCacheRepository"]["put"]>[0]> = {},
  ) {
    return {
      url: THREAD_URL,
      data: "<dat>本文</dat>",
      parsed: { responseCount: 1 },
      lastUpdated: 1_000,
      lastModified: null,
      etag: null,
      resLength: 3,
      datSize: 10,
      readcgiVer: 1,
      expired: false,
      title: "テストスレ",
      threadUrl: THREAD_URL,
      boardUrl: BOARD_URL,
      boardTitle: "テスト板",
      kind: "thread",
      ...overrides,
    };
  }

  it("保存した本文と解析結果を、JSONを戻したうえで取得できる", async () => {
    const { tauriCacheRepository } = repositories;
    await tauriCacheRepository.put(createCacheRecord());

    expect(await tauriCacheRepository.get(THREAD_URL)).toMatchObject({
      url: THREAD_URL,
      data: "<dat>本文</dat>",
      parsed: { responseCount: 1 },
      lastUpdated: 1_000,
      expired: false,
      title: "テストスレ",
      kind: "thread",
    });
  });

  it("dat落ちの状態は、真偽値として保存し、未確認は null のまま返す", async () => {
    const { tauriCacheRepository } = repositories;
    await tauriCacheRepository.put(createCacheRecord({ expired: true }));
    expect((await tauriCacheRepository.get(THREAD_URL))?.expired).toBe(true);

    await tauriCacheRepository.put(createCacheRecord({ expired: null }));
    expect((await tauriCacheRepository.get(THREAD_URL))?.expired).toBeNull();
  });

  it("同じURLを保存し直すと、内容を上書きし、件数は増やさない", async () => {
    const { tauriCacheRepository } = repositories;
    await tauriCacheRepository.put(createCacheRecord({ data: "古い本文" }));
    await tauriCacheRepository.put(createCacheRecord({ data: "新しい本文", lastUpdated: 2_000 }));

    expect(await tauriCacheRepository.get(THREAD_URL)).toMatchObject({
      data: "新しい本文",
      lastUpdated: 2_000,
    });
    expect(await tauriCacheRepository.count()).toBe(1);
  });

  it("削除すると取得できなくなり、件数も減る", async () => {
    const { tauriCacheRepository } = repositories;
    await tauriCacheRepository.put(createCacheRecord());
    await tauriCacheRepository.put(createCacheRecord({ url: OTHER_THREAD_URL }));

    await tauriCacheRepository.remove(THREAD_URL);

    expect(await tauriCacheRepository.get(THREAD_URL)).toBeNull();
    expect(await tauriCacheRepository.count()).toBe(1);
  });

  it("期間で掃除すると、古い通常の本文だけを消し、新しいものとdat落ちと閲覧ログは残す", async () => {
    const { tauriCacheRepository } = repositories;
    const oldPlain = THREAD_URL;
    const oldExpired = `${THREAD_URL}expired`;
    const oldLog = `${THREAD_URL}log`;
    const freshPlain = `${THREAD_URL}fresh`;
    await tauriCacheRepository.put(
      createCacheRecord({ url: oldPlain, lastUpdated: 100, kind: null }),
    );
    await tauriCacheRepository.put(
      createCacheRecord({ url: oldExpired, lastUpdated: 100, kind: null, expired: true }),
    );
    await tauriCacheRepository.put(
      createCacheRecord({ url: oldLog, lastUpdated: 100, kind: "thread" }),
    );
    await tauriCacheRepository.put(
      createCacheRecord({ url: freshPlain, lastUpdated: 900, kind: null }),
    );

    await tauriCacheRepository.clearOlderThan(500);

    const remaining = await Promise.all(
      [oldPlain, oldExpired, oldLog, freshPlain].map((url) => tauriCacheRepository.get(url)),
    );
    expect(remaining.map((record) => record?.url ?? null)).toEqual([
      null,
      oldExpired,
      oldLog,
      freshPlain,
    ]);
  });

  it("板ごとの一覧用の種類ではない古い本文は、期間の掃除で消す", async () => {
    const { tauriCacheRepository } = repositories;
    await tauriCacheRepository.put(createCacheRecord({ kind: "board", lastUpdated: 100 }));

    await tauriCacheRepository.clearOlderThan(500);

    expect(await tauriCacheRepository.get(THREAD_URL)).toBeNull();
  });

  it("全件削除で、キャッシュをすべて消す", async () => {
    const { tauriCacheRepository } = repositories;
    await tauriCacheRepository.put(createCacheRecord());

    await tauriCacheRepository.clear();

    expect(await tauriCacheRepository.count()).toBe(0);
  });
});

describe("Tauri SQLite の板メニューのキャッシュ", () => {
  let repositories: Repositories;

  beforeEach(async () => {
    repositories = await import("src/app/platform/tauri/drizzle/repositories");
    await clearAll(repositories);
  });

  afterEach(async () => {
    await clearAll(repositories);
  });

  it("保存したメニューを、キーで取得できる", async () => {
    const { tauriBBSMenuCacheRepository } = repositories;
    await tauriBBSMenuCacheRepository.put({ key: "bbsmenu", data: "[]", lastUpdated: 5 });

    expect(await tauriBBSMenuCacheRepository.get("bbsmenu")).toEqual({
      key: "bbsmenu",
      data: "[]",
      lastUpdated: 5,
    });
  });

  it("同じキーで保存し直すと、メニューを上書きする", async () => {
    const { tauriBBSMenuCacheRepository } = repositories;
    await tauriBBSMenuCacheRepository.put({ key: "bbsmenu", data: "[]", lastUpdated: 5 });
    await tauriBBSMenuCacheRepository.put({ key: "bbsmenu", data: "[1]", lastUpdated: 9 });

    expect(await tauriBBSMenuCacheRepository.get("bbsmenu")).toEqual({
      key: "bbsmenu",
      data: "[1]",
      lastUpdated: 9,
    });
  });

  it("保存されていないキーは null を返す", async () => {
    expect(await repositories.tauriBBSMenuCacheRepository.get("missing")).toBeNull();
  });
});

describe("Tauri SQLite の書き込み履歴リポジトリ", () => {
  let repositories: Repositories;

  beforeEach(async () => {
    repositories = await import("src/app/platform/tauri/drizzle/repositories");
    await clearAll(repositories);
  });

  afterEach(async () => {
    await clearAll(repositories);
  });

  function createWriteRecord(
    overrides: Partial<Parameters<Repositories["tauriWriteHistoryRepository"]["add"]>[0]> = {},
  ) {
    return {
      url: THREAD_URL,
      res: 3,
      title: "テストスレ",
      name: "名無し",
      mail: "sage",
      inputName: "入力名",
      inputMail: "入力メール",
      message: "本文です",
      date: 100,
      ...overrides,
    };
  }

  it("書き込みを追加すると、新しい日時のものから順に、入力した内容のまま返す", async () => {
    const { tauriWriteHistoryRepository } = repositories;
    await tauriWriteHistoryRepository.add(createWriteRecord({ date: 100 }));
    await tauriWriteHistoryRepository.add(createWriteRecord({ res: 4, date: 300 }));

    const rows = await tauriWriteHistoryRepository.get(0, 10);

    expect(rows.map((row) => row.res)).toEqual([4, 3]);
    expect(rows[1]).toMatchObject({
      url: THREAD_URL,
      name: "名無し",
      input_name: "入力名",
      input_mail: "入力メール",
      message: "本文です",
    });
  });

  it("書き込みを更新すると、内容を書き換える", async () => {
    const { tauriWriteHistoryRepository } = repositories;
    await tauriWriteHistoryRepository.add(createWriteRecord());
    const [saved] = await tauriWriteHistoryRepository.get(0, 1);

    await tauriWriteHistoryRepository.update({
      ...createWriteRecord(),
      id: saved!.id,
      message: "直した本文",
    });

    expect((await tauriWriteHistoryRepository.get(0, 1))[0]).toMatchObject({
      id: saved!.id,
      message: "直した本文",
    });
  });

  it("URLと書き込みの番号を指定すると、その書き込みだけを消す", async () => {
    const { tauriWriteHistoryRepository } = repositories;
    await tauriWriteHistoryRepository.add(createWriteRecord({ res: 3 }));
    await tauriWriteHistoryRepository.add(createWriteRecord({ res: 4 }));

    await tauriWriteHistoryRepository.remove(THREAD_URL, 3);

    expect((await tauriWriteHistoryRepository.getByUrl(THREAD_URL)).map((row) => row.res)).toEqual([
      4,
    ]);
  });

  it("全件削除で、書き込み履歴をすべて消す", async () => {
    const { tauriWriteHistoryRepository } = repositories;
    await tauriWriteHistoryRepository.add(createWriteRecord());

    await tauriWriteHistoryRepository.clear(-1);

    expect(await tauriWriteHistoryRepository.count()).toBe(0);
  });
});
