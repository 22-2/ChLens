import React, { useId } from "react";
import type { ThreadTitleNgDialogController } from "src/view/browser/hooks/use-thread-title-ng-dialog";

interface Props {
  controller: ThreadTitleNgDialogController;
}

/** スレタイNG登録の共通ダイアログ。登録状態は呼び出し元のcontrollerへ委譲する。 */
export const ThreadTitleNgDialog: React.FC<Props> = ({ controller }) => {
  const titleId = useId();
  if (!controller.thread) {
    return null;
  }

  return (
    <div className="bookmark-root-dialog thread-ng-dialog" role="presentation">
      <button
        type="button"
        className="bookmark-root-dialog__backdrop"
        aria-label="スレタイNG登録を閉じる"
        onClick={controller.close}
      />
      <div
        className="bookmark-root-dialog__panel thread-ng-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="bookmark-root-dialog__header">
          <div>
            <p className="bookmark-root-dialog__eyebrow">Thread NG</p>
            <h2 id={titleId}>スレタイをNG登録</h2>
          </div>
          <button
            type="button"
            className="bookmark-root-dialog__close"
            onClick={controller.close}
            disabled={controller.saving}
          >
            閉じる
          </button>
        </div>
        <p className="bookmark-root-dialog__description">
          NGに登録するスレタイを編集してください。登録後はこのタイトルを含むスレッドが非表示になります。
        </p>
        <label className="thread-ng-dialog__field">
          <span>スレタイ</span>
          <textarea
            value={controller.draft}
            onChange={(event) => controller.setDraft(event.target.value)}
            rows={3}
            autoFocus
          />
        </label>
        {controller.error && <p className="bookmark-root-dialog__error">{controller.error}</p>}
        <div className="bookmark-root-dialog__actions">
          <button
            type="button"
            className="bookmark-root-dialog__button"
            onClick={controller.close}
            disabled={controller.saving}
          >
            キャンセル
          </button>
          <button
            type="button"
            className="bookmark-root-dialog__button bookmark-root-dialog__button--primary"
            onClick={() => void controller.submit()}
            disabled={controller.saving || !controller.draft.trim()}
          >
            {controller.saving ? "登録中..." : "登録"}
          </button>
        </div>
      </div>
    </div>
  );
};
