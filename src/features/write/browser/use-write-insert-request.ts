import { type RefObject, useEffect, useRef } from "react";
import type { useWriteSessionControls } from "src/features/write/browser/use-write-session";
import type { useOptionalBottomPanel } from "src/view/browser/hooks/use-bottom-panel";

type BottomPanel = NonNullable<ReturnType<typeof useOptionalBottomPanel>>;
type WriteTargets = ReturnType<typeof useWriteSessionControls>["targets"];

interface UseWriteInsertRequestOptions {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  /** 下部パネルから届いた追記要求。無ければ何もしない。 */
  request: BottomPanel["writePanelInsertRequest"] | null | undefined;
  clearRequest: (requestId: number) => void;
  threadUrl: string;
  targets: WriteTargets;
  selectThread: (threadUrl: string) => void;
  message: string;
  setMessage: (message: string) => void;
}

/**
 * 右クリックの返信などから届いた文を、現在の下書きの末尾へ追記して本文欄のキャレットを末尾に置く。
 */
export function useWriteInsertRequest({
  textareaRef,
  request,
  clearRequest,
  threadUrl,
  targets,
  selectThread,
  message,
  setMessage,
}: UseWriteInsertRequestOptions): void {
  const appliedInsertRequestIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!request || appliedInsertRequestIdRef.current === request.id) {
      return;
    }

    const requestThreadUrl = request.threadUrl;
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
    const nextMessage = `${message}${separator}${request.text}`;
    // 下書きの更新と要求の消費は別々に再描画されるため、同じ要求の再実行を防ぐ。
    appliedInsertRequestIdRef.current = request.id;
    setMessage(nextMessage);
    clearRequest(request.id);

    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.focus();
    const caretPosition = nextMessage.length;
    textarea.setSelectionRange(caretPosition, caretPosition);
  }, [clearRequest, message, request, selectThread, setMessage, targets, textareaRef, threadUrl]);
}
