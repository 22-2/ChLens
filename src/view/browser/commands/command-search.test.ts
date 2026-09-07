import { Search } from "lucide-react";
import type { ResolvedBrowserCommand } from "src/view/browser/commands/browser-commands";
import { filterAndSortBrowserCommands } from "src/view/browser/commands/command-search";
import { describe, expect, it } from "vite-plus/test";

function command(
  id: string,
  label: string,
  englishLabel: string,
  keywords: readonly string[] = [],
): ResolvedBrowserCommand {
  return {
    id,
    label,
    englishLabel,
    keywords,
    group: "navigation",
    icon: Search,
    enabled: true,
  };
}

const commands = [
  command("navigation.open-settings", "設定を開く", "Open Settings", ["preferences", "config"]),
  command("page.reload", "現在のページを更新", "Reload Current Page", ["再読み込み", "refresh"]),
  command("copy.page-url", "現在のページURLをコピー", "Copy Current Page URL", [
    "アドレス",
    "link",
  ]),
];

const threadCommands = [
  ...commands,
  command("page.jump-to-response", "レス番号を指定してジャンプ", "Jump to Response Number", [
    "レス移動",
    "番号",
    "jump",
    "response",
  ]),
];

describe("filterAndSortBrowserCommands", () => {
  it("日本語名と英語名のどちらでも検索できる", () => {
    expect(filterAndSortBrowserCommands(commands, "設定", []).map(({ id }) => id)).toEqual([
      "navigation.open-settings",
    ]);
    expect(filterAndSortBrowserCommands(commands, "open settings", []).map(({ id }) => id)).toEqual(
      ["navigation.open-settings"],
    );
  });

  it("複数単語と曖昧入力を検索できる", () => {
    expect(filterAndSortBrowserCommands(commands, "copy url", []).map(({ id }) => id)).toEqual([
      "copy.page-url",
    ]);
    expect(filterAndSortBrowserCommands(commands, "opset", []).map(({ id }) => id)).toEqual([
      "navigation.open-settings",
    ]);
  });

  it("検索別名とコマンドIDも検索対象にする", () => {
    expect(filterAndSortBrowserCommands(commands, "preferences", []).map(({ id }) => id)).toEqual([
      "navigation.open-settings",
    ]);
    expect(filterAndSortBrowserCommands(commands, "page.reload", []).map(({ id }) => id)).toEqual([
      "page.reload",
    ]);
  });

  it("空入力では最近使ったコマンドを先頭にし、残りの定義順を保つ", () => {
    expect(
      filterAndSortBrowserCommands(commands, "", ["copy.page-url", "page.reload"]).map(
        ({ id }) => id,
      ),
    ).toEqual(["copy.page-url", "page.reload", "navigation.open-settings"]);
  });

  it("スレッドで正の数字を入力するとレス番号ジャンプを最上位へ合成する", () => {
    const result = filterAndSortBrowserCommands(threadCommands, "42", []);

    expect(result[0]).toMatchObject({
      id: "page.jump-to-response:42",
      label: "レス42へジャンプ",
      englishLabel: "Jump to Response 42",
    });
  });

  it("全角数字と先頭ゼロを正規化し、安全でない番号は候補にしない", () => {
    expect(filterAndSortBrowserCommands(threadCommands, " ０４２ ", [])[0]).toMatchObject({
      id: "page.jump-to-response:42",
      label: "レス42へジャンプ",
    });
    expect(
      filterAndSortBrowserCommands(threadCommands, "9007199254740992", []).some(({ id }) =>
        id.startsWith("page.jump-to-response:"),
      ),
    ).toBe(false);
  });

  it("数字以外や0は動的なレス番号ジャンプ候補にしない", () => {
    for (const query of ["0", "-1", "1.5", "+42", "42abc"]) {
      expect(
        filterAndSortBrowserCommands(threadCommands, query, []).some(({ id }) =>
          id.startsWith("page.jump-to-response:"),
        ),
      ).toBe(false);
    }
  });
});
