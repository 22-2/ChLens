import { SyncableEntryList } from "src/core/bookmark/BookmarkEntryList";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("src/core/network/URL", () => ({ fix: (url: string) => url }));

const THREAD_URL = "https://example.com/test/read.cgi/board/1/";

function createThreadEntry() {
  return {
    url: THREAD_URL,
    title: "テストスレ",
    type: "thread",
    bbsType: "5ch",
    resCount: 3,
    readState: {
      url: THREAD_URL,
      received: 3,
      read: 2,
      last: 3,
    },
    expired: false,
  };
}

describe("SyncableEntryList", () => {
  it("既読状態の解除を別のブックマーク保存先へ同期する", async () => {
    const primary = new SyncableEntryList();
    const synced = new SyncableEntryList();
    const entry = createThreadEntry();
    await primary.add(entry);
    await synced.add(entry);

    const changes: string[] = [];
    primary.onChanged.add(({ type }) => changes.push(type));
    primary.syncStart(synced);

    await primary.clearReadState(THREAD_URL);

    expect(primary.get(THREAD_URL)?.readState).toBeNull();
    expect(synced.get(THREAD_URL)?.readState).toBeNull();
    expect(changes).toContain("READ_STATE_REMOVED");
  });
});
