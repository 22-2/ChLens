import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ResMediaGallery } from "src/view/browser/components/ResMediaGallery";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  cleanup();
});

describe("ResMediaGallery", () => {
  it("YouTube サムネイルをクリックするとレス内 iframe を開く", () => {
    const onUrlClick = vi.fn();
    render(
      <ResMediaGallery
        urls={["https://youtu.be/TestVideo01"]}
        onUrlClick={onUrlClick}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "YouTube の動画を展開する" }),
    );

    const frame = screen.getByTitle("YouTube 動画プレーヤー");
    expect(frame).toBeInTheDocument();
    expect(frame).toHaveAttribute(
      "src",
      expect.stringContaining("youtube-nocookie.com/embed/TestVideo01"),
    );
    expect(onUrlClick).not.toHaveBeenCalled();
  });

  it("直リンク動画をクリックするとレス内 video を開閉する", () => {
    const rawUrl =
      "https://video.twimg.com/amplify_video/0000000000000000000/vid/avc1/1280x720/test-video.mp4?tag=14";
    const { container } = render(
      <ResMediaGallery urls={[rawUrl]} onUrlClick={() => {}} />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Twitter Video を展開する" }),
    );

    const player = container.querySelector(
      ".res__media-embed-player",
    ) as HTMLVideoElement;
    expect(player).toBeInTheDocument();
    expect(player).toHaveAttribute("src", rawUrl);

    fireEvent.click(
      container.querySelector(".res__media-embed-close") as HTMLButtonElement,
    );
    expect(container.querySelector(".res__media-embed-player")).toBeNull();
  });

  it("popup 用 middle click では mousedown 時点で1回だけ新規タブ扱いにする", () => {
    const rawUrl =
      "https://video.twimg.com/amplify_video/0000000000000000000/vid/avc1/1280x720/test-video.mp4?tag=14";
    const onUrlClick = vi.fn();
    const onMiddleClickStart = vi.fn();

    render(
      <ResMediaGallery
        urls={[rawUrl]}
        onUrlClick={onUrlClick}
        onMiddleClickStart={onMiddleClickStart}
        openOnMiddleMouseDown
      />,
    );

    const thumbButton = screen.getByRole("button", {
      name: "Twitter Video を展開する",
    });
    fireEvent.mouseDown(thumbButton, { button: 1 });
    fireEvent(
      thumbButton,
      new MouseEvent("auxclick", {
        button: 1,
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(onUrlClick).toHaveBeenCalledTimes(1);
    expect(onUrlClick).toHaveBeenCalledWith(rawUrl, undefined, 1);
    expect(onMiddleClickStart).toHaveBeenCalledTimes(1);
  });
});
