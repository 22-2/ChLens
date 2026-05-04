import {
  consumePendingThreadResJump,
  measureThreadReadState,
  peekPendingThreadResJump,
  requestThreadResJump,
  scrollThreadToResponse,
} from "src/view/browser/utils/thread-read-state";
import { afterEach, describe, expect, it } from "vitest";

function createRect({
  top,
  bottom,
  left = 0,
  right = 100,
}: {
  top: number;
  bottom: number;
  left?: number;
  right?: number;
}): DOMRect {
  return {
    x: left,
    y: top,
    top,
    bottom,
    left,
    right,
    width: right - left,
    height: bottom - top,
    toJSON: () => ({}),
  } as DOMRect;
}

describe("thread-read-state", () => {
  afterEach(() => {
    consumePendingThreadResJump("https://example.com/test/read.cgi/live/1/");
  });

  it("visible areaからlast/read/offsetを算出する", () => {
    const panel = document.createElement("div");
    panel.className = "content-area__tab-panel";
    panel.getBoundingClientRect = () => createRect({ top: 100, bottom: 200 });

    const host = document.createElement("div");
    host.className = "thread-page";
    panel.appendChild(host);

    const responses = document.createElement("div");
    responses.className = "thread-page__responses";
    host.appendChild(responses);

    const rects = [
      createRect({ top: 80, bottom: 120 }),
      createRect({ top: 120, bottom: 160 }),
      createRect({ top: 160, bottom: 220 }),
    ];

    rects.forEach((rect, index) => {
      const article = document.createElement("article");
      article.dataset.resNum = String(index + 1);
      article.getBoundingClientRect = () => rect;
      responses.appendChild(article);
    });

    const measured = measureThreadReadState(host, 3);

    expect(measured).toEqual({
      last: 1,
      read: 3,
      received: 3,
      offset: -20,
    });
  });

  it("指定レスへoffset付きでスクロールする", () => {
    const panel = document.createElement("div");
    panel.className = "content-area__tab-panel";
    panel.getBoundingClientRect = () => createRect({ top: 100, bottom: 260 });
    Object.defineProperty(panel, "scrollTop", {
      configurable: true,
      value: 50,
      writable: true,
    });

    const scrollCalls: ScrollToOptions[] = [];
    panel.scrollTo = (options: ScrollToOptions) => {
      scrollCalls.push(options);
    };

    const host = document.createElement("div");
    host.className = "thread-page";
    panel.appendChild(host);

    const responses = document.createElement("div");
    responses.className = "thread-page__responses";
    host.appendChild(responses);

    const article = document.createElement("article");
    article.dataset.resNum = "42";
    article.getBoundingClientRect = () => createRect({ top: 180, bottom: 240 });
    responses.appendChild(article);

    const didScroll = scrollThreadToResponse(host, 42, {
      highlight: false,
      offset: 20,
    });

    expect(didScroll).toBe(true);
    expect(scrollCalls).toEqual([
      {
        top: 110,
        behavior: "auto",
      },
    ]);
  });

  it("pending jumpを保持して後で消費できる", () => {
    const jump = requestThreadResJump(
      "https://example.com/test/read.cgi/live/1/",
      42,
    );

    expect(jump?.resNum).toBe(42);
    expect(
      peekPendingThreadResJump("https://example.com/test/read.cgi/live/1/"),
    ).toMatchObject({ resNum: 42 });
    expect(
      consumePendingThreadResJump(
        "https://example.com/test/read.cgi/live/1/",
        jump?.token,
      ),
    ).toMatchObject({ resNum: 42 });
    expect(
      peekPendingThreadResJump("https://example.com/test/read.cgi/live/1/"),
    ).toBeNull();
  });
});
