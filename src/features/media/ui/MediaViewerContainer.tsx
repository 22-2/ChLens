import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AuxiliaryWindowOptions,
  createAuxiliaryWindowRoot,
} from "src/features/auxiliary-window/browser/auxiliary-window-root";
import { openAuxiliaryWindow } from "src/features/auxiliary-window/browser/use-auxiliary-window";
import {
  useViewSurface,
  type ViewSurface,
  ViewSurfaceProvider,
} from "src/features/auxiliary-window/browser/use-view-surface";

import { useMediaViewerStore } from "../browser/use-media-viewer-store";
import { MediaViewerContent } from "./MediaViewerContent";

interface MediaViewerContainerProps {
  scopeId: string;
}

interface DetachedMediaViewerWindow {
  window: Window;
  root: HTMLElement;
  onBeforeUnload: () => void;
  onLoad: () => void;
}

const MEDIA_VIEWER_WINDOW_OPTIONS: AuxiliaryWindowOptions = {
  name: "readcrx-media-viewer",
  features: "popup,width=1180,height=820,resizable=yes",
  title: "画像ビューア - read.crx 2",
  shellClassName: "detached-media-viewer-window",
  logLabel: "MediaViewer",
};

export function MediaViewerContainer({
  scopeId,
}: MediaViewerContainerProps): React.ReactElement | null {
  const sourceSurface = useViewSurface();
  const viewerScopeId = useMediaViewerStore((state) => state.viewerScopeId);
  const [detached, setDetached] = useState<DetachedMediaViewerWindow | null>(null);
  const detachedRef = useRef(detached);
  detachedRef.current = detached;

  const removeDetachedWindow = useCallback((expectedWindow?: Window) => {
    const current = detachedRef.current;
    if (!current || (expectedWindow && current.window !== expectedWindow)) {
      return;
    }
    current.window.removeEventListener("beforeunload", current.onBeforeUnload);
    current.window.removeEventListener("load", current.onLoad);
    detachedRef.current = null;
    setDetached(null);
  }, []);

  const attachToSource = useCallback(() => {
    const current = detachedRef.current;
    if (!current) {
      return;
    }
    removeDetachedWindow(current.window);
    if (!current.window.closed) {
      current.window.close();
    }
  }, [removeDetachedWindow]);

  useEffect(() => {
    if (detached && viewerScopeId !== scopeId) {
      // 単一viewerが別scopeへ移った時、旧scopeの別窓だけを残さない。
      attachToSource();
    }
  }, [attachToSource, detached, scopeId, viewerScopeId]);

  const detach = useCallback(() => {
    const current = detachedRef.current;
    if (current && !current.window.closed) {
      current.window.focus();
      return;
    }

    // popupはユーザー操作の同期中に作り、ブロックを避ける。失敗時は元の表示を維持する。
    const opened = openAuxiliaryWindow(MEDIA_VIEWER_WINDOW_OPTIONS, sourceSurface.window);
    if (!opened) {
      return;
    }

    const entry: DetachedMediaViewerWindow = {
      ...opened,
      onBeforeUnload: () => {
        if (detachedRef.current?.window !== opened.window) {
          return;
        }
        if (opened.window.closed) {
          useMediaViewerStore.getState().closeViewer(scopeId);
          removeDetachedWindow(opened.window);
        }
      },
      onLoad: () => {
        if (detachedRef.current?.window !== opened.window || opened.window.closed) {
          return;
        }
        try {
          // 再読み込みで消えたPortal rootだけを作り直し、controllerと画像状態を保持する。
          const root = createAuxiliaryWindowRoot(
            sourceSurface.document,
            opened.window,
            MEDIA_VIEWER_WINDOW_OPTIONS,
          );
          const latest = detachedRef.current;
          if (latest?.window === opened.window) {
            const next = { ...latest, root };
            detachedRef.current = next;
            setDetached(next);
          }
        } catch (error) {
          console.error("[MediaViewer] 再読み込み後の別窓を再接続できませんでした", error);
        }
      },
    };
    opened.window.addEventListener("beforeunload", entry.onBeforeUnload);
    opened.window.addEventListener("load", entry.onLoad);
    detachedRef.current = entry;
    setDetached(entry);
    opened.window.focus();
  }, [removeDetachedWindow, scopeId, sourceSurface.document, sourceSurface.window]);

  useEffect(() => {
    if (!detached) {
      return;
    }
    // beforeunloadの発火差を補い、OSの×でclosedになった時だけviewerを終了する。
    const monitorId = sourceSurface.window.setInterval(() => {
      if (detached.window.closed && detachedRef.current?.window === detached.window) {
        useMediaViewerStore.getState().closeViewer(scopeId);
        removeDetachedWindow(detached.window);
      }
    }, 250);
    return () => sourceSurface.window.clearInterval(monitorId);
  }, [detached, removeDetachedWindow, scopeId, sourceSurface.window]);

  useEffect(() => {
    return () => {
      const current = detachedRef.current;
      if (!current) {
        return;
      }
      current.window.removeEventListener("beforeunload", current.onBeforeUnload);
      current.window.removeEventListener("load", current.onLoad);
      if (!current.window.closed) {
        current.window.close();
      }
    };
  }, []);

  const surface: ViewSurface = detached
    ? { window: detached.window, document: detached.window.document }
    : sourceSurface;

  return (
    <ViewSurfaceProvider surface={surface}>
      <MediaViewerContent
        scopeId={scopeId}
        isDetached={detached !== null}
        onDetach={detach}
        onAttach={attachToSource}
        portalRoot={detached?.root ?? null}
      />
    </ViewSurfaceProvider>
  );
}
