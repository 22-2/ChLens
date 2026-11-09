import React, { useId } from "react";
import { Dialog } from "src/view/browser/ui/Dialog";
import type { WriteWarning } from "src/view/browser/utils/write-warning";

/** URLの追跡パラメータ警告のカテゴリ名。除去して投稿する選択肢を出す条件に使う。 */
const URL_TRACKING_WARNING_CATEGORY = "URLの追跡パラメータ";

interface WriteWarningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  container?: HTMLElement;
  warnings: readonly WriteWarning[];
  onRemoveTrackingParametersAndSubmit: () => void;
  onSubmitAnyway: () => void;
}

/** 投稿前に、個人情報やURLの追跡パラメータが含まれている可能性を知らせる確認ダイアログ。 */
export const WriteWarningDialog: React.FC<WriteWarningDialogProps> = ({
  open,
  onOpenChange,
  container,
  warnings,
  onRemoveTrackingParametersAndSubmit,
  onSubmitAnyway,
}) => {
  const descriptionId = useId();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal container={container}>
        <Dialog.Overlay className="browser-dialog-overlay" />
        <Dialog.Content
          className="browser-dialog-content write-panel__warning-dialog"
          aria-describedby={descriptionId}
        >
          <Dialog.Title className="browser-dialog-title">投稿内容を確認してください</Dialog.Title>
          <Dialog.Description id={descriptionId} className="browser-dialog-description">
            公開したくない情報や、共有元の計測に使われるURLパラメータが含まれている可能性があります。
            投稿前に内容を確認してください。
          </Dialog.Description>
          <ul className="write-panel__warning-list">
            {warnings.map((warning) => (
              <li key={warning.category}>
                <strong>{warning.category}</strong>: {warning.reason}
              </li>
            ))}
          </ul>
          <div className="write-panel__error-dialog-actions">
            <Dialog.Close asChild>
              <button type="button" className="write-panel__btn write-panel__btn--secondary">
                内容を見直す
              </button>
            </Dialog.Close>
            {warnings.some((warning) => warning.category === URL_TRACKING_WARNING_CATEGORY) && (
              <button
                type="button"
                className="write-panel__btn write-panel__btn--secondary"
                onClick={onRemoveTrackingParametersAndSubmit}
              >
                URLパラメータを除去して投稿
              </button>
            )}
            <button
              type="button"
              className="write-panel__btn write-panel__btn--primary"
              onClick={onSubmitAnyway}
            >
              無視して投稿
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
