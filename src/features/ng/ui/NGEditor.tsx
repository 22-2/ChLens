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

export const NG_DSL_EXAMPLE = `// 動作＋対象＋条件種別の見出しに、値をインデントして記述します
hide body contains:
  荒らし
  spam

hide id contains:
  abc123

// スレ一覧の末尾へ薄く表示し、divider内へ折りたたみます
demote title contains:
  勢いのない定期スレ

hide url regex:
  "https?://(?:x|twitter)\\.com/.+"

// 名前欄・メール欄・SLIPも対象にできます
hide name contains:
  名無しの荒らし

hide slip contains:
  ワッチョイ

// 数値条件は「対象 >= 数値:」で書きます
hide reply-count >= 5:

hide anchor-count >= 3:

// hideの消し方は「NGレスの表示方式」設定に従います
// collapseは設定にかかわらず折りたたみ、クリックで表示できます
// （hard-ngはhide、soft-ngはcollapseの別名です）
collapse body contains:
  宣伝

// ルールを一時的に止めるときはdisabled=trueを付けます
hide title contains disabled=true:
  雑談`;

export const NG_DSL_MULTILINE_EXAMPLE = `// 同じブロックの条件はORで判定します
highlight title contains color=red label=注目 sites=[eddibb.cc 5ch.io]:
  google
  ぐーぐる
  microsoft

// 「注目」を含み、かつレス数が100以上のスレッドだけをハイライトします
highlight title contains color=red label=注目:
  注目
and res-count >= 100:

hide body regex:
  "(imgur\\.com/.+?){15}"`;

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
  `("(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*')|(\\/\\/.*$|^\\s*#.*$)|(\\b(?:${actionPattern}|${operatorPattern})\\b)|(\\b(?:${targetPattern})\\b)|(\\b(?:${matcherPattern})\\b)|(\\b(?:${optionPattern})\\b(?=\\s*=))|(#[0-9a-fA-F]{3,8}\\b)`,
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
