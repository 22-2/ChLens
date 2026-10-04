import { ChURL } from "./ChURL";
import { HOSTNAME } from "./hosts";

export interface WriteFormInput {
  name: string;
  mail: string;
  message: string;
  /** テストや呼び出し元が送信時刻を固定するためのUnix秒。 */
  nowSeconds?: number;
}

export interface ChWriteFormData {
  action: string;
  charset: "UTF-8" | "Shift_JIS" | "EUC-JP";
  referer: string;
  input: Record<string, string>;
  textarea: Record<string, string>;
}

/** 投稿フォームのホスト固有URLと項目名を、意味データとして組み立てる。 */
export function getWriteFormData(threadUrl: string, input: WriteFormInput): ChWriteFormData | null {
  let url: ChURL;
  try {
    url = new ChURL(threadUrl);
    // 保存・照合用の正規化で通信方式が変わっても、投稿は入力URLのHTTP/HTTPSを維持する。
    // 掲示板ごとの強制HTTPS化ではなく、フォーク元と同じ共通方針で送信先を決める。
    url.protocol = new URL(threadUrl).protocol;
  } catch {
    return null;
  }

  const { type, bbsType } = url.guessType();
  if (type !== "thread") return null;
  const boardPath = url.toBoard().url.pathname.split("/").filter(Boolean);
  const threadId = url.getThreadId();
  const boardName = url.getBoardName();
  if (!threadId || !boardName) return null;
  const timestamp = String((input.nowSeconds ?? Math.floor(Date.now() / 1000)) - 60);
  const referer = url.toBoard().url.href;
  const action = `${url.protocol}//${url.hostname}`;
  const textarea = { MESSAGE: input.message };

  if (bbsType === "2ch") {
    const isOpen2ch = url.getTsld() === "open2ch.net";
    const isEddibb = url.hostname === HOSTNAME.EDDIBB;
    if (isOpen2ch) {
      return {
        action: `${action}/test/bbs.cgi`,
        charset: "UTF-8",
        referer,
        input: {
          submit: "書",
          bbs: boardName,
          key: threadId,
          FROM: input.name,
          mail: input.mail,
        },
        textarea,
      };
    }
    return {
      action: `${action}/test/bbs.cgi`,
      charset: "Shift_JIS",
      referer,
      input: {
        submit: isEddibb ? "書き込む" : "書きこむ",
        time: timestamp,
        bbs: boardName,
        key: threadId,
        FROM: input.name,
        mail: input.mail,
        oekaki_thread1: "",
      },
      textarea,
    };
  }

  if (bbsType === "jbbs") {
    const [directory, boardId] = boardPath;
    if (!directory || !boardId) return null;
    return {
      action: `${url.protocol}//${HOSTNAME.NEW_JBBS}/bbs/write.cgi/${directory}/${boardId}/${threadId}/`,
      charset: "EUC-JP",
      referer,
      input: {
        TIME: timestamp,
        DIR: directory,
        BBS: boardId,
        KEY: threadId,
        NAME: input.name,
        MAIL: input.mail,
      },
      textarea,
    };
  }

  if (bbsType === "machi") {
    return {
      action: `${action}/bbs/write.cgi`,
      charset: "Shift_JIS",
      referer,
      input: {
        submit: "書きこむ",
        TIME: timestamp,
        BBS: boardName,
        KEY: threadId,
        NAME: input.name,
        MAIL: input.mail,
      },
      textarea,
    };
  }

  return null;
}

/** eddibbで認証トークン形式のメール欄が指定されているか判定する。 */
export function isWriteAuthToken(threadUrl: string, mail: string): boolean {
  try {
    const url = new URL(threadUrl);
    return (
      url.hostname.toLowerCase() === HOSTNAME.EDDIBB && /^#[A-Za-z0-9_-]{16,}$/.test(mail.trim())
    );
  } catch {
    return false;
  }
}

/** 投稿本文から候補URLを抜き、同じ掲示板のHTTPS認証ページだけを許可する。 */
export function resolveWriteAuthCodeUrl(
  candidateOrText: string | null,
  pageUrl: string,
): string | null {
  try {
    const page = new URL(pageUrl);
    const matchedUrl = candidateOrText?.match(
      /https?:\/\/[^\s<>"']+\/auth-code(?:[/?#][^\s<>"']*)?/i,
    )?.[0];
    const candidate = new URL(matchedUrl ?? "/auth-code", pageUrl);
    if (
      candidate.hostname !== page.hostname ||
      candidate.pathname !== "/auth-code" ||
      !["http:", "https:"].includes(candidate.protocol)
    ) {
      return null;
    }
    candidate.protocol = "https:";
    return candidate.href;
  } catch {
    return null;
  }
}

/** 書き込み結果ページとして扱うURLかを判定する。 */
export function isWriteResultPageUrl(rawUrl: string): boolean {
  return [
    /^https?:\/\/[^/]+\/test\/bbs\.cgi(?:\?.*)?$/i,
    /^https?:\/\/jbbs\.shitaraba\.net\/bbs\/write\.cgi\/[\w-]+\/[\d-]+\/(?:\d+|new)\/?(?:\?.*)?$/i,
    /^https?:\/\/[^/]+\/bbs\/write\.cgi(?:\?.*)?$/i,
  ].some((pattern) => pattern.test(rawUrl));
}
