import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useResizeHandle } from "src/view/browser/hooks/use-resize-handle";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const onCommit = vi.fn();

function Panel({ axis = "x" as "x" | "y", value = 300 }) {
  const resize = useResizeHandle({
    value,
    min: 200,
    max: 600,
    axis,
    direction: -1,
    keyboardStep: 20,
    onCommit,
  });
  return (
    <div data-testid="panel" style={{ width: resize.size }}>
      <div aria-label="パネルの幅" {...resize.handleProps} />
    </div>
  );
}

function width() {
  return screen.getByTestId("panel").style.width;
}

describe("リサイズハンドル", () => {
  afterEach(() => {
    cleanup();
    onCommit.mockClear();
  });

  it("ドラッグ中は表示だけを変え、離したときに1回だけ確定する", () => {
    render(<Panel />);
    const handle = screen.getByRole("separator", { name: "パネルの幅" });
    fireEvent.pointerDown(handle, { clientX: 500, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 450, pointerId: 1 });
    expect(width()).toBe("350px");
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.pointerUp(handle, { clientX: 400, pointerId: 1 });
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(400);
  });

  it("範囲の外へ引いても上限・下限に収める", () => {
    render(<Panel />);
    const handle = screen.getByRole("separator", { name: "パネルの幅" });
    fireEvent.pointerDown(handle, { clientX: 500, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 0, pointerId: 1 });
    expect(width()).toBe("600px");
    fireEvent.pointerUp(handle, { clientX: 900, pointerId: 1 });
    expect(onCommit).toHaveBeenCalledWith(200);
  });

  it("キャンセルされたら元の大きさに戻し、確定しない", () => {
    render(<Panel />);
    const handle = screen.getByRole("separator", { name: "パネルの幅" });
    fireEvent.pointerDown(handle, { clientX: 500, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 450, pointerId: 1 });
    fireEvent.pointerCancel(handle, { pointerId: 1 });
    expect(width()).toBe("300px");
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("矢印キーで向きに合わせて大きさを変える", () => {
    const { rerender } = render(<Panel />);
    const handle = screen.getByRole("separator", { name: "パネルの幅" });
    expect(handle).toHaveAttribute("aria-orientation", "vertical");
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(onCommit).toHaveBeenLastCalledWith(320);
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(onCommit).toHaveBeenCalledTimes(1);

    rerender(<Panel axis="y" />);
    expect(handle).toHaveAttribute("aria-orientation", "horizontal");
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(onCommit).toHaveBeenLastCalledWith(320);
  });
});
