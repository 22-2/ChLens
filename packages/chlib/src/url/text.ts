// URL本文解析に使う共通パターン。
// 変更理由: 表示処理とメディア判定が別々のURL正規表現を持つと、同じ本文でも
// 表示・検索・メディア解決の結果がずれるため、共有ライブラリで一元管理する。

const OBFUSCATED_PROTOCOLS: Readonly<Record<string, string>> = {
  p: "http:",
  ps: "https:",
  s: "https:",
  tp: "http:",
  tps: "https:",
  ttp: "http:",
  ttps: "https:",
  // BEアイコンのDAT表記は独自スキームを使うため、リンク・置換・サムネイルで揃える。
  sssp: "https:",
};

// 掲示板では自動リンク化を避けるため、URLの先頭を削った表記が使われることがある。
// 復元対象は p:// / tp:// / ttp:// を http:// に、
// ps:// / s:// / tps:// / ttps:// を https:// に置き換えた形式で、
// スキームを完全に省略した :// は指定された既定プロトコル（省略時は https://）で補完する。
// 転載文などに混ざる http:/ / https:/ のスラッシュ1本抜けも、リンク先だけ補正する。
// 通常の http:// と https:// はそのまま扱い、いずれもホスト名・パス・クエリは変更しない。
// スキームを省いたホスト名形式（例: images.example.com/path.jpg）も画像転載で頻出するため、
// 文頭または空白の後にあるドメイン名をURLとして拾い、正規化時にhttps://を補う。
export const URL_LIKE_PATTERN =
  /(?:https?:\/\/|https?:\/(?!\/)|(?:p|ps|s|tp|tps|ttp|ttps|sssp):\/\/|(?<![A-Za-z0-9+./:@-]):\/\/)[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+|(?<![A-Za-z0-9+./:@-])(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,}(?::\d+)?(?:[/?#][A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+)?/gi;

const HOST_ONLY_URL_PATTERN =
  /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,}(?::\d+)?(?:[/?#].*)?$/i;

/** 5chの既知の中継URLがルートのクエリに持つHTTP(S)リンクを取り出す。 */
export function unwrap5chJumpUrl(rawUrl: string): string {
  let wrapper: URL;
  try {
    wrapper = new URL(rawUrl);
  } catch {
    return rawUrl;
  }

  if (
    !["http:", "https:"].includes(wrapper.protocol) ||
    wrapper.hostname.toLowerCase() !== "jump.5ch.net" ||
    wrapper.port !== "" ||
    wrapper.pathname !== "/" ||
    wrapper.hash ||
    !wrapper.search
  ) {
    return rawUrl;
  }

  const encodedTarget = wrapper.search.slice(1);
  let targetText = encodedTarget;
  if (!/^https?:\/\//iu.test(targetText)) {
    try {
      targetText = decodeURIComponent(encodedTarget);
    } catch {
      return rawUrl;
    }
  }

  let target: URL;
  if (/%(?![\da-f]{2})/iu.test(targetText)) return rawUrl;
  try {
    target = new URL(targetText);
  } catch {
    return rawUrl;
  }

  // 任意スキームや資格情報付きURL、中継URLの再帰展開は遷移先として許可しない。
  if (
    !["http:", "https:"].includes(target.protocol) ||
    !target.hostname ||
    target.username ||
    target.password ||
    target.hostname.toLowerCase() === "jump.5ch.net"
  ) {
    return rawUrl;
  }

  return target.href;
}

export function normalizeObfuscatedUrl(rawUrl: string, fallbackProtocol?: string): string {
  if (HOST_ONLY_URL_PATTERN.test(rawUrl)) {
    // ホスト名だけの画像URLは相対パスとして解釈されるため、画像取得前に絶対URLへ戻す。
    return `https://${rawUrl}`;
  }

  if (rawUrl.startsWith("://")) {
    // :// だけでは元のスキームを復元できないため、安全側の https を既定にする。
    const protocol = fallbackProtocol?.toLowerCase() === "http:" ? "http:" : "https:";
    return `${protocol}//${rawUrl.slice(3)}`;
  }

  const singleSlashMatch = rawUrl.match(/^(https?):\/(?!\/)/i);
  if (singleSlashMatch) {
    // 転載時の誤記を救済しつつ、http/https以外のスキームは勝手に書き換えない。
    return `${singleSlashMatch[1]}://${rawUrl.slice(singleSlashMatch[0].length)}`;
  }

  const match = rawUrl.match(/^(https?):\/\/|^(p|ps|s|tp|tps|ttp|ttps|sssp):\/\//i);
  const obfuscatedProtocol = match?.[2]?.toLowerCase();
  const restoredProtocol = obfuscatedProtocol ? OBFUSCATED_PROTOCOLS[obfuscatedProtocol] : null;
  if (!match || !restoredProtocol) return rawUrl;

  const urlBody = rawUrl.slice(match[0].length);
  if (/^https?:\/\//i.test(urlBody)) {
    // 転記時に ps:// などの省略スキームが完全なURLの前へ重複することがある。
    // 外側の省略スキームをさらに連結すると https://https://... になり、画像やリンクを開けないため、内側の完全なURLを採用する。
    return urlBody;
  }

  return `${restoredProtocol}//${urlBody}`;
}
