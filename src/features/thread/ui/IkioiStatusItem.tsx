import { Flame } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import {
  getArchiveReplayThreadCapabilities,
  useArchiveReplayPositionStore,
} from "src/features/archive-replay/browser/position-store";
import {
  buildMomentumGraphData,
  calculateIkioi,
  type MomentumGraphData,
} from "src/features/thread/domain/thread-momentum";
import { MomentumLineChart } from "src/features/thread/ui/MomentumLineChart";
import { container } from "src/service-container/index";
import type { IThreadDetail } from "src/service-container/interfaces";
import { MiniWindow } from "src/view/browser/components/MiniWindow";
import { MiniWindowSection } from "src/view/browser/components/MiniWindowControls";
import { STATUS_BAR_PRIORITY } from "src/view/browser/components/status-bar-priority";
import { StatusBarItem } from "src/view/browser/components/StatusBar";
import { useMiniWindowTrigger } from "src/view/browser/hooks/use-mini-window-trigger";
import { useTabStore } from "src/view/browser/state/tabs/use-tab-store";

export const IkioiStatusItem: React.FC = () => {
  const { viewTab, viewPage } = useTabStore();
  const replayPosition = useArchiveReplayPositionStore((state) => state.position);
  const [ikioi, setIkioi] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [momentumData, setMomentumData] = useState<MomentumGraphData | null>(null);

  const threadUrl = viewPage.type === "thread" ? viewPage.threadUrl : null;
  const threadCapabilities =
    threadUrl == null
      ? null
      : getArchiveReplayThreadCapabilities(replayPosition, viewTab.id, threadUrl);
  const reloadKey = viewTab.reloadKey;
  const {
    triggerRef: miniWindowTriggerRef,
    anchor: miniWindowAnchor,
    toggle: toggleMiniWindow,
    close: closeMiniWindow,
  } = useMiniWindowTrigger(threadCapabilities?.canShowMomentum ? threadUrl : null);

  useEffect(() => {
    if (threadUrl == null) {
      return;
    }
    // 変更理由: 過去実況はログを表示する読み取り専用画面なので、勢い計算用の再取得を行わない。
    if (!threadCapabilities?.canShowMomentum) return;

    let alive = true;

    const syncIkioi = (detail: Pick<IThreadDetail, "res"> | undefined) => {
      if (!alive || !detail?.res) {
        return;
      }
      setIkioi(calculateIkioi(detail.res));
      setMomentumData(buildMomentumGraphData(detail.res));
    };

    const load = async () => {
      setLoading(true);
      try {
        const result = await container.thread.getThread(threadUrl, {
          forceUpdate: false,
          // 常時表示のアイテムなので、cache結果で先に更新してちらつきを減らす。
          onCache: (cached) => syncIkioi(cached),
        });
        syncIkioi(result);
      } catch {
        if (alive) {
          setIkioi(null);
          setMomentumData(null);
        }
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    };

    // 手動更新・自動更新など外部要因の再取得は Tab の reloadKey へ集約されるため、
    // pollingではなく reloadKey 変化時に同期して不要な定期通信を避ける。
    void load();

    return () => {
      alive = false;
    };
  }, [reloadKey, threadCapabilities?.canShowMomentum, threadUrl]);

  const displayValue = useMemo(() => {
    if (loading && ikioi == null) {
      return "...";
    }
    if (ikioi == null) {
      return "--";
    }
    return ikioi.toLocaleString();
  }, [ikioi, loading]);

  if (!threadCapabilities?.canShowMomentum) {
    return null;
  }

  return (
    <>
      <StatusBarItem
        id="ikioi-status"
        alignment="left"
        priority={STATUS_BAR_PRIORITY.left.ikioi}
        title={`勢い: ${displayValue}`}
        interactive
      >
        <button
          ref={miniWindowTriggerRef}
          className="status-bar__btn"
          onClick={toggleMiniWindow}
          title={`勢い: ${displayValue}`}
          aria-label={`勢い ${displayValue}`}
        >
          <span className="status-bar__ikioi">
            <Flame size={13} aria-hidden="true" />
            <span className="status-bar__ikioi-value">{displayValue}</span>
          </span>
        </button>
      </StatusBarItem>

      {miniWindowAnchor && (
        <MiniWindow
          title="勢い"
          anchor={miniWindowAnchor}
          onClose={closeMiniWindow}
          triggerRef={miniWindowTriggerRef}
        >
          <MiniWindowSection title="勢いグラフ">
            <MomentumLineChart data={momentumData} loading={loading} />
          </MiniWindowSection>
        </MiniWindow>
      )}
    </>
  );
};
