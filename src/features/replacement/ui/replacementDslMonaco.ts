import type * as Monaco from "monaco-editor";
import type { DslSnippetToken } from "src/view/browser/ui/DslEditor";

export const REPLACEMENT_DSL_LANGUAGE_ID = "replacement-dsl";

const SNIPPETS = [
  {
    label: "replace body",
    detail: "本文の文字列を置換",
    insertText: 'replace body:\n  from "${1:置換前}"\n  to "${2:置換後}"',
  },
  {
    label: "replace body regex",
    detail: "正規表現で置換",
    insertText: 'replace body regex:\n  from "${1:正規表現}"\n  to "${2:置換後}"',
  },
  {
    label: "remove body line first",
    detail: "一致する先頭行を削除",
    insertText: 'remove body line first:\n  equals "${1:画像URLや行の内容}"',
  },
  {
    label: "remove body line",
    detail: "一致する行をすべて削除",
    insertText: 'remove body line:\n  equals "${1:行の内容}"',
  },
  { label: "from", detail: "置換前", insertText: 'from "${1:置換前}"' },
  { label: "to", detail: "置換後（空文字も指定可）", insertText: 'to "${1:置換後}"' },
  {
    label: "when url contains",
    detail: "URLに含む場合だけ適用",
    insertText: 'when url contains "${1:example.com}"',
  },
  {
    label: "unless title contains",
    detail: "タイトルに含む場合は除外",
    insertText: 'unless title contains "${1:除外する語}"',
  },
];

export function ensureReplacementDslLanguage(monaco: typeof Monaco): void {
  if (monaco.languages.getLanguages().some(({ id }) => id === REPLACEMENT_DSL_LANGUAGE_ID)) return;
  monaco.languages.register({ id: REPLACEMENT_DSL_LANGUAGE_ID });
  monaco.languages.setMonarchTokensProvider(REPLACEMENT_DSL_LANGUAGE_ID, {
    tokenizer: {
      root: [
        [/^\s*(?:\/\/|#|\/\*|\*).*$/u, "comment"],
        [/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/u, "string"],
        [/\b(?:replace|remove|from|to|equals|when|unless)\b/u, "keyword"],
        [
          /\b(?:name|mail|date|body|all|url|title|literal|regex|line|first|contains)\b/u,
          "type.identifier",
        ],
        [/\bflags(?==)/u, "attribute.name"],
        [/:|=/u, "delimiter"],
      ],
    },
  });
  monaco.languages.setLanguageConfiguration(REPLACEMENT_DSL_LANGUAGE_ID, {
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
      decreaseIndentPattern: /^(?:replace|remove)\s/u,
    },
  });
  monaco.languages.registerCompletionItemProvider(REPLACEMENT_DSL_LANGUAGE_ID, {
    triggerCharacters: [" ", "="],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      return {
        suggestions: SNIPPETS.map((snippet) => ({
          ...snippet,
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range: {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          },
        })),
      };
    },
  });
}

export function tokenizeReplacementDslLine(line: string): DslSnippetToken[] {
  const tokens: DslSnippetToken[] = [];
  const pattern =
    /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\/\/.*$|^\s*#.*$)|(\b(?:replace|remove|from|to|equals|when|unless|name|mail|date|body|all|url|title|literal|regex|line|first|contains)\b)|(\bflags\b(?=\s*=))/gu;
  let cursor = 0;
  for (const match of line.matchAll(pattern)) {
    if (match.index > cursor) tokens.push({ type: "plain", text: line.slice(cursor, match.index) });
    tokens.push({
      type: match[1] ? "string" : match[2] ? "comment" : match[3] ? "rule" : "param",
      text: match[0],
    });
    cursor = match.index + match[0].length;
  }
  tokens.push({ type: "plain", text: line.slice(cursor) });
  return tokens;
}
