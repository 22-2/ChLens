import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { DEFAULT_COMMENT_OVERLAY_GEOMETRY, type CommentOverlayMonitor } from "../platform/types";
import { OverlayControlPanel } from "./OverlayControlPanel";

const monitor: CommentOverlayMonitor = {
  id: "main",
  name: "メインモニター",
  x: 0,
  y: 0,
  width: 1_920,
  height: 1_080,
  scaleFactor: 1,
};

const secondMonitor: CommentOverlayMonitor = {
  id: "sub",
  name: "サブモニター",
  x: 1_920,
  y: 0,
  width: 2_560,
  height: 1_440,
  scaleFactor: 1.25,
};

describe("OverlayControlPanel", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("ディスプレイをダブルクリックすると全画面geometryを通知する", () => {
    const onGeometryChange = vi.fn();
    render(
      <OverlayControlPanel
        monitors={[monitor]}
        geometry={DEFAULT_COMMENT_OVERLAY_GEOMETRY}
        onGeometryChange={onGeometryChange}
      />,
    );

    fireEvent.doubleClick(screen.getByTestId("overlay-control-panel-desktop"));

    expect(onGeometryChange).toHaveBeenCalledWith({
      x: 0,
      y: 0,
      width: 1_920,
      height: 1_080,
    });
  });

  it("左右ボタンで1画面ずつ縦横比を保ったプレビューへ切り替える", () => {
    const onGeometryChange = vi.fn();
    render(
      <OverlayControlPanel
        monitors={[monitor, secondMonitor]}
        geometry={DEFAULT_COMMENT_OVERLAY_GEOMETRY}
        onGeometryChange={onGeometryChange}
      />,
    );

    const desktop = screen.getByTestId("overlay-control-panel-desktop");
    expect(document.querySelector('[data-monitor-id="main"]')).toBeInTheDocument();
    expect(document.querySelector('[data-monitor-id="sub"]')).not.toBeInTheDocument();
    expect(desktop).toHaveAttribute("viewBox", "0 0 1920 1080");

    fireEvent.click(screen.getByRole("button", { name: "次のディスプレイをプレビュー" }));

    expect(document.querySelector('[data-monitor-id="main"]')).not.toBeInTheDocument();
    expect(document.querySelector('[data-monitor-id="sub"]')).toBeInTheDocument();
    expect(desktop).toHaveAttribute("viewBox", "1920 0 2560 1440");
    expect(screen.getByText(/このディスプレイには表示領域がありません/)).toBeInTheDocument();

    fireEvent.doubleClick(desktop);

    expect(onGeometryChange).toHaveBeenLastCalledWith({
      x: 1_920,
      y: 0,
      width: 2_560,
      height: 1_440,
    });
  });

  it("仮想デスクトップをドラッグすると選択geometryを追従させる", () => {
    const onGeometryChange = vi.fn();
    render(
      <OverlayControlPanel
        monitors={[monitor]}
        geometry={DEFAULT_COMMENT_OVERLAY_GEOMETRY}
        onGeometryChange={onGeometryChange}
      />,
    );
    const desktop = screen.getByTestId("overlay-control-panel-desktop");
    vi.spyOn(desktop, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      width: 1_920,
      height: 1_080,
      top: 0,
      right: 1_920,
      bottom: 1_080,
      left: 0,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(desktop.querySelector("[data-overlay-control-background]")!, {
      button: 0,
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(desktop, {
      pointerId: 1,
      clientX: 900,
      clientY: 550,
    });
    fireEvent.pointerUp(desktop, { pointerId: 1 });

    expect(onGeometryChange).toHaveBeenCalled();
    expect(onGeometryChange.mock.lastCall?.[0]).toEqual(
      expect.objectContaining({ width: expect.any(Number), height: expect.any(Number) }),
    );
  });
});
