import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import type { IRes } from "src/service-container/interfaces";
import { ResItem } from "src/view/browser/components/ResItem";
import { describe, expect, it, vi } from "vitest";

vi.mock("src/view/browser/utils/utils", async () => {
  const actual = await vi.importActual<
    typeof import("src/view/browser/utils/utils")
  >("src/view/browser/utils/utils");
  return {
    ...actual,
    decodeResponseHtml: () => ({
      nameHtml: "名無しさん",
      mailHtml: "",
      otherHtml: "",
      messageHtml: "本文",
      isNameAnchor: false,
    }),
    extractUrlsFromMessage: () => [
      "https://example.com/page",
      "https://example.com/image.jpg",
    ],
    toViewerImageUrl: (rawUrl: string) =>
      rawUrl.endsWith(".jpg") ? rawUrl : null,
  };
});

const BASE_RES: IRes = {
  num: 1,
  name: "名無しさん",
  mail: "",
  date: "2026/04/22",
  message: "本文",
};

describe("ResItem", () => {
  it("返信数に応じてレス番号と返信ラベルに同じ強調色クラスを付与する", () => {
    const { rerender } = render(
      <ResItem
        res={BASE_RES}
        idPos={0}
        idCount={0}
        repCount={3}
        isOwn={false}
        isReplyToOwn={false}
        isImageBlurred={false}
        imageBlurRadius={4}
        miniAa={false}
        messageProtocol="https:"
        onIdClick={() => {}}
        onRepClick={() => {}}
        onUrlClick={() => true}
        onUrlContextMenu={() => true}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
        onContextMenu={() => {}}
      />,
    );

    expect(containerQueryByClass("res__num")).toHaveClass("res__num--warm");
    expect(screen.getByText("返信(3)")).toHaveClass("res__rep--warm");

    rerender(
      <ResItem
        res={BASE_RES}
        idPos={0}
        idCount={0}
        repCount={5}
        isOwn={false}
        isReplyToOwn={false}
        isImageBlurred={false}
        imageBlurRadius={4}
        miniAa={false}
        messageProtocol="https:"
        onIdClick={() => {}}
        onRepClick={() => {}}
        onUrlClick={() => true}
        onUrlContextMenu={() => true}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
        onContextMenu={() => {}}
      />,
    );

    expect(containerQueryByClass("res__num")).toHaveClass("res__num--hot");
    expect(screen.getByText("返信(5)")).toHaveClass("res__rep--hot");
  });

  it("リンクと画像の右クリックでは既定コンテキストメニューを維持する", () => {
    const onContextMenu = vi.fn();

    const { container } = render(
      <ResItem
        res={BASE_RES}
        idPos={0}
        idCount={0}
        repCount={0}
        isOwn={false}
        isReplyToOwn={false}
        isImageBlurred={false}
        imageBlurRadius={4}
        miniAa={false}
        messageProtocol="https:"
        onIdClick={() => {}}
        onRepClick={() => {}}
        onUrlClick={() => true}
        onUrlContextMenu={() => true}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
        onContextMenu={onContextMenu}
      />,
    );

    const link = container.querySelector("a.res__link") as HTMLAnchorElement;
    const thumb = container.querySelector("a.res__thumb") as HTMLAnchorElement;
    const linkEvent = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    const thumbEvent = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });

    link.dispatchEvent(linkEvent);
    thumb.dispatchEvent(thumbEvent);

    expect(onContextMenu).not.toHaveBeenCalled();
    expect(linkEvent.defaultPrevented).toBe(false);
    expect(thumbEvent.defaultPrevented).toBe(false);
  });

  it("自分のレスと自分宛て返信に強調クラスとバッジを付ける", () => {
    const { container } = render(
      <ResItem
        res={BASE_RES}
        idPos={0}
        idCount={0}
        repCount={0}
        isOwn
        isReplyToOwn
        isImageBlurred={false}
        imageBlurRadius={4}
        miniAa={false}
        messageProtocol="https:"
        onIdClick={() => {}}
        onRepClick={() => {}}
        onUrlClick={() => true}
        onUrlContextMenu={() => true}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
        onContextMenu={() => {}}
      />,
    );

    const article = container.querySelector("[data-res-num='1']");
    expect(article).toHaveClass("res--own");
    expect(article).toHaveClass("res--reply-to-own");
    expect(screen.getByText("自分")).toBeInTheDocument();
    expect(screen.getByText("返信")).toBeInTheDocument();
  });
});

function containerQueryByClass(className: string): HTMLElement {
  const el = document.querySelector(`.${className}`);
  if (!(el instanceof HTMLElement)) {
    throw new Error(`Element not found: .${className}`);
  }
  return el;
}
