import { useEffect } from "react";
import {
  useWriteSessionControls,
  type WriteEditorPlace,
} from "src/features/write/browser/use-write-session";
import { useOptionalBottomPanel } from "src/view/browser/hooks/use-bottom-panel";

const EDITOR_PLACE_LABELS: Record<WriteEditorPlace, string> = {
  bottom: "下部パネル",
  side: "サイドパネル",
};

/**
 * 編集欄はほかの場所（別窓・下部・サイド）に1つだけ置くため、この場所には
 * 現在の場所と「こちらに移動」だけを出す。
 */
export function WriteEditorElsewhere({ place }: { place: WriteEditorPlace }) {
  const bottomPanel = useOptionalBottomPanel();
  const {
    isWindowOpen,
    editorPlace,
    isEditorBusy,
    moveEditor,
    openWriteWindow,
    requestEditorFocus,
    selectedThreadUrl,
    selectThread,
    appendDraft,
  } = useWriteSessionControls();

  useEffect(() => {
    const request = bottomPanel?.writePanelInsertRequest;
    if (!request) {
      return;
    }

    const targetThreadUrl = request.threadUrl ?? selectedThreadUrl;
    if (!targetThreadUrl) {
      return;
    }

    // 変更理由: 編集欄がほかの場所にある間はこの場所の書き込みUIをマウントしないため、
    // 返信要求を共有下書きへ移してから元のペイン側の要求を消費する。
    selectThread(targetThreadUrl);
    appendDraft(targetThreadUrl, request.text);
    bottomPanel.clearWritePanelInsertRequest(request.id);
  }, [appendDraft, bottomPanel, selectThread, selectedThreadUrl]);

  const moveHere = () => {
    if (!moveEditor(place)) return;
    if (place === "side") requestEditorFocus();
    else bottomPanel?.requestWritePanelFocus();
  };
  return (
    <div className="write-panel__detached-message">
      <span>
        書き込み欄は{isWindowOpen ? "別窓" : EDITOR_PLACE_LABELS[editorPlace]}で開いています。
      </span>
      {isWindowOpen && (
        <button
          type="button"
          className="write-panel__btn write-panel__btn--secondary"
          onClick={() => openWriteWindow()}
        >
          別窓を表示
        </button>
      )}
      {/* 下書きと投稿先はセッションに残るため、移動しても入力内容は失われない。 */}
      <button
        type="button"
        className="write-panel__btn write-panel__btn--secondary"
        onClick={moveHere}
        disabled={isEditorBusy}
        title={isEditorBusy ? "送信中は移動できません" : undefined}
      >
        こちらに移動
      </button>
    </div>
  );
}
