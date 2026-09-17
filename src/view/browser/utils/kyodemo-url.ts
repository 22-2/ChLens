/**
 * レスのIDから、実況共有サービスのURLを組み立てる。
 * 変更理由: スレッド内の共有リンク生成はメディアURL判定と責務が異なるため、
 * メディア機能を移動しても汎用のThreadView操作だけで完結するよう別モジュールへ分離する。
 */
export function buildKyodemoUrl(threadUrl: string, rawId: string): string | null {
  try {
    const urlObj = new window.URL(threadUrl);
    const pathParts = urlObj.pathname.split("/");
    const board = pathParts[3];
    const key = pathParts[4];
    if (!board || !key) return null;

    const date = new Date();
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const dateStr = `${yyyy}${mm}${dd}`;

    return `https://www.kyodemo.net/sdemo/b/e_e_${board}/?hi=${encodeURIComponent(
      rawId,
    )}&key=${encodeURIComponent(key)}&date=${dateStr}`;
  } catch {
    return null;
  }
}
