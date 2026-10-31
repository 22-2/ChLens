import type { Entry } from "src/core/bookmark/BookmarkEntryList";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { messageSend, messageOn, getReadStateMock } = vi.hoisted(() => ({
  messageSend: vi.fn(),
  messageOn: vi.fn(),
  getReadStateMock: vi.fn(),
}));

vi.mock("src/app/Message", () => ({
  default: { send: messageSend, on: messageOn },
}));

vi.mock("src/app/platform/runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("src/app/platform/runtime")>()),
  isTauriRuntime: () => false,
}));

// 既読情報の保存は別のテストで扱うため、ここでは読み出し結果だけを差し替える。
vi.mock("src/core/bookmark/ReadState.js", () => ({
  get: getReadStateMock,
}));

// ブラウザのブックマーク（ルートフォルダ内のノード）をメモリ上に持つ。一覧への追加・削除は、
// ここへの作成・削除として反映される。変更イベントは発火させず、一覧側の追従は別のテストで扱う。
const { browserBookmarks } = vi.hoisted(() => {
  const nodes: { id: string; parentId: string; title: string; url?: string }[] = [];
  let seq = 0;
  const noopEvent = { addListener: () => {} };
  const bookmarks = {
    getChildren: async (parentId: string) =>
      nodes.filter((node) => node.parentId === parentId).map((node) => ({ ...node })),
    get: async (id: string) => nodes.filter((node) => node.id === id).map((node) => ({ ...node })),
    create: async (details: { parentId: string; url?: string; title: string }) => {
      seq += 1;
      const node = { id: `node-${seq}`, ...details };
      nodes.push(node);
      return { ...node };
    },
    update: async (id: string, changes: { title?: string; url?: string }) => {
      const node = nodes.find((candidate) => candidate.id === id);
      if (!node) return undefined;
      Object.assign(node, changes);
      return { ...node };
    },
    remove: async (id: string) => {
      const index = nodes.findIndex((node) => node.id === id);
      if (index >= 0) nodes.splice(index, 1);
    },
    onCreated: noopEvent,
    onRemoved: noopEvent,
    onChanged: noopEvent,
    onMoved: noopEvent,
  };
  return { browserBookmarks: { nodes, bookmarks } };
});

vi.mock("webextension-polyfill", () => ({ default: { bookmarks: browserBookmarks.bookmarks } }));

import Bookmark from "src/core/bookmark/Bookmark";

const ROOT_ID = "root-folder";
const THREAD_URL = "https://mevius.5ch.io/test/read.cgi/livegalileo/1000000001/";
const OTHER_THREAD_URL = "https://mevius.5ch.io/test/read.cgi/livegalileo/1000000002/";
const BOARD_URL = "https://mevius.5ch.io/livegalileo/";

function createThreadEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    url: THREAD_URL,
    title: "テストスレ",
    type: "thread",
    bbsType: "5ch",
    resCount: 3,
    readState: null,
    expired: false,
    ...overrides,
  } as Entry;
}

function createBookmark() {
  return new Bookmark(ROOT_ID);
}

describe("Bookmark（ブックマークの操作と画面への通知）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    browserBookmarks.nodes.length = 0;
    getReadStateMock.mockResolvedValue(null);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  describe("追加と取得", () => {
    it("追加したスレッドは、指定したタイトルで取得できる", async () => {
      const bookmark = createBookmark();

      expect(await bookmark.add(THREAD_URL, "追加するスレ")).toBe(true);

      expect(bookmark.get(THREAD_URL)).toMatchObject({ url: THREAD_URL, title: "追加するスレ" });
    });

    it("既読情報がある場合は、その既読情報と受信数を件数として使う", async () => {
      getReadStateMock.mockResolvedValue({ url: THREAD_URL, received: 42, read: 10, last: 42 });
      const bookmark = createBookmark();

      await bookmark.add(THREAD_URL, "既読のあるスレ");

      expect(bookmark.get(THREAD_URL)).toMatchObject({
        resCount: 42,
        readState: { received: 42, read: 10, last: 42 },
      });
    });

    it("件数を指定すると、既存の件数より多い場合にだけ反映する", async () => {
      const bookmark = createBookmark();

      await bookmark.add(THREAD_URL, "スレ", 8);
      expect(bookmark.get(THREAD_URL)?.resCount).toBe(8);

      await bookmark.add(OTHER_THREAD_URL, "少ない件数", 1);
      expect(bookmark.get(OTHER_THREAD_URL)?.resCount).toBe(1);
    });

    it("同じURLを二重に追加すると、失敗を返す", async () => {
      const bookmark = createBookmark();
      await bookmark.add(THREAD_URL, "最初");

      expect(await bookmark.add(THREAD_URL, "二回目")).toBe(false);
      expect(bookmark.get(THREAD_URL)?.title).toBe("最初");
    });

    it("存在しないURLの取得は null を返し、板ごとの一覧には別の板のスレを含めない", async () => {
      const bookmark = createBookmark();
      await bookmark.add(THREAD_URL, "スレ");

      expect(bookmark.get("https://mevius.5ch.io/test/read.cgi/livegalileo/9/")).toBeNull();
      expect(bookmark.getByBoard(BOARD_URL).map((entry) => entry.url)).toEqual([THREAD_URL]);
      expect(bookmark.getByBoard("https://mevius.5ch.io/otherboard/")).toEqual([]);
    });
  });

  describe("変更と削除", () => {
    it("件数の更新は、現在より多い件数の場合にだけ反映する", async () => {
      const bookmark = createBookmark();
      await bookmark.add(THREAD_URL, "スレ", 10);

      await bookmark.updateResCount(THREAD_URL, 4);
      expect(bookmark.get(THREAD_URL)?.resCount).toBe(10);

      await bookmark.updateResCount(THREAD_URL, 15);
      expect(bookmark.get(THREAD_URL)?.resCount).toBe(15);
    });

    it("既読情報の更新は、より新しいものだけを反映し、更新を通知する", async () => {
      const bookmark = createBookmark();
      await bookmark.add(THREAD_URL, "スレ");
      messageSend.mockClear();

      await bookmark.updateReadState({ url: THREAD_URL, received: 20, read: 20, last: 20 });
      expect(bookmark.get(THREAD_URL)?.readState).toMatchObject({ read: 20 });
      expect(messageSend).toHaveBeenCalledWith("read_state_updated", {
        board_url: BOARD_URL,
        read_state: { url: THREAD_URL, received: 20, read: 20, last: 20 },
      });

      messageSend.mockClear();
      await bookmark.updateReadState({ url: THREAD_URL, received: 5, read: 5, last: 5 });
      expect(bookmark.get(THREAD_URL)?.readState).toMatchObject({ read: 20 });
      expect(messageSend).not.toHaveBeenCalled();
    });

    it("期限切れの状態を変えると、その変更を通知する", async () => {
      const bookmark = createBookmark();
      await bookmark.add(THREAD_URL, "スレ");
      messageSend.mockClear();

      await bookmark.updateExpired(THREAD_URL, true);

      expect(bookmark.get(THREAD_URL)?.expired).toBe(true);
      expect(messageSend).toHaveBeenCalledWith(
        "bookmark_updated",
        expect.objectContaining({ type: "expired" }),
      );
    });

    it("削除すると取得できなくなり、削除を通知する", async () => {
      const bookmark = createBookmark();
      await bookmark.add(THREAD_URL, "スレ");
      messageSend.mockClear();

      expect(await bookmark.remove(THREAD_URL)).toBe(true);

      expect(bookmark.get(THREAD_URL)).toBeNull();
      expect(messageSend).toHaveBeenCalledWith(
        "bookmark_updated",
        expect.objectContaining({ type: "removed" }),
      );
    });

    it("既読情報の解除は、解除したことを通知する", async () => {
      const bookmark = createBookmark();
      await bookmark.add(THREAD_URL, "スレ");
      await bookmark.updateReadState({ url: THREAD_URL, received: 9, read: 9, last: 9 });
      messageSend.mockClear();

      await bookmark.clearReadState(THREAD_URL);

      expect(bookmark.get(THREAD_URL)?.readState).toBeNull();
      expect(messageSend).toHaveBeenCalledWith("read_state_removed", { url: THREAD_URL });
    });

    it("期限切れのブックマークだけを一括で削除する", async () => {
      const bookmark = createBookmark();
      await bookmark.add(THREAD_URL, "期限切れ");
      await bookmark.add(OTHER_THREAD_URL, "有効");
      await bookmark.updateExpired(THREAD_URL, true);

      expect(await bookmark.removeAllExpired()).toBe(true);

      expect(bookmark.get(THREAD_URL)).toBeNull();
      expect(bookmark.get(OTHER_THREAD_URL)).not.toBeNull();
    });

    it("すべて削除すると、一覧を空にする", async () => {
      const bookmark = createBookmark();
      await bookmark.add(THREAD_URL, "スレ");
      await bookmark.add(OTHER_THREAD_URL, "別スレ");

      expect(await bookmark.removeAll()).toBe(true);

      expect(bookmark.getAll()).toEqual([]);
    });
  });

  describe("バックアップからの取り込み", () => {
    it("未登録のブックマークは、バックアップの内容で追加する", async () => {
      const bookmark = createBookmark();

      const imported = await bookmark.import(
        createThreadEntry({
          title: "バックアップのスレ",
          resCount: 30,
          readState: { url: THREAD_URL, received: 30, read: 25, last: 30 },
        }),
      );

      expect(imported).toBe(true);
      expect(bookmark.get(THREAD_URL)).toMatchObject({
        title: "バックアップのスレ",
        resCount: 30,
        readState: { read: 25 },
      });
    });

    it("登録済みの既読情報は、バックアップの方が新しい場合にだけ置き換える", async () => {
      const bookmark = createBookmark();
      await bookmark.add(THREAD_URL, "スレ");
      await bookmark.updateReadState({ url: THREAD_URL, received: 50, read: 50, last: 50 });

      await bookmark.import(
        createThreadEntry({ readState: { url: THREAD_URL, received: 20, read: 20, last: 20 } }),
      );

      expect(bookmark.get(THREAD_URL)?.readState).toMatchObject({ read: 50 });
    });

    it("バックアップの件数は、既存より多い場合にだけ反映する", async () => {
      const bookmark = createBookmark();
      await bookmark.add(THREAD_URL, "スレ", 40);

      await bookmark.import(createThreadEntry({ resCount: 10 }));
      expect(bookmark.get(THREAD_URL)?.resCount).toBe(40);

      await bookmark.import(createThreadEntry({ resCount: 60 }));
      expect(bookmark.get(THREAD_URL)?.resCount).toBe(60);
    });

    it("バックアップの表示名と期限切れの状態を、既存のブックマークへ反映する", async () => {
      const bookmark = createBookmark();
      await bookmark.add(THREAD_URL, "古い名前");

      await bookmark.import(createThreadEntry({ title: "バックアップの名前", expired: true }));

      expect(bookmark.get(THREAD_URL)).toMatchObject({
        title: "バックアップの名前",
        expired: true,
      });
    });
  });
});
