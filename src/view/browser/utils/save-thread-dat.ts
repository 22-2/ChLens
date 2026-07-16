import { ChURL } from "packages/ch-lib/src/index";
import { getThreadXhrInfo, isHtmlThread } from "src/core/ThreadParser.js";
import { container } from "src/service-container/index";

// スレ閲覧時のキャッシュキーは Thread.get() と同じく getThreadXhrInfo の path なので、
// ここでも同じ導出を使わないと保存済みdatを見つけられない。
function resolveDatCachePath(threadUrl: string): { path: string; isHtml: boolean } | null {
  const url = new ChURL(threadUrl);
  const format2chnet = container.config.get("format_2chnet");
  const xhrInfo = getThreadXhrInfo(url, format2chnet);
  if (!xhrInfo) {
    return null;
  }
  return { path: xhrInfo.path, isHtml: isHtmlThread(url, format2chnet) };
}

function buildDatFilename(threadUrl: string): string {
  // read.cgi 形式のURLから「板名_スレキー.dat」を組み立てる。
  const matched = /\/(?:test|bbs)\/read(?:_archive)?\.cgi\/(\w+)\/(\d+)(?:\/(\d+))?/.exec(
    threadUrl,
  );
  if (matched) {
    const threadKey = matched[3] ?? matched[2];
    return `${matched[1]}_${threadKey}.dat`;
  }
  return "thread.dat";
}

/**
 * 表示中スレのdat（キャッシュ済み生データ）をファイルとしてダウンロード保存する。
 * 成功/失敗はトーストで通知する。
 */
export async function saveThreadDat(threadUrl: string): Promise<void> {
  const resolved = resolveDatCachePath(threadUrl);
  if (!resolved) {
    container.toast.error("対応していないURLのためdatを保存できません");
    return;
  }

  // read.cgi(HTML)取得のスレはキャッシュに生datを持たない（parsedのみ）ため保存対象外。
  if (resolved.isHtml) {
    container.toast.error("この掲示板はHTML形式で取得しているためdatを保存できません");
    return;
  }

  const cache = container.cache.getCache(resolved.path);
  try {
    await cache.get();
  } catch {
    container.toast.error("datのキャッシュが見つかりません。スレを再読み込みしてください");
    return;
  }

  if (cache.data == null || cache.data === "") {
    container.toast.error("datのキャッシュが空のため保存できません");
    return;
  }

  // キャッシュは取得時にデコード済みの文字列なので、UTF-8テキストとして保存する。
  const blob = new Blob([cache.data], { type: "text/plain;charset=utf-8" });
  const objectUrl = window.URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = buildDatFilename(threadUrl);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    container.toast.info("datを保存しました");
  } finally {
    // click 直後に revoke するとダウンロードが始まらない環境があるため遅延させる。
    window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 10_000);
  }
}
