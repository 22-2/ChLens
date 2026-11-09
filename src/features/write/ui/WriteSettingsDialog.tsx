import React, { useId } from "react";
import { Dialog } from "src/view/browser/ui/Dialog";
import { SettingRow, TextControl } from "src/view/browser/ui/FormControls";
import { WRITE_SETTING_COPY } from "src/view/browser/utils/write-settings";

interface WriteSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  container?: HTMLElement;
  name: string;
  mail: string;
  onNameChange: (name: string) => void;
  onMailChange: (mail: string) => void;
  disabled: boolean;
}

/** 書き込みの名前・メールの既定値を、板のすべてのスレッドで共有する設定として編集するダイアログ。 */
export const WriteSettingsDialog: React.FC<WriteSettingsDialogProps> = ({
  open,
  onOpenChange,
  container,
  name,
  mail,
  onNameChange,
  onMailChange,
  disabled,
}) => {
  const descriptionId = useId();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal container={container}>
        <Dialog.Overlay className="browser-dialog-overlay" />
        <Dialog.Content
          className="browser-dialog-content write-panel__settings-dialog"
          aria-describedby={descriptionId}
        >
          <Dialog.Title className="browser-dialog-title">書き込み設定</Dialog.Title>
          <Dialog.Description id={descriptionId} className="browser-dialog-description">
            <strong>この板のすべてのスレッドで共有されます。</strong> 変更はすぐに反映されます。
          </Dialog.Description>
          <div className="write-panel__settings-list">
            <SettingRow
              htmlFor="write-setting-name"
              label={WRITE_SETTING_COPY.default_name.title}
              description={WRITE_SETTING_COPY.default_name.description}
              layout="stacked"
            >
              <TextControl
                id="write-setting-name"
                value={name}
                onValueChange={onNameChange}
                disabled={disabled}
                placeholder="名無し"
              />
            </SettingRow>
            <SettingRow
              htmlFor="write-setting-mail"
              label={WRITE_SETTING_COPY.default_mail.title}
              description={WRITE_SETTING_COPY.default_mail.description}
              layout="stacked"
            >
              <TextControl
                id="write-setting-mail"
                value={mail}
                onValueChange={onMailChange}
                disabled={disabled}
              />
            </SettingRow>
          </div>
          <div className="write-panel__settings-actions">
            <Dialog.Close asChild>
              <button type="button" className="write-panel__btn write-panel__btn--secondary">
                閉じる
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
