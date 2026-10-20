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

import {
  deleteImgurImage,
  hasImgurDeletehash,
  removeImgurImageLines,
  saveImgurDeletehash,
  subscribeImgurImageDeleted,
} from "./imgur-deletehash";

const IMAGE_URL = "https://i.imgur.com/abc123.png";

describe("Imgur削除キーの保存と削除", () => {
  beforeEach(() => {
    mocks.fetch.mockReset();
    mocks.storage.clear();
  });

  it("保存した削除キーは、拡張子や http の表記が違う同じ画像URLでも判定できる", async () => {
    await saveImgurDeletehash(IMAGE_URL, "hash-1");

    await expect(hasImgurDeletehash("http://imgur.com/abc123")).resolves.toBe(true);
    await expect(hasImgurDeletehash("https://i.imgur.com/other.png")).resolves.toBe(false);
  });

  it("削除に成功したら削除キーを消し、購読者へ削除された画像URLを通知する", async () => {
    await saveImgurDeletehash(IMAGE_URL, "hash-1");
    mocks.fetch.mockResolvedValue({
      status: 200,
      body: JSON.stringify({ data: true, success: true, status: 200 }),
    });
    const listener = vi.fn();
    const unsubscribe = subscribeImgurImageDeleted(listener);

    await deleteImgurImage(IMAGE_URL);

    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://api.imgur.com/3/image/hash-1",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(listener).toHaveBeenCalledWith(IMAGE_URL);
    await expect(hasImgurDeletehash(IMAGE_URL)).resolves.toBe(false);
    unsubscribe();
  });

  it("削除キーのない画像は削除APIを呼ばずに拒否する", async () => {
    await expect(deleteImgurImage(IMAGE_URL)).rejects.toThrow("削除できません");

    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("Imgurが失敗を返したら理由を含めて拒否し、削除キーは残す", async () => {
    await saveImgurDeletehash(IMAGE_URL, "hash-1");
    mocks.fetch.mockResolvedValue({
      status: 403,
      body: JSON.stringify({ data: { error: "Forbidden" }, success: false, status: 403 }),
    });
    const listener = vi.fn();
    const unsubscribe = subscribeImgurImageDeleted(listener);

    await expect(deleteImgurImage(IMAGE_URL)).rejects.toThrow("Forbidden");

    expect(listener).not.toHaveBeenCalled();
    await expect(hasImgurDeletehash(IMAGE_URL)).resolves.toBe(true);
    unsubscribe();
  });

  it("購読を解除した後は削除通知を受け取らない", async () => {
    await saveImgurDeletehash(IMAGE_URL, "hash-1");
    mocks.fetch.mockResolvedValue({
      status: 200,
      body: JSON.stringify({ data: true, success: true, status: 200 }),
    });
    const listener = vi.fn();
    const unsubscribe = subscribeImgurImageDeleted(listener);
    unsubscribe();

    await deleteImgurImage(IMAGE_URL);

    expect(listener).not.toHaveBeenCalled();
  });
});

describe("本文から削除された画像の行を取り除く", () => {
  it("同じ画像を指すURL行だけを取り除き、前後の文章と他の画像は残す", () => {
    const message = [
      "本文です",
      "https://i.imgur.com/abc123.png",
      "https://i.imgur.com/other.png",
      "http://imgur.com/abc123",
      "",
    ].join("\n");

    expect(removeImgurImageLines(message, IMAGE_URL)).toBe(
      ["本文です", "https://i.imgur.com/other.png", ""].join("\n"),
    );
  });

  it("本文中に同じURLが文章の一部として含まれるだけなら残す", () => {
    const message = "参考 https://i.imgur.com/abc123.png を見て";

    expect(removeImgurImageLines(message, IMAGE_URL)).toBe(message);
  });
});
