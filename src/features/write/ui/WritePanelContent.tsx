import {
  ArrowBigUp,
  Clipboard,
  ExternalLink,
  ImagePlus,
  MoreVertical,
  Settings,
} from "lucide-react";
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { extractUrlsFromMessage, toViewerImageUrl } from "src/core/util/url-media";
import { useMediaViewerStore } from "src/features/media/browser/use-media-viewer-store";
import { MANUAL_IMAGE_LOADING_CONFIG_KEY } from "src/features/media/domain/media-settings";
import { ExternalImage } from "src/features/media/ui/ExternalImage";
import { MediaViewerContainer } from "src/features/media/ui/MediaViewerContainer";
import { useImgurUpload } from "src/features/write/browser/use-imgur-upload";
import { useWrite } from "src/features/write/browser/use-write";
import { useWriteEditorFocus } from "src/features/write/browser/use-write-editor-focus";
import { useWriteInsertRequest } from "src/features/write/browser/use-write-insert-request";
import { useWritePreSubmitWarnings } from "src/features/write/browser/use-write-pre-submit-warnings";
import {
  useWriteDraft,
  useWriteDraftActions,
  useWriteSessionControls,
  type WriteEditorPlace,
} from "src/features/write/browser/use-write-session";
import { useWriteTextareaAutosize } from "src/features/write/browser/use-write-textarea-autosize";
import { WriteAuthDialog } from "src/features/write/ui/WriteAuthDialog";
import { WriteEditorElsewhere } from "src/features/write/ui/WriteEditorElsewhere";
import { WriteSettingsDialog } from "src/features/write/ui/WriteSettingsDialog";
import { WriteWarningDialog } from "src/features/write/ui/WriteWarningDialog";
import { OperationStatusItem } from "src/view/browser/components/OperationStatusItem";
import { useOptionalBottomPanel } from "src/view/browser/hooks/use-bottom-panel";
import { useConfigBooleanSetting } from "src/view/browser/hooks/use-config-boolean-setting";
import { useToast } from "src/view/browser/hooks/use-toast";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import { useTabStore } from "src/view/browser/state/tabs/use-tab-store";
import { Popover } from "src/view/browser/ui/Popover";
import { sanitizeUrlsInText } from "src/view/browser/utils/url-tracking";
import { bindWriteConfirmationFrame } from "src/view/browser/utils/write-confirmation";

const WRITE_SUBMIT_CTRL_ENTER_KEY = "write_submit_ctrl_enter";
const WRITE_SANITIZE_URLS_ON_PASTE_KEY = "write_sanitize_urls_on_paste";
const noop = () => {};

/**
 * 書き込み欄を置く場所。下部パネルはペインに属し、サイドパネルと別窓はペインの外にある。
 * 別窓は開いている間、常に編集欄を持つ。
 */
export type WriteSurface = WriteEditorPlace | "window";

export interface WritePanelContentProps {
  surface?: WriteSurface;
  onClose?: () => void;
  portalContainer?: HTMLElement | null;
}

export const WritePanelContent: React.FC<WritePanelContentProps> = ({
  surface = "bottom",
  ...props
}) => {
  const { isWindowOpen, editorPlace } = useWriteSessionControls();
  // メイン窓の場所は、別窓がなく編集欄の場所と一致するときだけ編集欄を持つ。
  if (surface !== "window" && (isWindowOpen || editorPlace !== surface)) {
    return <WriteEditorElsewhere place={surface} />;
  }
  return <WritePanelEditor surface={surface} {...props} />;
};

const WritePanelEditor: React.FC<WritePanelContentProps & { surface: WriteSurface }> = ({
  surface,
  onClose,
  portalContainer,
}) => {
  // 別窓とサイドの編集欄はペインの下部パネルに属さないため、フォーカス要求はセッション側を使う。
  const isInPane = surface === "bottom";
  const isWindow = surface === "window";
  const { viewPage } = useTabStore();
  const { value: manualImageLoading } = useConfigBooleanSetting(MANUAL_IMAGE_LOADING_CONFIG_KEY);
  // 変更理由: 設定DialogのPortal先も書き込み窓と同じDocumentへ置き、別窓で
  // メイン窓のテーマ境界へ戻らないようにする。
  const viewSurface = useViewSurface();
  const toast = useToast();
  const { window: viewWindow, document: viewDocument } = viewSurface;
  const bottomPanel = useOptionalBottomPanel();
  // 下部パネルの要求をサイドの編集欄も同時に処理すると、返信が二重に追記される。
  const writePanelInsertRequest =
    surface === "bottom" ? bottomPanel?.writePanelInsertRequest : null;
  const clearWritePanelInsertRequest = bottomPanel?.clearWritePanelInsertRequest ?? noop;
  const closePanel = isWindow ? (onClose ?? noop) : (bottomPanel?.closePanel ?? onClose ?? noop);
  const {
    selectedThreadUrl,
    targets,
    selectThread,
    openWriteWindow,
    editorFocusRequestId,
    consumeEditorFocusRequest,
    setEditorBusy,
  } = useWriteSessionControls();
  const fallbackThreadUrl = viewPage.type === "thread" ? viewPage.threadUrl : "";
  const threadUrl = selectedThreadUrl ?? fallbackThreadUrl;
  const draft = useWriteDraft(threadUrl);
  const { setDraft } = useWriteDraftActions();
  const handleDraftChange = useCallback(
    (nextMessage: string) => setDraft(threadUrl, nextMessage),
    [setDraft, threadUrl],
  );
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const writePanelFocusRequestId = bottomPanel?.writePanelFocusRequestId ?? null;
  const imgurFileInputRef = useRef<HTMLInputElement | null>(null);
  const [dialogPortalContainer, setDialogPortalContainer] = useState<HTMLElement | null>(
    portalContainer ?? null,
  );
  const [isErrorDialogOpen, setIsErrorDialogOpen] = useState(false);
  const confirmationFrameCleanupRef = useRef<(() => void) | null>(null);
  // 変更理由: 書き込み中の入力欄を増やさず、書き込みに関する設定を
  // パネル内の歯車モーダルへまとめて、必要な時だけ変更できるようにする。
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { value: submitWithCtrlEnter } = useConfigBooleanSetting(WRITE_SUBMIT_CTRL_ENTER_KEY);
  const { value: sanitizeUrlsOnPaste } = useConfigBooleanSetting(WRITE_SANITIZE_URLS_ON_PASTE_KEY);
  const {
    name,
    mail,
    message,
    status,
    statusText,
    authCode,
    authCodeUrl,
    confirmationPage,
    canSubmit,
    iframeRef,
    setName,
    setMail,
    setMessage,
    submit,
    submitConfirmation,
    handleRetry,
  } = useWrite(threadUrl, {
    draft,
    onDraftChange: handleDraftChange,
    tabId: targets.find((target) => target.threadUrl === threadUrl)?.tabId,
  });

  useWriteTextareaAutosize(textareaRef, viewWindow, { message, status });

  const isSubmitting = status === "submitting";
  // 変更理由: 投稿前の本文から画像だけを既存ビューアへ渡し、URLの復元や
  // 複数画像の前後移動をレス表示と同じ規則で利用できるようにする。
  const previewImages = useMemo(
    () => extractUrlsFromMessage(message).filter((url) => toViewerImageUrl(url)),
    [message],
  );
  const previewId = useId();
  const mediaViewerScopeId = `write-preview:${previewId}:${threadUrl}`;
  const openMedia = useMediaViewerStore((state) => state.openMediaFromUrl);
  const { isImgurUploading, imgurUploadStatus, runImgurUpload, handlePasteClipboardImage } =
    useImgurUpload({
      threadUrl,
      message,
      isSubmitting,
      setMessage,
      setDraft,
      textareaRef,
      viewSurface,
    });
  const isConfirm = status === "confirm" || confirmationPage != null;
  const isConfirmationSubmitting = confirmationPage != null && isSubmitting;
  const writeErrorMessage = statusText || "書き込みに失敗しました";

  useWriteEditorFocus({
    textareaRef,
    viewWindow,
    viewDocument,
    isInPane,
    bottomPanel,
    writePanelFocusRequestId,
    editorFocusRequestId,
    consumeEditorFocusRequest,
    isSubmitting,
    status,
    authCodeUrl,
  });
  const uploadStatusIsVisible =
    isImgurUploading ||
    imgurUploadStatus?.type === "success" ||
    imgurUploadStatus?.type === "error";
  // 認証手順は専用ダイアログで案内し、ステータスバーには同じ案内を残さない。
  const statusBarMessage = uploadStatusIsVisible
    ? (imgurUploadStatus?.message ?? "Imgurに投稿しています...")
    : status === "idle" || (status === "error" && authCodeUrl != null)
      ? null
      : statusText || (status === "error" ? writeErrorMessage : null);
  const statusBarIsError = uploadStatusIsVisible
    ? imgurUploadStatus?.type === "error"
    : status === "error";
  const statusBarIsBusy = isImgurUploading || status === "submitting";
  useEffect(() => {
    // 送信中だけ知らせ、ほかの場所の「こちらに移動」で送信状態を失わないようにする。
    // 送信していない編集欄が解除しないよう、知らせた編集欄だけが元に戻す。
    if (!statusBarIsBusy) return;
    setEditorBusy(true);
    return () => setEditorBusy(false);
  }, [setEditorBusy, statusBarIsBusy]);

  const {
    requestSubmit,
    writeWarnings,
    isWarningDialogOpen,
    setIsWarningDialogOpen,
    removeTrackingParametersAndSubmit,
    confirmWarningSubmit,
  } = useWritePreSubmitWarnings({
    name,
    mail,
    message,
    canSubmit,
    isSubmitting,
    submit,
    setMessage,
    toast,
  });

  const handleMessagePaste = useCallback(
    (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      // 変更理由: 板・ドメインで自動除去をOFFにした場合は、貼り付け文字列をそのまま編集欄へ渡す。
      if (!sanitizeUrlsOnPaste) return;
      const pastedText = event.clipboardData.getData("text/plain");
      const result = sanitizeUrlsInText(pastedText);
      if (result.removedParameters.length === 0) return;

      event.preventDefault();
      const textarea = event.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const nextMessage = `${message.slice(0, start)}${result.text}${message.slice(end)}`;
      const nextCaret = start + result.text.length;

      // 変更理由: 追跡値を除去した貼り付け内容を下書きにも保存し、キャレット位置を維持する。
      setMessage(nextMessage);
      toast.success("貼り付け時にURLパラメータを除去しました");
      viewWindow.requestAnimationFrame(() => {
        if (textarea.isConnected) textarea.setSelectionRange(nextCaret, nextCaret);
      });
    },
    [message, sanitizeUrlsOnPaste, setMessage, toast, viewWindow],
  );

  const handleOpenWriteWindow = useCallback(() => {
    // 別窓のReactツリーを先に作成し、現在の下部パネルは表示場所の重複を避けて閉じる。
    // 戻り値がfalseのときはポップアップがブロックされたため、入力欄を残す。
    const opened = openWriteWindow();
    if (opened !== false) {
      closePanel();
    }
  }, [closePanel, openWriteWindow]);

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
    // 変更理由: 通常のエラーはステータスバーへ集約し、認証URLが必要な場合だけ
    // コピー操作を提供するDialogを開く。
    setIsErrorDialogOpen(status === "error" && authCodeUrl != null);
  }, [authCodeUrl, status]);

  useWriteInsertRequest({
    textareaRef,
    request: writePanelInsertRequest,
    clearRequest: clearWritePanelInsertRequest,
    threadUrl,
    targets,
    selectThread,
    message,
    setMessage,
  });

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
      requestSubmit();
    },
    [canSubmit, closePanel, isSubmitting, requestSubmit, submitWithCtrlEnter],
  );

  return (
    <div className="write-panel">
      {/* 書き込みと画像投稿も取得中の表示と同じ部品を使い、エラー表示の仕様を揃える。 */}
      <OperationStatusItem
        id="write-operation-status"

        message={statusBarMessage}
        busy={statusBarIsBusy}
        isError={statusBarIsError}
      />
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
            {!isInPane && targets.length > 0 && (
              // 投稿先の切り替えは共有書き込み窓とサイドパネルの役割に限定し、各ペインの
              // 下部パネルは表示中スレッドへそのまま投稿する簡潔な入力欄として保つ。
              // サイドパネルは操作中のペインに追従しないため、投稿先を明示して選べるようにする。
              <label className="write-panel__target-group">
                <span className="write-panel__field-label">投稿先</span>
                <select
                  className="write-panel__target-select"
                  value={selectedThreadUrl ?? ""}
                  onChange={(event) => selectThread(event.currentTarget.value)}
                  disabled={isSubmitting || isImgurUploading}
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
            <input
              ref={imgurFileInputRef}
              className="write-panel__file-input"
              type="file"
              accept="image/*"
              aria-label="Imgurに投稿する画像を選択"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file) void runImgurUpload(async () => file);
              }}
            />
            <div className="write-panel__body-row">
              <textarea
                ref={textareaRef}
                className="write-panel__textarea"
                rows={1}
                aria-label="本文"
                value={message}
                onPaste={handleMessagePaste}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleTextareaKeyDown}
                disabled={isSubmitting || isImgurUploading}
                placeholder={threadUrl ? "本文を入力..." : "スレッドを開いてから書き込んでください"}
              />
              {/* 送信操作は本文欄の右上に固定して重ね、本文は右パディングで文字と重ならないようにする。 */}
              <div className="write-panel__side">
                <button
                  type="submit"
                  className="write-panel__btn write-panel__btn--primary"
                  disabled={!canSubmit || isSubmitting || isImgurUploading}
                  aria-label="書き込む"
                  title="書き込む"
                >
                  <ArrowBigUp size={18} aria-hidden="true" />
                </button>
                <Popover.Root open={isMenuOpen} onOpenChange={setIsMenuOpen}>
                  <Popover.Trigger asChild>
                    <button
                      type="button"
                      className="write-panel__menu-trigger"
                      aria-label="その他の操作"
                      title="その他の操作"
                    >
                      <MoreVertical size={16} aria-hidden="true" />
                    </button>
                  </Popover.Trigger>
                  {/* パネル外へ表示し、狭い画面では表示位置を自動調整する。 */}
                  <Popover.Portal container={dialogPortalContainer ?? viewDocument.body}>
                    <Popover.Content
                      className="write-panel__menu-items"
                      side="top"
                      align="end"
                      sideOffset={4}
                      collisionPadding={8}
                    >
                      <button
                        type="button"
                        className="write-panel__menu-item"
                        onClick={() => {
                          setIsMenuOpen(false);
                          setIsSettingsDialogOpen(true);
                        }}
                        disabled={isSubmitting || isImgurUploading}
                      >
                        <Settings size={14} aria-hidden="true" />
                        <span>書き込み設定</span>
                      </button>
                      {!isWindow && (
                        <button
                          type="button"
                          className="write-panel__menu-item"
                          onClick={() => {
                            setIsMenuOpen(false);
                            handleOpenWriteWindow();
                          }}
                          disabled={isSubmitting || isImgurUploading}
                        >
                          <ExternalLink size={14} aria-hidden="true" />
                          <span>書き込みを別窓で開く</span>
                        </button>
                      )}
                      <button
                        type="button"
                        className="write-panel__menu-item"
                        onClick={() => {
                          setIsMenuOpen(false);
                          imgurFileInputRef.current?.click();
                        }}
                        disabled={isSubmitting || isImgurUploading || !threadUrl}
                      >
                        <ImagePlus size={14} aria-hidden="true" />
                        <span>ローカル画像をImgurに投稿</span>
                      </button>
                      <button
                        type="button"
                        className="write-panel__menu-item"
                        onClick={() => {
                          setIsMenuOpen(false);
                          handlePasteClipboardImage();
                        }}
                        disabled={isSubmitting || isImgurUploading || !threadUrl}
                      >
                        <Clipboard size={14} aria-hidden="true" />
                        <span>クリップボード画像をImgurに投稿</span>
                      </button>
                    </Popover.Content>
                  </Popover.Portal>
                </Popover.Root>
              </div>
            </div>
            {status === "error" && (
              <button
                type="button"
                className="write-panel__btn write-panel__btn--secondary write-panel__retry"
                onClick={handleRetry}
              >
                再入力
              </button>
            )}
            {previewImages.length > 0 && (
              <div
                className="write-panel__image-previews"
                role="group"
                aria-label="投稿画像のプレビュー"
              >
                {/* 変更理由: 本文内の画像を投稿前に見分けて選べるよう、サムネイルから
                    選んだ画像を開き、ビューアでは本文順に前後移動できるようにする。 */}
                {previewImages.map((url, index) => (
                  <button
                    key={url}
                    type="button"
                    className="write-panel__image-preview"
                    aria-label={`画像${index + 1}をプレビュー`}
                    title={url}
                    onClick={() => openMedia(url, previewImages, mediaViewerScopeId)}
                  >
                    {manualImageLoading ? (
                      <span className="external-image-placeholder">
                        クリックして画像をプレビュー
                      </span>
                    ) : (
                      <ExternalImage
                        src={toViewerImageUrl(url) ?? url}
                        alt=""
                        loading="lazy"
                        manualLoad={false}
                        insideControl
                      />
                    )}
                  </button>
                ))}
              </div>
            )}
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
      {/* 変更理由: パネルの切り抜きや重なり順に制限されず、別窓でも同じ画面内で表示する。 */}
      {createPortal(
        <MediaViewerContainer scopeId={mediaViewerScopeId} />,
        dialogPortalContainer ?? viewDocument.body,
      )}
      <WriteWarningDialog
        open={isWarningDialogOpen}
        onOpenChange={setIsWarningDialogOpen}
        container={dialogPortalContainer ?? undefined}
        warnings={writeWarnings}
        onRemoveTrackingParametersAndSubmit={removeTrackingParametersAndSubmit}
        onSubmitAnyway={confirmWarningSubmit}
      />
      <WriteSettingsDialog
        open={isSettingsDialogOpen}
        onOpenChange={setIsSettingsDialogOpen}
        container={dialogPortalContainer ?? undefined}
        name={name}
        mail={mail}
        onNameChange={setName}
        onMailChange={setMail}
        disabled={isSubmitting}
      />
      <WriteAuthDialog
        open={status === "error" && isErrorDialogOpen}
        onOpenChange={(open) => {
          setIsErrorDialogOpen(open);
          // 閉じる・Esc・背景クリックでも認証案内を解除し、ステータスバーへ残し続けない。
          if (!open) handleRetry();
        }}
        container={dialogPortalContainer ?? undefined}
        authCode={authCode}
        authCodeUrl={authCodeUrl}
      />
    </div>
  );
};
