import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createBrowserCommentOverlayPlatform } from "src/features/comment-overlay/platform/browser";
import { OverlayControlBar } from "./OverlayControlBar";

function createPlatform() {
  const platform = createBrowserCommentOverlayPlatform();
  vi.spyOn(platform, "minimize").mockResolvedValue(undefined);
  vi.spyOn(platform, "toggleMaximize").mockResolvedValue(undefined);
  vi.spyOn(platform, "close").mockResolvedValue(undefined);
  vi.spyOn(platform, "startResizing").mockResolvedValue(undefined);
  return platform;
}

describe("OverlayControlBar", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("最小化、最大化、閉じるを対応するplatform操作へ渡す", () => {
    const platform = createPlatform();

    render(<OverlayControlBar visible platform={platform} />);

    fireEvent.click(screen.getByRole("button", { name: "最小化" }));
    fireEvent.click(screen.getByRole("button", { name: "最大化／元に戻す" }));
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));

    expect(platform.minimize).toHaveBeenCalledTimes(1);
    expect(platform.toggleMaximize).toHaveBeenCalledTimes(1);
    expect(platform.close).toHaveBeenCalledTimes(1);
  });

  it("8方向のリサイズ領域を対応するdirectionへ渡す", () => {
    const platform = createPlatform();
    const { container } = render(<OverlayControlBar visible platform={platform} />);

    const handles = [
      ["north-west", "NorthWest"],
      ["north", "North"],
      ["north-east", "NorthEast"],
      ["east", "East"],
      ["south-east", "SouthEast"],
      ["south", "South"],
      ["south-west", "SouthWest"],
      ["west", "West"],
    ] as const;

    for (const [className, direction] of handles) {
      const handle = container.querySelector(`.comment-overlay-control-bar__resize--${className}`);
      expect(handle).toBeInTheDocument();
      fireEvent.pointerDown(handle as HTMLElement, { button: 0 });
      expect(platform.startResizing).toHaveBeenCalledWith(direction);
    }
  });

  it("非表示時は操作バーをpointer操作の対象にしない", () => {
    const platform = createPlatform();

    render(<OverlayControlBar visible={false} platform={platform} />);

    const bar = screen.getByRole("banner");
    expect(bar).not.toHaveClass("comment-overlay-control-bar--visible");
  });
});
