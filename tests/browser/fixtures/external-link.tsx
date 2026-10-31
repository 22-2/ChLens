import "src/view/browser/styles/index.css";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { MediaViewer } from "src/features/media/ui/MediaViewer";
import { ResMediaGallery } from "src/features/media/ui/ResMediaGallery";
import { ResBody } from "src/features/thread/ui/ResBody";
import { container } from "src/service-container";
import { toastStore } from "src/service-container/toast-store";
import { useConfigBooleanSetting } from "src/view/browser/hooks/use-config-boolean-setting";
import { ViewSurfaceProvider } from "src/view/browser/hooks/use-view-surface";
import { useUrlHandlers } from "src/view/browser/pages/thread/use-url-handlers";
import { ConfirmableLink } from "src/view/browser/ui/ConfirmableLink";
import { requestExternalLink } from "src/view/browser/utils/external-link";

import { recordOpen } from "./external-link-platform";

// 既定の手動取得では最初のクリックが画像の取得になり、ビューアーや外部起動の確認まで進まない。
// この画面では外部リンクの確認を検証するため、画像は自動で取得させる。
const config = new Map([
  ["confirm_external_links", "on"],
  ["manual_image_loading", "off"],
]);
const listeners = new Map<unknown, (data: { key?: string }) => void>();
container.config = {
  get: (key) => config.get(key) ?? null,
  ready: (callback) => callback(),
  getAll: () => Object.fromEntries(config),
  set: (key, value) => {
    config.set(key, String(value));
    for (const callback of listeners.values()) callback({ key });
  },
};
container.message = {
  on: <T,>(_type: string, callback: (data: T) => void) => {
    listeners.set(callback, (data) => callback(data as T));
  },
  off: (_type, callback) => {
    listeners.delete(callback);
  },
  send: () => {},
};
container.toast = toastStore;
window.open = ((url: string | URL) => {
  recordOpen(String(url));
  return null;
}) as typeof window.open;

const ARTICLE = "https://example.com/article?id=42&utm_source=test";
const IMAGE = "https://images.example.org/photo.png?utm_source=test";
const noop = () => {};

function Probe() {
  const { value: enabled, setValue } = useConfigBooleanSetting("confirm_external_links");
  const [opened, setOpened] = useState<object[]>([]);
  const [viewer, setViewer] = useState<string | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const [frameDocument, setFrameDocument] = useState<Document | null>(null);
  useEffect(() => {
    const listener = (event: Event) =>
      setOpened((current) => [...current, (event as CustomEvent).detail]);
    window.addEventListener("probe:open", listener);
    return () => window.removeEventListener("probe:open", listener);
  }, []);
  const { handleUrlClick } = useUrlHandlers({
    threadUrl: "https://example.org/test/read.cgi/board/1000000000/",
    dispatch: noop,
    openMediaFromUrl: (url) => setViewer(url),
    addPopupContextMenu: () => "probe-menu",
  });
  return (
    <main className="probe" style={{ padding: "24px" }}>
      <h1>外部リンクの確認</h1>
      <label>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setValue(event.target.checked)}
        />
        確認機能
      </label>
      <button type="button" onClick={() => (document.documentElement.dataset.theme = "dark")}>
        ダーク表示
      </button>
      <output data-testid="opened">{JSON.stringify(opened)}</output>
      <section aria-label="本文">
        <ResBody
          messageHtml={`<a class="res__link" href="${ARTICLE.replaceAll("&", "&amp;")}">記事リンク</a>`}
          anchorPreviewDepth={0}
          onUrlClick={(url, button, mode) => handleUrlClick(url, undefined, button, mode)}
          onUrlContextMenu={noop}
          onIdLinkClick={noop}
          onAnchorClick={noop}
          onAnchorHover={noop}
          onAnchorLeave={noop}
        />
      </section>
      <section aria-label="画像">
        <ResMediaGallery urls={[IMAGE]} onUrlClick={handleUrlClick} openOnMiddleMouseDown />
      </section>
      <section aria-label="通常リンク">
        <ConfirmableLink href={ARTICLE}>埋め込み投稿のリンク</ConfirmableLink>
      </section>
      <button type="button" onClick={() => requestExternalLink("javascript:alert(1)")}>
        非Web URLを検証
      </button>
      <iframe
        title="別Documentのリンク"
        srcDoc="<!doctype html><html><head></head><body></body></html>"
        onLoad={(event) => {
          const doc = event.currentTarget.contentDocument!;
          for (const stylesheet of document.querySelectorAll("style, link[rel='stylesheet']"))
            doc.head.append(stylesheet.cloneNode(true));
          setFrameDocument(doc);
        }}
      />
      {frameDocument &&
        createPortal(
          <ViewSurfaceProvider
            surface={{ document: frameDocument, window: frameDocument.defaultView! }}
          >
            <ConfirmableLink href={ARTICLE}>別窓リンク</ConfirmableLink>
          </ViewSurfaceProvider>,
          frameDocument.body,
        )}
      {viewer && (
        <MediaViewer
          viewer={{ src: IMAGE, label: IMAGE }}
          viewerStageRef={stage}
          viewerCanvasRef={canvas}
          viewerImageRef={image}
          canNavigateViewerPrev={false}
          canNavigateViewerNext={false}
          isLoading={false}
          onOverlayClick={() => setViewer(null)}
          onChromeClick={(event) => event.stopPropagation()}
          onNavigatePrev={noop}
          onNavigateNext={noop}
          onZoomOut={noop}
          onZoomReset={noop}
          onZoomIn={noop}
          onSave={noop}
          onCopy={noop}
          onSaveAllImages={noop}
          isSavingAllImages={false}
          canDeleteImage={false}
          onDeleteImage={noop}
          onClose={() => setViewer(null)}
          onImageLoad={noop}
          onImageError={noop}
          isDetached={false}
          onDetach={noop}
          onAttach={noop}
        />
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Probe />);
