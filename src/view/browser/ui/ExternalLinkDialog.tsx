import { useId, useRef, useState } from "react";
import { Button } from "src/view/browser/ui/Button";
import { Dialog } from "src/view/browser/ui/Dialog";
import type { ExternalLinkAnalysis } from "src/view/browser/utils/external-link-analysis";

export function ExternalLinkDialog({
  analysis,
  targetDocument,
  onApprove,
  onCancel,
}: {
  analysis: ExternalLinkAnalysis;
  targetDocument: Document;
  onApprove: (url: string) => void;
  onCancel: () => void;
}) {
  const [cleaned, setCleaned] = useState(analysis.cleanedUrl !== null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const destination = cleaned && analysis.cleanedUrl ? analysis.cleanedUrl : analysis.original;
  const hostname = analysis.canOpen ? new URL(destination).hostname : analysis.hostname;
  const destinationId = useId();
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <Dialog.Portal container={targetDocument.body}>
        <Dialog.Overlay className="browser-dialog-overlay" />
        <Dialog.Content
          className="browser-dialog-content external-link-dialog"
          onKeyDownCapture={(event) => {
            // 別DocumentでもEscapeを処理し、背後の画像ビューアやポップアップへ伝播させない。
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              onCancel();
            }
          }}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            cancelRef.current?.focus();
          }}
        >
          <Dialog.Title className="browser-dialog-title">外部リンクを開きますか？</Dialog.Title>
          <Dialog.Description className="browser-dialog-description">
            リンク先の安全性を保証するものではありません。開くURLを確認してください。
            この確認は、設定の「一般」→「通信」→「外部リンクを開く前に確認する」からオフにできます。
          </Dialog.Description>
          {hostname && <strong className="external-link-dialog__domain">{hostname}</strong>}
          <label htmlFor={destinationId}>開くURL</label>
          <textarea id={destinationId} readOnly rows={3} value={destination} />
          {analysis.warnings.length > 0 && (
            <ul className="external-link-dialog__warnings">
              {analysis.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
          {analysis.cleanedUrl && (
            <label className="external-link-dialog__choice">
              <input
                type="checkbox"
                checked={cleaned}
                onChange={(event) => setCleaned(event.target.checked)}
              />
              追跡情報の除去・転送URLの展開後のURLを使う
            </label>
          )}
          <div className="external-link-dialog__actions">
            <button
              ref={cancelRef}
              type="button"
              className="browser-button"
              data-variant="subtle"
              onClick={onCancel}
            >
              キャンセル
            </button>
            <Button disabled={!analysis.canOpen} onClick={() => onApprove(destination)}>
              開く
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
