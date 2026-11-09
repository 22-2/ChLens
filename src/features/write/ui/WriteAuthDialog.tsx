import React, { useCallback, useEffect, useId, useState } from "react";
import { createLogger } from "src/app/logger";
import { useToast } from "src/view/browser/hooks/use-toast";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import { Dialog } from "src/view/browser/ui/Dialog";
import { copyText } from "src/view/browser/utils/clipboard";

const logger = createLogger("write");

interface WriteAuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  container?: HTMLElement;
  authCode: string | null | undefined;
  authCodeUrl: string | null | undefined;
}

/**
 * 認証が必要なときに、認証コードと認証ページURLをコピーできる形で案内するダイアログ。
 * 「コピーしました」の表示は、案内する値が変わるたびに戻す。
 */
export const WriteAuthDialog: React.FC<WriteAuthDialogProps> = ({
  open,
  onOpenChange,
  container,
  authCode,
  authCodeUrl,
}) => {
  const viewSurface = useViewSurface();
  const toast = useToast();
  const descriptionId = useId();
  const authCodeUrlInputId = useId();
  const authCodeInputId = useId();
  const [isAuthCodeUrlCopied, setIsAuthCodeUrlCopied] = useState(false);
  const [isAuthCodeCopied, setIsAuthCodeCopied] = useState(false);

  useEffect(() => {
    setIsAuthCodeUrlCopied(false);
    setIsAuthCodeCopied(false);
  }, [authCode, authCodeUrl]);

  const handleCopyAuthCode = useCallback(async () => {
    if (!authCode) return;
    try {
      await copyText(authCode, viewSurface);
      setIsAuthCodeCopied(true);
      toast.success("認証コードをコピーしました");
    } catch (error) {
      logger.error("eddibbの認証コードをコピーできませんでした", error);
      toast.error("認証コードをコピーできませんでした");
    }
  }, [authCode, toast, viewSurface]);

  const handleCopyAuthCodeUrl = useCallback(async () => {
    if (!authCodeUrl) return;
    try {
      await copyText(authCodeUrl, viewSurface);
      setIsAuthCodeUrlCopied(true);
      toast.success("認証URLをコピーしました");
    } catch (error) {
      logger.error("eddibbの認証URLをコピーできませんでした", error);
      toast.error("認証URLをコピーできませんでした");
    }
  }, [authCodeUrl, toast, viewSurface]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal container={container}>
        <Dialog.Overlay className="browser-dialog-overlay" />
        <Dialog.Content
          className="browser-dialog-content write-panel__error-dialog"
          aria-describedby={descriptionId}
        >
          <Dialog.Title className="browser-dialog-title">認証を完了してください</Dialog.Title>
          <Dialog.Description id={descriptionId} className="browser-dialog-description">
            認証コードを認証ページで入力してトークンを発行し、メール欄へ貼り付けてから再入力してください。
          </Dialog.Description>
          {/* 変更理由: ステータスバーへ流れていた認証コードを、選択・コピーしやすい認証手順内へ移す。 */}
          {authCode && (
            <div className="write-panel__auth-url">
              <label htmlFor={authCodeInputId}>認証コード</label>
              <textarea
                id={authCodeInputId}
                className="write-panel__auth-url-input"
                value={authCode}
                readOnly
                rows={1}
                onFocus={(event) => event.currentTarget.select()}
                aria-label="認証コード"
              />
              <button
                type="button"
                className="write-panel__btn write-panel__btn--secondary"
                onClick={() => void handleCopyAuthCode()}
              >
                {isAuthCodeCopied ? "コピーしました" : "コードをコピー"}
              </button>
            </div>
          )}
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
              <button type="button" className="write-panel__btn write-panel__btn--primary">
                再入力
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
