import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  unminimize: vi.fn(),
  show: vi.fn(),
  setFocus: vi.fn(),
  getByLabel: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(),
  Window: class {
    static getByLabel = mocks.getByLabel;
  },
}));

import { TauriWindowManager } from "./WindowManager";

describe("Tauriの別窓フォーカス", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getByLabel.mockResolvedValue({
      unminimize: mocks.unminimize,
      show: mocks.show,
      setFocus: mocks.setFocus,
    });
    mocks.invoke.mockResolvedValue(undefined);
  });

  it("同じラベルのOS窓を復元し、表示してからフォーカスする", async () => {
    const popup = { __chlensPopupLabel: "chlens-popup-3" } as unknown as Window;
    await TauriWindowManager.focusPopup!(popup);
    expect(mocks.getByLabel).toHaveBeenCalledWith("chlens-popup-3");
    expect(mocks.unminimize).toHaveBeenCalledBefore(mocks.show);
    expect(mocks.show).toHaveBeenCalledBefore(mocks.setFocus);
  });

  it("ラベルがないときは別の窓へフォーカスせず失敗を通知する", async () => {
    await expect(TauriWindowManager.focusPopup!({} as Window)).rejects.toThrow(
      "別窓のTauriラベルを取得できませんでした",
    );
  });

  it("既存のOS窓がなければフォーカスせず失敗を通知する", async () => {
    mocks.getByLabel.mockResolvedValue(null);
    const popup = { __chlensPopupLabel: "chlens-popup-3" } as unknown as Window;
    await expect(TauriWindowManager.focusPopup!(popup)).rejects.toThrow(
      "別窓のTauriウィンドウが見つかりません: chlens-popup-3",
    );
  });

  it("DOMを閉じた後、同じラベルのOS窓を閉じる", async () => {
    const close = vi.fn();
    const popup = { __chlensPopupLabel: "chlens-popup-3", close } as unknown as Window;
    await TauriWindowManager.closePopup!(popup);
    expect(close).toHaveBeenCalledBefore(mocks.invoke);
    expect(mocks.invoke).toHaveBeenCalledWith("plugin:window|close", { label: "chlens-popup-3" });
  });

  it("不正なラベルでは別のOS窓を閉じず、DOMは閉じて失敗を通知する", async () => {
    const close = vi.fn();
    const popup = { __chlensPopupLabel: "main", close } as unknown as Window;
    await expect(TauriWindowManager.closePopup!(popup)).rejects.toThrow(
      "別窓のTauriラベルを取得できませんでした",
    );
    expect(close).toHaveBeenCalledOnce();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
