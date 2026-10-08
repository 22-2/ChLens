// @vitest-environment node
import { describe, expect, it } from "vite-plus/test";

import { formatReplacementDsl, parseReplacementDsl } from "./dsl";

describe("置換DSLの解析と診断", () => {
  it("literalを省略した基本形を読み取り、同じ形で整形する", () => {
    const source = 'replace body:\n  from "ｗｗｗ"\n  to "（笑）"';
    const parsed = parseReplacementDsl(source);
    expect(parsed).toEqual({
      recognized: true,
      diagnostics: [],
      rules: [
        {
          operation: "replace",
          unit: "text",
          target: "body",
          matcher: { kind: "literal", source: "ｗｗｗ" },
          replacement: "（笑）",
          conditions: [],
        },
      ],
    });
    expect(formatReplacementDsl(parsed.rules)).toBe(source);
    expect(parseReplacementDsl(source.replace("body:", "body literal:"))).toEqual(parsed);
  });

  it("正規表現のバックスラッシュ・引用符・末尾のバックスラッシュを往復できる", () => {
    const parsed = parseReplacementDsl(String.raw`replace body regex flags=gi:
  from '(\d+)\s+"引用"'
  to '$1'
  when url regex '^https?://example\.com/'
  unless title equals "対象外"

replace name:
  from "末尾\\"
  to "引用\"と\\と'"

remove body line first:
  equals "先頭"`);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.rules[0].matcher.source).toBe('(\\d+)\\s+"引用"');
    expect(parsed.rules[1].matcher.source).toBe("末尾\\");
    expect(parseReplacementDsl(formatReplacementDsl(parsed.rules))).toEqual(parsed);
  });

  it("空の設定・コメント・CRLFを受け付ける", () => {
    expect(parseReplacementDsl("\r\n# コメント\r\n  // コメント")).toEqual({
      recognized: false,
      rules: [],
      diagnostics: [],
    });
    expect(parseReplacementDsl('replace body:\r\n  from "a"\r\n  to ""').diagnostics).toEqual([]);
  });

  it("最後の引用符がエスケープされている未閉鎖の値を拒否する", () => {
    expect(
      parseReplacementDsl(String.raw`replace body:
  from "a\"
  to "b"`).diagnostics.some((diagnostic) => diagnostic.line === 2),
    ).toBe(true);
  });

  it.each([
    ['replace msg:\n  from "a"\n  to "b"', "未対応の対象"],
    ['unknown body:\n  from "a"\n  to "b"', "未対応の操作"],
    ['replace body wrong:\n  from "a"\n  to "b"', "未対応のオプション"],
    ['replace body literal regex:\n  from "a"\n  to "b"', "方式を複数"],
    ['replace body flags=ii:\n  from "a"\n  to "b"', "フラグが不正"],
    ['replace body flags=m:\n  from "a"\n  to "b"', "literal のflags"],
    ['replace body regex flags=uv:\n  from "a"\n  to "b"', "フラグが不正"],
    ['replace body regex flags=:\n  from "a"\n  to "b"', "flags の値"],
    ['replace body regex flags=g flags=i:\n  from "a"\n  to "b"', "flags を複数"],
    ['replace body regex:\n  from "["\n  to "b"', "正規表現"],
    ['replace body:\n  from ""\n  to "b"', "空文字にできません"],
    ['replace body:\n  to "b"', "from の指定"],
    ['replace body:\n  from "a"', "to の指定"],
    ['replace body:\n  from "a"\n  to "b"\n  to "c"', "to を複数"],
    ['replace body:\n  from bare\n  to "b"', "引用符"],
    ['replace body:\n  from "未閉鎖\n  to "b"', "引用符"],
    ['replace body:\n  from "a" extra\n  to "b"', "余分な指定"],
    ['replace body:\n  from "a"\n  to "b"\n  when url contains', "引用符"],
    ['replace body:\n  from "a"\n  to "b"\n  when board contains "a"', "条件対象"],
    ['replace body:\n  from "a"\n  to "b"\n  when url wrong "a"', "条件演算子"],
    ['replace body:\n  from "a"\n  to "b"\n  unless title regex "["', "正規表現"],
    ['remove name line:\n  equals "a"', "対象は body のみ"],
    ['remove body line wrong:\n  equals "a"', "remove の指定"],
    ["remove body line:", "equals の指定"],
    ['remove body line:\n  equals "a<br>b"', "論理行の区切り"],
    ['replace body\n  from "a"\n  to "b"', "末尾には :"],
    ['  from "a"', "見出しが必要"],
    ["a\tb\tmsg", "不明な置換ルール"],
  ])("不正な入力を適用しない: %s", (source, message) => {
    const parsed = parseReplacementDsl(source);
    expect(parsed.rules).toEqual([]);
    expect(parsed.diagnostics.some((diagnostic) => diagnostic.message.includes(message))).toBe(
      true,
    );
  });

  it("複数のエラーを行・列付きで返し、有効なルールも部分適用しない", () => {
    const parsed = parseReplacementDsl(
      'replace body:\n  from "a"\n  to "b"\n\nreplace body regex:\n  from "["\n  to "b"\n  unknown "a"',
    );
    expect(parsed.rules).toEqual([]);
    expect(parsed.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ line: 6, column: 3 }),
        expect.objectContaining({ line: 8, column: 3 }),
      ]),
    );
  });
});
