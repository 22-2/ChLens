import { describe, expect, it, vi } from "vitest";

const { runtimeGetUrlMock, sendMessageMock } = vi.hoisted(() => ({
  runtimeGetUrlMock: vi.fn((path: string) => {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `chrome-extension://test-extension${normalizedPath}`;
  }),
  sendMessageMock: vi.fn(),
}));

vi.mock("webextension-polyfill", () => ({
  default: {
    runtime: {
      getURL: runtimeGetUrlMock,
      sendMessage: sendMessageMock,
    },
  },
}));

describe("cs_addlink", () => {
  it("左クリック経路と補助クリック経路で同じ正規化済みURLを共有する", async () => {
    const { createViewerTargets } = await import("src/cs_addlink");

    expect(
      createViewerTargets("https://bbs.eddibb.cc/liveedge/1000000005/"),
    ).toEqual({
      targetUrl: "http://bbs.eddibb.cc/test/read.cgi/liveedge/1000000005/",
      viewerUrl:
        "chrome-extension://test-extension/view/browser.html?q=http%3A%2F%2Fbbs.eddibb.cc%2Ftest%2Fread.cgi%2Fliveedge%2F1000000005%2F",
    });
  });
});
