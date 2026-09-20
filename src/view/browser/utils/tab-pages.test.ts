import { createQuickAccessPage, createSettingsPage } from "src/view/browser/utils/tab-pages";
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
});
