import { describe, expect, it } from "vite-plus/test";

import { normalizeSidePanel, showSidePanelView } from "./side-panel-state";

describe("サイドパネルの保存状態", () => {
  it("保存済みの順序と選択を復元し、新しいビューを追加する", () => {
    const result = normalizeSidePanel({
      isOpen: true,
      width: 400,
      views: ["images", "boards"],
      activeView: "images",
    });
    expect(result.isOpen).toBe(true);
    expect(result.width).toBe(400);
    expect(result.views.slice(0, 2)).toEqual(["images", "boards"]);
    expect(result.activeView).toBe("images");
    expect(result.views).toContain("favorites");
  });
  it("不正な値と重複を除き幅を制限する", () => {
    const result = normalizeSidePanel({
      width: 900,
      views: ["boards", "boards", "unknown"],
      activeView: "unknown",
    });
    expect(result.width).toBe(600);
    expect(result.views.filter((id) => id === "boards")).toHaveLength(1);
    expect(result.views).not.toContain("unknown");
    expect(result.activeView).toBe("boards");
  });
  it("指定のビューで開き、幅と並び順は保つ", () => {
    const result = showSidePanelView(
      { isOpen: false, width: 360, views: ["write", "boards"], activeView: "boards" },
      "write",
    );
    expect(result.isOpen).toBe(true);
    expect(result.activeView).toBe("write");
    expect(result.width).toBe(360);
    expect(result.views.slice(0, 2)).toEqual(["write", "boards"]);
  });
});
