import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ExternalImageProps } from "src/features/media/ui/ExternalImage";
import { InlineExpandedImage } from "src/features/media/ui/InlineExpandedImage";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("src/app/logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

// 画像の取得は ExternalImage の責務なので、ここでは img の読み込み結果だけを流す。
vi.mock("src/features/media/ui/ExternalImage", async () => {
  const React = await import("react");
  return {
    ExternalImage: (props: ExternalImageProps) =>
      React.createElement("img", {
        src: props.src,
        alt: props.alt ?? "",
        "data-image-key": props["data-image-key"],
        onLoad: props.onLoad,
        onError: props.onError,
      }),
  };
});

const IMAGE_URL = "https://images.example.com/photo.png";

type Props = Parameters<typeof InlineExpandedImage>[0];

function createProps(overrides: Partial<Props> = {}): Props {
  return {
    src: IMAGE_URL,
    imageKey: IMAGE_URL,
    isBlurred: false,
    blurStyle: {},
    onClose: vi.fn(),
    onOpenViewer: vi.fn(),
    onContextMenu: vi.fn(),
    onLoad: vi.fn(),
    onError: vi.fn(),
    onResize: vi.fn(),
    ...overrides,
  };
}

/** 親要素のクリックを記録し、画像の操作が親へ伝わらないことを確かめられるようにする。 */
function renderInline(overrides: Partial<Props> = {}) {
  const props = createProps(overrides);
  const parentClick = vi.fn();
  const { container } = render(
    <div data-testid="parent" style={{ paddingRight: 0 }} onClick={parentClick}>
      <InlineExpandedImage {...props} />
    </div>,
  );
  const wrapper = container.querySelector<HTMLElement>(".res__inline-image");
  if (!wrapper) throw new Error("展開画像の外枠が描画されていません");
  return { props, parentClick, wrapper, parent: screen.getByTestId("parent") };
}

/** 画像と親の位置を固定し、リサイズの上限と下限を計算できるようにする。 */
function stubLayout(wrapper: HTMLElement, imageWidth = 200) {
  const image = wrapper.querySelector("img");
  if (!image) throw new Error("展開画像が描画されていません");
  const rect = (values: Partial<DOMRect>) => () =>
    ({
      x: 0,
      y: 0,
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      width: 0,
      height: 0,
      ...values,
    }) as DOMRect;
  Object.defineProperty(image, "getBoundingClientRect", {
    value: rect({ width: imageWidth, height: 100, right: imageWidth }),
  });
  Object.defineProperty(wrapper, "getBoundingClientRect", {
    value: rect({ left: 100 }),
  });
  Object.defineProperty(wrapper.parentElement, "getBoundingClientRect", {
    value: rect({ right: 500 }),
  });
}

function loadImage() {
  fireEvent.load(screen.getByRole("img", { name: IMAGE_URL }));
}

describe("InlineExpandedImage", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("読み込み中は読み込み中の表示を出し、完了すると消す", () => {
    const { wrapper } = renderInline();
    expect(screen.getByRole("status")).toHaveTextContent("画像を読み込み中…");
    expect(wrapper).toHaveClass("res__inline-image--loading");

    loadImage();

    expect(screen.queryByText("画像を読み込み中…")).not.toBeInTheDocument();
    expect(wrapper).not.toHaveClass("res__inline-image--loading");
  });

  it("読み込み完了を呼び出し元へ伝える", () => {
    const { props } = renderInline();

    loadImage();

    expect(props.onLoad).toHaveBeenCalledTimes(1);
  });

  it("表示に失敗すると閉じる案内を出し、ログと呼び出し元の onError に伝える", () => {
    const { props } = renderInline();

    fireEvent.error(screen.getByRole("img", { name: IMAGE_URL }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "画像を表示できません。クリックして閉じる",
    );
    expect(props.onError).toHaveBeenCalledTimes(1);
  });

  it("画像をクリックすると折りたたみ、親へはクリックを伝えない", () => {
    const { props, parentClick } = renderInline();

    fireEvent.click(screen.getByRole("button", { name: "画像を折りたたむ" }));

    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(parentClick).not.toHaveBeenCalled();
  });

  it("ビューアで開くボタンは、ビューアを開く操作だけを行い、親へはクリックを伝えない", () => {
    const { props, parentClick } = renderInline();

    fireEvent.click(screen.getByRole("button", { name: "ビューアで開く" }));

    expect(props.onOpenViewer).toHaveBeenCalledTimes(1);
    expect(props.onClose).not.toHaveBeenCalled();
    expect(parentClick).not.toHaveBeenCalled();
  });

  it("縮小ボタンは折りたたみ、親へはクリックを伝えない", () => {
    const { props, parentClick } = renderInline();

    fireEvent.click(screen.getByRole("button", { name: "画像を縮小" }));

    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(parentClick).not.toHaveBeenCalled();
  });

  it("右クリックのメニューは、呼び出し元の onContextMenu に渡す", () => {
    const { props, wrapper } = renderInline();

    fireEvent.contextMenu(wrapper);

    expect(props.onContextMenu).toHaveBeenCalledTimes(1);
  });

  it("ぼかし対象の画像には、ぼかし用のクラスを付ける", () => {
    const { wrapper } = renderInline({ isBlurred: true });

    expect(wrapper).toHaveClass("res__thumb--blurred");
  });

  it("サイズ変更のハンドルは、読み込みが完了するまで表示しない", () => {
    renderInline();

    expect(screen.queryByRole("button", { name: "画像のサイズを変更" })).not.toBeInTheDocument();
  });

  it("サイズ変更を受け付けない場合は、読み込み完了後もハンドルを表示しない", () => {
    renderInline({ onResize: undefined });
    loadImage();

    expect(screen.queryByRole("button", { name: "画像のサイズを変更" })).not.toBeInTheDocument();
  });

  it("読み込み完了後はサイズ変更のハンドルを表示し、表示幅を反映する", () => {
    const { wrapper } = renderInline({ width: 240 });
    loadImage();

    expect(screen.getByRole("button", { name: "画像のサイズを変更" })).toBeInTheDocument();
    expect(wrapper).toHaveClass("res__inline-image--resized");
    expect(wrapper.style.width).toBe("240px");
  });

  it("矢印キーで幅を20pxずつ変え、その幅を呼び出し元へ渡す", () => {
    const { props, wrapper } = renderInline();
    loadImage();
    stubLayout(wrapper, 200);
    const handle = screen.getByRole("button", { name: "画像のサイズを変更" });

    fireEvent.keyDown(handle, { key: "ArrowRight" });
    fireEvent.keyDown(handle, { key: "ArrowLeft" });

    expect(props.onResize).toHaveBeenNthCalledWith(1, 220);
    expect(props.onResize).toHaveBeenNthCalledWith(2, 180);
  });

  it("矢印キー以外の操作では、幅を変えない", () => {
    const { props, wrapper } = renderInline();
    loadImage();
    stubLayout(wrapper, 200);

    fireEvent.keyDown(screen.getByRole("button", { name: "画像のサイズを変更" }), {
      key: "Enter",
    });

    expect(props.onResize).not.toHaveBeenCalled();
  });

  it("キーボードで広げるときは、親の幅に収まる上限で止める", () => {
    const { props, wrapper } = renderInline();
    loadImage();
    // 親の右端 500 から、枠の左端 100 を引いた 400px が上限になる。
    stubLayout(wrapper, 390);

    fireEvent.keyDown(screen.getByRole("button", { name: "画像のサイズを変更" }), {
      key: "ArrowRight",
    });

    expect(props.onResize).toHaveBeenCalledWith(400);
  });

  it("ポインタをドラッグすると、離すまで表示幅を変えて、離した位置の幅を確定する", () => {
    const { props, wrapper } = renderInline();
    loadImage();
    stubLayout(wrapper, 200);
    const handle = screen.getByRole("button", { name: "画像のサイズを変更" });
    Object.defineProperty(handle, "setPointerCapture", { value: vi.fn() });

    fireEvent.pointerDown(handle, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 150, pointerId: 1 });
    expect(wrapper.style.width).toBe("250px");

    fireEvent.pointerUp(handle, { clientX: 150, pointerId: 1 });

    expect(props.onResize).toHaveBeenCalledWith(250);
    expect(wrapper.style.width).toBe("");
  });

  it("ポインタ操作が中断されたら、幅を確定せずに元へ戻す", () => {
    const { props, wrapper } = renderInline();
    loadImage();
    stubLayout(wrapper, 200);
    const handle = screen.getByRole("button", { name: "画像のサイズを変更" });
    Object.defineProperty(handle, "setPointerCapture", { value: vi.fn() });

    fireEvent.pointerDown(handle, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 150, pointerId: 1 });
    fireEvent.pointerCancel(handle, { pointerId: 1 });

    expect(props.onResize).not.toHaveBeenCalled();
    expect(wrapper.style.width).toBe("");
  });

  it("主ボタン以外のポインタ操作では、ドラッグを始めない", () => {
    const { props, wrapper } = renderInline();
    loadImage();
    stubLayout(wrapper, 200);
    const handle = screen.getByRole("button", { name: "画像のサイズを変更" });
    Object.defineProperty(handle, "setPointerCapture", { value: vi.fn() });

    fireEvent.pointerDown(handle, { button: 2, clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 150, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: 150, pointerId: 1 });

    expect(props.onResize).not.toHaveBeenCalled();
    expect(wrapper.style.width).toBe("");
  });
});
