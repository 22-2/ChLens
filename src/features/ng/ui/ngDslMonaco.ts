import {
  NG_DSL_LANGUAGE_ID,
  RULE_DSL_COMPLETION_CANDIDATES,
  RULE_DSL_LANGUAGE_DEFINITION,
  type RuleDslCompletionCandidate,
} from "@chlen/chlib";
import type * as Monaco from "monaco-editor";

type MonacoNamespace = typeof Monaco;

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

function createCommandRange(
  model: Monaco.editor.ITextModel,
  position: Monaco.Position,
): Monaco.IRange {
  // 候補は条件・設定の行全体を含むため、入力済みのwhenや対象もまとめて置き換える。
  const indent = /^\s*/u.exec(model.getLineContent(position.lineNumber))?.[0].length ?? 0;
  return { ...createRange(model, position), startColumn: indent + 1 };
}

function createHeaderSuggestions(
  monaco: MonacoNamespace,
  model: Monaco.editor.ITextModel,
  position: Monaco.Position,
): Monaco.languages.CompletionItem[] {
  const range = createCommandRange(model, position);
  return RULE_DSL_COMPLETION_CANDIDATES.filter(({ category }) => category === "header").map(
    (candidate) => toCompletionItem(monaco, candidate, range),
  );
}

function createOptionSuggestions(
  monaco: MonacoNamespace,
  model: Monaco.editor.ITextModel,
  position: Monaco.Position,
): Monaco.languages.CompletionItem[] {
  const range = createCommandRange(model, position);
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
  if (monaco.languages.getLanguages().some(({ id }) => id === NG_DSL_LANGUAGE_ID)) return;
  monaco.languages.register({ id: NG_DSL_LANGUAGE_ID });

  const actionPattern = RULE_DSL_LANGUAGE_DEFINITION.actions
    .flatMap((entry) => [entry.name, ...(entry.aliases ?? [])])
    .map(escapeRegExp)
    .join("|");
  const targetPattern = RULE_DSL_LANGUAGE_DEFINITION.targets
    .flatMap((entry) => [entry.name, ...(entry.aliases ?? [])])
    .map(escapeRegExp)
    .join("|");
  const operatorPattern = RULE_DSL_LANGUAGE_DEFINITION.operators.map(escapeRegExp).join("|");
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
        [/"(?:[^"\\]|\\.)*"/, "string"],
        [/'(?:[^'\\]|\\.)*'/, "string"],
        [/\/\*/, "comment", "@blockComment"],
        [/^\s*\/\/.*$/, "comment"],
        [/^\s*#.*$/, "comment"],
        [new RegExp(`^\\s*(?:${actionPattern}|${operatorPattern})\\b`), "keyword"],
        [new RegExp(`\\b(?:${targetPattern})\\b`), "type.identifier"],
        [new RegExp(`\\b(?:${matcherPattern})\\b`), "type.identifier"],
        [new RegExp(`\\b(?:${optionPattern})\\b`), "attribute.name"],
        [new RegExp(`\\b(?:${colorPattern})\\b`), "string"],
        [/#(?:[0-9a-fA-F]{6})\b/, "number.hex"],
        [/>=?/, "operator"],
        [/:|=/, "delimiter"],
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
    ],
    surroundingPairs: [
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
    indentationRules: {
      increaseIndentPattern: /:\s*$/u,
      decreaseIndentPattern: /^(?:hide|collapse|highlight|demote):/u,
    },
  });

  monaco.languages.registerCompletionItemProvider(NG_DSL_LANGUAGE_ID, {
    triggerCharacters: [" ", ">", '"', "'"],
    provideCompletionItems(model, position) {
      const line = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
      if (/^\s+color\s+[#\w-]*$/iu.test(line)) {
        return { suggestions: createColorSuggestions(monaco, model, position) };
      }
      if (/^\s+(?:sites|label|disabled)\b/iu.test(line)) {
        return { suggestions: createOptionSuggestions(monaco, model, position) };
      }
      if (!/^\s/u.test(line)) {
        return { suggestions: createHeaderSuggestions(monaco, model, position) };
      }
      return {
        suggestions: RULE_DSL_COMPLETION_CANDIDATES.filter(
          ({ category }) =>
            category === "condition" || category === "option" || category === "regex-value",
        ).map((candidate) =>
          toCompletionItem(
            monaco,
            candidate,
            candidate.category === "regex-value"
              ? createRange(model, position)
              : createCommandRange(model, position),
          ),
        ),
      };
    },
  });
}
