import type { MouseEvent } from "react";
import type { INGResult } from "src/service-container/interfaces";
import { NgBadge } from "./NgBadge";

interface NgResponsePlaceholderProps {
  responseNumber: number;
  result: INGResult | undefined;
  responseStateClassName: string;
  onReveal: () => void;
  onContextMenu: (event: MouseEvent) => void;
}

/** NGレスの内容を隠した状態を、通常のレスと同じヘッダー構造で表示する。 */
export function NgResponsePlaceholder({
  responseNumber,
  result,
  responseStateClassName,
  onReveal,
  onContextMenu,
}: NgResponsePlaceholderProps) {
  return (
    <article
      data-res-num={responseNumber}
      className={`res res--ng-placeholder${responseStateClassName ? ` ${responseStateClassName}` : ""}`}
      role="button"
      aria-label={`レス${responseNumber}の内容を表示`}
      tabIndex={0}
      onClick={onReveal}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onReveal();
        }
      }}
      onContextMenu={onContextMenu}
    >
      <header className="res__header">
        <span className="res__num">{responseNumber}</span>
        <NgBadge result={result} />
      </header>
      <div className="res__ng-reveal">クリックして内容を表示</div>
    </article>
  );
}
