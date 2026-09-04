import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { container } from "src/service-container";
import type { IRes } from "src/service-container/interfaces";
import { ResPopup } from "src/view/browser/components/ResPopup";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

function createRes(num: number, message: string, id = "ID:AAA"): IRes {
  return {
    num,
    name: `name-${num}`,
    mail: "",
    date: "2026/09/04(金) 12:00:00.000",
    id,
    message,
  };
}

const ITEMS = [createRes(1, "first message"), createRes(4, "second message")];
const BASE_PROPS: React.ComponentProps<typeof ResPopup> = {
  x: 16,
  y: 16,
  title: "ID:AAA (2件)",
  items: ITEMS,
  messageProtocol: "https:",
  repIndex: new Map(),
  idIndex: new Map([["ID:AAA", new Set([1, 4])]]),
  onUrlClick: () => {},
  onUrlContextMenu: () => {},
  onIdLinkClick: () => {},
  onRepClick: () => {},
  onAnchorClick: () => {},
  onAnchorHover: () => {},
  onAnchorLeave: () => {},
  onResContextMenu: () => {},
  onClose: () => {},
  threadTitle: "テストスレタイ",
  threadUrl: "https://example.com/test/read.cgi/board/123/",
};

describe("ResPopup", () => {
  const writeText = vi.fn<() => Promise<void>>();
  const writeClipboard = vi.fn<() => Promise<void>>();
  const clipboardItemCtor = vi.fn();
  const canvasContextStub = {
    fillRect: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 7 })),
    scale: vi.fn(),
    strokeRect: vi.fn(),
    fillStyle: "",
    font: "",
    lineWidth: 1,
    strokeStyle: "",
  };

  class ClipboardItemMock {
    constructor(items: Record<string, Blob>) {
      clipboardItemCtor(items);
    }
  }

  beforeEach(() => {
    writeText.mockResolvedValue();
    writeClipboard.mockResolvedValue();
    container.config = {
      get: vi.fn(() => "default"),
      set: vi.fn(),
      getAll: () => ({}),
      ready: (callback: () => void) => callback(),
    };
    container.message = {
      on: vi.fn(),
      off: vi.fn(),
      send: vi.fn(),
    };
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { write: writeClipboard, writeText },
    });
    vi.stubGlobal("ClipboardItem", ClipboardItemMock);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () => canvasContextStub as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback: BlobCallback) => {
      callback(new Blob(["png"], { type: "image/png" }));
    });
    canvasContextStub.fillText.mockClear();
  });

  afterEach(() => {
    cleanup();
    writeText.mockReset();
    writeClipboard.mockReset();
    clipboardItemCtor.mockReset();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("ヘッダーメニューからIDレスを一括コピーできる", () => {
    render(<ResPopup {...BASE_PROPS} />);

    fireEvent.click(screen.getByRole("button", { name: "IDポップアップメニュー" }));
    fireEvent.click(screen.getByRole("button", { name: "IDのレスを一括コピー" }));

    expect(writeText).toHaveBeenCalledOnce();
    const copiedText = (writeText.mock.calls as unknown as Array<[string]>)[0]?.[0];
    expect(copiedText).toContain("1 name-1 ID:AAA");
    expect(copiedText).toContain("first message");
    expect(copiedText).toContain("4 name-4 ID:AAA");
    expect(copiedText).toContain("second message");
    expect(copiedText).toContain("テストスレタイ");
    expect(copiedText).toContain("https://example.com/test/read.cgi/board/123/");
  });

  it("ヘッダーメニューから表示中のIDレスを画像としてコピーできる", async () => {
    render(<ResPopup {...BASE_PROPS} />);

    fireEvent.click(screen.getByRole("button", { name: "IDポップアップメニュー" }));
    fireEvent.click(screen.getByRole("button", { name: "IDのレスを画像としてコピー" }));

    await waitFor(() => expect(writeClipboard).toHaveBeenCalledOnce());
    expect(clipboardItemCtor).toHaveBeenCalledOnce();
    const drawnTexts = canvasContextStub.fillText.mock.calls.map(([text]) => text);
    expect(drawnTexts).toContain("ID:AAA (2件)");
    expect(drawnTexts).toContain("1 name-1 ID:AAA");
    expect(drawnTexts).toContain("4 name-4 ID:AAA");
    expect(drawnTexts).toContain("first message");
    expect(drawnTexts).toContain("second message");
  });

  it("IDポップアップのピン留めを切り替え、固定中は外側クリックで閉じない", () => {
    const onTogglePinned = vi.fn();
    const onClose = vi.fn();
    const { rerender, container: rendered } = render(
      <ResPopup {...BASE_PROPS} pinned={false} onTogglePinned={onTogglePinned} onClose={onClose} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "IDポップアップメニュー" }));
    fireEvent.click(screen.getByRole("button", { name: "ピン留め" }));
    expect(onTogglePinned).toHaveBeenCalledOnce();

    rerender(<ResPopup {...BASE_PROPS} pinned onTogglePinned={onTogglePinned} onClose={onClose} />);
    const popup = rendered.querySelector(".res-popup") as HTMLElement;
    expect(screen.getByRole("button", { name: "ピン留めを解除" })).toBeInTheDocument();

    fireEvent.mouseLeave(popup, { relatedTarget: document.body });
    fireEvent.mouseDown(document.body);

    expect(onClose).not.toHaveBeenCalled();
  });

  it("IDポップアップメニューは外側クリックで閉じる", () => {
    render(<ResPopup {...BASE_PROPS} />);

    fireEvent.click(screen.getByRole("button", { name: "IDポップアップメニュー" }));
    expect(screen.getByRole("button", { name: "IDのレスを一括コピー" })).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole("button", { name: "IDのレスを一括コピー" })).not.toBeInTheDocument();
  });
});
