import { useEffect, useMemo, useState } from "react";
import type { BoardThread } from "@chlen/ch-lib";
import {
  DEFAULT_OVERLAY_GEOMETRY,
  liveWindowPlatform,
  type OverlayGeometry,
} from "../platform/index";
import {
  createChLensLiveSource,
  createTauriChLensLiveSource,
  type ChLensLiveSource,
} from "../live-session/source";
import { useLiveBoard, useLiveThread } from "./use-live-sessions";
import { ThreadView } from "./ThreadView";
import { useThreadListController } from "./use-thread-list-controller";
import { ThreadListView } from "../../../../src/view/shared/ThreadListView";
import "./styles.css";

// Phase 2では実況板を固定URLで開く。板一覧UI（BBSMenu）は後続phaseで追加する。
// エッヂは5ch.netのliveedgeが404になるため、Eddibbの正規URLを使う。
const DEFAULT_BOARD_URL = "http://bbs.eddibb.cc/liveedge/";

function createDefaultSource(): ChLensLiveSource {
  // Tauri実行時はCORS回避のためRust側HTTPへ委譲し、ブラウザ実行時は通常fetchを使う。
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
    ? createTauriChLensLiveSource()
    : createChLensLiveSource();
}

type Operation = "show" | "hide" | "focus" | "apply" | "save" | "restore" | "click-through";

function describeOperation(operation: Operation): string {
  switch (operation) {
    case "show":
      return "Overlayを表示しました";
    case "hide":
      return "Overlayを非表示にしました";
    case "focus":
      return "Overlayへfocusしました";
    case "apply":
      return "Overlay geometryを適用しました";
    case "save":
      return "Overlay geometryを保存しました";
    case "restore":
      return "保存済みgeometryを復元しました";
    case "click-through":
      return "クリック透過を切り替えました";
  }
}

export function App() {
  const [geometry, setGeometry] = useState<OverlayGeometry>(DEFAULT_OVERLAY_GEOMETRY);
  const [clickThrough, setClickThrough] = useState(true);
  const [status, setStatus] = useState("Live Session未接続（Phase 1 spike）");
  const source = useMemo(() => createDefaultSource(), []);
  const [selectedThread, setSelectedThread] = useState<BoardThread | null>(null);
  const board = useLiveBoard(DEFAULT_BOARD_URL, { source });
  const thread = useLiveThread(selectedThread?.url ?? null, { source });
  const threadList = useThreadListController({ threads: board.snapshot?.data ?? [] });

  const selectThread = (next: BoardThread) => {
    setSelectedThread(next);
    setStatus(`「${next.title}」を開きました`);
  };

  useEffect(() => {
    // Start in passthrough mode so a newly opened transparent overlay never steals clicks from
    // the application underneath before the user intentionally opens its controls.
    void liveWindowPlatform.setOverlayClickThrough(true).catch((error: unknown) => {
      console.error("[Chlens Live] initial overlay click-through setup failed:", error);
    });

    void liveWindowPlatform
      .loadOverlayGeometry()
      .then((stored) => {
        if (stored) setGeometry(stored);
      })
      .catch((error: unknown) => {
        console.error("[Chlens Live] initial overlay geometry load failed:", error);
      });
  }, []);

  const runOperation = async (
    operation: Operation,
    action: () => Promise<void> | Promise<string | undefined>,
  ) => {
    try {
      // Some operations have a valid non-error outcome that is not the usual success message.
      const result = await action();
      setStatus(typeof result === "string" ? result : describeOperation(operation));
    } catch (error) {
      console.error(`[Chlens Live] overlay operation failed: ${operation}`, error);
      setStatus(`Overlay操作に失敗しました: ${operation}`);
    }
  };

  const updateGeometry = (key: keyof OverlayGeometry, value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    setGeometry((current) => ({ ...current, [key]: parsed }));
  };

  const showOverlay = () =>
    runOperation("show", async () => {
      await liveWindowPlatform.setOverlayGeometry(geometry);
      await liveWindowPlatform.showOverlay();
    });

  const restoreGeometry = () =>
    runOperation("restore", async () => {
      const stored = await liveWindowPlatform.loadOverlayGeometry();
      if (!stored) {
        return "保存済みgeometryはありません";
      }
      setGeometry(stored);
      await liveWindowPlatform.setOverlayGeometry(stored);
    });

  const saveCurrentGeometry = () =>
    runOperation("save", async () => {
      const current = (await liveWindowPlatform.getOverlayGeometry()) ?? geometry;
      setGeometry(current);
      await liveWindowPlatform.saveOverlayGeometry(current);
    });

  const toggleClickThrough = () =>
    runOperation("click-through", async () => {
      const nextClickThrough = !clickThrough;
      await liveWindowPlatform.setOverlayClickThrough(nextClickThrough);
      setClickThrough(nextClickThrough);
    });

  return (
    <main className="live-shell">
      <header className="live-header">
        <div>
          <p className="live-eyebrow">CHLENS LIVE</p>
          <h1>実況 Main</h1>
        </div>
        <span className="live-phase">Phase 4</span>
      </header>

      <section className="live-card" aria-labelledby="thread-ui-title">
        <div className="live-card__heading">
          <div>
            <p className="live-eyebrow">LIVE READER</p>
            <h2 id="thread-ui-title">ThreadList / Thread</h2>
          </div>
          <output className="live-status">
            {board.loading
              ? "板を取得中…"
              : board.error
                ? "板の取得に失敗しました"
                : `${board.snapshot?.data.length ?? 0}件のスレ`}
          </output>
        </div>
        <div className="live-reader">
          <div className="live-reader__list">
            <ThreadListView
              rows={threadList.rows}
              loading={board.loading}
              error={board.error ? "スレ一覧の取得に失敗しました" : null}
              query={threadList.query}
              onQueryChange={threadList.setQuery}
              sortColumn={threadList.sortColumn}
              sortDirection={threadList.sortDirection}
              onSort={threadList.sort}
              selectedId={selectedThread?.url ?? null}
              onSelect={(row) => {
                const thread = threadList.threadsById.get(row.id);
                if (thread) selectThread(thread);
              }}
            />
          </div>
          <div className="live-reader__thread">
            {selectedThread ? (
              <ThreadView
                title={thread.snapshot?.data.title ?? selectedThread.title}
                posts={thread.snapshot?.data.posts ?? []}
                loading={thread.loading}
                error={thread.error}
                datFall={false}
                onRefresh={thread.refresh}
                onStop={thread.stop}
              />
            ) : (
              <div className="live-reader__placeholder">スレを選択してください</div>
            )}
          </div>
        </div>
      </section>

      <section className="live-card" aria-labelledby="overlay-window-title">
        <div className="live-card__heading">
          <div>
            <p className="live-eyebrow">WINDOW CONTROL</p>
            <h2 id="overlay-window-title">Overlay window</h2>
          </div>
          <output className="live-status" data-testid="live-status">
            {status}
          </output>
        </div>

        <div className="live-actions">
          <button type="button" onClick={showOverlay}>
            Overlayを表示
          </button>
          <button
            type="button"
            onClick={() => runOperation("hide", () => liveWindowPlatform.hideOverlay())}
          >
            非表示
          </button>
          <button
            type="button"
            onClick={() => runOperation("focus", () => liveWindowPlatform.focusOverlay())}
          >
            focus
          </button>
          <button type="button" aria-pressed={clickThrough} onClick={toggleClickThrough}>
            {clickThrough ? "クリック透過を解除" : "クリック透過を有効化"}
          </button>
        </div>

        <div className="live-geometry" aria-label="Overlay geometry">
          {(["x", "y", "width", "height"] as const).map((key) => (
            <label key={key}>
              <span>{key}</span>
              <input
                type="number"
                value={geometry[key]}
                onChange={(event) => updateGeometry(key, event.target.value)}
              />
            </label>
          ))}
        </div>

        <div className="live-actions live-actions--secondary">
          <button
            type="button"
            onClick={() =>
              runOperation("apply", () => liveWindowPlatform.setOverlayGeometry(geometry))
            }
          >
            geometryを適用
          </button>
          <button type="button" onClick={saveCurrentGeometry}>
            現在位置を保存
          </button>
          <button type="button" onClick={restoreGeometry}>
            保存位置を復元
          </button>
        </div>
      </section>

      <p className="live-note">
        Overlay本体は起動時からクリック透過です。上部の操作バーは同じ透明window内にあり、透過中もドラッグと
        最小化・最大化・閉じる操作が可能です。起動直後は位置確認のためバーを表示し、バーから
        ポインターが離れた後はホバー時だけ表示します。透過中はバーとリサイズ境界だけ一時的に
        操作可能になります。解除はこのMainから行います。
      </p>
    </main>
  );
}
