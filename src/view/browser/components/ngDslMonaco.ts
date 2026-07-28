import type * as Monaco from "monaco-editor";
import {
  getNgDslRuleSpec,
  NG_DSL_LANGUAGE_ID,
  NG_DSL_RULE_SPECS,
  NG_HIGHLIGHT_COLOR_PRESET_ITEMS,
  normalizeNgDslKeyword,
  normalizeNgDslParameterName,
  splitNgDslTopLevel,
  type NGDslParameterSpec,
  type NGDslRuleSpec,
} from "src/core/ngDsl";

type MonacoNamespace = typeof Monaco;

let ngDslRegistered = false;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createMarkdown(value: string): Monaco.IMarkdownString {
  return {
    value,
    isTrusted: false,
  };
}

function createTopLevelState() {
  return {
    quote: null as "'" | '"' | null,
    escapeNext: false,
    parenDepth: 0,
    bracketDepth: 0,
    braceDepth: 0,
  };
}

function advanceTopLevelState(state: ReturnType<typeof createTopLevelState>, char: string): void {
  if (state.escapeNext) {
    state.escapeNext = false;
    return;
  }

  if (state.quote) {
    if (char === "\\") {
      state.escapeNext = true;
      return;
    }
    if (char === state.quote) {
      state.quote = null;
    }
    return;
  }

  if (char === '"' || char === "'") {
    state.quote = char;
    return;
  }

  switch (char) {
    case "(":
      state.parenDepth += 1;
      break;
    case ")":
      state.parenDepth = Math.max(0, state.parenDepth - 1);
      break;
    case "[":
      state.bracketDepth += 1;
      break;
    case "]":
      state.bracketDepth = Math.max(0, state.bracketDepth - 1);
      break;
    case "{":
      state.braceDepth += 1;
      break;
    case "}":
      state.braceDepth = Math.max(0, state.braceDepth - 1);
      break;
  }
}

function isTopLevelState(state: ReturnType<typeof createTopLevelState>): boolean {
  return (
    state.quote == null &&
    state.parenDepth === 0 &&
    state.bracketDepth === 0 &&
    state.braceDepth === 0
  );
}

function getTextUntilPosition(model: Monaco.editor.ITextModel, position: Monaco.Position): string {
  return model.getValueInRange({
    startLineNumber: 1,
    startColumn: 1,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
  });
}

function getCurrentEntryText(textUntilCursor: string): string {
  const state = createTopLevelState();
  let entryStartIndex = 0;

  for (let index = 0; index < textUntilCursor.length; index += 1) {
    const char = textUntilCursor[index];
    if (char === "\n" && isTopLevelState(state)) {
      entryStartIndex = index + 1;
      continue;
    }
    advanceTopLevelState(state, char);
  }

  return textUntilCursor.slice(entryStartIndex);
}

function getKeywordPrefix(entryTextUntilCursor: string): string | null {
  const state = createTopLevelState();
  let lastTopLevelCommaIndex = -1;
  let lastTopLevelColonIndex = -1;

  for (let index = 0; index < entryTextUntilCursor.length; index += 1) {
    const char = entryTextUntilCursor[index];
    if (char === "," && isTopLevelState(state)) {
      lastTopLevelCommaIndex = index;
    } else if (char === ":" && isTopLevelState(state)) {
      lastTopLevelColonIndex = index;
    }
    advanceTopLevelState(state, char);
  }

  if (lastTopLevelColonIndex > lastTopLevelCommaIndex) {
    return null;
  }

  return entryTextUntilCursor.slice(lastTopLevelCommaIndex + 1).trimStart();
}

interface NgDslArgumentContext {
  spec: NGDslRuleSpec;
  currentArgIndex: number;
  currentArgText: string;
  usedNamedArgs: Set<string>;
}

function getArgumentContext(entryTextUntilCursor: string): NgDslArgumentContext | null {
  const trimmedEntry = entryTextUntilCursor.trimStart();
  const openParenIndex = trimmedEntry.indexOf("(");
  if (openParenIndex <= 0) {
    return null;
  }

  const keyword = normalizeNgDslKeyword(trimmedEntry.slice(0, openParenIndex));
  const spec = getNgDslRuleSpec(keyword);
  if (!spec) {
    return null;
  }

  const state = createTopLevelState();
  let insideArgs = false;
  for (let index = openParenIndex; index < trimmedEntry.length; index += 1) {
    const char = trimmedEntry[index];
    if (char === "(" && isTopLevelState(state)) {
      insideArgs = true;
    }
    advanceTopLevelState(state, char);
  }

  if (!insideArgs || state.parenDepth === 0) {
    return null;
  }

  const argsText = trimmedEntry.slice(openParenIndex + 1);
  const segments = splitNgDslTopLevel(argsText, ",", { preserveEmpty: true });
  const currentArgText = segments.at(-1) ?? "";
  const usedNamedArgs = new Set<string>();
  for (const segment of segments.slice(0, -1)) {
    const equalIndex = segment.indexOf("=");
    if (equalIndex < 0) {
      continue;
    }
    const rawKey = segment.slice(0, equalIndex).trim();
    const key = normalizeNgDslParameterName(rawKey) ?? rawKey;
    if (key !== "") {
      usedNamedArgs.add(key);
    }
  }

  return {
    spec,
    currentArgIndex: Math.max(0, segments.length - 1),
    currentArgText,
    usedNamedArgs,
  };
}

function createCompletionRange(
  model: Monaco.editor.ITextModel,
  position: Monaco.Position,
): Monaco.IRange {
  const word = model.getWordUntilPosition(position);
  return {
    startLineNumber: position.lineNumber,
    startColumn: word.startColumn,
    endLineNumber: position.lineNumber,
    endColumn: word.endColumn,
  };
}

function createRuleSnippet(spec: NGDslRuleSpec): string {
  const args: string[] = [];
  let placeholderIndex = 1;

  for (const parameter of spec.parameters) {
    if (parameter.name === "word") {
      args.push(`word="\${${placeholderIndex}:${spec.wordDescription}}"`);
      placeholderIndex += 1;
    } else if (parameter.name === "sites") {
      continue;
    } else if (parameter.name === "bgColor") {
      args.push(`bgColor=\${${placeholderIndex}:red}`);
      placeholderIndex += 1;
    } else if (parameter.name === "label") {
      args.push(`label="\${${placeholderIndex}:注目}"`);
      placeholderIndex += 1;
    } else if (parameter.name === "disabled") {
      args.push(`disabled=\${${placeholderIndex}:false}`);
      placeholderIndex += 1;
    }
  }

  return `${spec.keyword}(${args.join(" ")})`;
}

function createMultilineHighlightSnippet(spec: NGDslRuleSpec): string {
  return `${spec.keyword}(\n  word="\${1:\${spec.wordDescription}}"\n  sites=[\n    \${2:eddibb.cc}\n    \${3:5ch.net}\n  ]\n  bgColor=\${4:red}\n  label="\${5:注目}"\n  disabled=\${6:false}\n)`;
}

function createRuleCompletionItems(
  monaco: MonacoNamespace,
  model: Monaco.editor.ITextModel,
  position: Monaco.Position,
): Monaco.languages.CompletionItem[] {
  const range = createCompletionRange(model, position);
  const items: Monaco.languages.CompletionItem[] = NG_DSL_RULE_SPECS.map((spec) => ({
    label: spec.keyword,
    kind: monaco.languages.CompletionItemKind.Function,
    detail: spec.description,
    documentation: createMarkdown(
      `${spec.keyword}: ${spec.description}\n\n値: ${spec.wordDescription}`,
    ),
    insertText: createRuleSnippet(spec),
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    range,
  }));

  for (const spec of NG_DSL_RULE_SPECS.filter((candidate) =>
    candidate.parameters.some((parameter) => parameter.name === "bgColor"),
  )) {
    items.push({
      label: `${spec.keyword} (複数行)` as string,
      kind: monaco.languages.CompletionItemKind.Snippet,
      detail: `${spec.keyword} の複数行テンプレート`,
      documentation: createMarkdown("sites 配列とハイライト色を複数行で書くテンプレートです。"),
      insertText: createMultilineHighlightSnippet(spec),
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      range,
    });
  }

  return items;
}

function createParameterSnippet(parameter: NGDslParameterSpec): string {
  switch (parameter.name) {
    case "word":
      return 'word="${1:キーワード}"';
    case "sites":
      return "sites=${1:eddibb.cc}";
    case "bgColor":
      return "bgColor=${1:red}";
    case "label":
      return 'label="${1:注目}"';
    case "disabled":
      return "disabled=true";
  }
}

function createParameterCompletionItems(
  monaco: MonacoNamespace,
  model: Monaco.editor.ITextModel,
  position: Monaco.Position,
  context: NgDslArgumentContext,
): Monaco.languages.CompletionItem[] {
  const range = createCompletionRange(model, position);
  const currentKeyMatch = context.currentArgText.match(/^\s*(\w+)\s*=/);
  const currentKey = currentKeyMatch?.[1]
    ? (normalizeNgDslParameterName(currentKeyMatch[1]) ?? currentKeyMatch[1])
    : null;
  const items: Monaco.languages.CompletionItem[] = [];

  for (const parameter of context.spec.parameters) {
    if (currentKey !== parameter.name && context.usedNamedArgs.has(parameter.name)) {
      continue;
    }

    items.push({
      label: parameter.name,
      kind: monaco.languages.CompletionItemKind.Property,
      detail: parameter.detail,
      documentation: createMarkdown(parameter.documentation),
      insertText: createParameterSnippet(parameter),
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      range,
    });
  }

  if (!context.usedNamedArgs.has("sites") || currentKey === "sites") {
    items.push({
      label: "sites=[...]",
      kind: monaco.languages.CompletionItemKind.Snippet,
      detail: "複数サイトテンプレート",
      documentation: createMarkdown("複数のドメインや板を sites 配列で指定します。"),
      insertText: "sites=[\n  ${1:eddibb.cc}\n  ${2:5ch.net}\n]",
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      range,
    });
  }

  return items;
}

function createColorCompletionItems(
  monaco: MonacoNamespace,
  model: Monaco.editor.ITextModel,
  position: Monaco.Position,
): Monaco.languages.CompletionItem[] {
  const range = createCompletionRange(model, position);
  return [
    ...NG_HIGHLIGHT_COLOR_PRESET_ITEMS.map((preset) => ({
      label: preset.name,
      kind: monaco.languages.CompletionItemKind.Color,
      detail: `${preset.hex} / ${preset.description}`,
      documentation: createMarkdown(`${preset.description}\n\n${preset.name}: ${preset.hex}`),
      insertText: preset.name,
      range,
    })),
    {
      label: "#rrggbb",
      kind: monaco.languages.CompletionItemKind.Snippet,
      detail: "16進カラーコード",
      documentation: createMarkdown(
        "予約色以外の色は #ffcdd2 のような 16 進カラーコードで指定します。",
      ),
      insertText: "#${1:ffcdd2}",
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      range,
    },
  ];
}

function buildSignatureLabel(spec: NGDslRuleSpec): string {
  return `${spec.keyword}(${spec.parameters.map((parameter) => parameter.name).join(", ")})`;
}

export function ensureNgDslLanguage(monaco: MonacoNamespace): void {
  if (ngDslRegistered) {
    return;
  }

  ngDslRegistered = true;
  monaco.languages.register({ id: NG_DSL_LANGUAGE_ID });

  const keywordPattern = NG_DSL_RULE_SPECS.flatMap((spec) => [
    spec.keyword,
    ...(spec.aliases ?? []),
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
        [/^\s*\/\/.*/, "comment"],
        [/^\s*(?:attachName|expireDate|ignoreResNumber|ignoreNgType):/, "keyword"],
        [new RegExp(`\\b(?:${keywordPattern})\\b`), "type.identifier"],
        [/\b(?:word|sites|scope|bgColor|label|disabled)\b(?=\s*=)/, "attribute.name"],
        [new RegExp(`\\b(?:${colorPattern})\\b`), "string"],
        [/#(?:[0-9a-fA-F]{6})\b/, "number.hex"],
        [/\b\d{4}\/\d{1,2}\/\d{1,2}\b/, "number"],
        [/\$\[|\]\$|[()[\]{}]/, "delimiter.bracket"],
        [/:|,|=/, "delimiter"],
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
    brackets: [
      ["(", ")"],
      ["[", "]"],
      ["{", "}"],
    ],
    autoClosingPairs: [
      { open: "(", close: ")" },
      { open: "[", close: "]" },
      { open: "{", close: "}" },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
    surroundingPairs: [
      { open: "(", close: ")" },
      { open: "[", close: "]" },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
  });

  monaco.languages.registerCompletionItemProvider(NG_DSL_LANGUAGE_ID, {
    triggerCharacters: ["(", ",", "=", "[", '"'],
    provideCompletionItems(model, position) {
      const entryTextUntilCursor = getCurrentEntryText(getTextUntilPosition(model, position));
      const argumentContext = getArgumentContext(entryTextUntilCursor);

      if (argumentContext) {
        const currentKeyMatch = argumentContext.currentArgText.match(/^\s*(\w+)\s*=/);
        const currentKey = currentKeyMatch?.[1]
          ? normalizeNgDslParameterName(currentKeyMatch[1])
          : null;

        if (
          currentKey === "bgColor" &&
          /^\s*\w+\s*=\s*[#\w-]*$/i.test(argumentContext.currentArgText)
        ) {
          return {
            suggestions: createColorCompletionItems(monaco, model, position),
          };
        }

        return {
          suggestions: createParameterCompletionItems(monaco, model, position, argumentContext),
        };
      }

      const keywordPrefix = getKeywordPrefix(entryTextUntilCursor);
      if (keywordPrefix == null) {
        return { suggestions: [] };
      }

      return {
        suggestions: createRuleCompletionItems(monaco, model, position),
      };
    },
  });

  monaco.languages.registerSignatureHelpProvider(NG_DSL_LANGUAGE_ID, {
    signatureHelpTriggerCharacters: ["(", ",", "="],
    provideSignatureHelp(model, position) {
      const entryTextUntilCursor = getCurrentEntryText(getTextUntilPosition(model, position));
      const argumentContext = getArgumentContext(entryTextUntilCursor);
      if (!argumentContext) {
        return null;
      }

      const currentKeyMatch = argumentContext.currentArgText.match(/^\s*(\w+)\s*=/);
      const currentKey = currentKeyMatch?.[1]
        ? (normalizeNgDslParameterName(currentKeyMatch[1]) ?? currentKeyMatch[1])
        : null;
      let activeParameter = argumentContext.currentArgIndex;
      if (currentKey) {
        const keyedIndex = argumentContext.spec.parameters.findIndex(
          (parameter) => parameter.name === currentKey,
        );
        if (keyedIndex >= 0) {
          activeParameter = keyedIndex;
        }
      }

      activeParameter = Math.min(
        Math.max(activeParameter, 0),
        Math.max(0, argumentContext.spec.parameters.length - 1),
      );

      return {
        value: {
          activeSignature: 0,
          activeParameter,
          signatures: [
            {
              label: buildSignatureLabel(argumentContext.spec),
              documentation: createMarkdown(
                `${argumentContext.spec.description}\n\n値: ${argumentContext.spec.wordDescription}`,
              ),
              parameters: argumentContext.spec.parameters.map((parameter) => ({
                label: parameter.name,
                documentation: createMarkdown(parameter.documentation),
              })),
            },
          ],
        },
        dispose: () => {},
      };
    },
  });
}
