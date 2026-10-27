// @vitest-environment node
import { describe, expect, it } from "vite-plus/test";

import { formatRuleDsl, parseRuleDsl } from "./dsl";
import { validateRuleDsl } from "./validator";

const canonical = String.raw`highlight:
  color blue
  label "注目"
  sites "example.com"
  when title contains:
    "chatgpt"
    "claude"
    "gemini"
  when res-count >= 10
  unless title contains "除外"

hide:
  when body regex "(imgur\\.com/.+?){15}" flags=i

hide:
  when anchor-count >= 10`;

describe("NGのwhen/unlessブロックDSL", () => {
  it("動作・表示設定・適用先・OR一覧・AND条件を分離して解析する", () => {
    const result = parseRuleDsl(canonical);
    expect(result.diagnostics).toEqual([]);
    expect(result.rules[0]).toEqual({
      action: "highlight",
      target: "title",
      enabled: true,
      presentation: { color: "blue", label: "注目" },
      scope: { sites: ["example.com"] },
      matchers: ["chatgpt", "claude", "gemini"].map((value) => ({ kind: "contains", value })),
      conditions: [
        { target: "res-count", matchers: [{ kind: "contains", value: "10" }] },
        { target: "title", negate: true, matchers: [{ kind: "contains", value: "除外" }] },
      ],
    });
    expect(formatRuleDsl(result.rules)).toBe(canonical);
    expect(parseRuleDsl(formatRuleDsl(result.rules)).rules).toEqual(result.rules);
  });

  it("単一条件は同じ行、複数条件は一覧で指定できる", () => {
    const result = parseRuleDsl(
      'hide:\n  when id contains "a/b"\n  unless body contains:\n    "残す"\n    "許可"',
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.rules[0].conditions?.[0]).toMatchObject({
      negate: true,
      matchers: [
        { kind: "contains", value: "残す" },
        { kind: "contains", value: "許可" },
      ],
    });
  });

  it("複数の適用先、無効化、色名・カラーコードを往復する", () => {
    const source =
      'highlight:\n  color #ffcdd2\n  label "a: b"\n  sites:\n    "example.com"\n    "bbs.example.org"\n  disabled true\n  when title contains "注目"';
    const result = parseRuleDsl(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.rules[0]).toMatchObject({
      enabled: false,
      scope: { sites: ["example.com", "bbs.example.org"] },
    });
    expect(formatRuleDsl(result.rules)).toBe(source);
  });

  it("設定と条件の順序を入れ替えてもtitleのハイライトを維持する", () => {
    const result = parseRuleDsl(
      'highlight:\n  when res-count >= 10\n  color red\n  unless title contains "除外"\n  label "注目"',
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.rules[0]).toMatchObject({
      target: "title",
      negate: true,
      conditions: [{ target: "res-count" }],
    });
    expect(parseRuleDsl(formatRuleDsl(result.rules)).rules).toEqual(result.rules);
  });

  it.each(["res-count", "reply-count", "anchor-count"])(
    "%sの数値比較を解析・往復する",
    (target) => {
      for (const operator of [">=", ">"] as const) {
        const source = `hide:\n  when ${target} ${operator} 10`;
        const result = parseRuleDsl(source);
        expect(result.diagnostics).toEqual([]);
        expect(formatRuleDsl(result.rules)).toBe(source);
      }
    },
  );

  it("正規表現・引用符・末尾のバックスラッシュを往復する", () => {
    const result = parseRuleDsl(String.raw`hide:
  when body regex:
    "\\d+\\s+" flags=i
    'a"b'
  unless name contains "a\\"
`);
    expect(result.diagnostics).toEqual([]);
    expect(parseRuleDsl(formatRuleDsl(result.rules)).rules).toEqual(result.rules);
  });

  it.each([
    ["hide body contains:\n  spam", "旧形式"],
    ['hide:\n  when body contains "x"\nand res-count >= 10:', "旧形式"],
    ["hide:\n  when body contains bare", "引用符"],
    ['hide:\n  when body contains ""', "空でない"],
    ['hide:\n  when body regex "["', "正規表現"],
    ['hide:\n  when body regex "x" flags=ii', "flags"],
    ['hide:\n  when body contains "x" flags=i', "引用文字列"],
    ["hide:\n  when anchor-count >= -1", "整数"],
    ['hide:\n  when res-count contains "10"', "数値比較"],
    ["hide:\n  when body >= 10", "containsまたはregex"],
    ["hide:\n  when body contains:", "1つ以上"],
    ['hide:\n  sites:\n  when body contains "x"', "1つ以上"],
    ['hide:\n  sites ""\n  when body contains "x"', "空でない"],
    ['hide:\n  disabled yes\n  when body contains "x"', "trueまたはfalse"],
    ['hide:\n  label "x"\n  when body contains "x"', "highlightとblurでのみ"],
    ['blur:\n  color red\n  when image similar "0123456789abcdef"', "highlightでのみ"],
    ['hide:\n  when image similar "0123456789abcdef"', "blurでのみ使えます"],
    ['blur:\n  when body contains "x"', "1つだけ"],
    [
      'blur:\n  when image similar "0123456789abcdef"\n  when image similar "fedcba9876543210"',
      "1つだけ",
    ],
    ['blur:\n  unless image similar "0123456789abcdef"', "unlessを使えません"],
    ['blur:\n  when image contains "x"', "similarを指定"],
    ['hide:\n  when body similar "x"', "containsまたはregex"],
    ['blur:\n  when image similar "xyz"', "16進16桁"],
    ['blur:\n  when image similar "0123456789abcdef0"', "16進16桁"],
    ['blur:\n  when image similar "0123456789abcdef" flags=i', "16進16桁"],
    ["blur:\n  when image similar 0123456789abcdef", "引用符"],
    ['blur:\n  similarity 49%\n  when image similar "0123456789abcdef"', "50〜100"],
    ['blur:\n  similarity 101\n  when image similar "0123456789abcdef"', "50〜100"],
    ['blur:\n  similarity 85.5%\n  when image similar "0123456789abcdef"', "50〜100"],
    ['hide:\n  similarity 85%\n  when body contains "x"', "blurでのみ指定"],
    ['highlight:\n  when url contains "x"', "title条件"],
    ['hide:\n  sites "example.com"\n  sites "example.org"\n  when body contains "x"', "重複"],
    ['hide:\n  when body contains "x"\n    "y"', "一覧の見出し"],
    ['hide:\n  when body contains:\n    "x"\n      "y"', "同じインデント"],
    ['hide:\n  when res-count >= 1\n  unless body contains "x"', "同じ画面"],
    ['demote:\n  when title contains "x"', "未対応の動作"],
    ['warn:\n  when title contains "x"', "同じ画面"],
  ])("不正な指定を位置付きで診断する: %s", (source, message) => {
    const result = validateRuleDsl(source);
    expect(result.valid).toBe(false);
    expect(result.diagnostics.some((diagnostic) => diagnostic.message.includes(message))).toBe(
      true,
    );
    expect(result.diagnostics.every(({ line, column }) => line > 0 && column > 0)).toBe(true);
  });

  it("類似画像NGのblurを解析し、%付きで書き戻す", () => {
    const source = [
      "blur:",
      '  label "類似画像"',
      "  similarity 90",
      '  sites "example.com"',
      '  unless id contains "許可ID"',
      "  when image similar:",
      '    "0123456789ABCDEF"',
      '    "fedcba9876543210"',
    ].join("\n");
    const result = validateRuleDsl(source);
    expect(result.diagnostics).toEqual([]);
    // imageを主条件にし、ほかの条件はANDの追加条件にする。ハッシュは小文字にそろえる。
    expect(result.rules).toEqual([
      {
        action: "blur",
        enabled: true,
        target: "image",
        matchers: [
          { kind: "image-hash", value: "0123456789abcdef" },
          { kind: "image-hash", value: "fedcba9876543210" },
        ],
        conditions: [
          { target: "id", matchers: [{ kind: "contains", value: "許可ID" }], negate: true },
        ],
        scope: { sites: ["example.com"] },
        presentation: { label: "類似画像" },
        similarity: 90,
      },
    ]);
    const formatted = formatRuleDsl(result.rules);
    expect(formatted).toBe(
      [
        "blur:",
        '  label "類似画像"',
        "  similarity 90%",
        '  sites "example.com"',
        "  when image similar:",
        '    "0123456789abcdef"',
        '    "fedcba9876543210"',
        '  unless id contains "許可ID"',
      ].join("\n"),
    );
    expect(parseRuleDsl(formatted).rules).toEqual(result.rules);
  });

  it("similarityを省略したblurは、書き戻しでも省略したままにする", () => {
    const source = 'blur:\n  when image similar "0123456789abcdef"';
    const result = validateRuleDsl(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.rules[0]).not.toHaveProperty("similarity");
    expect(formatRuleDsl(result.rules)).toBe(source);
  });

  it("similarityは境界の50%と100%を受け付ける", () => {
    for (const similarity of ["50%", "100"]) {
      const result = validateRuleDsl(
        `blur:\n  similarity ${similarity}\n  when image similar "0123456789abcdef"`,
      );
      expect(result.diagnostics, similarity).toEqual([]);
    }
  });

  it("不正なルールを除き後続を解析するが、全体は保存不可にする", () => {
    const result = validateRuleDsl(
      'hide:\n  when unknown contains "x"\nhide:\n  when body contains "残る"',
    );
    expect(result.valid).toBe(false);
    expect(result.rules).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({ line: 2, column: 3 });
  });

  it("空文字とコメントだけならルールを持たない有効な設定になる", () => {
    expect(validateRuleDsl("")).toMatchObject({ valid: true, recognized: false, rules: [] });
    expect(validateRuleDsl("// コメント\n# コメント\n")).toMatchObject({ valid: true, rules: [] });
  });
});
