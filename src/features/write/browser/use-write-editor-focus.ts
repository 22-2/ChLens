import { type RefObject, useEffect, useRef } from "react";
import type { useOptionalBottomPanel } from "src/view/browser/hooks/use-bottom-panel";

interface UseWriteEditorFocusOptions {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  viewWindow: Window;
  viewDocument: Document;
  /** 下部パネルの編集欄か。そうでなければセッション側のフォーカス要求を使う。 */
  isInPane: boolean;
  bottomPanel: ReturnType<typeof useOptionalBottomPanel>;
  writePanelFocusRequestId: number | null;
  editorFocusRequestId: number | null;
  consumeEditorFocusRequest: (requestId: number) => void;
  isSubmitting: boolean;
  status: string;
  authCodeUrl: string | null | undefined;
}

/**
 * 本文欄のフォーカスを扱う。パネルを開く要求に応じた初期フォーカスと、
 * 送信が終わったあとのフォーカスの戻しの2つ。
 */
export function useWriteEditorFocus({
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
}: UseWriteEditorFocusOptions): void {
  useEffect(() => {
    const requestId = isInPane ? writePanelFocusRequestId : editorFocusRequestId;
    if (requestId == null) {
      return;
    }

    const frameId = viewWindow.requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) {
        return;
      }

      // パネルを開いた描画が終わってからフォーカスし、ユーザーがすぐ入力できる状態にする。
      textarea.focus({ preventScroll: true });
      if (isInPane) {
        bottomPanel?.consumeWritePanelFocusRequest(requestId);
      } else {
        consumeEditorFocusRequest(requestId);
      }
    });

    return () => viewWindow.cancelAnimationFrame(frameId);
  }, [
    bottomPanel,
    consumeEditorFocusRequest,
    editorFocusRequestId,
    isInPane,
    textareaRef,
    viewWindow,
    writePanelFocusRequestId,
  ]);

  const wasSubmittingRef = useRef(false);
  useEffect(() => {
    const wasSubmitting = wasSubmittingRef.current;
    wasSubmittingRef.current = isSubmitting;
    if (!wasSubmitting || isSubmitting) return;

    // 変更理由: 送信中は本文欄がdisabledになりフォーカスが外れるため、成功・失敗のどちらでも
    // 送信後にそのまま続けて入力できるよう戻す。エラーダイアログが出るときはそちらを優先する。
    const textarea = textareaRef.current;
    if (!textarea || (status === "error" && authCodeUrl != null)) return;
    const activeElement = viewDocument.activeElement;
    // 送信ボタンの無効化でフォーカスが残る場合もあるため、別の入力欄へ移していたときだけ奪わない。
    if (activeElement?.matches("input, textarea, select") && activeElement !== textarea) return;
    textarea.focus({ preventScroll: true });
  }, [authCodeUrl, isSubmitting, status, textareaRef, viewDocument]);
}
