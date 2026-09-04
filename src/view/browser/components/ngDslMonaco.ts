import type * as Monaco from "monaco-editor";
import {
  NG_DSL_LANGUAGE_ID,
  RULE_DSL_COMPLETION_CANDIDATES,
  RULE_DSL_LANGUAGE_DEFINITION,
  type RuleDslCompletionCandidate,
} from "@chlen/ch-lib";

type MonacoNamespace = typeof Monaco;
let ngDslRegistered = false;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createRange(model: Monaco.editor.ITextModel, position: Monaco.Position): Monaco.IRange {
  const word = model.getWordUntilPosition(position);
  return {
    startLineNumber: position.lineNumber,
    startColumn: word.startColumn,
    endLineNumber: position.lineNumber,
    endColumn: word.endColumn,
  };
}

function createHeaderSuggestions(
  monaco: MonacoNamespace,
  model: Monaco.editor.ITextModel,
  position: Monaco.Position,
): Monaco.languages.CompletionItem[] {
  const range = createRange(model, position);
  return RULE_DSL_COMPLETION_CANDIDATES.filter(({ category }) => category === "header").map(
    (candidate) => toCompletionItem(monaco, candidate, range),
  );
}

function createOptionSuggestions(
  monaco: MonacoNamespace,
  model: Monaco.editor.ITextModel,
  position: Monaco.Position,
): Monaco.languages.CompletionItem[] {
  const range = createRange(model, position);
  return RULE_DSL_COMPLETION_CANDIDATES.filter(({ category }) => category === "option").map(
    (candidate) => toCompletionItem(monaco, candidate, range),
  );
}

function createColorSuggestions(
  monaco: MonacoNamespace,
  model: Monaco.editor.ITextModel,
  position: Monaco.Position,
): Monaco.languages.CompletionItem[] {
  const range = createRange(model, position);
  return RULE_DSL_COMPLETION_CANDIDATES.filter(({ category }) => category === "color").map(
    (candidate) => toCompletionItem(monaco, candidate, range),
  );
}

function toCompletionItem(
  monaco: MonacoNamespace,
  candidate: RuleDslCompletionCandidate,
  range: Monaco.IRange,
): Monaco.languages.CompletionItem {
  const kind =
    candidate.category === "option"
      ? monaco.languages.CompletionItemKind.Property
      : candidate.category === "color"
        ? monaco.languages.CompletionItemKind.Color
        : candidate.category === "regex-value"
          ? monaco.languages.CompletionItemKind.Keyword
          : monaco.languages.CompletionItemKind.Snippet;
  return {
    label: candidate.label,
    kind,
    detail: candidate.detail,
    insertText: candidate.insertText,
    ...(candidate.isSnippet
      ? { insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet }
      : {}),
    range,
  };
}

export function ensureNgDslLanguage(monaco: MonacoNamespace): void {
  if (ngDslRegistered) return;
  ngDslRegistered = true;
  monaco.languages.register({ id: NG_DSL_LANGUAGE_ID });

  const actionPattern = RULE_DSL_LANGUAGE_DEFINITION.actions
    .flatMap((entry) => [entry.name, ...(entry.aliases ?? [])])
    .map(escapeRegExp)
    .join("|");
  const targetPattern = RULE_DSL_LANGUAGE_DEFINITION.targets
    .flatMap((entry) => [entry.name, ...(entry.aliases ?? [])])
    .map(escapeRegExp)
    .join("|");
  const optionPattern = RULE_DSL_LANGUAGE_DEFINITION.options
    .flatMap((entry) => [entry.name, ...(entry.aliases ?? [])])
    .map(escapeRegExp)
    .join("|");
  const colorPattern = RULE_DSL_LANGUAGE_DEFINITION.colors
    .map((preset) => preset.name)
    .map(escapeRegExp)
    .join("|");
  const matcherPattern = RULE_DSL_LANGUAGE_DEFINITION.matchers.join("|");

  monaco.languages.setMonarchTokensProvider(NG_DSL_LANGUAGE_ID, {
    tokenizer: {
      root: [
        [/\/\*/, "comment", "@blockComment"],
        [/^\s*\/\/.*$/, "comment"],
        [/^\s*#.*$/, "comment"],
        [new RegExp(`^\\s*(?:${actionPattern})\\b`), "keyword"],
        [new RegExp(`\\b(?:${targetPattern})\\b`), "type.identifier"],
        [new RegExp(`\\b(?:${matcherPattern})\\b`), "type.identifier"],
        [new RegExp(`\\b(?:${optionPattern})\\b(?=\\s*=)`), "attribute.name"],
        [new RegExp(`\\b(?:${colorPattern})\\b`), "string"],
        [/#(?:[0-9a-fA-F]{6})\b/, "number.hex"],
        [/>=?/, "operator"],
        [/:|=/, "delimiter"],
        [/"(?:[^"\\]|\\.)*"/, "string"],
        [/'(?:[^'\\]|\\.)*'/, "string"],
      ],
      blockComment: [
        [/[^/*]/, "comment"],
        [/\/\*/, "comment", "@push"],
        [/\*\//, "comment", "@pop"],
        [/[/*]/, "comment"],
      ],
    },
  });

  monaco.languages.setLanguageConfiguration(NG_DSL_LANGUAGE_ID, {
    autoClosingPairs: [
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: "[", close: "]" },
    ],
    surroundingPairs: [
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: "[", close: "]" },
    ],
  });

  monaco.languages.registerCompletionItemProvider(NG_DSL_LANGUAGE_ID, {
    triggerCharacters: [" ", "=", ">", "[", '"', "'"],
    provideCompletionItems(model, position) {
      const line = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
      if (/\bcolor\s*=\s*[#\w-]*$/iu.test(line)) {
        return { suggestions: createColorSuggestions(monaco, model, position) };
      }
      // 類似画像NGのthresholdも既存の設定項目と同じ補完入口へ揃える。
      if (/\b(?:sites|label|disabled|threshold)\s*=\s*[^\s]*$/iu.test(line)) {
        return { suggestions: createOptionSuggestions(monaco, model, position) };
      }
      if (!/^\s/u.test(line)) {
        return { suggestions: createHeaderSuggestions(monaco, model, position) };
      }
      return {
        suggestions: RULE_DSL_COMPLETION_CANDIDATES.filter(
          ({ category }) => category === "regex-value",
        ).map((candidate) => toCompletionItem(monaco, candidate, createRange(model, position))),
      };
    },
  });
}
