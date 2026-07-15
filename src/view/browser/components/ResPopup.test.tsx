import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { usePopupSurfaceCloseGuard } from "src/view/browser/hooks/use-popup-manager";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function PopupCloseGuardHarness({ onClose }: { onClose: () => void }) {
  const { armMouseLeaveCloseSuppression, handleMouseDownCapture, shouldSuppressMouseLeaveClose } =
    usePopupSurfaceCloseGuard();

  return (
    <div
      data-testid="surface"
      onMouseDownCapture={handleMouseDownCapture}
      onMouseLeave={() => {
        if (shouldSuppressMouseLeaveClose()) {
          return;
        }
        onClose();
      }}
    >
      <button type="button" onClick={armMouseLeaveCloseSuppression}>
        arm guard
      </button>
      <a href="https://example.com" data-testid="popup-link">
        popup link
      </a>
    </div>
  );
}

function PopupSurfaceMouseDownHarness({ onSurfaceMouseDown }: { onSurfaceMouseDown: () => void }) {
  const { handleMouseDownCapture } = usePopupSurfaceCloseGuard(onSurfaceMouseDown);

  return (
    <div data-testid="surface" onMouseDownCapture={handleMouseDownCapture}>
      <div data-testid="plain-area">plain area</div>
      <a href="https://example.com" data-testid="popup-link">
        popup link
      </a>
    </div>
  );
}

describe("usePopupSurfaceCloseGuard", () => {
  it("middle click 直後の mouseleave close を抑止する", () => {
    const onClose = vi.fn();

    render(<PopupCloseGuardHarness onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "arm guard" }));
    fireEvent.mouseLeave(screen.getByTestId("surface"), {
      relatedTarget: null,
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("middle click 後は遅延した最初の mouseleave も1回は抑止する", () => {
    const onClose = vi.fn();

    vi.useFakeTimers();
    render(<PopupCloseGuardHarness onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "arm guard" }));
    vi.advanceTimersByTime(1000);
    fireEvent.mouseLeave(screen.getByTestId("surface"), {
      relatedTarget: null,
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("リンクの左クリック操作直後の mouseleave close も抑止する", () => {
    const onClose = vi.fn();

    render(<PopupCloseGuardHarness onClose={onClose} />);

    fireEvent.mouseDown(screen.getByTestId("popup-link"), { button: 0 });
    fireEvent.mouseLeave(screen.getByTestId("surface"), {
      relatedTarget: null,
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("popup内リンクの mousedown では枝閉じ用 onSurfaceMouseDown を呼ばない", () => {
    const onSurfaceMouseDown = vi.fn();

    render(<PopupSurfaceMouseDownHarness onSurfaceMouseDown={onSurfaceMouseDown} />);

    fireEvent.mouseDown(screen.getByTestId("popup-link"), { button: 0 });

    expect(onSurfaceMouseDown).not.toHaveBeenCalled();
  });

  it("popup本体の通常領域 mousedown では枝閉じ用 onSurfaceMouseDown を呼ぶ", () => {
    const onSurfaceMouseDown = vi.fn();

    render(<PopupSurfaceMouseDownHarness onSurfaceMouseDown={onSurfaceMouseDown} />);

    fireEvent.mouseDown(screen.getByTestId("plain-area"), { button: 0 });

    expect(onSurfaceMouseDown).toHaveBeenCalledOnce();
  });
});
