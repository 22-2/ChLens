import "fake-indexeddb/auto";

import type { Entry } from "src/core/bookmark/BookmarkEntryList";
import IDBBookmarkEntryList from "src/core/bookmark/IDBBookmarkEntryList";
import { describe, expect, it, vi } from "vite-plus/test";

// 読み込み経路が webextension-polyfill を間接的に取り込むが、このテストは拡張機能の API を使わない。
vi.mock("webextension-polyfill", () => ({ default: {} }));

// IndexedDB の接続はテストをまたいで閉じないため、データベースは消さずに URL を変えて分離する。
let threadSeq = 0;

function createThreadEntry(overrides: Partial<Entry> = {}): Entry {
  threadSeq += 1;
  const url = `https://mevius.5ch.io/test/read.cgi/livegalileo/${1_000_000_000 + threadSeq}/`;
  return {
    url,
    title: "テストスレ",
    type: "thread",
    bbsType: "5ch",
    resCount: 3,
    readState: { url, received: 3, read: 2, last: 3 },
    expired: false,
    ...overrides,
  } as Entry;
}

/** 起動時の読み込みが終わるまで待つ。読み込み済みでも、後から登録した時点で呼び出される。 */
function waitUntilReady(list: IDBBookmarkEntryList): Promise<void> {
  return new Promise((resolve) => list.ready.add(() => resolve()));
}

/** 別インスタンスを作ると、保存済みのデータから読み込み直す。画面を開き直したときと同じ経路になる。 */
async function reopenList(): Promise<IDBBookmarkEntryList> {
  const list = new IDBBookmarkEntryList();
  await waitUntilReady(list);
  return list;
}

describe("IndexedDBのブックマーク保存", () => {
  it("追加したブックマークを、開き直したあとも読み込める", async () => {
    const list = await reopenList();
    const entry = createThreadEntry({ title: "保存されるスレ" });

    expect(await list.add(entry)).toBe(true);

    const reopened = await reopenList();
    expect(reopened.get(entry.url)).toMatchObject({ title: "保存されるスレ", resCount: 3 });
  });

  it("既読状態を含めて保存し、開き直したあとも同じ値で読み込める", async () => {
    const list = await reopenList();
    const base = createThreadEntry();
    const entry = {
      ...base,
      readState: {
        url: base.url,
        received: 40,
        read: 12,
        last: 40,
        offset: 3,
        date: 1_700_000_000,
      },
    };

    await list.add(entry);

    const reopened = await reopenList();
    expect(reopened.get(entry.url)?.readState).toMatchObject({
      received: 40,
      read: 12,
      last: 40,
      offset: 3,
      date: 1_700_000_000,
    });
  });

  it("同じURLのブックマークは追加せず、既存の内容を変えない", async () => {
    const list = await reopenList();
    const entry = createThreadEntry({ title: "最初のタイトル" });
    await list.add(entry);

    expect(await list.add({ ...entry, title: "別のタイトル" })).toBe(false);

    const reopened = await reopenList();
    expect(reopened.get(entry.url)?.title).toBe("最初のタイトル");
  });

  it("更新したブックマークは、開き直したあとも更新後の内容で読み込める", async () => {
    const list = await reopenList();
    const entry = createThreadEntry({ title: "更新前" });
    await list.add(entry);

    expect(await list.update({ ...entry, title: "更新後", resCount: 99 })).toBe(true);

    const reopened = await reopenList();
    expect(reopened.get(entry.url)).toMatchObject({ title: "更新後", resCount: 99 });
  });

  it("存在しないブックマークの更新は、保存せずに失敗を返す", async () => {
    const list = await reopenList();
    const entry = createThreadEntry();

    expect(await list.update(entry)).toBe(false);

    const reopened = await reopenList();
    expect(reopened.get(entry.url)).toBeNull();
  });

  it("削除したブックマークは、開き直したあとも読み込まれない", async () => {
    const list = await reopenList();
    const entry = createThreadEntry();
    await list.add(entry);

    expect(await list.remove(entry.url)).toBe(true);

    const reopened = await reopenList();
    expect(reopened.get(entry.url)).toBeNull();
  });

  it("存在しないブックマークの削除は、失敗を返す", async () => {
    const list = await reopenList();

    expect(await list.remove(createThreadEntry().url)).toBe(false);
  });

  it("同じURLの重複追加では、購読側へ追加の変更を通知しない", async () => {
    const list = await reopenList();
    const entry = createThreadEntry();
    await list.add(entry);
    const changes: string[] = [];
    list.onChanged.add(({ type }) => changes.push(type));

    await list.add(entry);

    expect(changes).toEqual([]);
  });

  it("存在しないブックマークの削除では、購読側へ削除の変更を通知しない", async () => {
    const list = await reopenList();
    const changes: string[] = [];
    list.onChanged.add(({ type }) => changes.push(type));

    await list.remove(createThreadEntry().url);

    expect(changes).toEqual([]);
  });
});
