import { Settings } from "lucide-react";
import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { useBottomPanel } from "src/view/browser/hooks/use-bottom-panel";
import { useConfigBooleanSetting } from "src/view/browser/hooks/use-config-boolean-setting";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";
import { useWrite } from "src/view/browser/hooks/use-write";
import { Dialog } from "src/view/browser/ui/Dialog";
import { CheckboxField } from "src/view/browser/ui/FormControls";

const WRITE_SUBMIT_CTRL_ENTER_KEY = "write_submit_ctrl_enter";
const WRITE_CLOSE_PANEL_AFTER_SUBMIT_KEY = "write_close_panel_after_submit";

export const WritePanelContent: React.FC = () => {
  const { currentPage } = useTabStore();
  const { writePanelInsertRequest, clearWritePanelInsertRequest, closePanel } = useBottomPanel();
  const threadUrl = currentPage.type === "thread" ? currentPage.threadUrl : "";
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const errorDialogDescriptionId = useId();
  const settingsDialogDescriptionId = useId();
  const [dialogPortalContainer, setDialogPortalContainer] = useState<HTMLElement | null>(null);
  const [isErrorDialogOpen, setIsErrorDialogOpen] = useState(false);
  // 変更理由: 書き込み中の入力欄を増やさず、書き込みに関する設定を
  // パネル内の歯車モーダルへまとめて、必要な時だけ変更できるようにする。
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
  const { value: submitWithCtrlEnter, setValue: setSubmitWithCtrlEnter } = useConfigBooleanSetting(
    WRITE_SUBMIT_CTRL_ENTER_KEY,
  );
  const { value: closePanelAfterSubmit, setValue: setClosePanelAfterSubmit } =
    useConfigBooleanSetting(WRITE_CLOSE_PANEL_AFTER_SUBMIT_KEY);

  const {
    name,
    mail,
    sage,
    message,
    status,
    statusText,
    canSubmit,
    iframeRef,
    setName,
    setMail,
    setSage,
    setMessage,
    submit,
    handleSubmit,
    handleRetry,
  } = useWrite(threadUrl);

  const isSubmitting = status === "submitting";
  const isConfirm = status === "confirm";
  const writeErrorMessage = statusText || "書き込みに失敗しました";

  useEffect(() => {
    // テーマトークンは `.browser-shell[data-theme]` にスコープされるため、
    // body直下のPortalではダークテーマのsurface/textを継承できない。
    setDialogPortalContainer(document.querySelector<HTMLElement>(".browser-shell"));
  }, []);

  useEffect(() => {
    // 変更理由: エラー状態とDialogの開閉を同じ値で管理すると、Dialogを閉じても
    // statusがerrorのまま再表示されるため、閉じた後も既存の再入力操作を使えるよう分離する。
    setIsErrorDialogOpen(status === "error");
  }, [status, statusText]);

  useEffect(() => {
    if (status !== "success" || !closePanelAfterSubmit) {
      return;
    }

    // 変更理由: 投稿成功を受け取った後だけ閉じることで、通信失敗や確認画面の途中で
    // 入力内容を隠さず、設定をONにした利用者の連続投稿だけを短くできる。
    closePanel();
  }, [closePanel, closePanelAfterSubmit, status]);

  useEffect(() => {
    if (!writePanelInsertRequest) {
      return;
    }

    const separator = message === "" || message.endsWith("\n") ? "" : "\n";
    // 変更理由: 右クリックからの返信文は現在の下書きへ自然に追記し、
    // 毎回置き換えるより「開いて貼り付けた」感覚に近い挙動へ揃える。
    const nextMessage = `${message}${separator}${writePanelInsertRequest.text}`;
    setMessage(nextMessage);
    clearWritePanelInsertRequest(writePanelInsertRequest.id);

    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.focus();
    const caretPosition = nextMessage.length;
    textarea.setSelectionRange(caretPosition, caretPosition);
  }, [clearWritePanelInsertRequest, message, setMessage, writePanelInsertRequest]);

  const handleTextareaKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Escape") {
        // IME確定など他のEscapeと区別せず、素直にパネルを閉じる。
        closePanel();
        return;
      }

      if (
        !submitWithCtrlEnter ||
        isSubmitting ||
        !canSubmit ||
        e.key !== "Enter" ||
        !(e.ctrlKey || e.metaKey)
      ) {
        return;
      }

      // textarea の改行より投稿を優先し、送信ショートカットとして一貫動作させる。
      e.preventDefault();
      void submit();
    },
    [canSubmit, closePanel, isSubmitting, submit, submitWithCtrlEnter],
  );

  const handleSubmitWithCtrlEnterChange = useCallback(
    (checked: boolean) => {
      setSubmitWithCtrlEnter(checked);
    },
    [setSubmitWithCtrlEnter],
  );

  const handleSageChange = useCallback(
    (checked: boolean) => {
      setSage(checked);
    },
    [setSage],
  );

  const handleClosePanelAfterSubmitChange = useCallback(
    (checked: boolean) => {
      setClosePanelAfterSubmit(checked);
    },
    [setClosePanelAfterSubmit],
  );

  return (
    <div className="write-panel">
      <form
        className={`write-panel__form${isConfirm ? " write-panel__form--confirm" : ""}`}
        onSubmit={handleSubmit}
      >
        {isConfirm && (
          <div className="write-panel__confirm-bar">
            <span>{statusText}</span>
            <button
              type="button"
              className="write-panel__btn write-panel__btn--secondary"
              onClick={handleRetry}
            >
              戻る
            </button>
          </div>
        )}
        {!isConfirm && (
          <>
            <div className="write-panel__header-row">
              <label className="write-panel__field-group">
                <span className="write-panel__field-label">名前</span>
                <input
                  className="write-panel__input"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isSubmitting}
                  placeholder="名無し"
                />
              </label>
              <label className="write-panel__field-group write-panel__field-group--grow">
                <span className="write-panel__field-label">メール</span>
                <input
                  className="write-panel__input"
                  type="text"
                  value={sage ? "sage" : mail}
                  onChange={(e) => setMail(e.target.value)}
                  disabled={isSubmitting || sage}
                  placeholder=""
                />
              </label>
              <button
                type="button"
                className="write-panel__settings-btn"
                onClick={() => setIsSettingsDialogOpen(true)}
                disabled={isSubmitting}
                title="書き込み設定"
                aria-label="書き込み設定"
              >
                <Settings size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="write-panel__body-row">
              <textarea
                ref={textareaRef}
                className="write-panel__textarea"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleTextareaKeyDown}
                disabled={isSubmitting}
                placeholder={threadUrl ? "本文を入力..." : "スレッドを開いてから書き込んでください"}
              />
              <div className="write-panel__side">
                <button
                  type="submit"
                  className="write-panel__btn write-panel__btn--primary"
                  disabled={!canSubmit}
                >
                  書き込む
                </button>
                {status === "error" && (
                  <button
                    type="button"
                    className="write-panel__btn write-panel__btn--secondary"
                    onClick={handleRetry}
                  >
                    再入力
                  </button>
                )}
                {statusText && status !== "error" && (
                  <span
                    className={`write-panel__status write-panel__status--${status}`}
                    title={statusText}
                  >
                    {statusText}
                  </span>
                )}
              </div>
            </div>
          </>
        )}
        <iframe
          ref={iframeRef}
          className={`write-panel__iframe${isConfirm ? " write-panel__iframe--visible" : ""}`}
          title={isConfirm ? "書き込み確認" : "write-iframe"}
          aria-hidden={!isConfirm}
        />
      </form>
      <Dialog.Root open={isSettingsDialogOpen} onOpenChange={setIsSettingsDialogOpen}>
        <Dialog.Portal container={dialogPortalContainer ?? undefined}>
          <Dialog.Overlay className="browser-dialog-overlay" />
          <Dialog.Content
            className="browser-dialog-content write-panel__settings-dialog"
            aria-describedby={settingsDialogDescriptionId}
          >
            <Dialog.Title className="browser-dialog-title">書き込み設定</Dialog.Title>
            <Dialog.Description
              id={settingsDialogDescriptionId}
              className="browser-dialog-description"
            >
              書き込みパネルの操作と投稿後の動作を設定します。
            </Dialog.Description>
            <div className="write-panel__settings-list">
              <CheckboxField
                id="write-setting-submit-ctrl-enter"
                label="Ctrl+Enterで書き込む"
                description="本文入力中にCtrl+Enter（Macは⌘+Enter）で投稿します。"
                checked={submitWithCtrlEnter}
                onCheckedChange={handleSubmitWithCtrlEnterChange}
              />
              <CheckboxField
                id="write-setting-sage"
                label="sageで書き込む"
                description="ONにすると、メール欄へsageを自動設定して投稿します。"
                checked={sage}
                onCheckedChange={handleSageChange}
              />
              <CheckboxField
                id="write-setting-close-panel"
                label="レス後に書き込みパネルを閉じる"
                description="投稿が成功したときだけ、下部の書き込みパネルを閉じます。"
                checked={closePanelAfterSubmit}
                onCheckedChange={handleClosePanelAfterSubmitChange}
              />
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
      <Dialog.Root
        open={status === "error" && isErrorDialogOpen}
        onOpenChange={setIsErrorDialogOpen}
      >
        <Dialog.Portal container={dialogPortalContainer ?? undefined}>
          <Dialog.Overlay className="browser-dialog-overlay" />
          <Dialog.Content
            className="browser-dialog-content write-panel__error-dialog"
            aria-describedby={errorDialogDescriptionId}
          >
            <Dialog.Title className="browser-dialog-title">書き込みに失敗しました</Dialog.Title>
            <Dialog.Description
              id={errorDialogDescriptionId}
              className="browser-dialog-description"
            >
              サーバーから返されたエラー内容を確認してください。
            </Dialog.Description>
            {/* 変更理由: エラー本文は長さや改行を保持したまま確認できる必要があるため、
                既存のstatusTextだけをReactのテキストとして表示し、URL等の追加情報は表示しない。 */}
            <p className="write-panel__error-message" role="alert">
              {writeErrorMessage}
            </p>
            <div className="write-panel__error-dialog-actions">
              <Dialog.Close asChild>
                <button type="button" className="write-panel__btn write-panel__btn--secondary">
                  閉じる
                </button>
              </Dialog.Close>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="write-panel__btn write-panel__btn--primary"
                  onClick={handleRetry}
                >
                  再入力
                </button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
};
