import { container } from "src/service-container";
import { stubService } from "src/service-container/test-stubs";
import {
  deleteThreadLogAndCloseTab,
  deleteThreadLogAndHistory,
} from "src/view/browser/commands/thread-log-actions";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const loggerMock = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));
vi.mock("src/app/logger", () => ({ createLogger: () => loggerMock }));

const mocks = vi.hoisted(() => ({
  deleteLog: vi.fn(),
  send: vi.fn(),
  historyRemoveThread: vi.fn(),
  readStateRemove: vi.fn(),
  bookmarkClearReadState: vi.fn(),
  clearCachedReadState: vi.fn(),
}));

const THREAD_URL = "https://example.com/test/read.cgi/board/1/";

describe("スレログと閲覧履歴の削除", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteLog.mockResolvedValue(1);
    mocks.historyRemoveThread.mockResolvedValue(undefined);
    mocks.readStateRemove.mockResolvedValue(undefined);
    mocks.bookmarkClearReadState.mockResolvedValue(true);
    mocks.clearCachedReadState.mockResolvedValue(undefined);

    container.threadLog = stubService<typeof container.threadLog>("threadLog", {
      deleteLog: mocks.deleteLog,
    });
    container.message = stubService<typeof container.message>("message", {
      send: mocks.send,
    });
    container.history = stubService<typeof container.history>("history", {
      removeThread: mocks.historyRemoveThread,
    });
    container.readState = stubService<typeof container.readState>("readState", {
      remove: mocks.readStateRemove,
    });
    container.bookmark = stubService<typeof container.bookmark>("bookmark", {
      clearReadState: mocks.bookmarkClearReadState,
    });
  });

  it("ログ削除後に一覧更新を通知し、履歴と既読状態も消す", async () => {
    const calls: string[] = [];
    mocks.deleteLog.mockImplementation(async () => {
      calls.push("deleteLog");
      return 1;
    });
    mocks.send.mockImplementation(() => {
      calls.push("log_updated");
    });
    mocks.historyRemoveThread.mockImplementation(async () => {
      calls.push("history");
    });
    mocks.readStateRemove.mockImplementation(async () => {
      calls.push("readState");
    });
    mocks.clearCachedReadState.mockImplementation(async () => {
      calls.push("cache");
    });

    const deleted = await deleteThreadLogAndHistory(THREAD_URL, mocks.clearCachedReadState);

    expect(deleted).toBe(1);
    expect(mocks.deleteLog).toHaveBeenCalledWith(THREAD_URL);
    expect(mocks.send).toHaveBeenCalledWith("log_updated", { url: THREAD_URL });
    expect(mocks.historyRemoveThread).toHaveBeenCalledWith(THREAD_URL);
    expect(mocks.clearCachedReadState).toHaveBeenCalledWith(THREAD_URL);
    // 変更理由: 後片付けの失敗で履歴が残らないよう、履歴削除を既読状態より先に行う。
    expect(calls).toEqual(["deleteLog", "log_updated", "history", "readState", "cache"]);
  });

  it("削除したログが0件なら一覧更新を通知しない", async () => {
    mocks.deleteLog.mockResolvedValue(0);

    await deleteThreadLogAndHistory(THREAD_URL, mocks.clearCachedReadState);

    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.historyRemoveThread).toHaveBeenCalledWith(THREAD_URL);
  });

  it("削除に成功したらタブを閉じて成功を表示する", async () => {
    const toast = {
      notify: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    };
    const closeTab = vi.fn(() => true);

    await deleteThreadLogAndCloseTab({
      threadUrl: THREAD_URL,
      closeTab,
      clearCachedReadState: mocks.clearCachedReadState,
      toast,
    });

    expect(closeTab).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith("スレログと閲覧履歴を削除してタブを閉じました");
  });

  it("ログが保存されていなくても履歴を消し、その旨を表示する", async () => {
    mocks.deleteLog.mockResolvedValue(0);
    const toast = {
      notify: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    };

    await deleteThreadLogAndCloseTab({
      threadUrl: THREAD_URL,
      closeTab: () => false,
      clearCachedReadState: mocks.clearCachedReadState,
      toast,
    });

    expect(mocks.historyRemoveThread).toHaveBeenCalledWith(THREAD_URL);
    expect(toast.info).toHaveBeenCalledWith(
      "このスレのログは保存されておらず、閲覧履歴を削除しました。タブは閉じられませんでした",
    );
  });
});
