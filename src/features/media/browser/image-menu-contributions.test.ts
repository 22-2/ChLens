// @vitest-environment node
import { describe, expect, it, vi } from "vite-plus/test";

const { loggerError } = vi.hoisted(() => ({ loggerError: vi.fn() }));
vi.mock("src/app/logger", () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: loggerError }),
}));

import { addImageMenuProvider, collectImageMenuItems } from "./image-menu-contributions";

const context = {
  imageKey: "https://images.example.com/a.jpg",
  image: {} as HTMLImageElement,
  targetWindow: {} as Window,
};

describe("画像の右クリックメニューへの項目の追加", () => {
  it("登録した関数の項目を集め、解除したら出さない", () => {
    const remove = addImageMenuProvider(() => [{ id: "a", label: "A" }]);
    expect(collectImageMenuItems(context).map(({ id }) => id)).toEqual(["a"]);
    remove();
    expect(collectImageMenuItems(context)).toEqual([]);
  });

  it("1つの関数が失敗しても、ログを出してほかの項目は出す", () => {
    const error = new Error("失敗");
    const removeBroken = addImageMenuProvider(() => {
      throw error;
    });
    const removeOk = addImageMenuProvider(() => [{ id: "ok", label: "OK" }]);
    try {
      expect(collectImageMenuItems(context).map(({ id }) => id)).toEqual(["ok"]);
      expect(loggerError).toHaveBeenCalledWith(
        "画像の右クリックメニューの項目を作れませんでした",
        expect.objectContaining({ imageKey: context.imageKey, error }),
      );
    } finally {
      removeBroken();
      removeOk();
    }
  });
});
