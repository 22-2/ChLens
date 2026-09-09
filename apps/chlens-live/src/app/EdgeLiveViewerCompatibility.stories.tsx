import { useEffect, useMemo, useState, type ReactElement } from "react";
import type { CommentCandidate } from "src/features/comment-overlay/domain";
import { OverlayStage } from "src/features/comment-overlay/ui/OverlayStage";
import { EdgeLiveViewerSettingsPanel } from "./EdgeLiveViewerSettingsPanel";
import {
  DEFAULT_EDGE_LIVE_VIEWER_SETTINGS,
  filterEdgeLiveViewerComments,
  type EdgeLiveViewerSettings,
} from "./edge-live-viewer-settings";

const FIXTURE_COMMENTS: readonly CommentCandidate[] = [
  { responseNumber: 101, author: "名無し", id: "live-1", text: "試合始まった！", date: "21:04:12" },
  {
    responseNumber: 102,
    author: "実況民",
    id: "live-2",
    text: ">>101 今日は期待できそう",
    date: "21:04:15",
  },
  {
    responseNumber: 103,
    author: "名無し",
    id: "live-3",
    text: "画像 https://example.com/sample.png",
    date: "21:04:18",
  },
  {
    responseNumber: 104,
    author: "解説民",
    id: "blocked-id",
    text: "このコメントはNG設定を試せます",
    date: "21:04:21",
  },
];

export default {
  title: "Live/EdgeLiveViewer互換",
  parameters: {
    docs: {
      description: {
        component:
          "EdgeLiveViewerの主要な表示設定・NG設定・再生操作を、Tauriなしで比較確認するfixtureです。",
      },
    },
  },
};

export function 設定とオーバーレイ(): ReactElement {
  const [settings, setSettings] = useState<EdgeLiveViewerSettings>({
    ...DEFAULT_EDGE_LIVE_VIEWER_SETTINGS,
  });
  const [playing, setPlaying] = useState(true);
  const [comments, setComments] = useState<readonly CommentCandidate[]>(FIXTURE_COMMENTS);
  const visibleComments = useMemo(
    () => filterEdgeLiveViewerComments(comments, settings),
    [comments, settings],
  );

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(
      () => {
        setComments((current) => {
          const nextNumber = (current.at(-1)?.responseNumber ?? 104) + 1;
          const next = [
            ...current,
            {
              responseNumber: nextNumber,
              author: "新着実況",
              id: `live-${nextNumber}`,
              text: `新着コメント ${nextNumber}：速度と行間を確認`,
              date: new Date().toLocaleTimeString("ja-JP"),
            },
          ];
          // 変更理由: 長時間Storybookを開いてもDOM入力が増え続けないよう、設定と同じ上限で履歴を保つ。
          return next.slice(-settings.maxComments);
        });
      },
      Math.max(500, (settings.updateIntervalSeconds * 1_000) / settings.playbackSpeed),
    );
    return () => window.clearInterval(timer);
  }, [playing, settings.maxComments, settings.playbackSpeed, settings.updateIntervalSeconds]);

  const bottomPadding = settings.displayPosition === "bottom" ? 0 : 120;
  const topPadding = settings.displayPosition === "bottom" ? 120 : 0;
  return (
    <main className="edge-compat-story">
      <section className="edge-compat-story__preview">
        <header>
          <div>
            <strong>EdgeLiveViewer互換プレビュー</strong>
            <span>
              {visibleComments.length}件表示 / {comments.length - visibleComments.length}件NG
            </span>
          </div>
          <button type="button" onClick={() => setPlaying((current) => !current)}>
            {playing ? "一時停止" : "再生"}
          </button>
        </header>
        <div className="edge-compat-story__screen" style={{ opacity: settings.opacity }}>
          <OverlayStage
            key={`${settings.displayPosition}-${settings.fontSize}-${settings.spacing}`}
            comments={visibleComments}
            fitToContainer
            stageWidth={960}
            stageHeight={420}
            fontFamily={settings.fontFamily}
            fontSize={settings.fontSize}
            fontWeight={settings.fontWeight}
            fontColor={settings.fontColor}
            shadowSize={settings.shadowSize}
            shadowColor={settings.shadowColor}
            shadowDirections={settings.shadowDirections}
            durationSeconds={settings.durationSeconds}
            laneHeight={Math.ceil(settings.fontSize * 1.2 + settings.spacing)}
            maxActiveCount={settings.maxComments}
            maxQueueSize={settings.maxComments}
            commentOpacity={1}
            backgroundColor={settings.opaqueBackground ? settings.chromaKeyColor : "transparent"}
            topPadding={topPadding}
            bottomPadding={bottomPadding}
            playing={playing}
            interactive={false}
            showCommentInfo={false}
          />
        </div>
        <footer>アンカー・URL・NG ID／名前／本文は「NG設定」からその場で確認できます。</footer>
      </section>
      <EdgeLiveViewerSettingsPanel value={settings} onChange={setSettings} />
    </main>
  );
}
