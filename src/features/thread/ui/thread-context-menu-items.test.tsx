import {
  createThreadBookmarkMenuItem,
  createThreadContextMenuItems,
  createThreadCopyMenuItems,
} from "src/features/thread/ui/thread-context-menu-items";
import type { CommandRequest } from "src/view/browser/commands/command-runtime";
import { describe, expect, it, vi } from "vite-plus/test";

const target = {
  title: "テストスレッド",
  url: "https://example.com/test/read.cgi/software/123/",
};

describe("thread-context-menu-items", () => {
  it("コピー項目を指定順で生成し、対象付きコマンドを発行する", () => {
    const runCommand = vi.fn<(request: CommandRequest) => void>();
    const items = createThreadCopyMenuItems(target, runCommand);

    expect(items.map((item) => item.label)).toEqual([
      "スレタイをコピー",
      "URLをコピー",
      "スレタイ＆URLをコピー",
    ]);

    for (const item of items) {
      item.onSelect?.();
    }

    expect(runCommand.mock.calls.map(([request]) => request)).toEqual([
      {
        id: "target.copy",
        args: { target: { ...target, kind: "thread" }, format: "title" },
      },
      {
        id: "target.copy",
        args: { target: { ...target, kind: "thread" }, format: "url" },
      },
      {
        id: "target.copy",
        args: { target: { ...target, kind: "thread" }, format: "title-url" },
      },
    ]);
  });

  it("ブックマーク項目は表示時の状態をsetコマンドへ変換する", () => {
    const runCommand = vi.fn<(request: CommandRequest) => void>();
    const item = createThreadBookmarkMenuItem({
      target,
      isBookmarked: false,
      runCommand,
    });

    item.onSelect?.();

    expect(runCommand).toHaveBeenCalledWith({
      id: "target.bookmark.set",
      args: {
        target: { ...target, kind: "thread" },
        bookmarked: true,
      },
    });
  });

  it("一覧メニューにスレログと閲覧履歴の一括削除操作を追加する", () => {
    const onDeleteThreadRecords = vi.fn();
    const items = createThreadContextMenuItems({
      target,
      isBookmarked: false,
      onRegisterTitleNg: vi.fn(),
      runCommand: vi.fn(),
      onDeleteThreadRecords,
    });
    const deleteRecordsItem = items.find((item) => item.id === "delete-thread-records");

    expect(deleteRecordsItem?.label).toBe("スレログと閲覧履歴を削除");
    deleteRecordsItem?.onSelect?.();
    expect(onDeleteThreadRecords).toHaveBeenCalledOnce();
  });
});
