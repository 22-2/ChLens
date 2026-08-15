import type * as Monaco from "monaco-editor";
import { NG_DSL_LANGUAGE_ID, NG_HIGHLIGHT_COLOR_PRESET_ITEMS } from "src/core/ngDsl";
import {
  isRuleCombinationSupported,
  RULE_ACTION_CATALOG,
  RULE_OPTION_CATALOG,
  RULE_TARGET_CATALOG,
} from "src/core/rules/catalog";

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
  return RULE_ACTION_CATALOG.flatMap((action) =>
    RULE_TARGET_CATALOG.filter((target) =>
      isRuleCombinationSupported(action.name, target.name),
    ).map((target) => ({
      label: `${action.name} ${target.name}`,
      kind: monaco.languages.CompletionItemKind.Snippet,
      detail: `${action.description} 対象: ${target.description}`,
      insertText: `${action.name} ${target.name}:\n  \${1:キーワード}`,
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      range,
    })),
  );
}

function createOptionSuggestions(
  monaco: MonacoNamespace,
  model: Monaco.editor.ITextModel,
  position: Monaco.Position,
): Monaco.languages.CompletionItem[] {
  const range = createRange(model, position);
  return RULE_OPTION_CATALOG.map((option) => ({
    label: option.name,
    kind: monaco.languages.CompletionItemKind.Property,
    detail: option.description,
    insertText: `${option.name}=`,
    range,
  }));
}

function createColorSuggestions(
  monaco: MonacoNamespace,
  model: Monaco.editor.ITextModel,
  position: Monaco.Position,
): Monaco.languages.CompletionItem[] {
  const range = createRange(model, position);
  return [
    ...NG_HIGHLIGHT_COLOR_PRESET_ITEMS.map((preset) => ({
      label: preset.name,
      kind: monaco.languages.CompletionItemKind.Color,
      detail: `${preset.hex} / ${preset.description}`,
      insertText: preset.name,
      range,
    })),
    {
      label: "#rrggbb",
      kind: monaco.languages.CompletionItemKind.Snippet,
      detail: "16進カラーコード",
      insertText: "#${1:ffcdd2}",
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      range,
    },
  ];
}

export function ensureNgDslLanguage(monaco: MonacoNamespace): void {
  if (ngDslRegistered) return;
  ngDslRegistered = true;
  monaco.languages.register({ id: NG_DSL_LANGUAGE_ID });

  const actionPattern = RULE_ACTION_CATALOG.flatMap((entry) => [
    entry.name,
    ...(entry.aliases ?? []),
  ])
    .map(escapeRegExp)
    .join("|");
  const targetPattern = RULE_TARGET_CATALOG.flatMap((entry) => [
    entry.name,
    ...(entry.aliases ?? []),
  ])
    .map(escapeRegExp)
    .join("|");
  const optionPattern = RULE_OPTION_CATALOG.flatMap((entry) => [
    entry.name,
    ...(entry.aliases ?? []),
  ])
    .map(escapeRegExp)
    .join("|");
  const colorPattern = NG_HIGHLIGHT_COLOR_PRESET_ITEMS.map((preset) => preset.name)
    .map(escapeRegExp)
    .join("|");

  monaco.languages.setMonarchTokensProvider(NG_DSL_LANGUAGE_ID, {
    tokenizer: {
      root: [
        [/\/\*/, "comment", "@blockComment"],
        [/^\s*\/\/.*$/, "comment"],
        [/^\s*#.*$/, "comment"],
        [new RegExp(`^\\s*(?:${actionPattern})\\b`), "keyword"],
        [new RegExp(`\\b(?:${targetPattern})\\b`), "type.identifier"],
        [/^\s+regex\b/, "type.identifier"],
        [new RegExp(`\\b(?:${optionPattern})\\b(?=\\s*=)`), "attribute.name"],
        [new RegExp(`\\b(?:${colorPattern})\\b`), "string"],
        [/#(?:[0-9a-fA-F]{6})\b/, "number.hex"],
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
    triggerCharacters: [" ", "=", "[", '"', "'"],
    provideCompletionItems(model, position) {
      const line = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
      const range = createRange(model, position);
      if (/\bcolor\s*=\s*[#\w-]*$/iu.test(line)) {
        return { suggestions: createColorSuggestions(monaco, model, position) };
      }
      if (/\b(?:sites|label|disabled)\s*=\s*[^\s]*$/iu.test(line)) {
        return { suggestions: createOptionSuggestions(monaco, model, position) };
      }
      if (!/^\s/u.test(line)) {
        return { suggestions: createHeaderSuggestions(monaco, model, position) };
      }
      return {
        suggestions: [
          {
            label: "regex",
            kind: monaco.languages.CompletionItemKind.Keyword,
            detail: "正規表現条件",
            insertText: 'regex "${1:パターン}"',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
          },
        ],
      };
    },
  });
}
