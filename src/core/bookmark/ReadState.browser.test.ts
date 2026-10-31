import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { messageSend, tauriState, tauriRepository, getTauriRepositories } = vi.hoisted(() => {
  const tauriRepository = {
    set: vi.fn(),
    get: vi.fn(),
    getAll: vi.fn(),
    getByBoard: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
  };
  return {
    messageSend: vi.fn(),
    tauriState: { enabled: false },
    tauriRepository,
    getTauriRepositories: vi.fn(async () => ({ tauriReadStateRepository: tauriRepository })),
  };
});

vi.mock("src/app/Message", () => ({
  default: { send: messageSend },
}));

vi.mock("src/core/storage/TauriDrizzleBridge", () => ({
  isTauriRuntime: () => tauriState.enabled,
  getTauriRepositories,
}));

// 5ch の新しいホストは 5ch.io。同じホストのサブドメインは保存キーで *.5ch.io にまとめられる。
const BOARD_URL = "https://mevius.5ch.io/livegalileo/";
const THREAD_URL = "https://mevius.5ch.io/test/read.cgi/livegalileo/1000000001/";
const SUBDOMAIN_THREAD_URL = "https://eagle.5ch.io/test/read.cgi/livegalileo/1000000001/";
const STORED_THREAD_URL = "https://*.5ch.io/test/read.cgi/livegalileo/1000000001/";
const OTHER_BOARD_URL = "https://mevius.5ch.io/otherboard/";
const OTHER_BOARD_THREAD_URL = "https://mevius.5ch.io/test/read.cgi/otherboard/1000000002/";
const OTHER_STORED_THREAD_URL = "https://*.5ch.io/test/read.cgi/otherboard/1000000002/";

function readState(url: string, received = 10, read = 5) {
  return { url, received, read, last: received };
}

describe("既読情報のIndexedDB保存", () => {
  // 既読情報モジュールはimport時にIndexedDBを開くため、テストごとに読み直さず状態だけ空にする。
  let ReadState: typeof import("src/core/bookmark/ReadState");
  let consoleError: { mockRestore: () => void } | null = null;

  beforeEach(async () => {
    vi.clearAllMocks();
    tauriState.enabled = false;
    ReadState = await import("src/core/bookmark/ReadState");
    await ReadState.clear();
    messageSend.mockClear();
  });

  afterEach(() => {
    consoleError?.mockRestore();
    consoleError = null;
  });

  function silenceConsoleError() {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    return consoleError;
  }

  it("保存した既読情報を、呼び出し時のURLのまま取得できる", async () => {
    await ReadState.set(readState(THREAD_URL, 10, 5));

    const result = await ReadState.get(THREAD_URL);

    expect(result).toMatchObject({ url: THREAD_URL, received: 10, read: 5, last: 10 });
  });

  it("URLのフラグメントは保存キーに含めず、同じスレッドとして扱う", async () => {
    await ReadState.set(readState(`${THREAD_URL}#res-3`, 10, 5));

    const result = await ReadState.get(THREAD_URL);

    expect(result).toMatchObject({ url: THREAD_URL, read: 5 });
  });

  it("5ch の別サブドメインでも同じスレッドの既読として共有する", async () => {
    await ReadState.set(readState(THREAD_URL, 10, 7));

    const result = await ReadState.get(SUBDOMAIN_THREAD_URL);

    expect(result).toMatchObject({ url: SUBDOMAIN_THREAD_URL, read: 7 });
  });

  it("未保存のスレッドは null を返す", async () => {
    expect(await ReadState.get(THREAD_URL)).toBeNull();
  });

  it("保存時に既読更新を通知し、板のURLと既読情報を渡す", async () => {
    await ReadState.set(readState(THREAD_URL, 10, 5));

    expect(messageSend).toHaveBeenCalledWith("read_state_updated", {
      board_url: BOARD_URL,
      read_state: { url: THREAD_URL, received: 10, read: 5, last: 10 },
    });
  });

  it("板ごとの取得では、その板の既読情報だけを呼び出し元のホストのURLで返す", async () => {
    await ReadState.set(readState(THREAD_URL, 10, 5));
    await ReadState.set(readState(OTHER_BOARD_THREAD_URL, 4, 4));

    const result = await ReadState.getByBoard(BOARD_URL);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ url: THREAD_URL, read: 5 });
  });

  it("板ごとの取得で、別の板の既読情報は含めない", async () => {
    await ReadState.set(readState(OTHER_BOARD_THREAD_URL, 4, 4));

    expect(await ReadState.getByBoard(BOARD_URL)).toEqual([]);
    expect(await ReadState.getByBoard(OTHER_BOARD_URL)).toHaveLength(1);
  });

  it("全件の取得では、保存したすべての既読情報を保存キーのURLで返す", async () => {
    await ReadState.set(readState(THREAD_URL));
    await ReadState.set(readState(OTHER_BOARD_THREAD_URL));

    const urls = (await ReadState.getAll()).map((item) => item.url).sort();

    expect(urls).toEqual([OTHER_STORED_THREAD_URL, STORED_THREAD_URL].sort());
  });

  it("削除すると取得できなくなり、削除を通知する", async () => {
    await ReadState.set(readState(THREAD_URL));
    messageSend.mockClear();

    await ReadState.remove(THREAD_URL);

    expect(await ReadState.get(THREAD_URL)).toBeNull();
    expect(messageSend).toHaveBeenCalledWith("read_state_removed", { url: THREAD_URL });
  });

  it("全件削除で、保存したすべての既読情報を消す", async () => {
    await ReadState.set(readState(THREAD_URL));
    await ReadState.set(readState(OTHER_BOARD_THREAD_URL));

    await ReadState.clear();

    expect(await ReadState.getAll()).toEqual([]);
  });

  it("引数がオブジェクトでなければ、保存せずに例外を投げる", async () => {
    const spy = silenceConsoleError();

    await expect(ReadState.set(null as never)).rejects.toThrow(
      "既読情報に登録しようとしたデータが不正です",
    );
    expect(spy).toHaveBeenCalled();
    expect(messageSend).not.toHaveBeenCalled();
  });

  it("既読の数が数値でなければ、保存せずに例外を投げる", async () => {
    silenceConsoleError();

    await expect(
      ReadState.set({ url: THREAD_URL, received: "10", read: 5, last: 10 } as never),
    ).rejects.toThrow("既読情報に登録しようとしたデータが不正です");
    expect(await ReadState.get(THREAD_URL)).toBeNull();
  });

  it("URLが文字列でなければ、取得を拒否する", async () => {
    silenceConsoleError();

    await expect(ReadState.get(42 as never)).rejects.toThrow(
      "既読情報を取得しようとしたデータが不正です",
    );
  });
});

describe("既読情報のTauri(SQLite)への委譲", () => {
  let ReadState: typeof import("src/core/bookmark/ReadState");
  let consoleError: { mockRestore: () => void } | null = null;

  beforeEach(async () => {
    vi.clearAllMocks();
    tauriState.enabled = true;
    ReadState = await import("src/core/bookmark/ReadState");
  });

  afterEach(() => {
    tauriState.enabled = false;
    consoleError?.mockRestore();
    consoleError = null;
  });

  it("保存はSQLiteのリポジトリへ委譲し、正規化後のURLと板のURLで通知する", async () => {
    tauriRepository.set.mockResolvedValue({
      normalizedUrl: STORED_THREAD_URL,
      boardUrl: BOARD_URL,
    });

    await ReadState.set(readState(THREAD_URL, 10, 5));

    // set はリポジトリへ渡したオブジェクトの url を、戻り値の正規化後のURLへ書き換えるため、
    // 記録された参照は書き換え後の値になる。url は通知の検証で確かめ、ここでは変わらない値だけを見る。
    expect(tauriRepository.set).toHaveBeenCalledWith(
      expect.objectContaining({ received: 10, read: 5 }),
    );
    expect(messageSend).toHaveBeenCalledWith("read_state_updated", {
      board_url: BOARD_URL,
      read_state: expect.objectContaining({ url: STORED_THREAD_URL }),
    });
  });

  it("取得はフラグメントを除いたURLでリポジトリへ問い合わせる", async () => {
    tauriRepository.get.mockResolvedValue({ url: THREAD_URL, read: 5 });

    const result = await ReadState.get(`${THREAD_URL}#res-9`);

    expect(tauriRepository.get).toHaveBeenCalledWith(THREAD_URL);
    expect(result).toEqual({ url: THREAD_URL, read: 5 });
  });

  it("削除は、リポジトリが返した正規化後のURLで通知する", async () => {
    tauriRepository.remove.mockResolvedValue(STORED_THREAD_URL);

    await ReadState.remove(THREAD_URL);

    expect(messageSend).toHaveBeenCalledWith("read_state_removed", { url: STORED_THREAD_URL });
  });

  it("全件取得・板ごとの取得・全件削除はリポジトリの結果をそのまま返す", async () => {
    tauriRepository.getAll.mockResolvedValue([{ url: THREAD_URL }]);
    tauriRepository.getByBoard.mockResolvedValue([{ url: THREAD_URL }]);

    expect(await ReadState.getAll()).toEqual([{ url: THREAD_URL }]);
    expect(await ReadState.getByBoard(BOARD_URL)).toEqual([{ url: THREAD_URL }]);
    await ReadState.clear();
    expect(tauriRepository.clear).toHaveBeenCalledTimes(1);
  });

  it("リポジトリの失敗は、原因を保ったまま例外として呼び出し元へ伝える", async () => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const cause = new Error("database is locked");
    tauriRepository.set.mockRejectedValue(cause);

    const error = await ReadState.set(readState(THREAD_URL)).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).cause).toBe(cause);
    expect(messageSend).not.toHaveBeenCalled();
  });
});
