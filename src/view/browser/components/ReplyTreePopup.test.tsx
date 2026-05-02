import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type { IRes } from "src/service-container";
import { ReplyTreePopup } from "src/view/browser/components/ReplyTreePopup";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

const BASE_PROPS = {
  x: 16,
  y: 16,
  resNum: 1,
  repIndex: TEST_REP_INDEX,
  resMap: TEST_RES_MAP,
  messageProtocol: "https:" as const,
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
} as const;

describe("ReplyTreePopup", () => {
  const writeText = vi.fn<() => Promise<void>>();

  beforeEach(() => {
    writeText.mockResolvedValue();
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
        writeText,
      },
    });
  });

  afterEach(() => {
    cleanup();
    writeText.mockReset();
    vi.unstubAllGlobals();
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
    expect(writeText.mock.calls[0]?.[0]).toContain("[参照元レス]");
    expect(writeText.mock.calls[0]?.[0]).toContain("1 name-1");
    expect(writeText.mock.calls[0]?.[0]).toContain("source message");
    expect(writeText.mock.calls[0]?.[0]).toContain("[返信レス]");
    expect(writeText.mock.calls[0]?.[0]).toContain("2 name-2");
    expect(writeText.mock.calls[0]?.[0]).toContain("4 name-4");
  });

  it("返信ツリーメニューは outside click で閉じる", () => {
    render(<ReplyTreePopup {...BASE_PROPS} />);

    fireEvent.click(screen.getByRole("button", { name: "返信ツリーメニュー" }));
    expect(
      screen.getByRole("button", { name: "返信ツリーを一括コピー" }),
    ).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(
      screen.queryByRole("button", { name: "返信ツリーを一括コピー" }),
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
