import { parseRuleDsl } from "@chlen/chlib";
import type * as Monaco from "monaco-editor";
import { describe, expect, it, vi } from "vite-plus/test";

const { getSimilarImageRecord } = vi.hoisted(() => ({ getSimilarImageRecord: vi.fn() }));
vi.mock("src/features/ng/browser/similar-image-records", () => ({ getSimilarImageRecord }));

import { ensureNgDslLanguage, findImageHashAt } from "./ngDslMonaco";

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
      registerHoverProvider: vi.fn(),
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

function lines(source: string) {
  const content = source.split("\n");
  return { getLineContent: (lineNumber: number) => content[lineNumber - 1] ?? "" };
}

describe("類似画像NGのハッシュの位置", () => {
  it("when image similar の値と、その一覧の値だけを対象にする", () => {
    const model = lines(
      [
        "blur:",
        '  when image similar "0123456789ABCDEF"',
        "blur:",
        "  when image similar:",
        '    "fedcba9876543210"',
        "hide:",
        '  when body contains "0123456789abcdef"',
      ].join("\n"),
    );
    expect(findImageHashAt(model, 2, 25)).toEqual({
      hash: "0123456789abcdef",
      startColumn: 22,
      endColumn: 40,
    });
    expect(findImageHashAt(model, 2, 5)).toBeNull();
    expect(findImageHashAt(model, 5, 8)?.hash).toBe("fedcba9876543210");
    expect(findImageHashAt(model, 7, 28)).toBeNull();
  });
});

describe("類似画像NGのハッシュのホバー", () => {
  function captureHover() {
    let hover: Monaco.languages.HoverProvider | undefined;
    const monaco = {
      languages: {
        getLanguages: () => [],
        register: vi.fn(),
        setMonarchTokensProvider: vi.fn(),
        setLanguageConfiguration: vi.fn(),
        registerCompletionItemProvider: vi.fn(),
        registerHoverProvider: (_id: string, value: Monaco.languages.HoverProvider) => {
          hover = value;
        },
      },
    } as unknown as typeof Monaco;
    ensureNgDslLanguage(monaco);
    return (source: string, lineNumber: number, column: number) =>
      hover?.provideHover(
        lines(source) as unknown as Monaco.editor.ITextModel,
        { lineNumber, column } as Monaco.Position,
        { isCancellationRequested: false } as Monaco.CancellationToken,
      ) as Promise<Monaco.languages.Hover | null>;
  }

  it("登録したときの縮小画像と元のURLを出す", async () => {
    getSimilarImageRecord.mockResolvedValue({
      hash: "0123456789abcdef",
      thumbnailDataUrl: "data:image/jpeg;base64,AAAA",
      sourceUrl: "https://images.example.com/a.jpg",
      addedAt: 0,
    });
    const result = await captureHover()('  when image similar "0123456789abcdef"', 1, 25);
    expect(getSimilarImageRecord).toHaveBeenCalledWith("0123456789abcdef");
    expect(result?.contents.map((content) => (content as { value: string }).value)).toEqual([
      "![類似画像NGに登録した画像](data:image/jpeg;base64,AAAA)",
      "元の画像: `https://images.example.com/a.jpg`",
      expect.stringMatching(/^登録: /u),
    ]);
  });

  it("記録がないハッシュは、その旨を出す", async () => {
    getSimilarImageRecord.mockResolvedValue(null);
    const result = await captureHover()('  when image similar "0123456789abcdef"', 1, 25);
    expect((result?.contents[0] as { value: string }).value).toContain("記録はありません");
  });
});
