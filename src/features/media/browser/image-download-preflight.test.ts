import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { requestMediaImageDownload } from "./image-download-preflight";
import { useMediaImageStore } from "./use-media-image-store";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock("src/app/platform", () => ({ platform: { http: { fetch: fetchMock } } }));
vi.mock("src/view/browser/utils/config-setting", () => ({ readConfigValue: () => "1" }));

const imageUrl = "https://example.com/image.png";

beforeEach(() => {
  useMediaImageStore.setState({ images: new Map() });
  fetchMock.mockReset();
});

describe("画像の事前確認", () => {
  it.each([
    ["サイズ不明", {}],
    ["上限超過", { "content-length": "2000000" }],
  ])("%sの警告を見た後のクリックでダイアログを出さず取得する", async (_label, headers) => {
    fetchMock.mockResolvedValue({ status: 200, headers });
    const confirm = vi.spyOn(window, "confirm");

    await requestMediaImageDownload(imageUrl, imageUrl);
    expect(useMediaImageStore.getState().images.get(imageUrl)?.status).toBe(
      "awaiting-confirmation",
    );

    await requestMediaImageDownload(imageUrl, imageUrl);
    expect(useMediaImageStore.getState().images.get(imageUrl)?.status).toBe("requested");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("上限内の画像は確認後に追加操作なしで取得する", async () => {
    fetchMock.mockResolvedValue({ status: 200, headers: { "content-length": "1000" } });

    await requestMediaImageDownload(imageUrl, imageUrl);

    expect(useMediaImageStore.getState().images.get(imageUrl)?.status).toBe("requested");
  });
});
