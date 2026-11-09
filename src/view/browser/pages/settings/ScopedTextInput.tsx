import { useState } from "react";
import { TextControl } from "src/view/browser/ui/FormControls";

/** 入力途中は外部通知で文字を戻さず、確定後は他画面からの設定変更も反映する。 */
export function ScopedTextInput({
  id,
  value,
  ariaLabel,
  onSave,
}: {
  id: string;
  value: string;
  ariaLabel?: string;
  onSave: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  return (
    <TextControl
      id={id}
      ariaLabel={ariaLabel}
      value={editing ? draft : value}
      onFocus={() => {
        setDraft(value);
        setEditing(true);
      }}
      onValueChange={setDraft}
      onBlur={() => {
        setEditing(false);
        onSave(draft);
      }}
    />
  );
}
