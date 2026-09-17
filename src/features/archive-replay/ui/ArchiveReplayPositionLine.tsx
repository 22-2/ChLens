import { useEffect, useRef } from "react";

import { parseArchiveReplayTimestamp } from "../domain";

export function getReplayBoundaryIndex(
  responses: readonly { num: number; date?: string }[],
  playbackAt: number | undefined,
  responseNumber: number,
): number {
  // NGや絞り込みで対象レスが消えても、表示中のレス間に再生時刻を置く。
  let boundary = 0;
  responses.forEach((response, index) => {
    const timestamp = parseArchiveReplayTimestamp(response.date ?? "");
    if (
      playbackAt !== undefined && timestamp !== null
        ? timestamp <= playbackAt
        : response.num <= responseNumber
    )
      boundary = index + 1;
  });
  return boundary;
}

export function ArchiveReplayPositionLine({
  playbackAt,
  boundary,
  active,
}: {
  playbackAt?: number;
  boundary: number;
  active: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active) return;
    // 秒表示だけの更新では動かさず、レス境界が移動した時に取得・描画後のラインへ追従する。
    const frame = requestAnimationFrame(() =>
      ref.current?.scrollIntoView({ block: "center", behavior: "instant" }),
    );
    return () => cancelAnimationFrame(frame);
  }, [active, boundary]);
  const clock =
    playbackAt === undefined
      ? ""
      : new Intl.DateTimeFormat("ja-JP", {
          timeZone: "Asia/Tokyo",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }).format(new Date(playbackAt));
  return (
    <div
      ref={ref}
      className="thread-page__replay-position"
      role="separator"
      aria-label={`過去実況の再生位置 ${clock}`}
    >
      <span>再生位置 {clock}</span>
    </div>
  );
}
