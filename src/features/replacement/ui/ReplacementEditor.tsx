import { parseReplacementDsl } from "@chlen/chlib";
import { useMemo } from "react";
import { DslEditor, DslHelpSnippet } from "src/view/browser/ui/DslEditor";

import {
  ensureReplacementDslLanguage,
  REPLACEMENT_DSL_LANGUAGE_ID,
  tokenizeReplacementDslLine,
} from "./replacementDslMonaco";

export const REPLACEMENT_DSL_EXAMPLE = `// 本文の文字列置換。方式を省略するとliteralです
replace body:
  from "ｗｗｗ"
  to "（笑）"

// regexではキャプチャ参照を使えます
replace body regex:
  from "ID:([A-Za-z0-9]+)"
  to "ID:$1"`;

export const REPLACEMENT_LINE_EXAMPLE = `// BEアイコンのsssp://表記も、この画像URLで指定できます
remove body line first:
  equals "https://img.5ch.io/ico/001.gif"

// URL・タイトルの条件を付けられます
replace body:
  from "消したい語"
  to ""
  when title contains "実況"
  unless url contains "example.com"`;

export function ReplacementDslHelpSnippet({ code }: { code: string }) {
  return <DslHelpSnippet code={code} tokenize={tokenizeReplacementDslLine} />;
}

interface ReplacementEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export function ReplacementEditor({ value, onChange }: ReplacementEditorProps) {
  const parsed = useMemo(() => parseReplacementDsl(value), [value]);
  return (
    <DslEditor
      value={value}
      onChange={onChange}
      label="置換ルール"
      languageId={REPLACEMENT_DSL_LANGUAGE_ID}
      registerLanguage={ensureReplacementDslLanguage}
      diagnostics={parsed.diagnostics}
    />
  );
}
