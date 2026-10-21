import browser from "webextension-polyfill";

/**
 * ビューアータブを作成して前面に出す。
 * 以前はReactの初回描画を待ってから選択し、白い初期フレームを見せないようにしていたが、
 * バッジクリックへの反応速度を優先して待機をやめ、作成と同時に選択する。
 */
export async function createViewerTab(url: string, windowId?: number): Promise<browser.Tabs.Tab> {
  const tab = await browser.tabs.create({ url, active: true, windowId });
  if (tab.id === undefined) throw new Error("作成したビューアータブのIDがありません");
  return tab;
}
