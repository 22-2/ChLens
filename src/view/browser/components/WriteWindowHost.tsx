import React from "react";
import { createPortal } from "react-dom";
import { WritePanelContent } from "src/view/browser/components/WritePanelContent";
import { useWriteSession } from "src/view/browser/hooks/use-write-session";

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

  return createPortal(
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
    </main>,
    writeWindowRoot,
  );
};
