import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ExternalImageProps } from "src/features/media/ui/ExternalImage";
import { ManualLoadExternalImage } from "src/features/media/ui/ManualLoadExternalImage";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const loggerError = vi.hoisted(() => vi.fn());
vi.mock("src/app/logger", () => ({
  createLogger: () => ({ error: loggerError, warn: vi.fn(), debug: vi.fn() }),
}));

// 画像の取得や設定の読み込みは ExternalImage の責務なので、ここでは img の読み込み結果だけを流す。
vi.mock("src/features/media/ui/ExternalImage", async () => {
  const React = await import("react");
  return {
    ExternalImage: (props: ExternalImageProps) =>
      React.createElement("img", {
        src: props.src,
        alt: props.alt ?? "",
        className: props.className,
        onLoad: props.onLoad,
        onError: props.onError,
        "data-manual-load": String(props.manualLoad),
      }),
  };
});

const IMAGE_URL = "https://images.example.com/photo.png";
const SECOND_IMAGE_URL = "https://images.example.com/second.png";

describe("ManualLoadExternalImage", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("読み込み中は、同じ枠内に取得中の表示を出す", () => {
    render(<ManualLoadExternalImage src={IMAGE_URL} alt="写真" />);

    expect(screen.getByRole("status", { name: "画像を取得中" })).toHaveTextContent("取得中");
  });

  it("読み込みが完了すると取得中の表示を消し、呼び出し元の onLoad を呼ぶ", () => {
    const onLoad = vi.fn();
    render(<ManualLoadExternalImage src={IMAGE_URL} alt="写真" onLoad={onLoad} />);

    fireEvent.load(screen.getByRole("img", { name: "写真" }));

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(onLoad).toHaveBeenCalledTimes(1);
  });

  it("読み込みに失敗すると既定のエラー文言を出し、ログと呼び出し元の onError に伝える", () => {
    const onError = vi.fn();
    render(<ManualLoadExternalImage src={IMAGE_URL} alt="写真" onError={onError} />);

    fireEvent.error(screen.getByRole("img", { name: "写真" }));

    expect(screen.getByRole("status")).toHaveTextContent("画像の取得に失敗しました");
    expect(loggerError).toHaveBeenCalledWith("手動取得した画像を表示できませんでした", {
      url: IMAGE_URL,
    });
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("エラー文言を指定すると、既定の文言の代わりにそれを表示する", () => {
    render(<ManualLoadExternalImage src={IMAGE_URL} alt="写真" errorLabel="表示できません" />);

    fireEvent.error(screen.getByRole("img", { name: "写真" }));

    expect(screen.getByRole("status")).toHaveTextContent("表示できません");
  });

  it("画像のURLが変わると、前の画像の結果を引き継がず取得中に戻す", () => {
    const { rerender } = render(<ManualLoadExternalImage src={IMAGE_URL} alt="写真" />);
    fireEvent.error(screen.getByRole("img", { name: "写真" }));

    rerender(<ManualLoadExternalImage src={SECOND_IMAGE_URL} alt="写真" />);

    expect(screen.getByRole("status", { name: "画像を取得中" })).toBeInTheDocument();
    expect(screen.queryByText("画像の取得に失敗しました")).not.toBeInTheDocument();
  });

  it("自動取得を無効にした img を描画し、設定による二重の取得を防ぐ", () => {
    render(<ManualLoadExternalImage src={IMAGE_URL} alt="写真" />);

    expect(screen.getByRole("img", { name: "写真" })).toHaveAttribute("data-manual-load", "false");
  });

  it("コンテナのクラス名を指定すると、外枠に追加する", () => {
    const { container } = render(
      <ManualLoadExternalImage src={IMAGE_URL} alt="写真" containerClassName="my-gallery-item" />,
    );

    expect(container.firstElementChild).toHaveClass("res__manual-image-load", "my-gallery-item");
  });
});
