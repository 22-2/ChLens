import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { ViewerState } from "src/view/browser/utils/types";
import { toViewerImageUrl } from "src/view/browser/utils/utils";

interface UseMediaViewerResult {
  viewer: ViewerState | null;
  viewerScale: number;
  viewerStageRef: RefObject<HTMLDivElement | null>;
  openMediaFromUrl: (url: string, resImages?: string[]) => void;
  closeViewer: () => void;
  navigateViewer: (delta: number) => void;
  setViewerScale: Dispatch<SetStateAction<number>>;
}

export function useMediaViewer(): UseMediaViewerResult {
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const [viewerScale, setViewerScale] = useState(1);
  const viewerStageRef = useRef<HTMLDivElement | null>(null);

  const openMediaFromUrl = useCallback((url: string, resImages?: string[]) => {
    const imageUrl = toViewerImageUrl(url);
    if (imageUrl) {
      if (resImages && resImages.length > 1) {
        const idx = resImages.indexOf(url);
        setViewer({
          src: imageUrl,
          label: url,
          images: resImages,
          currentIndex: idx >= 0 ? idx : 0,
        });
      } else {
        setViewer({ src: imageUrl, label: url });
      }
      setViewerScale(1);
      return;
    }

    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const navigateViewer = useCallback((delta: number) => {
    setViewer((prev) => {
      if (!prev?.images) return prev;
      const len = prev.images.length;
      const newIdx = ((prev.currentIndex ?? 0) + delta + len) % len;
      const rawUrl = prev.images[newIdx];
      const newSrc = toViewerImageUrl(rawUrl) ?? rawUrl;
      return { ...prev, src: newSrc, label: rawUrl, currentIndex: newIdx };
    });
    setViewerScale(1);
  }, []);

  const closeViewer = useCallback(() => {
    setViewer(null);
  }, []);

  useEffect(() => {
    if (!viewer) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeViewer();
      } else if (e.key === "ArrowLeft") {
        navigateViewer(-1);
      } else if (e.key === "ArrowRight") {
        navigateViewer(1);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeViewer, navigateViewer, viewer]);

  useEffect(() => {
    const el = viewerStageRef.current;
    if (!el) return;

    const handler = (e: WheelEvent) => {
      e.preventDefault();
      setViewerScale((prev) => {
        const next = e.deltaY < 0 ? prev + 0.15 : prev - 0.15;
        return Math.min(5, Math.max(0.25, +next.toFixed(2)));
      });
    };

    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [viewer]);

  return {
    viewer,
    viewerScale,
    viewerStageRef,
    openMediaFromUrl,
    closeViewer,
    navigateViewer,
    setViewerScale,
  };
}
