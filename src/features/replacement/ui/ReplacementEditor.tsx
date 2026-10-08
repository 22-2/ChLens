import { parseReplacementDsl } from "@chlen/chlib";
import { useMemo } from "react";
import { Alert } from "src/view/browser/ui/Alert";
import { TextareaField } from "src/view/browser/ui/FormControls";

interface ReplacementEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export function ReplacementEditor({ value, onChange }: ReplacementEditorProps) {
  const parsed = useMemo(() => parseReplacementDsl(value), [value]);
  return (
    <div>
      <TextareaField
        id="settings-replace_str_txt"
        label="置換ルール"
        description="名前（name）・メール（mail）・日付欄（date）・本文（body）・全項目（all）を指定できます。保存後に読み込むレスへ順番に適用します。"
        value={value}
        rows={12}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      {parsed.diagnostics.length > 0 && (
        <Alert variant="danger" title="置換ルールを保存できません">
          <ul>
            {parsed.diagnostics.map((diagnostic, index) => (
              <li key={index}>
                {diagnostic.line}行{diagnostic.column}列: {diagnostic.message}
              </li>
            ))}
          </ul>
          最後に保存できたルールを引き続き使います。
        </Alert>
      )}
      <details>
        <summary>置換ルールの書き方</summary>
        <pre>
          {
            'replace body:\n  from "ｗｗｗ"\n  to "（笑）"\n\nreplace body regex:\n  from "ID:([A-Za-z0-9]+)"\n  to "ID:$1"\n  when title contains "実況"\n  unless url contains "example.com"\n\nremove body line first:\n  equals "消したい先頭行"'
          }
        </pre>
        <p>
          方式を省略すると文字列置換です。既定ではすべて置換し、大文字小文字を区別します。flags=i
          は大小文字を無視して最初の一致、flags=gi はすべての一致を置換します。to ""
          で空文字に置換できます。
        </p>
        <p>
          remove body line は一致する行をすべて削除し、first を付けると先頭行だけを判定します。when
          / unless は url または title に contains / equals / regex
          を指定し、すべての条件を満たす場合に適用します。
        </p>
      </details>
    </div>
  );
}
