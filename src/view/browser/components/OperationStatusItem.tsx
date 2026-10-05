import { LoaderCircle } from "lucide-react";
import { useMemo } from "react";
import { STATUS_BAR_PRIORITY } from "src/view/browser/components/status-bar-priority";
import { StatusBarItem } from "src/view/browser/components/StatusBar";

interface OperationStatusItemProps {
  id: string;
  message: string | null;
  busy?: boolean;
  isError?: boolean;
  visible?: boolean;
}

export function OperationStatusItem({
  id,
  message,
  busy = false,
  isError = false,
  visible = true,
}: OperationStatusItemProps) {
  // 通信元ごとに文言だけを渡せるよう、進捗・失敗の見た目と読み上げを共通化する。
  // 文言が変わらない再描画で登録順を更新すると、別の通信状況を奪うため表示内容を固定する。
  const content = useMemo(
    () => (
      <span
        className="operation-status__content"
        role={isError ? "alert" : "status"}
        aria-live={isError ? "assertive" : "polite"}
      >
        {busy && <LoaderCircle className="icon--spinning" aria-hidden="true" />}
        <span className="operation-status__message">{message}</span>
      </span>
    ),
    [busy, isError, message],
  );

  // 通信元のIDは別々に保ち、非表示化や完了時に他の通信まで削除しない。
  if (!visible || !message) return null;

  return (
    <StatusBarItem
      id={id}
      alignment="right"
      priority={STATUS_BAR_PRIORITY.right.operation}
      operationRank={isError ? 3 : busy ? 2 : 1}
      title={message}
      className={`operation-status${isError ? " operation-status--error" : ""}`}
    >
      {content}
    </StatusBarItem>
  );
}
