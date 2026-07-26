import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { createRef, type ComponentProps } from "react";
import { MediaViewer } from "src/view/browser/components/MediaViewer";
import { describe, expect, it, vi } from "vite-plus/test";

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
        isMaximized={false}
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
        onToggleMaximize={() => {}}
        onImageLoad={() => {}}
        {...overrides}
      />,
    );

  it("保存ボタンから onSave を呼ぶ", () => {
    const onSave = vi.fn();

    renderMediaViewer({ onSave });

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(onSave).toHaveBeenCalledOnce();
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
