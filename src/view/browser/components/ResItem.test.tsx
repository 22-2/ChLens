import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { IRes } from "src/service-container/interfaces";
import { ResItem } from "src/view/browser/components/ResItem";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

afterEach(cleanup);

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
      // res__link クラス付きのアンカーを含めることで、
      // 右クリックのコンテキストメニュー委譲テストで a.res__link セレクタが解決できるようにする。
      messageHtml: '<a href="https://example.com/page" class="res__link">リンク</a>',
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
    extractUrlsFromMessage: () => ["https://example.com/page", "https://example.com/image.jpg"],
    toViewerImageUrl: (rawUrl: string) => (rawUrl.endsWith(".jpg") ? rawUrl : null),
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
  it("NGレスをプレースホルダーで残し、クリック後に内容を表示する", () => {
    const ngRes: IRes = {
      ...BASE_RES,
      ng: { type: "Body", ruleDescription: "hide body contains:\n  本文" },
    };
    const { container } = render(
      <ResItem
        res={ngRes}
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
        onContextMenu={() => {}}
      />,
    );

    const placeholder = screen.getByRole("button", { name: "レス1の内容を表示" });
    expect(placeholder).toHaveAttribute("data-res-num", "1");
    expect(container.querySelector(".res__body")).not.toBeInTheDocument();

    fireEvent.click(placeholder);

    expect(container.querySelector(".res__body")).toBeInTheDocument();
  });

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

  it("状態クラスはNG、自分、自分宛て返信の優先順位で解決する", () => {
    const { container, rerender } = render(
      <ResItem
        res={BASE_RES}
        idPos={0}
        idCount={0}
        repCount={0}
        isOwn={false}
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
    expect(article).toHaveClass("res--state-reply-to-own");
    expect(container.querySelector(".res__name")).toHaveClass("res__name--state-reply-to-own");

    rerender(
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

    expect(article).toHaveClass("res--own");
    expect(article).toHaveClass("res--reply-to-own");
    expect(article).toHaveClass("res--state-own");
    expect(container.querySelector(".res__name")).toHaveClass("res__name--own");
    expect(container.querySelector(".res__name")).toHaveClass("res__name--reply-to-own");
    expect(container.querySelector(".res__name")).toHaveClass("res__name--state-own");
    expect(screen.getByText("自分")).toBeInTheDocument();
    expect(screen.getByText("返信")).toBeInTheDocument();

    const ngRes: IRes = {
      ...BASE_RES,
      ng: { type: "Body", ruleDescription: "hide body contains" },
    };
    rerender(
      <ResItem
        res={ngRes}
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

    expect(article).toHaveClass("res--state-ng");
    fireEvent.click(article!);
    expect(container.querySelector(".res__name")).toHaveClass("res__name--state-ng");
    expect(container.querySelector(".res__badge--ng")).toHaveTextContent("NG");
  });
});

function containerQueryByClass(className: string): HTMLElement {
  const el = document.querySelector(`.${className}`);
  if (!(el instanceof HTMLElement)) {
    throw new Error(`Element not found: .${className}`);
  }
  return el;
}
