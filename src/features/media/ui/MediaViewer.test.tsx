import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { type ComponentProps, createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("src/app/platform", () => ({
  platform: { http: { fetch: vi.fn() } },
}));
vi.mock("src/view/browser/hooks/use-config-boolean-setting", () => ({
  useConfigBooleanSetting: () => ({ value: false }),
}));
vi.mock("./ExternalImage", () => ({
  ExternalImage: () => <img alt="テスト画像" />,
}));

import { useMediaImageStore } from "../browser/use-media-image-store";
import { MediaViewer } from "./MediaViewer";

describe("MediaViewer", () => {
  afterEach(() => {
    cleanup();
    useMediaImageStore.setState({ images: new Map() });
  });

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
        onSaveAllImages={() => {}}
        isSavingAllImages={false}
        onCopy={() => {}}
        canDeleteImage={false}
        onDeleteImage={() => {}}
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

  it("右クリックメニューから読込済みの画像をコピーできる", () => {
    useMediaImageStore.setState({
      images: new Map([
        ["https://example.com/image.jpg", { status: "loaded", version: 1, fallbackSrc: null }],
      ]),
    });
    const onCopy = vi.fn();
    const { container } = renderMediaViewer({ onCopy });

    expect(screen.queryByRole("button", { name: "画像をコピー" })).not.toBeInTheDocument();
    expect(screen.queryByText("ブラウザで開く")).not.toBeInTheDocument();
    fireEvent.contextMenu(container.querySelector(".media-viewer")!);
    fireEvent.click(screen.getByRole("menuitem", { name: "画像をコピー" }));
    expect(onCopy).toHaveBeenCalledOnce();
  });

  it("読込中でも右クリックメニューを開け、画像のコピーは無効になる", () => {
    const { container } = renderMediaViewer({ isLoading: true });
    fireEvent.contextMenu(container.querySelector(".media-viewer")!);
    expect(screen.getByRole("menuitem", { name: "画像をコピー" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "ブラウザで開く" })).toBeEnabled();
  });

  it("このアプリから投稿した画像では削除ボタンから onDeleteImage を呼ぶ", () => {
    const onDeleteImage = vi.fn();

    renderMediaViewer({ canDeleteImage: true, onDeleteImage });

    fireEvent.click(screen.getByRole("button", { name: "削除" }));

    expect(onDeleteImage).toHaveBeenCalledOnce();
  });

  it("削除できない画像では削除ボタンを表示しない", () => {
    const { container } = renderMediaViewer({ canDeleteImage: false });

    expect(container.querySelector('[title="Imgurから削除"]')).toBeNull();
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
        onSaveAllImages={() => {}}
        isSavingAllImages={false}
        onCopy={() => {}}
        canDeleteImage={false}
        onDeleteImage={() => {}}
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

// 画像取得の依存から拡張 API を初期化しないよう、画面テストでは通信境界を差し替える。
vi.mock("src/app/platform", () => ({ platform: { http: { fetch: vi.fn() } } }));
