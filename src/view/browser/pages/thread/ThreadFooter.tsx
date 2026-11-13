import type { RefObject } from "react";
import { ThreadAutoScrollThreshold } from "src/view/browser/pages/thread/ThreadAutoScrollThreshold";
import { ThreadEndLine } from "src/view/browser/pages/thread/ThreadEndLine";

/** 末尾表示と追従判定の位置を、レス一覧の後にまとめて配置する。 */
export function ThreadFooter({
  hasResponses,
  filtered,
  tracking,
  canAutoScroll,
  isAutoScrolling,
  boundaryRef,
}: {
  hasResponses: boolean;
  filtered: boolean;
  tracking: boolean;
  canAutoScroll: boolean;
  isAutoScrolling: boolean;
  boundaryRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <>
      {hasResponses ? <ThreadEndLine filtered={filtered} /> : null}
      {tracking && !filtered ? (
        <ThreadAutoScrollThreshold
          canAutoScroll={canAutoScroll}
          isAutoScrolling={isAutoScrolling}
          boundaryRef={boundaryRef}
        />
      ) : null}
    </>
  );
}
