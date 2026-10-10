import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { type CommentOverlayMonitor, DEFAULT_COMMENT_OVERLAY_GEOMETRY } from "../platform/types";
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
  it("選択した実画面を静止画で表示し、更新ボタンで撮影し直して範囲を指定できる", async () => {
    const capture = vi.fn().mockResolvedValue("data:image/png;base64,preview");
    const onGeometryChange = vi.fn();
    render(
      <OverlayControlPanel
        monitors={[monitor, secondMonitor]}
        lockAspectRatio={false}
        onLockAspectRatioChange={vi.fn()}
        onGeometryChange={onGeometryChange}
        captureMonitorPreview={capture}
      />,
    );
    await waitFor(() => expect(screen.getByText("静止画プレビュー")).toBeInTheDocument());
    expect(capture).toHaveBeenCalledExactlyOnceWith(monitor);
    expect(document.querySelector("image")).toHaveAttribute(
      "href",
      "data:image/png;base64,preview",
    );
    fireEvent.doubleClick(screen.getByTestId("overlay-control-panel-desktop"));
    expect(onGeometryChange).toHaveBeenCalledWith({ x: 0, y: 0, width: 1920, height: 1080 });
    fireEvent.click(screen.getByRole("button", { name: "プレビューを更新" }));
    await waitFor(() => expect(capture).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "次のディスプレイをプレビュー" }));
    await waitFor(() => expect(capture).toHaveBeenLastCalledWith(secondMonitor));
    await waitFor(() => expect(document.querySelector("image")).toHaveAttribute("x", "1920"));
  });

  it("前の画面の撮影が遅れて完了しても選択中の画面に混ざらない", async () => {
    let finishFirst: ((image: string) => void) | undefined;
    const capture = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            finishFirst = resolve;
          }),
      )
      .mockResolvedValue("data:image/png;base64,second");
    render(
      <OverlayControlPanel
        monitors={[monitor, secondMonitor]}
        lockAspectRatio={false}
        onLockAspectRatioChange={vi.fn()}
        onGeometryChange={vi.fn()}
        captureMonitorPreview={capture}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "次のディスプレイをプレビュー" }));
    await waitFor(() =>
      expect(document.querySelector("image")).toHaveAttribute(
        "href",
        "data:image/png;base64,second",
      ),
    );
    await act(async () => {
      finishFirst?.("data:image/png;base64,first");
    });
    expect(document.querySelector("image")).toHaveAttribute("href", "data:image/png;base64,second");
  });

  it("撮影に失敗しても範囲指定を維持し、更新で再試行できる", async () => {
    const capture = vi
      .fn()
      .mockRejectedValueOnce(new Error("撮影失敗"))
      .mockResolvedValue("data:image/png;base64,retry");
    render(
      <OverlayControlPanel
        monitors={[monitor]}
        lockAspectRatio={false}
        onLockAspectRatioChange={vi.fn()}
        onGeometryChange={vi.fn()}
        captureMonitorPreview={capture}
      />,
    );
    await waitFor(() => expect(screen.getByText(/画面を取得できませんでした/)).toBeInTheDocument());
    expect(screen.getByTestId("overlay-control-panel-selection")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "プレビューを更新" }));
    await waitFor(() => expect(screen.getByText("静止画プレビュー")).toBeInTheDocument());
  });
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
        lockAspectRatio={false}
        onLockAspectRatioChange={vi.fn()}
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
        lockAspectRatio={false}
        onLockAspectRatioChange={vi.fn()}
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
        lockAspectRatio={false}
        onLockAspectRatioChange={vi.fn()}
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
