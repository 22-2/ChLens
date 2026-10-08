import { parseRuleDsl } from "@chlen/chlib";
import type * as Monaco from "monaco-editor";
import { describe, expect, it, vi } from "vite-plus/test";

import { ensureNgDslLanguage } from "./ngDslMonaco";

function complete(line: string, label: string): string {
  let provider: Monaco.languages.CompletionItemProvider | undefined;
  const monaco = {
    languages: {
      getLanguages: () => [],
      register: vi.fn(),
      setMonarchTokensProvider: vi.fn(),
      setLanguageConfiguration: vi.fn(),
      registerCompletionItemProvider: (
        _id: string,
        value: Monaco.languages.CompletionItemProvider,
      ) => {
        provider = value;
      },
      CompletionItemKind: { Property: 1, Color: 2, Keyword: 3, Snippet: 4 },
      CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
    },
  } as unknown as typeof Monaco;
  ensureNgDslLanguage(monaco);
  const word = /[\w-]*$/u.exec(line)?.[0] ?? "";
  const model = {
    getLineContent: () => line,
    getWordUntilPosition: () => ({
      word,
      startColumn: line.length - word.length + 1,
      endColumn: line.length + 1,
    }),
  } as unknown as Monaco.editor.ITextModel;
  const result = provider?.provideCompletionItems(
    model,
    { lineNumber: 1, column: line.length + 1 } as Monaco.Position,
    { triggerKind: 0 },
    { isCancellationRequested: false } as Monaco.CancellationToken,
  ) as Monaco.languages.CompletionList;
  const candidate = result.suggestions.find((item) => item.label === label);
  if (!candidate) throw new Error(`補完候補が見つかりません: ${label}`);
  const range = candidate.range as Monaco.IRange;
  const text = candidate.insertText.replace(/\$\{\d+:([^}]+)\}/gu, "$1");
  return line.slice(0, range.startColumn - 1) + text + line.slice(range.endColumn - 1);
}

describe("NGエディタの補完置換範囲", () => {
  it.each([
    ["  when title cont", "when title contains"],
    ["  unless title re", "unless title regex"],
  ])("途中まで入力した条件を重複させず補完する: %s", (line, label) => {
    const completed = complete(line, label);
    expect(completed).toBe(`  ${label} "値"`);
    expect(parseRuleDsl(`hide:\n${completed}`).diagnostics).toEqual([]);
  });

  it("設定名の入力後も設定行全体を置き換える", () => {
    const completed = complete("  sites ", "sites");
    expect(completed).toBe('  sites "値"');
    expect(parseRuleDsl(`hide:\n${completed}\n  when body contains "本文"`).diagnostics).toEqual(
      [],
    );
  });

  it("色名の補完はcolorを残して値だけを置き換える", () => {
    expect(complete("  color bl", "blue")).toBe("  color blue");
  });
});
