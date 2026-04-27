import "@testing-library/jest-dom/vitest";
import { render } from "@testing-library/react";
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
  it("リンクと画像の右クリックでは既定コンテキストメニューを維持する", () => {
    const onContextMenu = vi.fn();

    const { container } = render(
      <ResItem
        res={BASE_RES}
        idPos={0}
        idCount={0}
        repCount={0}
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
});
