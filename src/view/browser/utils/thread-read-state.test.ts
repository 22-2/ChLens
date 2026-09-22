import {
  consumePendingThreadResJump,
  measureThreadReadState,
  peekPendingThreadResJump,
  requestThreadResJump,
  scrollThreadToResponse,
} from "src/view/browser/utils/thread-read-state";
import { afterEach, describe, expect, it } from "vite-plus/test";

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
    panel.scrollTo = ((options?: ScrollToOptions) => {
      scrollCalls.push(options ?? { top: 0 });
    }) as typeof panel.scrollTo;

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

  it("別窓のレス要素を判定してスクロールする", () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const viewDocument = iframe.contentDocument;
    if (!viewDocument) {
      iframe.remove();
      throw new Error("別窓テスト用のiframeを初期化できませんでした");
    }

    const panel = viewDocument.createElement("div");
    panel.className = "content-area__tab-panel";
    panel.getBoundingClientRect = () => createRect({ top: 100, bottom: 260 });
    Object.defineProperty(panel, "scrollTop", {
      configurable: true,
      value: 50,
      writable: true,
    });
    const scrollCalls: ScrollToOptions[] = [];
    panel.scrollTo = ((options?: ScrollToOptions) => {
      scrollCalls.push(options ?? { top: 0 });
    }) as typeof panel.scrollTo;

    const host = viewDocument.createElement("div");
    host.className = "thread-page";
    panel.appendChild(host);
    const responses = viewDocument.createElement("div");
    responses.className = "thread-page__responses";
    host.appendChild(responses);
    const article = viewDocument.createElement("article");
    article.dataset.resNum = "42";
    article.getBoundingClientRect = () => createRect({ top: 180, bottom: 240 });
    responses.appendChild(article);
    viewDocument.body.appendChild(panel);

    expect(scrollThreadToResponse(host, 42, { highlight: false, offset: 20 })).toBe(true);
    expect(scrollCalls).toEqual([{ top: 110, behavior: "auto" }]);

    iframe.remove();
  });

  it("別窓のWindowProxyでHTMLElement constructorがなくてもレスへスクロールする", () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const viewDocument = iframe.contentDocument;
    const viewWindow = iframe.contentWindow;
    if (!viewDocument || !viewWindow) {
      iframe.remove();
      throw new Error("別窓テスト用のiframeを初期化できませんでした");
    }

    const viewWindowWithConstructors = viewWindow as Window & typeof globalThis;
    const originalHTMLElement = viewWindowWithConstructors.HTMLElement;
    Object.defineProperty(viewWindowWithConstructors, "HTMLElement", {
      configurable: true,
      value: undefined,
    });
    try {
      const panel = viewDocument.createElement("div");
      panel.className = "content-area__tab-panel";
      panel.getBoundingClientRect = () => createRect({ top: 100, bottom: 260 });
      Object.defineProperty(panel, "scrollTop", {
        configurable: true,
        value: 50,
        writable: true,
      });
      const scrollCalls: ScrollToOptions[] = [];
      panel.scrollTo = ((options?: ScrollToOptions) => {
        scrollCalls.push(options ?? { top: 0 });
      }) as typeof panel.scrollTo;

      const host = viewDocument.createElement("div");
      host.className = "thread-page";
      panel.appendChild(host);
      const responses = viewDocument.createElement("div");
      responses.className = "thread-page__responses";
      host.appendChild(responses);
      const article = viewDocument.createElement("article");
      article.dataset.resNum = "42";
      article.getBoundingClientRect = () => createRect({ top: 180, bottom: 240 });
      responses.appendChild(article);
      viewDocument.body.appendChild(panel);

      expect(scrollThreadToResponse(host, 42, { highlight: false, offset: 20 })).toBe(true);
      expect(scrollCalls).toEqual([{ top: 110, behavior: "auto" }]);
    } finally {
      Object.defineProperty(viewWindowWithConstructors, "HTMLElement", {
        configurable: true,
        value: originalHTMLElement,
      });
      iframe.remove();
    }
  });

  it("pending jumpを保持して後で消費できる", () => {
    const jump = requestThreadResJump("https://example.com/test/read.cgi/live/1/", 42);

    expect(jump?.resNum).toBe(42);
    expect(peekPendingThreadResJump("https://example.com/test/read.cgi/live/1/")).toMatchObject({
      resNum: 42,
    });
    expect(
      consumePendingThreadResJump("https://example.com/test/read.cgi/live/1/", jump?.token),
    ).toMatchObject({ resNum: 42 });
    expect(peekPendingThreadResJump("https://example.com/test/read.cgi/live/1/")).toBeNull();
  });
});
