// @vitest-environment node
import {
  createBoardPage,
  createQuickAccessPage,
  createSettingsPage,
} from "src/view/browser/utils/tab-pages";
import { describe, expect, it } from "vite-plus/test";

describe("共通ページ生成", () => {
  it("クイックアクセスの種別と表示名を対応させる", () => {
    expect(createQuickAccessPage("bookmarkList")).toEqual({
      type: "bookmarkList",
      title: "ブックマークリスト",
    });
    expect(createQuickAccessPage("historyList")).toEqual({
      type: "historyList",
      title: "閲覧履歴",
    });
    expect(createQuickAccessPage("writeHistoryList")).toEqual({
      type: "writeHistoryList",
      title: "書き込み履歴",
    });
    expect(createQuickAccessPage("logList")).toEqual({
      type: "logList",
      title: "ログ検索",
    });
  });

  it("設定ページのセクションを任意で付与する", () => {
    expect(createSettingsPage()).toEqual({ type: "settings", title: "設定" });
    expect(createSettingsPage("ng")).toEqual({
      type: "settings",
      title: "設定",
      sectionId: "ng",
    });
  });

  it("板のページは題名と板名に同じ名前を使い、板名がなければ URL にする", () => {
    const boardUrl = "https://example.com/board/";
    expect(createBoardPage(boardUrl, "板名")).toEqual({
      type: "threadList",
      title: "板名",
      boardUrl,
      boardTitle: "板名",
    });
    expect(createBoardPage(boardUrl)).toEqual(
      expect.objectContaining({ title: boardUrl, boardTitle: boardUrl }),
    );
    expect(createBoardPage(boardUrl, "")).toEqual(
      expect.objectContaining({ title: boardUrl, boardTitle: boardUrl }),
    );
  });
});
