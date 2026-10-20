// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  storage: new Map<string, string>(),
}));

vi.mock("src/app/platform", () => ({
  platform: {
    http: { fetch: mocks.fetch },
    storage: {
      kv: {
        get: async (key: string) => mocks.storage.get(key) ?? null,
        set: async (key: string, value: string) => {
          mocks.storage.set(key, value);
        },
        remove: async (key: string) => {
          mocks.storage.delete(key);
        },
      },
    },
  },
}));

vi.mock("src/app/logger", () => ({
  createLogger: () => ({ debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));

vi.mock("src/service-container", () => ({
  container: { config: { get: () => "" } },
}));

import { hasImgurDeletehash } from "./imgur-deletehash";
import { uploadImageToImgur } from "./imgur-upload";

const IMAGE = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });

describe("Imgur投稿", () => {
  beforeEach(() => {
    mocks.fetch.mockReset();
    mocks.storage.clear();
  });

  it("投稿で返された削除キーを画像URLと対応づけて保存し、本文に入れるURLは変えない", async () => {
    mocks.fetch.mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        success: true,
        status: 200,
        data: { link: "https://i.imgur.com/abc123.png", deletehash: "hash-1" },
      }),
    });

    await expect(uploadImageToImgur(IMAGE)).resolves.toBe("https://i.imgur.com/abc123.png");

    await expect(hasImgurDeletehash("https://i.imgur.com/abc123.png")).resolves.toBe(true);
  });

  it("削除キーが返されない投稿は成功させ、削除対象には加えない", async () => {
    mocks.fetch.mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        success: true,
        status: 200,
        data: { link: "https://i.imgur.com/abc123.png" },
      }),
    });

    await expect(uploadImageToImgur(IMAGE)).resolves.toBe("https://i.imgur.com/abc123.png");

    await expect(hasImgurDeletehash("https://i.imgur.com/abc123.png")).resolves.toBe(false);
  });
});
