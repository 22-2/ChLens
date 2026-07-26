import {
  addRecentCommandId,
  normalizeRecentCommandIds,
} from "src/view/browser/commands/command-history";
import { describe, expect, it } from "vite-plus/test";

describe("addRecentCommandId", () => {
  it("実行したコマンドを重複なしで先頭へ移動する", () => {
    expect(addRecentCommandId(["first", "second", "third"], "second")).toEqual([
      "second",
      "first",
      "third",
    ]);
  });

  it("履歴を20件に制限する", () => {
    const recent = Array.from({ length: 20 }, (_, index) => `command-${index}`);
    const next = addRecentCommandId(recent, "new-command");

    expect(next).toHaveLength(20);
    expect(next[0]).toBe("new-command");
    expect(next).not.toContain("command-19");
  });

  it("保存値から不正値と重複を除く", () => {
    expect(normalizeRecentCommandIds(["first", null, "second", "first", 42])).toEqual([
      "first",
      "second",
    ]);
  });
});
