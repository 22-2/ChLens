import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen } from "@testing-library/react";
import { type ComponentProps, createRef } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import { MediaViewer } from "./MediaViewer";

describe("MediaViewer", () => {
  const renderMediaViewer = (overrides: Partial<ComponentProps<typeof MediaViewer>> = {}) =>
    render(
      <MediaViewer
        viewer={{
          src: "https://example.com/image.jpg",
          label: "https://example.com/image.jpg",
        }}
        viewerStageRef={createRef<HTMLDivElement>()}
        viewerCanvasRef={createRef<HTMLDivElement>()}
        viewerImageRef={createRef<HTMLImageElement>()}
        canNavigateViewerPrev={false}
        canNavigateViewerNext={false}
        isLoading={false}
        onOverlayClick={() => {}}
        onChromeClick={() => {}}
        onNavigatePrev={() => {}}
        onNavigateNext={() => {}}
        onZoomOut={() => {}}
        onZoomReset={() => {}}
        onZoomIn={() => {}}
        onSave={() => {}}
        onClose={() => {}}
        isDetached={false}
        onDetach={() => {}}
        onAttach={() => {}}
        onImageLoad={() => {}}
        onImageError={() => {}}
        {...overrides}
      />,
    );

  it("保存ボタンから onSave を呼ぶ", () => {
    const onSave = vi.fn();

    renderMediaViewer({ onSave });

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(onSave).toHaveBeenCalledOnce();
  });

  it("最大化操作を表示せず、別窓では閉じる操作を隠す", () => {
    const { container, rerender } = renderMediaViewer({ isDetached: false });

    expect(container.querySelector('[title="閉じる"]')).toHaveClass("media-viewer__close");
    expect(container.querySelector(".media-viewer")).not.toHaveClass("media-viewer--detached");
    expect(container.querySelector('[title="最大化"]')).toBeNull();

    rerender(
      <MediaViewer
        viewer={{ src: "https://example.com/image.jpg", label: "https://example.com/image.jpg" }}
        viewerStageRef={createRef<HTMLDivElement>()}
        viewerCanvasRef={createRef<HTMLDivElement>()}
        viewerImageRef={createRef<HTMLImageElement>()}
        canNavigateViewerPrev={false}
        canNavigateViewerNext={false}
        isLoading={false}
        onOverlayClick={() => {}}
        onChromeClick={() => {}}
        onNavigatePrev={() => {}}
        onNavigateNext={() => {}}
        onZoomOut={() => {}}
        onZoomReset={() => {}}
        onZoomIn={() => {}}
        onSave={() => {}}
        onClose={() => {}}
        isDetached
        onDetach={() => {}}
        onAttach={() => {}}
        onImageLoad={() => {}}
        onImageError={() => {}}
      />,
    );

    expect(container.querySelector(".media-viewer")).toHaveClass("media-viewer--detached");
    expect(container.querySelector('[title="閉じる"]')).toHaveClass("media-viewer__close");
    expect(container.querySelector('[title="元の画面に戻す"]')).not.toBeNull();
    expect(container.querySelector('[title="最大化"]')).toBeNull();
  });

  it("オーバーレイを閉じる mousedown を背後のポップアップへ伝播させない", () => {
    const onDocumentMouseDown = vi.fn();
    const onOverlayClick = vi.fn();
    document.addEventListener("mousedown", onDocumentMouseDown);

    const { container, unmount } = renderMediaViewer({ onOverlayClick });
    const overlay = container.querySelector(".media-viewer");
    expect(overlay).not.toBeNull();

    fireEvent.mouseDown(overlay!);
    fireEvent.click(overlay!);

    expect(onDocumentMouseDown).not.toHaveBeenCalled();
    expect(onOverlayClick).toHaveBeenCalledOnce();

    unmount();
    document.removeEventListener("mousedown", onDocumentMouseDown);
  });
});
