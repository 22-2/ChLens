import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type React from "react";
import type { IRes } from "src/service-container";
import { container } from "src/service-container/index";
import { ReplyTreePopup } from "src/view/browser/components/ReplyTreePopup";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";

function createRes(num: number, message: string): IRes {
  return {
    num,
    name: `name-${num}`,
    mail: "",
    date: "2026/04/19(日) 12:00:00.000",
    message,
  };
}

const TEST_RES_MAP = new Map<number, IRes>([
  [1, createRes(1, "source message")],
  [2, createRes(2, "reply message")],
  [4, createRes(4, "nested reply message")],
]);

const TEST_REP_INDEX = new Map<number, Set<number>>([
  [1, new Set([2])],
  [2, new Set([4])],
]);

const BASE_PROPS: React.ComponentProps<typeof ReplyTreePopup> = {
  x: 16,
  y: 16,
  resNum: 1,
  repIndex: TEST_REP_INDEX,
  resMap: TEST_RES_MAP,
  messageProtocol: "https:",
  anchorPreviewDepth: 0,
  onUrlClick: () => {},
  onUrlContextMenu: () => {},
  onRepClick: () => {},
  onAnchorClick: () => {},
  onAnchorHover: () => {},
  onAnchorLeave: () => {},
  onResContextMenu: () => {},
  onIdLinkClick: () => {},
  onClose: () => {},
  threadTitle: "テストスレタイ",
  threadUrl: "https://example.com/test/read.cgi/board/123/",
};

describe("ReplyTreePopup", () => {
  const writeText = vi.fn<() => Promise<void>>();
  const writeClipboard = vi.fn<() => Promise<void>>();
  const clipboardItemCtor = vi.fn();
  class ClipboardItemMock {
    public readonly items: Record<string, Blob>;

    constructor(items: Record<string, Blob>) {
      this.items = items;
      clipboardItemCtor(items);
    }
  }
  const canvasContextStub = {
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    lineTo: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 7 })),
    moveTo: vi.fn(),
    scale: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    fillStyle: "",
    font: "",
    lineWidth: 1,
    strokeStyle: "",
  };

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
    vi.stubGlobal(
      "requestAnimationFrame",
      (callback: FrameRequestCallback): number => {
        callback(0);
        return 1;
      },
    );
    vi.stubGlobal("cancelAnimationFrame", () => {});
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        write: writeClipboard,
        writeText,
      },
    });
    vi.stubGlobal("ClipboardItem", ClipboardItemMock);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () => canvasContextStub as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (callback: BlobCallback) => {
        callback(new Blob(["png"], { type: "image/png" }));
      },
    );
  });

  afterEach(() => {
    cleanup();
    writeText.mockReset();
    writeClipboard.mockReset();
    clipboardItemCtor.mockReset();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("参照元レスと返信レスを分けて表示する", () => {
    render(<ReplyTreePopup {...BASE_PROPS} />);

    expect(screen.getByText("参照元レス")).toBeInTheDocument();
    expect(screen.getByText("返信レス")).toBeInTheDocument();
    expect(screen.getByText("source message")).toBeInTheDocument();
    expect(screen.getByText("reply message")).toBeInTheDocument();
    expect(screen.getByText("nested reply message")).toBeInTheDocument();

    const sourceSection = screen
      .getByText("参照元レス")
      .closest("section") as HTMLElement;
    const sourceCard = within(sourceSection)
      .getByText("source message")
      .closest("article");
    expect(sourceCard).toHaveClass("res--highlighted-persistent");
  });

  it("返信ツリー専用メニューからレスを一括コピーできる", async () => {
    render(<ReplyTreePopup {...BASE_PROPS} />);

    fireEvent.click(screen.getByRole("button", { name: "返信ツリーメニュー" }));
    fireEvent.click(
      screen.getByRole("button", { name: "返信ツリーを一括コピー" }),
    );

    expect(writeText).toHaveBeenCalledOnce();
    // @ts-expect-error: mock.calls の引数型は vi.fn の型定義から推論されない
    expect(writeText.mock.calls[0]?.[0]).toContain("[参照元レス]");
    // @ts-expect-error: 同上
    expect(writeText.mock.calls[0]?.[0]).toContain("1 name-1");
    // @ts-expect-error: 同上
    expect(writeText.mock.calls[0]?.[0]).toContain("source message");
    // @ts-expect-error: 同上
    expect(writeText.mock.calls[0]?.[0]).toContain("[返信レス]");
    // @ts-expect-error: 同上
    expect(writeText.mock.calls[0]?.[0]).toContain("2 name-2");
    // @ts-expect-error: 同上
    expect(writeText.mock.calls[0]?.[0]).toContain("4 name-4");
    // 末尾にスレタイとURLが付加されることを検証する。
    // @ts-expect-error: 同上
    expect(writeText.mock.calls[0]?.[0]).toContain("テストスレタイ");
    // @ts-expect-error: 同上
    expect(writeText.mock.calls[0]?.[0]).toContain(
      "https://example.com/test/read.cgi/board/123/",
    );
  });

  it("返信ツリー専用メニューから画像としてコピーできる", async () => {
    render(<ReplyTreePopup {...BASE_PROPS} />);

    fireEvent.click(screen.getByRole("button", { name: "返信ツリーメニュー" }));
    fireEvent.click(
      screen.getByRole("button", { name: "返信ツリーを画像としてコピー" }),
    );

    await waitFor(() => {
      expect(writeClipboard).toHaveBeenCalledOnce();
    });
    expect(clipboardItemCtor).toHaveBeenCalledOnce();
  });

  it("返信ツリーメニューは outside click で閉じる", () => {
    render(<ReplyTreePopup {...BASE_PROPS} />);

    fireEvent.click(screen.getByRole("button", { name: "返信ツリーメニュー" }));
    expect(
      screen.getByRole("button", { name: "返信ツリーを一括コピー" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "返信ツリーを画像としてコピー" }),
    ).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(
      screen.queryByRole("button", { name: "返信ツリーを一括コピー" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "返信ツリーを画像としてコピー" }),
    ).not.toBeInTheDocument();
  });

  it("参照元レスの返信リンクは無効化されていてクリックしても開かない", () => {
    const onRepClick = vi.fn();
    render(<ReplyTreePopup {...BASE_PROPS} onRepClick={onRepClick} />);

    const sourceSection = screen
      .getByText("参照元レス")
      .closest("section") as HTMLElement;
    const sourceReplyLink = within(sourceSection).getByText("返信(1)");

    expect(sourceReplyLink).toHaveAttribute("aria-disabled", "true");

    fireEvent.click(sourceReplyLink);

    expect(onRepClick).not.toHaveBeenCalled();
  });
});
