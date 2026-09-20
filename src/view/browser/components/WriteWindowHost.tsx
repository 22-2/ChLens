import React from "react";
import { createPortal } from "react-dom";
import { WritePanelContent } from "src/view/browser/components/WritePanelContent";
import { ViewSurfaceProvider } from "src/view/browser/hooks/use-view-surface";
import { useWriteSession } from "src/view/browser/hooks/use-write-session";
import { ToastProvider } from "src/view/browser/ui/Toast";

/**
 * 名前付きブラウザ窓へ書き込みUIを一度だけポータルする。
 *
 * 変更理由: 書き込み欄を各ペインの子として描画すると、ペイン数に応じて投稿状態も
 * 複製される。表示場所だけを別窓へ移し、状態はWriteSessionProviderへ集約する。
 */
export const WriteWindowHost: React.FC = () => {
  const { writeWindowRoot, closeWriteWindow } = useWriteSession();

  if (!writeWindowRoot) {
    return null;
  }

  const writeWindow = writeWindowRoot.ownerDocument.defaultView;
  if (!writeWindow) {
    return null;
  }

  const viewSurface = { window: writeWindow, document: writeWindow.document };

  return createPortal(
    <ViewSurfaceProvider surface={viewSurface}>
      {/* 別窓側にも同じ通知UIを置き、投稿操作の結果をメイン窓へ流さない。 */}
      <ToastProvider topOffset="16px" rightOffset="16px" />
      <main className="write-window">
        <header className="write-window__header">
          <h1 className="write-window__title">書き込み</h1>
          <button
            type="button"
            className="write-window__close"
            onClick={closeWriteWindow}
            aria-label="書き込み窓を閉じる"
          >
            閉じる
          </button>
        </header>
        <div className="write-window__content">
          <WritePanelContent
            standalone
            onClose={closeWriteWindow}
            portalContainer={writeWindowRoot}
          />
        </div>
      </main>
    </ViewSurfaceProvider>,
    writeWindowRoot,
  );
};
