import { useCallback } from "react";
import { useOptionalBottomPanel } from "src/view/browser/hooks/use-bottom-panel";
import { useToast } from "src/view/browser/hooks/use-toast";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import { useWriteSession } from "src/view/browser/hooks/use-write-session";

export type WriteRequest = (text: string, threadUrl?: string) => void;

/**
 * 返信・引用から共有書き込みセッションへ入力を渡す。
 *
 * 変更理由: 下部パネルのContextだけに依存すると、別窓へ移したタブから返信した時に
 * 表示元のないパネルを開こうとするため、表示環境と書き込み窓の状態をここで振り分ける。
 */
export function useWriteRequest(): WriteRequest {
  const bottomPanel = useOptionalBottomPanel();
  const writeSession = useWriteSession();
  const toast = useToast();
  const { window: viewWindow } = useViewSurface();

  return useCallback<WriteRequest>(
    (text, threadUrl) => {
      const isDetachedSurface = typeof window !== "undefined" && viewWindow !== window;

      if (writeSession.isWindowOpen || isDetachedSurface || !bottomPanel) {
        if (writeSession.isWindowOpen) {
          // 共有書き込み窓を表示中は、同じ入力欄を下部パネルにも残さない。
          bottomPanel?.closePanel();
        }
        const targetThreadUrl = threadUrl ?? writeSession.selectedThreadUrl;
        if (targetThreadUrl) {
          writeSession.selectThread(targetThreadUrl);
          writeSession.appendDraft(targetThreadUrl, text);
        }
        if (!writeSession.isWindowOpen) {
          const opened = writeSession.openWriteWindow(viewWindow);
          if (opened === false) {
            // 下部パネルのない別窓では、ポップアップブロックを画面上でも伝える。
            toast.error("書き込み窓を開けませんでした。ポップアップ設定を確認してください");
          }
        }
        return;
      }

      bottomPanel.openWritePanelWithText(text, threadUrl);
    },
    [bottomPanel, toast, viewWindow, writeSession],
  );
}
