import { validateRuleDsl } from "@chlen/chlib";
import { useMemo } from "react";
import { NG_DSL_LANGUAGE_ID, RULE_DSL_LANGUAGE_DEFINITION } from "src/core/ng/ngDsl";
import {
  RULE_ACTION_CATALOG,
  RULE_OPTION_CATALOG,
  RULE_TARGET_CATALOG,
} from "src/core/ng/rules/catalog";
import { ensureNgDslLanguage } from "src/features/ng/ui/ngDslMonaco";
import { DslEditor, DslHelpSnippet, type DslSnippetToken } from "src/view/browser/ui/DslEditor";

export interface NGEditorProps {
  value: string; // DSL文字列
  onChange: (value: string) => void;
}

export const NG_DSL_EXAMPLE = `// 一覧は「どれかに一致」（OR）です
hide:
  when body contains:
    "荒らし"
    "spam"

hide:
  when id contains "abc123"

// 一覧の末尾に折りたたんで表示します
demote:
  when title contains "定期スレ"

// collapseは表示方式の設定にかかわらず折りたたみます
collapse:
  when body contains "宣伝"

hide:
  when anchor-count >= 10`;

export const NG_DSL_MULTILINE_EXAMPLE = `// 複数の条件は「すべて満たす」（AND）です
highlight:
  color blue
  label "注目"
  sites "example.com"
  when title contains:
    "google"
    "ぐーぐる"
    "microsoft"
  when res-count >= 10
  unless title contains "除外"

// 正規表現は引用し、必要ならflagsを付けます
hide:
  when body regex "(imgur\\.com/.+?){15}" flags=i

// 複数の適用先も一覧にできます
hide:
  sites:
    "example.com"
    "bbs.example.org"
  disabled true
  when name contains "名無し"`;

interface NGDslHelpSnippetProps {
  code: string;
}

// Monacoの副作用を防ぐため、記述例の表示はEditorコンポーネントを使わずに自前で実装する
type NgDslToken = DslSnippetToken;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const actionPattern = RULE_ACTION_CATALOG.flatMap((entry) => [entry.name, ...(entry.aliases ?? [])])
  .map(escapeRegExp)
  .join("|");
const targetPattern = RULE_TARGET_CATALOG.flatMap((entry) => [entry.name, ...(entry.aliases ?? [])])
  .map(escapeRegExp)
  .join("|");
const operatorPattern = RULE_DSL_LANGUAGE_DEFINITION.operators.map(escapeRegExp).join("|");
const matcherPattern = "contains|regex";
const optionPattern = RULE_OPTION_CATALOG.flatMap((entry) => [entry.name, ...(entry.aliases ?? [])])
  .map(escapeRegExp)
  .join("|");

const NG_DSL_TOKEN_REGEX = new RegExp(
  `("(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*')|(\\/\\/.*$|^\\s*#.*$)|(\\b(?:${actionPattern}|${operatorPattern})\\b)|(\\b(?:${targetPattern})\\b)|(\\b(?:${matcherPattern})\\b)|(^\\s*(?:${optionPattern})\\b)|(#[0-9a-fA-F]{3,8}\\b)`,
  "g",
);

function tokenizeNgDslLine(line: string): NgDslToken[] {
  const tokens: NgDslToken[] = [];
  let cursor = 0;

  for (const match of line.matchAll(NG_DSL_TOKEN_REGEX)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      tokens.push({ type: "plain", text: line.slice(cursor, index) });
    }

    const tokenText = match[0];
    if (match[1]) {
      tokens.push({ type: "string", text: tokenText });
    } else if (match[2]) {
      tokens.push({ type: "comment", text: tokenText });
      cursor = index + tokenText.length;
      break;
    } else if (match[3] || match[4] || match[5]) {
      tokens.push({ type: "rule", text: tokenText });
    } else if (match[6]) {
      tokens.push({ type: "param", text: tokenText });
    } else if (match[7]) {
      tokens.push({ type: "color", text: tokenText });
    } else {
      tokens.push({ type: "plain", text: tokenText });
    }

    cursor = index + tokenText.length;
  }

  if (cursor < line.length) {
    tokens.push({ type: "plain", text: line.slice(cursor) });
  }

  if (tokens.length === 0) {
    tokens.push({ type: "plain", text: "" });
  }

  return tokens;
}

export function NGDslHelpSnippet({ code }: NGDslHelpSnippetProps) {
  return <DslHelpSnippet code={code} tokenize={tokenizeNgDslLine} />;
}

export function NGEditor({ value, onChange }: NGEditorProps) {
  const parsed = useMemo(() => validateRuleDsl(value), [value]);
  return (
    <DslEditor
      value={value}
      onChange={onChange}
      label="NGルール"
      languageId={NG_DSL_LANGUAGE_ID}
      registerLanguage={ensureNgDslLanguage}
      diagnostics={parsed.diagnostics}
    />
  );
}
