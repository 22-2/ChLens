import { useEffect, useState } from "react";
import {
  DEFAULT_OVERLAY_GEOMETRY,
  liveWindowPlatform,
  type OverlayGeometry,
} from "../platform/index";
import "./styles.css";

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
  const [clickThrough, setClickThrough] = useState(false);
  const [status, setStatus] = useState("Live Session未接続（Phase 1 spike）");

  useEffect(() => {
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
        <span className="live-phase">Phase 1 spike</span>
      </header>

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
        Overlay本体はクリック透過できます。上部の操作バーは同じ透明window内にあり、透過中もドラッグと
        最小化・最大化・閉じる操作が可能です。バーのダブルクリックでも最大化を切り替えられます。
        透過中はバーとリサイズ境界だけ一時的に操作可能になります。解除はこのMainから行います。
      </p>
    </main>
  );
}
