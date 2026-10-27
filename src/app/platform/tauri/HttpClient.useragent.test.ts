import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { TauriHttpClient } from "src/app/platform/tauri/HttpClient";

describe("TauriHttpClient のUser-Agent", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue({ status: 200, headers: {}, bodyBase64: "", url: "" });
  });

  const sentHeaders = () => invokeMock.mock.calls[0]![1].request.headers;

  it("指定したUser-Agentを要求へ付ける", async () => {
    await TauriHttpClient.fetch("https://example.com/", { userAgent: "Custom-Agent/1.0" });
    expect(sentHeaders()).toEqual({ "User-Agent": "Custom-Agent/1.0" });
  });

  it("空文字のときはWebView自身のUser-Agentを使う", async () => {
    await TauriHttpClient.fetch("https://example.com/", { userAgent: "" });
    expect(sentHeaders()).toEqual({ "User-Agent": navigator.userAgent });
  });

  it("userAgent未指定の要求には付けない", async () => {
    await TauriHttpClient.fetch("https://example.com/", { headers: { Accept: "*/*" } });
    expect(sentHeaders()).toEqual({ Accept: "*/*" });
  });

  it("呼び出し側が指定したUser-Agentヘッダーを優先する", async () => {
    await TauriHttpClient.fetch("https://example.com/", {
      userAgent: "Custom-Agent/1.0",
      headers: { "user-agent": "Explicit/2" },
    });
    expect(sentHeaders()).toEqual({ "user-agent": "Explicit/2" });
  });
});
