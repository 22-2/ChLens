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

/** 例を目的別に分け、最初から正規表現やサイト指定を覚えなくても使えるようにする。 */
export const NG_DSL_EXAMPLES = [
  {
    title: "本文の言葉で非表示にする",
    description:
      "hideは非表示、whenは「当てはまる場合」、bodyは本文、containsは「含む」です。文字列は引用符で囲み、条件行は半角スペース2つで下げます。",
    code: `hide:
  when body contains "宣伝"`,
  },
  {
    title: "複数のIDをまとめて指定する",
    description:
      "contains:の次の行からIDを1つずつ引用符で囲み、さらに半角スペース2つ下げます。どれか1つのIDを含むレスが対象です。IDは実際のものに置き換えてください。",
    code: `hide:
  when id contains:
    "sample001"
    "sample002"
    "sample003"`,
  },
  {
    title: "本文の条件に例外を付ける",
    description:
      "「宣伝」を含むレスを非表示にしますが、IDにsample001を含むレスは残します。unlessは「当てはまる場合は除外する」です。",
    code: `hide:
  when body contains "宣伝"
  unless id contains "sample001"`,
  },
  {
    title: "unlessだけで書く",
    description:
      "whenなしでも使えます。この例は「保存用」を含まない本文のレスをすべて非表示にします。一部の対象だけに絞る条件ではないので、広い範囲に適用される点に注意してください。複数の値を並べる場合は、どれにも一致しない対象に適用します。IDなど判定する値がない場合は適用しません。",
    code: `hide:
  unless body contains "保存用"`,
  },
  {
    title: "非表示にせず折りたたむ",
    description:
      "collapseはクリックで表示できるように折りたたみます。タイトル条件はスレ一覧の末尾のグループへ、本文やIDの条件はレスをその場で折りたたみます。",
    code: `collapse:
  when title contains "定期スレ"

collapse:
  when body contains "宣伝"`,
  },
  {
    title: "複数の条件を満たすスレを強調する",
    description:
      "タイトルに「実況」を含み、レス数が10以上のスレを青色で強調します。条件を複数書くと、すべて満たす場合に適用します。colorは色、labelはスレ一覧に表示する名前です。",
    code: `highlight:
  color blue
  label "注目"
  when title contains "実況"
  when res-count >= 10`,
  },
  {
    title: "サイト指定・一時無効化・正規表現",
    description:
      "sitesで適用先を絞れます。example.comは架空のサイトなので実際のサイトへ変更してください。disabled trueはルールを一時的に無効にします。regexは正規表現で、例では「宣伝」を3回以上繰り返す本文に一致します。",
    code: `hide:
  sites "example.com"
  disabled true
  when body regex "(宣伝){3,}"`,
  },
] as const;

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
