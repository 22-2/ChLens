import type { Entry } from "src/core/bookmark/BookmarkEntryList";
import BrowserBookmarkEntryList from "src/core/bookmark/BrowserBookmarkEntryList";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

// ブラウザのブックマークAPIをメモリ上に再現する。作成・更新・削除の後には、実際のブラウザと同じく
// 変更イベントを発火させ、一覧側の追従（ブラウザ起点の変更の取り込み）も確かめられるようにする。
const fake = vi.hoisted(() => {
  interface FakeNode {
    id: string;
    parentId: string;
    title: string;
    url?: string;
  }
  type Listener = (...args: unknown[]) => unknown;

  const state = { nodes: [] as FakeNode[], seq: 0, failGetChildren: false };
  const listeners = {
    created: [] as Listener[],
    removed: [] as Listener[],
    changed: [] as Listener[],
    moved: [] as Listener[],
  };
  const event = (list: Listener[]) => ({
    addListener: (fn: Listener) => {
      list.push(fn);
    },
  });
  const emit = (list: Listener[], ...args: unknown[]) => {
    for (const fn of list) void fn(...args);
  };

  const bookmarks = {
    getChildren: vi.fn(async (parentId: string) => {
      if (state.failGetChildren) throw new Error("ルートフォルダが見つかりません");
      return state.nodes.filter((node) => node.parentId === parentId).map((node) => ({ ...node }));
    }),
    get: vi.fn(async (id: string) =>
      state.nodes.filter((node) => node.id === id).map((node) => ({ ...node })),
    ),
    create: vi.fn(async (details: { parentId: string; url?: string; title: string }) => {
      state.seq += 1;
      const node: FakeNode = {
        id: `node-${state.seq}`,
        parentId: details.parentId,
        title: details.title,
        url: details.url,
      };
      state.nodes.push(node);
      emit(listeners.created, node.id, { ...node });
      return { ...node };
    }),
    update: vi.fn(async (id: string, changes: Partial<FakeNode>) => {
      const node = state.nodes.find((candidate) => candidate.id === id);
      if (!node) return undefined;
      Object.assign(node, changes);
      emit(listeners.changed, id, changes);
      return { ...node };
    }),
    remove: vi.fn(async (id: string) => {
      state.nodes = state.nodes.filter((node) => node.id !== id);
      emit(listeners.removed, id);
    }),
    onCreated: event(listeners.created),
    onRemoved: event(listeners.removed),
    onChanged: event(listeners.changed),
    onMoved: event(listeners.moved),
  };

  const reset = () => {
    state.nodes = [];
    state.seq = 0;
    state.failGetChildren = false;
    for (const list of Object.values(listeners)) list.length = 0;
    for (const mock of Object.values(bookmarks)) {
      if (typeof mock === "function" && "mockClear" in mock) mock.mockClear();
    }
  };

  /** テストが外部のブラウザ操作（別の画面での追加・削除など）を再現するための、ノードの追加口。 */
  const addExternalNode = (node: Omit<FakeNode, "id">) => {
    state.seq += 1;
    const created: FakeNode = { ...node, id: `node-${state.seq}` };
    state.nodes.push(created);
    emit(listeners.created, created.id, { ...created });
    return created;
  };

  return { browser: { bookmarks }, state, listeners, emit, reset, addExternalNode };
});

vi.mock("webextension-polyfill", () => ({ default: fake.browser }));

const ROOT_ID = "root-folder";
const THREAD_URL = "https://mevius.5ch.io/test/read.cgi/livegalileo/1000000001/";
const OTHER_THREAD_URL = "https://mevius.5ch.io/test/read.cgi/livegalileo/1000000002/";
const OTHER_ROOT_ID = "other-folder";

function createThreadEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    url: THREAD_URL,
    title: "テストスレ",
    type: "thread",
    bbsType: "5ch",
    resCount: 3,
    readState: { url: THREAD_URL, received: 3, read: 2, last: 3 },
    expired: false,
    ...overrides,
  } as Entry;
}

/** 準備完了を待つ。読み込みが終わっていれば、登録の時点で呼び出される。 */
function waitUntilReady(list: BrowserBookmarkEntryList): Promise<void> {
  return new Promise((resolve) => list.ready.add(() => resolve()));
}

async function openList(rootId = ROOT_ID): Promise<BrowserBookmarkEntryList> {
  const list = new BrowserBookmarkEntryList(rootId);
  await waitUntilReady(list);
  return list;
}

/** ブラウザのノードは既読などの付加情報を含むURLを持つため、解釈した後のスレッドURLで探す。 */
function findNodeId(url: string): string {
  const node = fake.state.nodes.find(
    (candidate) =>
      candidate.url !== undefined &&
      BrowserBookmarkEntryList.URLToEntry(candidate.url)?.url === url,
  );
  if (!node) throw new Error(`ブラウザのブックマークが見つかりません: ${url}`);
  return node.id;
}

describe("ブラウザのブックマークとの同期", () => {
  let consoleWarn: { mockRestore: () => void } | null = null;

  beforeEach(() => {
    fake.reset();
  });

  afterEach(() => {
    consoleWarn?.mockRestore();
    consoleWarn = null;
  });

  describe("URLとブックマークの相互変換", () => {
    it("スレッドの既読状態と件数を、URLの付加情報として往復できる", () => {
      const entry = createThreadEntry({
        readState: {
          url: THREAD_URL,
          received: 40,
          read: 12,
          last: 40,
          offset: 3,
          date: 1_700_000_000,
        },
      });

      const parsed = BrowserBookmarkEntryList.URLToEntry(
        BrowserBookmarkEntryList.entryToURL(entry),
      );

      expect(parsed).toMatchObject({
        url: THREAD_URL,
        type: "thread",
        resCount: 3,
        expired: false,
        readState: { received: 40, read: 12, last: 40, offset: 3, date: 1_700_000_000 },
      });
    });

    it("期限切れのスレッドは、その状態をURLの付加情報として保存して読み戻せる", () => {
      const entry = createThreadEntry({ expired: true });

      const parsed = BrowserBookmarkEntryList.URLToEntry(
        BrowserBookmarkEntryList.entryToURL(entry),
      );

      expect(parsed?.expired).toBe(true);
    });

    it("既読状態がないスレッドは、既読を付けずに読み戻す", () => {
      const entry = createThreadEntry({ readState: null, resCount: null });

      const parsed = BrowserBookmarkEntryList.URLToEntry(
        BrowserBookmarkEntryList.entryToURL(entry),
      );

      expect(parsed?.readState).toBeNull();
      expect(parsed?.resCount).toBeNull();
    });

    it("板のURLは板として読み戻し、解釈できないURLは null を返す", () => {
      expect(BrowserBookmarkEntryList.URLToEntry("https://mevius.5ch.io/livegalileo/")?.type).toBe(
        "board",
      );
      expect(BrowserBookmarkEntryList.URLToEntry("https://example.com/some/page")).toBeNull();
    });
  });

  describe("起動と読み込み", () => {
    it("起動時にルートフォルダの既存のブックマークを一覧へ読み込み、準備完了を通知する", async () => {
      fake.state.nodes.push({
        id: "existing-1",
        parentId: ROOT_ID,
        title: "保存済みのスレ",
        url: BrowserBookmarkEntryList.entryToURL(createThreadEntry()),
      });

      const list = await openList();

      expect(list.get(THREAD_URL)).toMatchObject({ title: "保存済みのスレ", resCount: 3 });
    });

    it("ルートフォルダ以外にあるブックマークは、一覧へ読み込まない", async () => {
      fake.state.nodes.push({
        id: "elsewhere-1",
        parentId: "some-other-folder",
        title: "別のフォルダのスレ",
        url: BrowserBookmarkEntryList.entryToURL(createThreadEntry()),
      });

      const list = await openList();

      expect(list.get(THREAD_URL)).toBeNull();
    });

    it("読み込みに失敗すると準備完了を通知せず、ルートの再設定を求める", async () => {
      consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
      fake.state.failGetChildren = true;

      const list = new BrowserBookmarkEntryList("missing-root");

      await vi.waitFor(() => {
        expect(list.needReconfigureRootNodeId.wasCalled).toBe(true);
      });
      expect(list.ready.wasCalled).toBe(false);
    });

    it("ルートを再設定して読み込みに成功すると、準備完了を通知する", async () => {
      consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
      fake.state.failGetChildren = true;
      const list = new BrowserBookmarkEntryList("missing-root");
      await vi.waitFor(() => {
        expect(list.needReconfigureRootNodeId.wasCalled).toBe(true);
      });

      fake.state.failGetChildren = false;
      const loaded = await list.setRootNodeId(ROOT_ID);

      expect(loaded).toBe(true);
      expect(list.ready.wasCalled).toBe(true);
    });

    it("別のルートへ切り替えると、前のルートの内容を外し、新しいルートの内容で一覧を作り直す", async () => {
      fake.state.nodes.push(
        {
          id: "root-a-1",
          parentId: ROOT_ID,
          title: "前のフォルダのスレ",
          url: BrowserBookmarkEntryList.entryToURL(createThreadEntry()),
        },
        {
          id: "root-b-1",
          parentId: OTHER_ROOT_ID,
          title: "新しいフォルダのスレ",
          url: BrowserBookmarkEntryList.entryToURL(createThreadEntry({ url: OTHER_THREAD_URL })),
        },
      );
      const list = await openList();

      await list.setRootNodeId(OTHER_ROOT_ID);

      expect(list.get(THREAD_URL)).toBeNull();
      expect(list.get(OTHER_THREAD_URL)?.title).toBe("新しいフォルダのスレ");
    });

    it("ブラウザのブックマークAPIがない環境では、同期を始めずに準備完了として扱う", async () => {
      consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const saved = fake.browser.bookmarks;
      Reflect.deleteProperty(fake.browser, "bookmarks");

      try {
        const list = new BrowserBookmarkEntryList(ROOT_ID);

        expect(list.ready.wasCalled).toBe(true);
        expect(fake.listeners.created).toEqual([]);
      } finally {
        fake.browser.bookmarks = saved;
      }
    });
  });

  describe("一覧の変更をブラウザへ書き込む", () => {
    it("一覧へ追加すると、ルートフォルダにURLとタイトル付きのブックマークを作る", async () => {
      const list = await openList();
      const entry = createThreadEntry({ title: "追加するスレ" });

      expect(await list.add(entry)).toBe(true);

      expect(fake.browser.bookmarks.create).toHaveBeenCalledWith({
        parentId: ROOT_ID,
        url: BrowserBookmarkEntryList.entryToURL(entry),
        title: "追加するスレ",
      });
    });

    it("同じURLを二重に追加しても、ブラウザにはブックマークを増やさない", async () => {
      const list = await openList();
      await list.add(createThreadEntry());

      expect(await list.add(createThreadEntry({ title: "別のタイトル" }))).toBe(false);

      expect(fake.browser.bookmarks.create).toHaveBeenCalledTimes(1);
      expect(fake.state.nodes).toHaveLength(1);
    });

    it("タイトルを変えて更新すると、ブラウザのブックマークのタイトルも変える", async () => {
      const list = await openList();
      await list.add(createThreadEntry({ title: "更新前" }));

      expect(await list.update(createThreadEntry({ title: "更新後" }))).toBe(true);

      expect(fake.state.nodes[0]?.title).toBe("更新後");
    });

    it("内容が変わらない更新では、ブラウザの更新を呼ばない", async () => {
      const list = await openList();
      const entry = createThreadEntry();
      await list.add(entry);
      fake.browser.bookmarks.update.mockClear();

      expect(await list.update(entry)).toBe(true);

      expect(fake.browser.bookmarks.update).not.toHaveBeenCalled();
    });

    it("一覧から削除すると、対応するブラウザのブックマークも削除する", async () => {
      const list = await openList();
      await list.add(createThreadEntry());

      expect(await list.remove(THREAD_URL)).toBe(true);

      expect(fake.state.nodes).toEqual([]);
      expect(list.get(THREAD_URL)).toBeNull();
    });
  });

  describe("ブラウザ側の変更を一覧へ取り込む", () => {
    it("ルートフォルダにブックマークが作られると、一覧へ追加する", async () => {
      const list = await openList();

      fake.addExternalNode({
        parentId: ROOT_ID,
        title: "ブラウザで追加したスレ",
        url: BrowserBookmarkEntryList.entryToURL(createThreadEntry()),
      });

      await vi.waitFor(() => {
        expect(list.get(THREAD_URL)?.title).toBe("ブラウザで追加したスレ");
      });
    });

    it("ルートフォルダ以外にブックマークが作られても、一覧へ追加しない", async () => {
      const list = await openList();

      fake.addExternalNode({
        parentId: OTHER_ROOT_ID,
        title: "別のフォルダのスレ",
        url: BrowserBookmarkEntryList.entryToURL(createThreadEntry()),
      });

      expect(list.get(THREAD_URL)).toBeNull();
    });

    it("同じスレッドが二重に作られたとき、既読が古い方のブックマークをブラウザから削除する", async () => {
      const list = await openList();
      await list.add(
        createThreadEntry({ readState: { url: THREAD_URL, received: 9, read: 9, last: 9 } }),
      );
      const older = fake.addExternalNode({
        parentId: ROOT_ID,
        title: "古い方",
        url: BrowserBookmarkEntryList.entryToURL(
          createThreadEntry({ readState: { url: THREAD_URL, received: 3, read: 2, last: 3 } }),
        ),
      });

      await vi.waitFor(() => {
        expect(fake.browser.bookmarks.remove).toHaveBeenCalledWith(older.id);
      });
    });

    it("ブラウザでブックマークが削除されると、一覧からも削除する", async () => {
      const list = await openList();
      await list.add(createThreadEntry());
      const nodeId = findNodeId(THREAD_URL);

      fake.emit(fake.listeners.removed, nodeId);

      await vi.waitFor(() => {
        expect(list.get(THREAD_URL)).toBeNull();
      });
    });

    it("ブラウザでタイトルが変わると、一覧の表示も変わる", async () => {
      const list = await openList();
      await list.add(createThreadEntry({ title: "変更前" }));
      const nodeId = findNodeId(THREAD_URL);

      fake.emit(fake.listeners.changed, nodeId, { title: "ブラウザで変えたタイトル" });

      await vi.waitFor(() => {
        expect(list.get(THREAD_URL)?.title).toBe("ブラウザで変えたタイトル");
      });
    });

    it("ブラウザでURLが別のスレに変わると、古いスレを外し、新しいスレへ付け替える", async () => {
      const list = await openList();
      await list.add(createThreadEntry());
      const nodeId = findNodeId(THREAD_URL);

      fake.emit(fake.listeners.changed, nodeId, {
        url: BrowserBookmarkEntryList.entryToURL(createThreadEntry({ url: OTHER_THREAD_URL })),
      });

      await vi.waitFor(() => {
        expect(list.get(OTHER_THREAD_URL)).not.toBeNull();
      });
      expect(list.get(THREAD_URL)).toBeNull();
    });
  });
});
