// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { stored, loggerError } = vi.hoisted(() => ({
  stored: new Map<string, unknown>(),
  loggerError: vi.fn(),
}));

vi.mock("src/app/platform", () => ({
  platform: {
    storage: {
      getStore: () => ({
        get: async (key: string) => stored.get(key),
        put: async (value: { url: string }) => {
          stored.set(value.url, value);
        },
        delete: async (key: string) => {
          stored.delete(key);
        },
        getAll: async () => [...stored.values()],
      }),
    },
  },
}));
vi.mock("src/app/logger", () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: loggerError }),
}));

import {
  findSimilarImageRecordBySourceUrl,
  getSimilarImageRecord,
  pruneSimilarImageRecords,
  saveSimilarImageRecord,
} from "./similar-image-records";

const record = {
  hash: "0123456789abcdef",
  thumbnailDataUrl: "data:image/jpeg;base64,AAAA",
  sourceUrl: "https://images.example.com/a.jpg",
  addedAt: 1,
};

describe("類似画像NGに登録した画像の記録", () => {
  beforeEach(() => {
    stored.clear();
    loggerError.mockReset();
  });

  it("ハッシュをキーに保存し、ハッシュと元のURLで引ける", async () => {
    await saveSimilarImageRecord(record);
    expect(stored.get(record.hash)).toMatchObject({ url: record.hash });
    await expect(getSimilarImageRecord(record.hash)).resolves.toEqual(record);
    await expect(findSimilarImageRecordBySourceUrl(record.sourceUrl)).resolves.toEqual(record);
    await expect(getSimilarImageRecord("fedcba9876543210")).resolves.toBeNull();
    await expect(
      findSimilarImageRecordBySourceUrl("https://images.example.com/b.jpg"),
    ).resolves.toBeNull();
  });

  it("形の違う値は記録として扱わない", async () => {
    stored.set(record.hash, { url: record.hash, thumbnailDataUrl: 1 });
    await expect(getSimilarImageRecord(record.hash)).resolves.toBeNull();
  });

  it("ルールから消えたハッシュの記録を捨てる", async () => {
    await saveSimilarImageRecord(record);
    await saveSimilarImageRecord({ ...record, hash: "fedcba9876543210" });
    await pruneSimilarImageRecords((hash) => hash === record.hash);
    expect([...stored.keys()]).toEqual([record.hash]);
  });
});
