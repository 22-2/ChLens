// @vitest-environment node
import { describe, expect, it } from "vite-plus/test";

import { parseReplacementDsl } from "./dsl";
import { createReplacementEngine } from "./engine";

const target = { name: "a", mail: "a", other: "a", message: "a", number: 42 };
function makeEngine(source: string) {
  const parsed = parseReplacementDsl(source);
  expect(parsed.diagnostics).toEqual([]);
  return createReplacementEngine(parsed.rules);
}

describe("置換ルールの実行", () => {
  it.each([
    ["name", "name"],
    ["mail", "mail"],
    ["date", "other"],
    ["body", "message"],
  ])("%sを対応するフィールドだけへ適用する", (name, field) => {
    const engine = makeEngine(`replace ${name}:\n  from "a"\n  to "b"`);
    expect(engine.apply("", "", target)).toEqual({ ...target, [field]: "b" });
    expect(target[field as keyof typeof target]).toBe("a");
  });

  it("allと記述順を守り、メタデータと入力を保持する", () => {
    const engine = makeEngine(
      'replace all:\n  from "a"\n  to "b"\nreplace body:\n  from "b"\n  to "c"',
    );
    expect(engine.apply("", "", target)).toEqual({
      name: "b",
      mail: "b",
      other: "b",
      message: "c",
      number: 42,
    });
    expect(target.message).toBe("a");
  });

  it.each([
    ["", "x A x"],
    [" flags=i", "x A a"],
    [" flags=gi", "x x x"],
    [" flags=g", "x A x"],
  ])("literalの大小文字と置換回数をflagsで指定する: %s", (options, expected) => {
    const engine = makeEngine(`replace body${options}:\n  from "a"\n  to "x"`);
    expect(engine.apply("", "", { ...target, message: "a A a" }).message).toBe(expected);
  });

  it("literalでは記号と置換後のキャプチャ記法をそのまま扱う", () => {
    const engine = makeEngine('replace body:\n  from "[a].*"\n  to "$1$&"');
    expect(engine.apply("", "", { ...target, message: "[a].* [a].* a" }).message).toBe(
      "$1$& $1$& a",
    );
  });

  it("regexのキャプチャ・空文字置換を繰り返し実行できる", () => {
    const engine = makeEngine(String.raw`replace body regex:
  from "wrapper:(https?://[^<>\s]+)"
  to "$1"
replace body:
  from "削除"
  to ""`);
    const response = { ...target, message: "wrapper:https://example.com/a 削除" };
    for (let i = 0; i < 2; i += 1) {
      expect(engine.apply("", "", response).message).toBe("https://example.com/a ");
    }
  });

  it("stickyフラグの検索位置を項目やレス間へ持ち越さない", () => {
    const engine = makeEngine('replace all regex flags=y:\n  from "a"\n  to "x"');
    for (let i = 0; i < 2; i += 1) {
      expect(engine.apply("", "", target)).toEqual({
        ...target,
        name: "x",
        mail: "x",
        other: "x",
        message: "x",
      });
    }
  });

  it("空行削除とURLの完全一致条件を行操作にも適用する", () => {
    const engine = makeEngine(
      'remove body line:\n  equals ""\n  when url equals "https://example.com/"',
    );
    const response = { ...target, message: "\n前\n\n後\n" };
    expect(engine.apply("https://example.com/", "", response).message).toBe("前\n後");
    expect(engine.apply("https://example.com/other", "", response).message).toBe(response.message);
  });

  it("URLとタイトルの肯定・否定条件をANDで評価する", () => {
    const engine = makeEngine(
      'replace body:\n  from "a"\n  to "b"\n  when url contains "example.com"\n  when title regex "^実況"\n  unless title equals "実況除外"',
    );
    expect(engine.apply("https://example.com/", "実況テスト", target).message).toBe("b");
    expect(engine.apply("https://example.org/", "実況テスト", target).message).toBe("a");
    expect(engine.apply("https://example.com/", "テスト", target).message).toBe("a");
    expect(engine.apply("https://example.com/", "実況除外", target).message).toBe("a");
  });

  it.each(["\n", "\r\n", "<br>", "<br/>", "<br />", "<BR>"])(
    "%sを論理行区切りとして先頭行と区切りを削除する",
    (separator) => {
      const engine = makeEngine('remove body line first:\n  equals "消す"');
      expect(
        engine.apply("", "", { ...target, message: `消す${separator}残す${separator}消す` })
          .message,
      ).toBe(`残す${separator}消す`);
      expect(engine.apply("", "", { ...target, message: `残す${separator}消す` }).message).toBe(
        `残す${separator}消す`,
      );
    },
  );

  it.each([
    ["残す\n消す\n末尾", "残す\n末尾"],
    ["残す\n消す", "残す"],
    ["消す\n消す\n残す", "残す"],
    ["残す\n消す\n消す", "残す"],
    ["消す", ""],
    ["消す\n消す", ""],
    ["前<br />消す\r\n中\n消す", "前<br />中"],
    ["前\n\n消す\n\n後", "前\n\n\n後"],
  ])("一致する論理行を削除し、余分な空行を残さない: %s", (message, expected) => {
    const engine = makeEngine('remove body line:\n  equals "消す"');
    expect(engine.apply("", "", { ...target, message }).message).toBe(expected);
  });
});
