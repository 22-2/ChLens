// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import peggy from "peggy";
import { describe, expect, it } from "vite-plus/test";

import { parseRuleDsl } from "./dsl";

const readSibling = (name: string): string =>
  readFileSync(fileURLToPath(new URL(name, import.meta.url)), "utf8");

describe("ルールDSLのPeggy文法", () => {
  it("コミット済みの生成パーサーがdsl.peggyと一致する", () => {
    // 文法だけを編集して generate:dsl を忘れると実行時の挙動が古いままになるため、生成結果を突き合わせる。
    const generated = peggy.generate(readSibling("dsl.peggy"), {
      output: "source",
      format: "es",
      allowedStartRules: ["Document", "Scalar", "OptionList", "ReplacementDocument"],
      grammarSource: "src/rules/dsl.peggy",
    });
    expect(generated).toBe(readSibling("dsl-grammar.js"));
  });

  it("構文エラーがあっても解析を止めず、後続のルールと複数の診断を返す", () => {
    const result = parseRuleDsl(`hide title regex:
  未引用の正規表現
and:
hide unknown-target contains:
  x
これはルールではない
hide body contains:
  生き残る`);

    expect(result.rules).toEqual([
      {
        action: "hide",
        target: "body",
        enabled: true,
        matchers: [{ kind: "contains", value: "生き残る" }],
      },
    ]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.line)).toEqual([2, 3, 4, 6]);
  });

  it("全角空白のインデントやBOM・ゼロ幅文字付きのコメントを従来どおり扱う", () => {
    const result = parseRuleDsl("​// コメント\nhide title contains:\n　ほげ\r\n﻿# コメント");

    expect(result.diagnostics).toEqual([]);
    expect(result.rules).toEqual([
      {
        action: "hide",
        target: "title",
        enabled: true,
        matchers: [{ kind: "contains", value: "ほげ" }],
      },
    ]);
  });

  it("オプション値に含まれるコロンを見出しの区切りとみなさない", () => {
    const result = parseRuleDsl(`highlight title contains label="a: b":
  x`);

    expect(result.diagnostics).toEqual([]);
    expect(result.rules[0]?.presentation).toEqual({ label: "a: b" });
  });
});
