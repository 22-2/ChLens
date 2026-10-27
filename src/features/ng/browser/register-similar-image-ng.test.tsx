import { validateRuleDsl } from "@chlen/chlib";
import { useImageHashStore } from "src/features/media/browser/use-image-hash-store";
import {
  buildSimilarImageRuleDsl,
  isNearlyFlatImageHash,
  registerSimilarImage,
} from "src/features/ng/browser/register-similar-image-ng";
import { container } from "src/service-container";
import type { INGService, IToastService } from "src/service-container/interfaces";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { loggerError } = vi.hoisted(() => ({ loggerError: vi.fn() }));
const records = vi.hoisted(() => ({
  findSimilarImageRecordBySourceUrl: vi.fn(),
  saveSimilarImageRecord: vi.fn(),
  pruneSimilarImageRecords: vi.fn(),
}));
vi.mock("src/features/ng/browser/similar-image-records", () => records);
const { createImageThumbnailFromElement } = vi.hoisted(() => ({
  createImageThumbnailFromElement: vi.fn(),
}));
vi.mock("src/features/media/browser/image-hash-reader", () => ({
  createImageThumbnailFromElement,
  computeImageHashFromElement: vi.fn(),
}));
vi.mock("src/app/logger", () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: loggerError }),
}));

const HASH = "0f0f0f0f0f0f0f0f";
const imageKey = "https://images.example.com/a.jpg";

const add = vi.fn<INGService["add"]>();
const hasImageHash = vi.fn<INGService["hasImageHash"]>();
const toast = {
  notify: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
} satisfies IToastService;
const confirm = vi.fn<(message?: string) => boolean>();
const targetWindow = { confirm } as unknown as Window;
const getOrComputeHash = vi.fn<(key: string, image: HTMLImageElement) => Promise<string>>();
const image = {} as HTMLImageElement;

describe("類似画像NGへの登録", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    add.mockResolvedValue(undefined);
    hasImageHash.mockReturnValue(false);
    confirm.mockReturnValue(true);
    getOrComputeHash.mockResolvedValue(HASH);
    records.findSimilarImageRecordBySourceUrl.mockResolvedValue(null);
    records.saveSimilarImageRecord.mockResolvedValue(undefined);
    records.pruneSimilarImageRecords.mockResolvedValue(undefined);
    createImageThumbnailFromElement.mockResolvedValue("data:image/jpeg;base64,AAAA");
    container.ng = {
      isNGBoard: vi.fn().mockReturnValue(null),
      isNGThread: vi.fn().mockReturnValue(null),
      hasImageRules: vi.fn().mockReturnValue(false),
      hasImageHash,
      isSimilarImageNG: vi.fn().mockReturnValue(null),
      add,
      invalidateCache: vi.fn(),
      execExpire: vi.fn(),
    };
    container.toast = toast;
    useImageHashStore.setState({ getOrComputeHash });
  });

  it("登録するルールは保存できる形で、similarityを明記する", () => {
    const dsl = buildSimilarImageRuleDsl(HASH);
    expect(dsl).toContain("similarity 85%");
    const result = validateRuleDsl(dsl);
    expect(result.diagnostics).toEqual([]);
    expect(result.rules[0]).toMatchObject({
      action: "blur",
      target: "image",
      similarity: 85,
      presentation: { label: "類似画像" },
      matchers: [{ kind: "image-hash", value: HASH }],
    });
  });

  it("1か0に偏ったハッシュを、ほぼ単色とみなす", () => {
    expect(isNearlyFlatImageHash("0000000000000000")).toBe(true);
    expect(isNearlyFlatImageHash("ffffffffffffffff")).toBe(true);
    expect(isNearlyFlatImageHash("00000000000000ff")).toBe(true);
    expect(isNearlyFlatImageHash("0000000000000fff")).toBe(false);
    expect(isNearlyFlatImageHash(HASH)).toBe(false);
  });

  it("ハッシュを求めてルールを足し、取り消し方を伝える", async () => {
    await registerSimilarImage({ imageKey, image, targetWindow });
    expect(getOrComputeHash).toHaveBeenCalledWith(imageKey, image);
    expect(add).toHaveBeenCalledWith(buildSimilarImageRuleDsl(HASH));
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("取り消す"), {
      targetWindow,
    });
    expect(confirm).not.toHaveBeenCalled();
  });

  it("登録済みのハッシュは足さずに伝える", async () => {
    hasImageHash.mockReturnValue(true);
    await registerSimilarImage({ imageKey, image, targetWindow });
    expect(add).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith("この画像は類似画像NGに登録済みです", { targetWindow });
  });

  it("ほぼ単色の画像は確認し、断られたら足さない", async () => {
    getOrComputeHash.mockResolvedValue("0000000000000000");
    confirm.mockReturnValue(false);
    await registerSimilarImage({ imageKey, image, targetWindow });
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("ほぼ単色"));
    expect(add).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    await registerSimilarImage({ imageKey, image, targetWindow });
    expect(add).toHaveBeenCalledWith(buildSimilarImageRuleDsl("0000000000000000"));
  });

  it("ハッシュを求められなければ、ログを出して利用者に伝える", async () => {
    const error = new Error("取得失敗");
    getOrComputeHash.mockRejectedValue(error);
    await registerSimilarImage({ imageKey, image, targetWindow });
    expect(add).not.toHaveBeenCalled();
    expect(loggerError).toHaveBeenCalledWith(
      "類似画像NGに登録する画像のハッシュを計算できませんでした",
      { imageKey, error },
    );
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("登録できませんでした"), {
      targetWindow,
    });
  });

  it("保存に失敗したら、ログを出して利用者に伝える", async () => {
    const error = new Error("保存失敗");
    add.mockRejectedValue(error);
    await registerSimilarImage({ imageKey, image, targetWindow });
    expect(loggerError).toHaveBeenCalledWith("類似画像NGのルールを保存できませんでした", {
      imageKey,
      hash: HASH,
      error,
    });
    expect(toast.error).toHaveBeenCalledWith("類似画像NGに登録できませんでした", { targetWindow });
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("登録したら縮小画像と元のURLを記録し、消えたルールの記録を捨てる", async () => {
    await registerSimilarImage({ imageKey, image, targetWindow });
    expect(createImageThumbnailFromElement).toHaveBeenCalledWith(image);
    expect(records.saveSimilarImageRecord).toHaveBeenCalledWith({
      hash: HASH,
      thumbnailDataUrl: "data:image/jpeg;base64,AAAA",
      sourceUrl: imageKey,
      addedAt: expect.any(Number),
    });
    expect(records.pruneSimilarImageRecords).toHaveBeenCalled();
  });

  it("同じURLの画像が登録済みなら、ハッシュを求めずに伝える", async () => {
    records.findSimilarImageRecordBySourceUrl.mockResolvedValue({ hash: HASH });
    hasImageHash.mockReturnValue(true);
    await registerSimilarImage({ imageKey, image, targetWindow });
    expect(getOrComputeHash).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith("この画像は類似画像NGに登録済みです", { targetWindow });
  });

  it("同じURLの記録があっても、ルールを消していれば登録し直せる", async () => {
    records.findSimilarImageRecordBySourceUrl.mockResolvedValue({ hash: HASH });
    hasImageHash.mockReturnValue(false);
    await registerSimilarImage({ imageKey, image, targetWindow });
    expect(add).toHaveBeenCalledWith(buildSimilarImageRuleDsl(HASH));
  });

  it("記録を残せなくても登録は済ませ、ログを出す", async () => {
    const error = new Error("縮小できない");
    createImageThumbnailFromElement.mockRejectedValue(error);
    await registerSimilarImage({ imageKey, image, targetWindow });
    expect(add).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalled();
    expect(loggerError).toHaveBeenCalledWith(
      "類似画像NGに登録した画像の記録を保存できませんでした",
      { imageKey, hash: HASH, error },
    );
  });
});
