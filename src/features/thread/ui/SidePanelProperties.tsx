import { type ReactNode, useMemo } from "react";
import { collectThreadImages } from "src/features/media/domain/thread-images";
import { useStoredReadState } from "src/features/thread/browser/use-stored-read-state";
import {
  buildMomentumGraphData,
  calculateIkioi,
  collectResTimestamps,
} from "src/features/thread/domain/thread-momentum";
import { countUnreadResponses } from "src/features/thread/domain/unread-count";
import { MomentumLineChart } from "src/features/thread/ui/MomentumLineChart";
import { ThreadSnapshotGate } from "src/view/browser/components/ThreadSnapshotGate";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import { useTabStore } from "src/view/browser/state/tabs/use-tab-store";
import type { ThreadSnapshot } from "src/view/browser/state/thread-snapshot";
import type { ThreadPage } from "src/view/browser/types";
import { formatCompactDateTime } from "src/view/browser/utils/date-time";
import { getBoardUrlFromThreadUrl } from "src/view/browser/utils/link-routing";

const UNKNOWN = "不明";

function formatElapsed(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 60) return `${minutes}分`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間${minutes % 60}分`;
  return `${Math.floor(hours / 24)}日${hours % 24}時間`;
}

function formatTimestamp(timestamp: number | null): string {
  return timestamp == null ? UNKNOWN : formatCompactDateTime(timestamp);
}

function ThreadProperties({ page, data }: { page: ThreadPage; data: ThreadSnapshot }) {
  const { dispatch } = useTabStore();
  const stats = useMemo(() => {
    // 経過時間と勢いは本文の更新時刻を基準に揃え、パネルの再描画では値を動かさない。
    const now = data.updatedAt;
    const timestamps = collectResTimestamps(data.responses);
    return {
      firstAt: timestamps[0] ?? null,
      lastAt: timestamps.at(-1) ?? null,
      now,
      ikioi: calculateIkioi(data.responses, now),
      graph: buildMomentumGraphData(data.responses, now),
      // 画像数は画像一覧と同じ判定で、NG に関係なくスレ全体を数える。
      imageCount: collectThreadImages(data.responses, data.messageProtocol).length,
    };
  }, [data]);
  const readState = useStoredReadState(page.threadUrl);

  // 板を特定できない URL では元の URL が返るため、その場合は板の操作を出さない。
  const boardUrl = getBoardUrlFromThreadUrl(page.threadUrl);
  const board =
    boardUrl === page.threadUrl ? (
      UNKNOWN
    ) : (
      <button
        type="button"
        className="side-panel__link"
        onClick={() =>
          dispatch(
            tabActions.navigate({
              type: "threadList",
              title: boardUrl,
              boardUrl,
              boardTitle: boardUrl,
            }),
          )
        }
      >
        {boardUrl}
      </button>
    );
  const unreadCount = countUnreadResponses(data.responses.length, readState);
  const status = data.expired ? "dat落ち" : data.error ? `取得失敗（${data.error}）` : "取得済み";
  const rows: [string, ReactNode][] = [
    ["スレ名", page.title],
    ["URL", page.threadUrl],
    ["板", board],
    ["作成日時", formatTimestamp(stats.firstAt)],
    ["経過時間", stats.firstAt == null ? UNKNOWN : formatElapsed(stats.now - stats.firstAt)],
    ["最終レス", formatTimestamp(stats.lastAt)],
    ["レス数", data.responses.length.toLocaleString()],
    ["未読数", unreadCount == null ? UNKNOWN : unreadCount.toLocaleString()],
    ["画像数", stats.imageCount.toLocaleString()],
    ["状態", status],
    ["勢い", stats.ikioi == null ? UNKNOWN : stats.ikioi.toLocaleString()],
    ["最終更新", formatCompactDateTime(stats.now)],
  ];
  return (
    <div className="side-panel__content">
      <dl className="side-panel__properties">
        {rows.map(([label, value]) => (
          <div key={label} className="side-panel__property">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <MomentumLineChart data={stats.graph} loading={false} />
    </div>
  );
}

export function SidePanelProperties({ tabId, page }: { tabId: string; page: ThreadPage }) {
  return (
    <ThreadSnapshotGate tabId={tabId} threadUrl={page.threadUrl}>
      {(snapshot) => <ThreadProperties page={page} data={snapshot} />}
    </ThreadSnapshotGate>
  );
}
