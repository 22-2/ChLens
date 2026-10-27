import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, Window as TauriWindow } from "@tauri-apps/api/window";
import { WindowManager, WindowOptions } from "src/app/platform/types";

function getPopupLabel(popup: Window): string {
  const label = (popup as Window & { __chlensPopupLabel?: string }).__chlensPopupLabel;
  if (!label || !/^chlens-popup-\d+$/u.test(label)) {
    throw new Error("別窓のTauriラベルを取得できませんでした");
  }
  return label;
}

// Tauri環境ではbrowser.tabs/windowsが使えないため、
// window.openを使ってシステムブラウザまたは新しいwebviewウィンドウを開く
export const TauriWindowManager: WindowManager = {
  getAssetUrl(path: string): string {
    return new URL(path, window.location.href).toString();
  },

  async openUrlInTab(url: string, _active = true): Promise<void> {
    window.open(url, "_blank");
  },

  async openWindow(options: WindowOptions): Promise<void> {
    const features = [
      options.width ? `width=${options.width}` : "",
      options.height ? `height=${options.height}` : "",
    ]
      .filter(Boolean)
      .join(",");
    window.open(options.url, "_blank", features);
  },

  openPopup(name: string, features: string, sourceWindow = window): Window | null {
    // 表示元のWindowを受け取り、ブラウザ版と同じく別窓からの操作を起点にできるようにする。
    return sourceWindow.open("", name, features);
  },

  async focusPopup(popup: Window): Promise<void> {
    // WebView2のDOM focusでは最小化したOS窓が復元されないため、生成時に付けたラベルで操作する。
    // 新しいWindowを構築すると同じラベルで窓の作成を試みるため、既存の窓を取得する。
    const label = getPopupLabel(popup);
    const nativeWindow = await TauriWindow.getByLabel(label);
    if (!nativeWindow) throw new Error(`別窓のTauriウィンドウが見つかりません: ${label}`);
    await nativeWindow.unminimize();
    await nativeWindow.show();
    await nativeWindow.setFocus();
  },

  async closePopup(popup: Window): Promise<void> {
    // WebView2ではDOMのcloseだけではTauriのOS窓が残るため、閉じる前にラベルを確保する。
    // 終了要求を遅らせないよう、窓一覧の取得を待たずに対象を閉じる。
    let label: string;
    try {
      label = getPopupLabel(popup);
    } finally {
      popup.close();
    }
    await invoke("plugin:window|close", { label });
  },

  async closeCurrent(): Promise<void> {
    window.close();
  },

  async setTitle(title: string): Promise<void> {
    await getCurrentWindow().setTitle(title);
  },
};
