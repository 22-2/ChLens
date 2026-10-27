import { setUserAgent } from "src/app/platform/user-agent";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { TauriHttpClient } from "src/app/platform/tauri/HttpClient";

describe("TauriHttpClient のUser-Agent", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue({ status: 200, headers: {}, bodyBase64: "", url: "" });
    setUserAgent("");
  });

  const sentHeaders = () => invokeMock.mock.calls[0]![1].request.headers;

  it("設定したUser-Agentを要求へ付ける", async () => {
    setUserAgent("  Custom-Agent/1.0 ");
    await TauriHttpClient.fetch("https://example.com/");
    expect(sentHeaders()).toEqual({ "User-Agent": "Custom-Agent/1.0" });
  });

  it("空欄のときは付けず、既定のUser-Agentに任せる", async () => {
    await TauriHttpClient.fetch("https://example.com/", { headers: { Accept: "*/*" } });
    expect(sentHeaders()).toEqual({ Accept: "*/*" });
  });

  it("呼び出し側が指定したUser-Agentを優先する", async () => {
    setUserAgent("Custom-Agent/1.0");
    await TauriHttpClient.fetch("https://example.com/", {
      headers: { "user-agent": "Explicit/2" },
    });
    expect(sentHeaders()).toEqual({ "user-agent": "Explicit/2" });
  });
});
