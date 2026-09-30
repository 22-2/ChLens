import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { useMediaViewerStore } from "../browser/use-media-viewer-store";
import { MediaViewerContainer } from "./MediaViewerContainer";

const mocks = vi.hoisted(() => ({
  openAuxiliaryWindow: vi.fn(),
  createAuxiliaryWindowRoot: vi.fn(),
}));

vi.mock("src/view/browser/hooks/use-auxiliary-window", () => ({
  openAuxiliaryWindow: mocks.openAuxiliaryWindow,
}));

vi.mock("src/view/browser/hooks/auxiliary-window-root", () => ({
  createAuxiliaryWindowRoot: mocks.createAuxiliaryWindowRoot,
}));

const IMAGE_URL = "https://example.com/image.jpg";

describe("別窓ビューアの表示サーフェス", () => {
  let iframe: HTMLIFrameElement;
  let popupWindow: Window;
  let popupDocument: Document;
  let initialRoot: HTMLElement;

  beforeEach(() => {
    useMediaViewerStore.setState({
      viewer: null,
      viewerScopeId: null,
      viewerScale: 1,
      isLoading: false,
    });
    iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    if (!iframe.contentWindow) {
      throw new Error("別窓用のテストDocumentを作成できませんでした");
    }
    popupWindow = iframe.contentWindow;
    popupDocument = popupWindow.document;
    Object.defineProperty(popupWindow, "focus", { configurable: true, value: vi.fn() });
    initialRoot = popupDocument.createElement("div");
    popupDocument.body.replaceChildren(initialRoot);
    mocks.openAuxiliaryWindow.mockReset();
    mocks.createAuxiliaryWindowRoot.mockReset();
    mocks.openAuxiliaryWindow.mockReturnValue({ window: popupWindow, root: initialRoot });
    mocks.createAuxiliaryWindowRoot.mockImplementation(
      (_sourceDocument: Document, targetWindow: Window) => {
        const root = targetWindow.document.createElement("div");
        targetWindow.document.body.replaceChildren(root);
        return root;
      },
    );
  });

  afterEach(() => {
    cleanup();
    iframe.remove();
  });

  it("切り離し・再読み込み・復帰の後も新しいstageでwheelとpanを維持する", () => {
    useMediaViewerStore.getState().openMediaFromUrl(IMAGE_URL, undefined, "thread-a");
    render(<MediaViewerContainer scopeId="thread-a" />);
    fireEvent.click(screen.getByRole("button", { name: "別窓へ切り離す" }));

    const getStage = (targetDocument: Document) => {
      const stage = targetDocument.querySelector<HTMLElement>(".media-viewer__stage");
      const image = targetDocument.querySelector<HTMLImageElement>(".media-viewer__image");
      const canvas = targetDocument.querySelector<HTMLElement>(".media-viewer__canvas");
      if (!stage || !image || !canvas) {
        throw new Error("テスト用ビューアーのstageが見つかりません");
      }
      stage.getBoundingClientRect = () =>
        ({
          x: 0,
          y: 0,
          left: 0,
          top: 0,
          right: 600,
          bottom: 400,
          width: 600,
          height: 400,
          toJSON: () => ({}),
        }) as DOMRect;
      Object.defineProperties(image, {
        complete: { configurable: true, value: true },
        naturalWidth: { configurable: true, value: 800 },
        naturalHeight: { configurable: true, value: 600 },
      });
      fireEvent.load(image);
      return { stage, canvas };
    };

    const { stage, canvas } = getStage(popupDocument);
    fireEvent.wheel(stage, { deltaY: -1, clientX: 300, clientY: 200 });
    expect(useMediaViewerStore.getState().viewerScale).toBe(1.25);
    const zoomTransform = canvas.style.transform;
    fireEvent.mouseDown(stage, { button: 0, clientX: 300, clientY: 200 });
    fireEvent.mouseMove(popupWindow, { clientX: 330, clientY: 220 });
    fireEvent.mouseUp(popupWindow, { button: 0 });
    const panTransform = canvas.style.transform;
    const parseTranslation = (transform: string) => {
      const match = transform.match(/translate\((-?[\d.]+)px, (-?[\d.]+)px\)/);
      if (!match) {
        throw new Error(`画像位置のtransformを解析できません: ${transform}`);
      }
      return { x: Number(match[1]), y: Number(match[2]) };
    };
    const beforePan = parseTranslation(zoomTransform);
    const afterPan = parseTranslation(panTransform);
    expect(afterPan.x).toBe(beforePan.x + 30);
    expect(afterPan.y).toBe(beforePan.y + 20);

    // reloadではbeforeunloadが先に来てもclosed=falseなのでstoreを維持してからrootを再生成する。
    act(() => {
      popupWindow.dispatchEvent(new Event("beforeunload"));
    });
    expect(useMediaViewerStore.getState().viewer?.label).toBe(IMAGE_URL);
    popupDocument.body.replaceChildren();
    act(() => {
      popupWindow.dispatchEvent(new Event("load"));
    });
    expect(mocks.createAuxiliaryWindowRoot).toHaveBeenCalledTimes(1);

    const reloaded = getStage(popupDocument);
    expect(reloaded.canvas.style.transform).toBe(panTransform);
    fireEvent.wheel(reloaded.stage, { deltaY: -1, clientX: 300, clientY: 200 });
    expect(useMediaViewerStore.getState().viewerScale).toBe(1.5);

    fireEvent.click(within(popupDocument.body).getByRole("button", { name: "元の画面に戻す" }));
    const { stage: returnedStage } = getStage(document);
    fireEvent.wheel(returnedStage, { deltaY: -1, clientX: 300, clientY: 200 });
    expect(useMediaViewerStore.getState().viewerScale).toBe(1.75);
  });
});
