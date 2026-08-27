import "@testing-library/jest-dom/vitest";
import { fireEvent, render } from "@testing-library/react";
import type { IRes } from "src/service-container/interfaces";
import { PopupResCard } from "src/view/browser/components/PopupResCard";
import { NgStatusProvider, useNgStatus } from "src/view/browser/hooks/use-ng-status";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("src/view/browser/utils/response-format", async () => {
  const actual = await vi.importActual<typeof import("src/view/browser/utils/response-format")>(
    "src/view/browser/utils/response-format",
  );
  return {
    ...actual,
    decodeResponseHtml: () => ({
      nameHtml: "名無しさん",
      mailHtml: "",
      otherHtml: "",
      messageHtml: "本文",
      isNameAnchor: false,
    }),
  };
});

vi.mock("src/view/browser/utils/url-media", async () => {
  const actual = await vi.importActual<typeof import("src/view/browser/utils/url-media")>(
    "src/view/browser/utils/url-media",
  );
  return {
    ...actual,
    extractUrlsFromMessage: () => ["https://example.com/image.jpg"],
    toViewerImageUrl: (rawUrl: string) => rawUrl,
  };
});

const BASE_RES: IRes = {
  num: 10,
  name: "名無しさん",
  mail: "",
  date: "2026/04/20",
  message: "https://example.com/image.jpg",
};

function TemporarilyDisabledNgCard({ res }: { res: IRes }) {
  const { setNgTemporarilyDisabled } = useNgStatus();
  return (
    <>
      <button type="button" onClick={() => setNgTemporarilyDisabled(true)}>
        一時NG解除
      </button>
      <PopupResCard
        res={res}
        messageProtocol="https:"
        anchorPreviewDepth={0}
        onUrlClick={() => {}}
        onUrlContextMenu={() => {}}
        onIdLinkClick={() => {}}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
      />
    </>
  );
}

describe("PopupResCard", () => {
  it("返信数に応じてレス番号と返信ラベルへ同じ強調色クラスを適用する", () => {
    const repIndex = new Map<number, Set<number>>([[10, new Set([1, 2, 3])]]);

    const { container, rerender } = render(
      <PopupResCard
        res={BASE_RES}
        messageProtocol="https:"
        anchorPreviewDepth={0}
        repIndex={repIndex}
        onUrlClick={() => {}}
        onUrlContextMenu={() => {}}
        onIdLinkClick={() => {}}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
        onRepClick={() => {}}
      />,
    );

    expect(container.querySelector(".res__num")).toHaveClass("res__num--warm");
    expect(container.querySelector(".res__rep")).toHaveClass("res__rep--warm");

    const hotRepIndex = new Map<number, Set<number>>([[10, new Set([1, 2, 3, 4, 5])]]);

    rerender(
      <PopupResCard
        res={BASE_RES}
        messageProtocol="https:"
        anchorPreviewDepth={0}
        repIndex={hotRepIndex}
        onUrlClick={() => {}}
        onUrlContextMenu={() => {}}
        onIdLinkClick={() => {}}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
        onRepClick={() => {}}
      />,
    );

    expect(container.querySelector(".res__num")).toHaveClass("res__num--hot");
    expect(container.querySelector(".res__rep")).toHaveClass("res__rep--hot");
  });

  it("NGレスはポップアップで内容を伏せ、クリック後に表示する", () => {
    const ngRes = { ...BASE_RES, ng: { type: "word" } } as IRes;
    const { container, getByRole } = render(
      <PopupResCard
        res={ngRes}
        messageProtocol="https:"
        anchorPreviewDepth={0}
        onUrlClick={() => {}}
        onUrlContextMenu={() => {}}
        onIdLinkClick={() => {}}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
      />,
    );

    expect(container.querySelector(".res__body")).not.toBeInTheDocument();
    fireEvent.click(getByRole("button", { name: "クリックして内容を表示" }));
    expect(container.querySelector(".res__body")).toBeInTheDocument();
  });

  it("一時NG解除中もNGバッジを残す", () => {
    const ngRes = { ...BASE_RES, ng: { type: "word" } } as IRes;
    const { container, getByRole } = render(
      <NgStatusProvider>
        <TemporarilyDisabledNgCard res={ngRes} />
      </NgStatusProvider>,
    );

    fireEvent.click(getByRole("button", { name: "一時NG解除" }));

    expect(container.querySelector(".res__body")).toBeInTheDocument();
    expect(container.querySelector(".res__badge--ng")).toHaveTextContent("NG");
  });

  it("サムネイルのミドルクリックで新規タブ扱いを1回だけ発火する", () => {
    const onUrlClick = vi.fn();
    const onLinkMiddleClickStart = vi.fn();

    const { container } = render(
      <PopupResCard
        res={BASE_RES}
        messageProtocol="https:"
        anchorPreviewDepth={0}
        onUrlClick={onUrlClick}
        onUrlContextMenu={() => {}}
        onLinkMiddleClickStart={onLinkMiddleClickStart}
        onIdLinkClick={() => {}}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
      />,
    );

    const thumb = container.querySelector("a.res__thumb") as HTMLAnchorElement;
    fireEvent.mouseDown(thumb, { button: 1 });
    fireEvent(
      thumb,
      new MouseEvent("auxclick", {
        button: 1,
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(onUrlClick).toHaveBeenCalledTimes(1);
    expect(onUrlClick).toHaveBeenCalledWith(
      "https://example.com/image.jpg",
      ["https://example.com/image.jpg"],
      1,
    );
    expect(onLinkMiddleClickStart).toHaveBeenCalled();
  });

  it("サムネイル右クリックでは既定コンテキストメニューを維持する", () => {
    const onContextMenu = vi.fn();

    const { container } = render(
      <PopupResCard
        res={BASE_RES}
        messageProtocol="https:"
        anchorPreviewDepth={0}
        onUrlClick={() => {}}
        onUrlContextMenu={() => {}}
        onIdLinkClick={() => {}}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
        onContextMenu={onContextMenu}
      />,
    );

    const thumb = container.querySelector("a.res__thumb") as HTMLAnchorElement;
    const contextMenuEvent = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });

    thumb.dispatchEvent(contextMenuEvent);

    expect(onContextMenu).not.toHaveBeenCalled();
    expect(contextMenuEvent.defaultPrevented).toBe(false);
  });

  it("ルート起点ボタン押下で先頭ツリー展開ハンドラを呼ぶ", () => {
    const onOpenRootReplyTree = vi.fn();
    const repIndex = new Map<number, Set<number>>([[10, new Set([1, 2])]]);

    const { getByRole } = render(
      <PopupResCard
        res={BASE_RES}
        messageProtocol="https:"
        anchorPreviewDepth={0}
        repIndex={repIndex}
        onUrlClick={() => {}}
        onUrlContextMenu={() => {}}
        onIdLinkClick={() => {}}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
        onRepClick={() => {}}
        onOpenRootReplyTree={onOpenRootReplyTree}
      />,
    );

    fireEvent.click(getByRole("button", { name: "ツリー先頭から" }));
    expect(onOpenRootReplyTree).toHaveBeenCalledWith(10, expect.any(Object));
  });
});
