let currentUserAgent = "";

/**
 * 設定画面で指定したUser-Agentを、このウィンドウの通信要求へ添えるために保持する。
 *
 * 変更理由: 実際の通信はTauriのRust側で行われ、そこからは設定を読めない。
 * 設定を読めるウィンドウ側で値を持ち、要求ごとに渡す（HTTPS方針と同じ構成）。
 */
export function setUserAgent(userAgent: string): void {
  currentUserAgent = userAgent.trim();
}

/** 空文字は「指定なし」で、通信層の既定のUser-Agentを使う。 */
export function getUserAgent(): string {
  return currentUserAgent;
}
