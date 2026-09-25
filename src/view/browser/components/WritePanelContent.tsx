import { Clipboard, ExternalLink, ImagePlus, MoreVertical, Settings } from "lucide-react";
import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { useOptionalBottomPanel } from "src/view/browser/hooks/use-bottom-panel";
import { useConfigBooleanSetting } from "src/view/browser/hooks/use-config-boolean-setting";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import { useWrite } from "src/view/browser/hooks/use-write";
import {
  useWriteDraft,
  useWriteDraftActions,
  useWriteSessionControls,
} from "src/view/browser/hooks/use-write-session";
import { Dialog } from "src/view/browser/ui/Dialog";
import { CheckboxField } from "src/view/browser/ui/FormControls";
import { copyText } from "src/view/browser/utils/clipboard";
import { bindWriteConfirmationFrame } from "src/view/browser/utils/write-confirmation";
import { findWriteWarnings } from "src/view/browser/utils/write-warning";

const WRITE_SUBMIT_CTRL_ENTER_KEY = "write_submit_ctrl_enter";
const WRITE_CLOSE_PANEL_AFTER_SUBMIT_KEY = "write_close_panel_after_submit";
const noop = () => {};

export interface WritePanelContentProps {
  standalone?: boolean;
  onClose?: () => void;
  portalContainer?: HTMLElement | null;
}

export const WritePanelContent: React.FC<WritePanelContentProps> = (props) => {
  const bottomPanel = useOptionalBottomPanel();
  const { isWindowOpen, openWriteWindow, selectedThreadUrl, selectThread, appendDraft } =
    useWriteSessionControls();

  useEffect(() => {
    const request = bottomPanel?.writePanelInsertRequest;
    if (!isWindowOpen || !request) {
      return;
    }

    const targetThreadUrl = request.threadUrl ?? selectedThreadUrl;
    if (!targetThreadUrl) {
      return;
    }

    // 変更理由: 別窓を表示中はペイン側の書き込みUIをマウントしないため、
    // 返信要求を共有下書きへ移してから元のペイン側の要求を消費する。
    selectThread(targetThreadUrl);
    appendDraft(targetThreadUrl, request.text);
    bottomPanel.clearWritePanelInsertRequest(request.id);
  }, [appendDraft, bottomPanel, isWindowOpen, selectThread, selectedThreadUrl]);

  if (isWindowOpen && !props.standalone) {
    return (
      <div className="write-panel__detached-message">
        <span>書き込み欄は別窓で開いています。</span>
        <button
          type="button"
          className="write-panel__btn write-panel__btn--secondary"
          onClick={() => openWriteWindow()}
        >
          別窓を表示
        </button>
      </div>
    );
  }

  return <WritePanelEditor {...props} />;
};

const WritePanelEditor: React.FC<WritePanelContentProps> = ({
  standalone = false,
  onClose,
  portalContainer,
}) => {
  const { viewPage } = useTabStore();
  // 変更理由: 設定DialogのPortal先も書き込み窓と同じDocumentへ置き、別窓で
  // メイン窓のテーマ境界へ戻らないようにする。
  const viewSurface = useViewSurface();
  const { window: viewWindow, document: viewDocument } = viewSurface;
  const bottomPanel = useOptionalBottomPanel();
  const writePanelInsertRequest = standalone ? null : bottomPanel?.writePanelInsertRequest;
  const clearWritePanelInsertRequest = bottomPanel?.clearWritePanelInsertRequest ?? noop;
  const closePanel = standalone ? (onClose ?? noop) : (bottomPanel?.closePanel ?? onClose ?? noop);
  const { selectedThreadUrl, targets, selectThread, openWriteWindow } = useWriteSessionControls();
  const fallbackThreadUrl = viewPage.type === "thread" ? viewPage.threadUrl : "";
  const threadUrl = selectedThreadUrl ?? fallbackThreadUrl;
  const draft = useWriteDraft(threadUrl);
  const { setDraft } = useWriteDraftActions();
  const handleDraftChange = useCallback(
    (nextMessage: string) => setDraft(threadUrl, nextMessage),
    [setDraft, threadUrl],
  );
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const errorDialogDescriptionId = useId();
  const authCodeUrlInputId = useId();
  const settingsDialogDescriptionId = useId();
  const warningDialogDescriptionId = useId();
  const [dialogPortalContainer, setDialogPortalContainer] = useState<HTMLElement | null>(
    portalContainer ?? null,
  );
  const [isErrorDialogOpen, setIsErrorDialogOpen] = useState(false);
  const [isWarningDialogOpen, setIsWarningDialogOpen] = useState(false);
  const [writeWarnings, setWriteWarnings] = useState<ReturnType<typeof findWriteWarnings>>([]);
  const [submitDelaySeconds, setSubmitDelaySeconds] = useState(3);
  const [isAuthCodeUrlCopied, setIsAuthCodeUrlCopied] = useState(false);
  const confirmationFrameCleanupRef = useRef<(() => void) | null>(null);
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
    authCodeUrl,
    confirmationPage,
    canSubmit,
    iframeRef,
    setName,
    setMail,
    setSage,
    setMessage,
    submit,
    submitConfirmation,
    handleRetry,
  } = useWrite(threadUrl, {
    draft,
    onDraftChange: handleDraftChange,
    tabId: targets.find((target) => target.threadUrl === threadUrl)?.tabId,
  });

  const isSubmitting = status === "submitting";
  const isConfirm = status === "confirm" || confirmationPage != null;
  const isConfirmationSubmitting = confirmationPage != null && isSubmitting;
  const writeErrorMessage = statusText || "書き込みに失敗しました";

  useEffect(() => {
    // 変更理由: パネルを開いた直後の誤クリックを防ぐため、表示から3秒間は
    // ボタンとショートカットの両方を無効にして、残り時間も利用者へ示す。
    const startedAt = Date.now();
    const updateRemaining = () => {
      const remaining = Math.max(0, Math.ceil((startedAt + 3000 - Date.now()) / 1000));
      setSubmitDelaySeconds(remaining);
      return remaining;
    };
    updateRemaining();
    const timer = viewWindow.setInterval(() => {
      if (updateRemaining() === 0) viewWindow.clearInterval(timer);
    }, 100);
    return () => viewWindow.clearInterval(timer);
  }, [viewWindow]);

  const requestSubmit = useCallback(() => {
    if (submitDelaySeconds > 0 || !canSubmit || isSubmitting) return;
    const warnings = findWriteWarnings([name, mail, message]);
    if (warnings.length > 0) {
      setWriteWarnings(warnings);
      setIsWarningDialogOpen(true);
      return;
    }
    void submit();
  }, [canSubmit, isSubmitting, mail, message, name, submit, submitDelaySeconds]);

  const confirmWarningSubmit = useCallback(() => {
    setIsWarningDialogOpen(false);
    void submit();
  }, [submit]);

  const handleOpenWriteWindow = useCallback(() => {
    // 別窓のReactツリーを先に作成し、現在の下部パネルは表示場所の重複を避けて閉じる。
    // 戻り値がfalseのときはポップアップがブロックされたため、入力欄を残す。
    const opened = openWriteWindow();
    if (opened !== false) {
      closePanel();
    }
  }, [closePanel, openWriteWindow]);

  useEffect(() => {
    setIsAuthCodeUrlCopied(false);
  }, [authCodeUrl]);

  const handleCopyAuthCodeUrl = useCallback(async () => {
    if (!authCodeUrl) return;
    try {
      await copyText(authCodeUrl, viewSurface);
      setIsAuthCodeUrlCopied(true);
    } catch (error) {
      console.error("eddibbの認証URLをコピーできませんでした", error);
    }
  }, [authCodeUrl, viewSurface]);

  const handleConfirmationFrameLoad = useCallback(() => {
    confirmationFrameCleanupRef.current?.();
    confirmationFrameCleanupRef.current = null;
    if (!confirmationPage || !iframeRef.current) return;

    confirmationFrameCleanupRef.current = bindWriteConfirmationFrame(
      iframeRef.current,
      (submission) => void submitConfirmation(submission),
    );
  }, [confirmationPage, iframeRef, submitConfirmation]);

  useEffect(() => {
    return () => {
      confirmationFrameCleanupRef.current?.();
      confirmationFrameCleanupRef.current = null;
    };
  }, [confirmationPage]);

  useEffect(() => {
    // テーマトークンは `.browser-shell[data-theme]` にスコープされるため、
    // body直下のPortalではダークテーマのsurface/textを継承できない。
    setDialogPortalContainer(
      portalContainer ?? viewDocument.querySelector<HTMLElement>(".browser-shell"),
    );
  }, [portalContainer, viewDocument]);

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

    const requestThreadUrl = writePanelInsertRequest.threadUrl;
    if (
      requestThreadUrl &&
      requestThreadUrl !== threadUrl &&
      targets.some((target) => target.threadUrl === requestThreadUrl)
    ) {
      // 返信操作が発生したペインと書き込み欄の表示場所が異なる場合でも、
      // 先に対象スレを選び、次の描画でそのスレの下書きへ追記する。
      selectThread(requestThreadUrl);
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
  }, [
    clearWritePanelInsertRequest,
    message,
    selectThread,
    setMessage,
    targets,
    threadUrl,
    writePanelInsertRequest,
  ]);

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
        submitDelaySeconds > 0 ||
        e.key !== "Enter" ||
        !(e.ctrlKey || e.metaKey)
      ) {
        return;
      }

      // textarea の改行より投稿を優先し、送信ショートカットとして一貫動作させる。
      e.preventDefault();
      requestSubmit();
    },
    [canSubmit, closePanel, isSubmitting, requestSubmit, submitDelaySeconds, submitWithCtrlEnter],
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
        onSubmit={(event) => {
          event.preventDefault();
          requestSubmit();
        }}
      >
        {isConfirm && (
          <div className="write-panel__confirm-bar">
            <span>{statusText}</span>
            <button
              type="button"
              className="write-panel__btn write-panel__btn--secondary"
              onClick={handleRetry}
              disabled={isConfirmationSubmitting}
            >
              戻る
            </button>
          </div>
        )}
        {!isConfirm && (
          <>
            {standalone &&
              targets.length > 0 && (
                // 投稿先の切り替えは共有書き込み窓の役割に限定し、各ペインの下部パネルは
                // 表示中スレッドへそのまま投稿する簡潔な入力欄として保つ。
                <label className="write-panel__target-group">
                  <span className="write-panel__field-label">投稿先</span>
                  <select
                    className="write-panel__target-select"
                    value={selectedThreadUrl ?? ""}
                    onChange={(event) => selectThread(event.currentTarget.value)}
                    disabled={isSubmitting}
                    aria-label="投稿先スレッド"
                  >
                    {targets.map((target) => (
                      <option key={target.threadUrl} value={target.threadUrl}>
                        {target.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}
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
              {/* 投稿操作を入力欄の行へ寄せ、本文欄の縦幅を確保する。 */}
              <details className="write-panel__menu">
                <summary
                  className="write-panel__menu-trigger"
                  aria-label="その他の操作"
                  title="その他の操作"
                >
                  <MoreVertical size={16} aria-hidden="true" />
                </summary>
                <div className="write-panel__menu-items">
                  <button
                    type="button"
                    className="write-panel__menu-item"
                    onClick={(event) => {
                      event.currentTarget.closest("details")?.removeAttribute("open");
                      setIsSettingsDialogOpen(true);
                    }}
                    disabled={isSubmitting}
                  >
                    <Settings size={14} aria-hidden="true" />
                    <span>書き込み設定</span>
                  </button>
                  {!standalone && (
                    <button
                      type="button"
                      className="write-panel__menu-item"
                      onClick={(event) => {
                        event.currentTarget.closest("details")?.removeAttribute("open");
                        handleOpenWriteWindow();
                      }}
                      disabled={isSubmitting}
                    >
                      <ExternalLink size={14} aria-hidden="true" />
                      <span>書き込みを別窓で開く</span>
                    </button>
                  )}
                  <button type="button" className="write-panel__menu-item" disabled>
                    <ImagePlus size={14} aria-hidden="true" />
                    <span>ローカル画像をImgurに投稿（未実装）</span>
                  </button>
                  <button type="button" className="write-panel__menu-item" disabled>
                    <Clipboard size={14} aria-hidden="true" />
                    <span>クリップボード画像をImgurに投稿（未実装）</span>
                  </button>
                </div>
              </details>
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
                  disabled={!canSubmit || isSubmitting || submitDelaySeconds > 0}
                >
                  {submitDelaySeconds > 0 ? `${submitDelaySeconds}秒後に書き込めます` : "書き込む"}
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
          {...(confirmationPage
            ? {
                srcDoc: confirmationPage.html,
                sandbox: "allow-same-origin",
                referrerPolicy: "no-referrer" as const,
                onLoad: handleConfirmationFrameLoad,
              }
            : {})}
        />
      </form>
      <Dialog.Root open={isWarningDialogOpen} onOpenChange={setIsWarningDialogOpen}>
        <Dialog.Portal container={dialogPortalContainer ?? undefined}>
          <Dialog.Overlay className="browser-dialog-overlay" />
          <Dialog.Content
            className="browser-dialog-content write-panel__warning-dialog"
            aria-describedby={warningDialogDescriptionId}
          >
            <Dialog.Title className="browser-dialog-title">投稿内容を確認してください</Dialog.Title>
            <Dialog.Description
              id={warningDialogDescriptionId}
              className="browser-dialog-description"
            >
              個人情報や第三者を傷つける表現が含まれている可能性があります。公開してよい内容か確認してください。
            </Dialog.Description>
            <ul className="write-panel__warning-list">
              {writeWarnings.map((warning) => (
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
              <button
                type="button"
                className="write-panel__btn write-panel__btn--primary"
                onClick={confirmWarningSubmit}
              >
                確認して投稿
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
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
              {authCodeUrl
                ? "認証ページで認証を完了し、発行されたトークンをメール欄へ貼り付けてください。"
                : "サーバーから返されたエラー内容を確認してください。"}
            </Dialog.Description>
            {/* 変更理由: エラー本文は長さや改行を保持したまま確認できる必要があるため、
                既存のstatusTextはReactのテキストとして表示し、認証URLだけを安全なコピー欄へ分離する。 */}
            <p className="write-panel__error-message" role="alert">
              {writeErrorMessage}
            </p>
            {authCodeUrl && (
              <div className="write-panel__auth-url">
                <label htmlFor={authCodeUrlInputId}>認証ページURL</label>
                <textarea
                  id={authCodeUrlInputId}
                  className="write-panel__auth-url-input"
                  value={authCodeUrl}
                  readOnly
                  rows={2}
                  onFocus={(event) => event.currentTarget.select()}
                  aria-label="認証ページURL"
                />
                <button
                  type="button"
                  className="write-panel__btn write-panel__btn--secondary"
                  onClick={() => void handleCopyAuthCodeUrl()}
                >
                  {isAuthCodeUrlCopied ? "コピーしました" : "URLをコピー"}
                </button>
              </div>
            )}
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
