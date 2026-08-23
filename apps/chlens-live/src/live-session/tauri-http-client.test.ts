import { describe, expect, it, vi } from "vite-plus/test";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { TauriHttpClient } from "./tauri-http-client";

vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: vi.fn(),
}));

describe("TauriHttpClient", () => {
  it("maps the plugin response to the ch-lib raw-byte transport contract", async () => {
    const body = Uint8Array.from([0x83, 0x65, 0x83, 0x58]).buffer;
    vi.mocked(tauriFetch).mockResolvedValueOnce({
      status: 206,
      headers: {
        forEach(callback: (value: string, key: string) => void) {
          callback("bytes=4-7", "content-range");
        },
      },
      arrayBuffer: async () => body,
    } as Response);

    const result = await new TauriHttpClient().get("https://bbs.eddibb.cc/liveedge/dat/1.dat", {
      headers: { "If-Range": "etag-value" },
    });

    expect(tauriFetch).toHaveBeenCalledWith("https://bbs.eddibb.cc/liveedge/dat/1.dat", {
      method: "GET",
      headers: { "If-Range": "etag-value" },
      signal: undefined,
    });
    expect(result).toEqual({
      status: 206,
      headers: { "content-range": "bytes=4-7" },
      body,
    });
  });

  it("logs and rethrows plugin transport errors", async () => {
    const error = new Error("network unavailable");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(tauriFetch).mockRejectedValueOnce(error);

    await expect(
      new TauriHttpClient().get("https://bbs.eddibb.cc/liveedge/subject.txt"),
    ).rejects.toBe(error);
    expect(consoleError).toHaveBeenCalledWith(
      "[TauriHttpClient] GET failed: https://bbs.eddibb.cc/liveedge/subject.txt",
      error,
    );
    consoleError.mockRestore();
  });
});
