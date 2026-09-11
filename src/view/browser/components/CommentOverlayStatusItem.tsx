import { AlertTriangle, MessageCircle } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { isTauriRuntime } from "src/app/platform/runtime";
import { useCommentOverlay } from "src/features/comment-overlay/application/use-comment-overlay";
import {
  commentOverlayWindowPlatform,
  type CommentOverlayGeometry,
  type CommentOverlayMonitor,
} from "src/features/comment-overlay/platform";
import { OverlayControlPanel } from "src/features/comment-overlay/ui/OverlayControlPanel";
import { MiniWindow } from "src/view/browser/components/MiniWindow";
import { StatusBarItem } from "src/view/browser/components/StatusBar";
import { STATUS_BAR_PRIORITY } from "src/view/browser/components/status-bar-priority";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";

interface CommentOverlayStatusItemProps {
  isActive: boolean;
}

/** Tauri版のスレッドだけに実況操作を表示し、Browser版のUI契約を変えない。 */
export const CommentOverlayStatusItem: React.FC<CommentOverlayStatusItemProps> = ({ isActive }) => {
  const { currentPage } = useTabStore();
  const { controller, snapshot } = useCommentOverlay();
  const [isWindowOpen, setIsWindowOpen] = useState(false);
  const [isControlPanelOpen, setIsControlPanelOpen] = useState(false);
  const [monitors, setMonitors] = useState<readonly CommentOverlayMonitor[]>([]);
  const [panelGeometry, setPanelGeometry] = useState<CommentOverlayGeometry | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelWriteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTauri = isTauriRuntime();
  const threadUrl = currentPage.type === "thread" ? currentPage.threadUrl : null;

  const isRunning = snapshot.state.status === "running";
  const isFlowing = isRunning && snapshot.visible;
  const errorLabel = snapshot.error == null ? null : `コメント実況エラー: ${snapshot.error}`;

  useEffect(() => {
    // 変更理由: 別スレッドへ移動した後に、直前のスレッド向け操作が開いたままに
    // 見えないよう、ステータス項目の対象が変わるタイミングで小窓を閉じる。
    setIsWindowOpen(false);
    setIsControlPanelOpen(false);
  }, [threadUrl]);

  useEffect(() => {
    if (!isWindowOpen || !isControlPanelOpen) return;
    // 変更理由: Overlayは表示専用に固定したため、実モニターと現在geometryを
    // Mainの操作パネルを開いた時だけ取得し、Overlay側の再計測を発生させない。
    let disposed = false;
    void Promise.all([
      commentOverlayWindowPlatform.getMonitors(),
      commentOverlayWindowPlatform.getGeometry(),
    ])
      .then(([nextMonitors, nextGeometry]) => {
        if (disposed) return;
        setMonitors(nextMonitors);
        setPanelGeometry(nextGeometry);
      })
      .catch((error: unknown) => {
        console.error("[ChLens] コメントOverlay操作パネルの初期化に失敗しました:", error);
      });

    return () => {
      disposed = true;
    };
  }, [isControlPanelOpen, isWindowOpen]);

  useEffect(() => {
    return () => {
      if (panelWriteTimerRef.current) clearTimeout(panelWriteTimerRef.current);
    };
  }, []);

  const handleFlowToggle = useCallback(() => {
    if (isFlowing) {
      void controller.stop().catch((error: unknown) => {
        console.error("[ChLens] コメント実況の停止に失敗しました:", error);
      });
      return;
    }
    if (isRunning) {
      void controller.setVisible(true).catch((error: unknown) => {
        console.error("[ChLens] コメントOverlayの再表示に失敗しました:", error);
      });
      return;
    }
    if (!threadUrl) return;
    // 変更理由: Overlay表示と実況開始は利用者にとって同じ操作なので、単一ボタンから
    // controller.startへ渡し、表示だけONで新着が流れない中間状態を作らない。
    void controller.start(threadUrl).catch((error: unknown) => {
      console.error("[ChLens] コメント実況の開始に失敗しました:", error);
    });
  }, [controller, isFlowing, isRunning, threadUrl]);

  const handleWindowToggle = useCallback(() => {
    if (btnRef.current) {
      setAnchorRect(btnRef.current.getBoundingClientRect());
    }
    setIsWindowOpen((current) => !current);
  }, []);

  const closeWindow = useCallback(() => setIsWindowOpen(false), []);

  const handlePanelGeometryChange = useCallback((nextGeometry: CommentOverlayGeometry) => {
    // 変更理由: ドラッグ中の連続座標を40ms単位へまとめ、表示の追従性とnative IPC量を両立する。
    setPanelGeometry(nextGeometry);
    if (panelWriteTimerRef.current) clearTimeout(panelWriteTimerRef.current);
    panelWriteTimerRef.current = setTimeout(() => {
      panelWriteTimerRef.current = null;
      void commentOverlayWindowPlatform
        .setGeometry(nextGeometry)
        .then(() => commentOverlayWindowPlatform.saveGeometry(nextGeometry))
        .catch((error: unknown) => {
          console.error(
            "[ChLens] コメントOverlay操作パネルからのgeometry反映に失敗しました:",
            error,
          );
        });
    }, 40);
  }, []);

  if (!isTauri || !isActive || (threadUrl == null && !isRunning)) return null;

  const flowLabel = isFlowing ? "コメントを画面に流す: ON" : "コメントを画面に流す: OFF";
  const statusLabel =
    errorLabel ??
    (isFlowing ? "コメントOverlay制御: 実況中・表示中" : "コメントOverlay制御: 停止中");

  return (
    <>
      <StatusBarItem
        id="comment-overlay-status"
        alignment="left"
        priority={STATUS_BAR_PRIORITY.left.commentOverlay}
        title={statusLabel}
        className={isRunning ? "status-bar__item--active" : undefined}
        interactive
      >
        <button
          ref={btnRef}
          type="button"
          className="status-bar__btn"
          onClick={handleWindowToggle}
          title={statusLabel}
          aria-label={statusLabel}
        >
          {errorLabel ? (
            <AlertTriangle size={13} aria-hidden="true" />
          ) : (
            <MessageCircle size={13} aria-hidden="true" />
          )}
        </button>
      </StatusBarItem>

      {isWindowOpen && anchorRect && (
        <MiniWindow
          title={isControlPanelOpen ? "コメントOverlay表示領域" : "コメントOverlay"}
          anchor={anchorRect}
          onClose={closeWindow}
          triggerRef={btnRef}
          width={isControlPanelOpen ? 560 : 280}
        >
          <div className="mini-window__section">
            <div className="mini-window__toggle-row">
              <span className="mini-window__toggle-label">コメントを画面に流す</span>
              <button
                type="button"
                className={`mini-window__toggle-btn${
                  isFlowing ? " mini-window__toggle-btn--on" : ""
                }`}
                onClick={handleFlowToggle}
                disabled={!isRunning && threadUrl == null}
                title={flowLabel}
                aria-label={flowLabel}
              >
                {isFlowing ? "ON" : "OFF"}
              </button>
            </div>
            <p className="mini-window__note">表示中のスレッドの新着レスをOverlayへ流します</p>
          </div>

          <div className="mini-window__separator" />

          <div className="mini-window__section">
            <button
              type="button"
              className="mini-window__action-btn"
              onClick={() => setIsControlPanelOpen((current) => !current)}
            >
              {isControlPanelOpen ? "表示領域パネルを閉じる" : "表示領域を調整"}
            </button>
          </div>

          {isControlPanelOpen && (
            <>
              <div className="mini-window__separator" />
              <OverlayControlPanel
                monitors={monitors}
                geometry={panelGeometry}
                onGeometryChange={handlePanelGeometryChange}
              />
            </>
          )}

          {errorLabel && (
            <>
              <div className="mini-window__separator" />
              <div className="mini-window__section">
                <p className="mini-window__note">{errorLabel}</p>
              </div>
            </>
          )}
        </MiniWindow>
      )}
    </>
  );
};
