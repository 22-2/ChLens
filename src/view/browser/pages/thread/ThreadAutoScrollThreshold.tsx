import type { RefObject } from "react";

/** 自動追従の判定線と、いまその下にいるかどうかを本文の中に示す。 */
export function ThreadAutoScrollThreshold({
  canAutoScroll,
  isAutoScrolling,
  boundaryRef,
}: {
  canAutoScroll: boolean;
  isAutoScrolling: boolean;
  boundaryRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      className={`thread-page__auto-scroll-threshold${
        canAutoScroll ? " thread-page__auto-scroll-threshold--armed" : ""
      }${isAutoScrolling ? " thread-page__auto-scroll-threshold--scrolling" : ""}`}
    >
      {/* 変更理由: 親要素の末尾は破線より16px下にあるため、親へrefを置くと
                    見た目では線を越えていても追従判定がfalseになる。判定点を実際の破線へ揃える。 */}
      <div
        ref={boundaryRef}
        className="thread-page__auto-scroll-threshold-line"
        aria-hidden="true"
      />
      <span className="thread-page__auto-scroll-threshold-label">
        {canAutoScroll
          ? "この線より下なので新着に追従します"
          : "この線より下にいる時だけ新着に追従します"}
      </span>
    </div>
  );
}
