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

  it("全角空白・BOM・ゼロ幅文字とCRLFを含む入力を解析する", () => {
    const result = parseRuleDsl('​// コメント\nhide:\n　when title contains "ほげ"\r\n﻿# コメント');
    expect(result.diagnostics).toEqual([]);
    expect(result.rules[0]?.matchers).toEqual([{ kind: "contains", value: "ほげ" }]);
  });
});
