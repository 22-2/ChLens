import type { ChURL } from "../url/ChURL";

export interface ThreadArchiveFallback {
  url: string;
  charset: string;
}

// 2ch.sc は板ごとに収容ホストが異なるため、確認できた板だけ明示的に登録する。
const LEGACY_MIRROR_HOST_BY_BOARD: Readonly<Record<string, string>> = {
  livejupiter: "hayabusa9.2ch.sc",
};

/**
 * 5chの通常スレッドURLから、取得失敗時に試す過去ログURLを組み立てる。
 *
 * 変更理由: URL正規化は現行ドメインへ移すが、古いスレッドはdatではなく
 * 過去ログHTMLに残っている場合があるため、通常取得が失敗した後の候補を共有する。
 */
export function getThreadArchiveFallbacks(url: ChURL): ThreadArchiveFallback[] {
  if (url.getTsld() !== "5ch.io" || url.isArchive || url.url.hostname === "kako.5ch.io") return [];

  const match = /^\/(?:test|bbs)\/read\.cgi\/([\w-]+)\/(\d+)\/$/.exec(url.url.pathname);
  if (!match) return [];

  const [, board, threadId] = match;
  const candidates: ThreadArchiveFallback[] = [
    {
      url: `https://kako.5ch.io/test/read.cgi/${board}/${threadId}/`,
      charset: "Shift_JIS",
    },
  ];
  const mirrorHost = LEGACY_MIRROR_HOST_BY_BOARD[board];
  if (mirrorHost) {
    candidates.push({
      url: `https://${mirrorHost}/test/read.cgi/${board}/${threadId}/`,
      charset: "Shift_JIS",
    });
  }

  return candidates;
}
