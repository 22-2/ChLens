import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { container } from "src/service-container/index";
import { useBottomPanel } from "src/view/browser/hooks/use-bottom-panel";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";
import { useWrite } from "src/view/browser/hooks/use-write";
import { Dialog } from "src/view/browser/ui/Dialog";

const WRITE_SUBMIT_CTRL_ENTER_KEY = "write_submit_ctrl_enter";

export const WritePanelContent: React.FC = () => {
  const { currentPage } = useTabStore();
  const { writePanelInsertRequest, clearWritePanelInsertRequest, closePanel } = useBottomPanel();
  const threadUrl = currentPage.type === "thread" ? currentPage.threadUrl : "";
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const errorDialogDescriptionId = useId();
  const [dialogPortalContainer, setDialogPortalContainer] = useState<HTMLElement | null>(null);
  const [isErrorDialogOpen, setIsErrorDialogOpen] = useState(false);
  const [submitWithCtrlEnter, setSubmitWithCtrlEnter] = useState(
    () => container.config.get(WRITE_SUBMIT_CTRL_ENTER_KEY) === "on",
  );

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
    const handleConfigUpdated = ({ key }: { key?: string }) => {
      if (key !== WRITE_SUBMIT_CTRL_ENTER_KEY) {
        return;
      }
      setSubmitWithCtrlEnter(container.config.get(WRITE_SUBMIT_CTRL_ENTER_KEY) === "on");
    };

    container.message.on("config_updated", handleConfigUpdated);
    return () => {
      container.message.off("config_updated", handleConfigUpdated);
    };
  }, []);

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

  const handleSubmitWithCtrlEnterChange = useCallback((checked: boolean) => {
    setSubmitWithCtrlEnter(checked);
    void container.config.set(WRITE_SUBMIT_CTRL_ENTER_KEY, checked ? "on" : "off");
  }, []);

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
                  value={mail}
                  onChange={(e) => setMail(e.target.value)}
                  disabled={isSubmitting || sage}
                  placeholder=""
                />
              </label>
              <label className="write-panel__sage">
                <input
                  type="checkbox"
                  checked={sage}
                  onChange={(e) => setSage(e.target.checked)}
                  disabled={isSubmitting}
                />
                sage
              </label>
              <label className="write-panel__sage">
                <input
                  type="checkbox"
                  checked={submitWithCtrlEnter}
                  onChange={(e) => handleSubmitWithCtrlEnterChange(e.target.checked)}
                  disabled={isSubmitting}
                />
                Ctrl+Enterで書き込む
              </label>
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
                {statusText && (
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
