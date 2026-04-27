import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { MediaViewer } from "src/view/browser/components/MediaViewer";
import { describe, expect, it, vi } from "vitest";

describe("MediaViewer", () => {
  it("保存ボタンから onSave を呼ぶ", () => {
    const onSave = vi.fn();

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
        onOverlayClick={() => {}}
        onChromeClick={() => {}}
        onNavigatePrev={() => {}}
        onNavigateNext={() => {}}
        onZoomOut={() => {}}
        onZoomReset={() => {}}
        onZoomIn={() => {}}
        onSave={onSave}
        onClose={() => {}}
        onImageLoad={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(onSave).toHaveBeenCalledOnce();
  });
});
