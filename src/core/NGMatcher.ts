import { InternalNGElement, TYPE } from "src/core/NGTypes";
import { PATTERNS } from "packages/ch-lib/src/url/patterns";
import { normalize } from "src/core/jsutil";

export interface NGThreadObj {
  all: string;
  title: string;
  url: string;
  resCount: number;
  name?: string;
  mail?: string;
  id?: string | null;
  slip?: string | null;
  mes?: string;
}

export interface NGResObj {
  all: string;
  name: string;
  mail: string;
  id: string | null;
  slip: string | null;
  mes: string;
  title: string;
  url: string;
  resCount?: number;
}

export function checkWord(
  { type, reg, word }: InternalNGElement,
  {
    all,
    name,
    mail,
    id,
    slip,
    mes,
    title,
    url,
    resCount,
  }: Partial<NGResObj & NGThreadObj>,
): string | null {
  // キャッシュ(ngobj)からロードしたwordは正規化されていない場合があるため、
  // 比較対象と同じnormalizeを両辺に適用する。これにより全角/半角・カタカナ/ひらがな・
  // 大文字/小文字の違いを吸収してケースインセンシティブなマッチングも実現する。
  const normalizedWord = normalize(word);
  if (
    (type === TYPE.REG_EXP && reg && reg.test(all || "")) ||
    (type === TYPE.REG_EXP_NAME && reg && reg.test(name || "")) ||
    (type === TYPE.REG_EXP_MAIL && reg && reg.test(mail || "")) ||
    (type === TYPE.REG_EXP_ID && id != null && reg && reg.test(id)) ||
    (type === TYPE.REG_EXP_SLIP && slip != null && reg && reg.test(slip)) ||
    (type === TYPE.REG_EXP_BODY && reg && reg.test(mes || "")) ||
    (type === TYPE.REG_EXP_TITLE && reg && reg.test(title || "")) ||
    (type === TYPE.REG_EXP_HIGHLIGHT_TITLE && reg && reg.test(title || "")) ||
    (type === TYPE.REG_EXP_URL && reg && reg.test(url || "")) ||
    (type === TYPE.TITLE && normalize(title || "").includes(normalizedWord)) ||
    (type === TYPE.HIGHLIGHT_TITLE && normalize(title || "").includes(normalizedWord)) ||
    (type === TYPE.NAME && normalize(name || "").includes(normalizedWord)) ||
    (type === TYPE.MAIL && normalize(mail || "").includes(normalizedWord)) ||
    (type === TYPE.ID && (id != null ? id.includes(word) : false)) ||
    (type === TYPE.SLIP && (slip != null ? slip.includes(word) : false)) ||
    (type === TYPE.BODY && normalize(mes || "").includes(normalizedWord)) ||
    (type === TYPE.WORD && normalize(all || "").includes(normalizedWord)) ||
    (type === TYPE.URL && (url || "").includes(word)) ||
    (type === TYPE.RES_COUNT &&
      resCount != null &&
      parseInt(word, 10) < resCount)
  ) {
    return type;
  }
  return null;
}

export function checkScope(ngObj: InternalNGElement, url: string): boolean {
  if (!ngObj.scope) {
    return true;
  }

  const { value } = ngObj.scope;
  const scopeValues = Array.isArray(value) ? value : [value];

  if (scopeValues.some((scopeValue) => scopeValue === "*")) {
    return true;
  }

  return scopeValues.some((scopeValue) => {
    if (scopeValue.includes("/")) {
      return url.includes(scopeValue);
    }

    const domainMatch = url.match(/^https?:\/\/([^/]+)/);
    if (domainMatch && domainMatch[1].includes(scopeValue)) {
      return true;
    }

    // 変更理由: /test/read.cgi 固定抽出だと machi/jbbs 等で scope 判定が漏れるため、
    // 共有PATTERNSを使って BBS種別に依存しない board キー抽出へ寄せる。
    try {
      const parsed = new window.URL(url);
      const { pathname } = parsed;

      const chThreadMatch = PATTERNS.CH_THREAD.exec(pathname);
      if (chThreadMatch) {
        const segments = chThreadMatch[1].split("/");
        return segments[segments.length - 2] === scopeValue;
      }

      const machiThreadMatch = PATTERNS.MACHI_THREAD.exec(pathname);
      if (machiThreadMatch) {
        return machiThreadMatch[1].split("/")[0] === scopeValue;
      }

      const shitarabaThreadMatch = PATTERNS.SHITARABA_THREAD.exec(pathname);
      if (shitarabaThreadMatch) {
        const segments = shitarabaThreadMatch[1].split("/");
        return segments[segments.length - 2] === scopeValue;
      }

      const eddibbThreadMatch =
        PATTERNS.EDDIBB_THREAD_2.exec(pathname) ?? PATTERNS.EDDIBB_THREAD.exec(pathname);
      if (eddibbThreadMatch) {
        return eddibbThreadMatch[1] === scopeValue;
      }

      const chBoardMatch = PATTERNS.CH_BOARD.exec(pathname);
      if (chBoardMatch) {
        return chBoardMatch[1].replace(/\/$/, "") === scopeValue;
      }

      const machiBoardMatch = PATTERNS.MACHI_BOARD.exec(pathname);
      if (machiBoardMatch) {
        return machiBoardMatch[1].replace(/\/$/, "") === scopeValue;
      }

      const shitarabaBoardMatch = PATTERNS.SHITARABA_BOARD.exec(pathname);
      if (shitarabaBoardMatch) {
        return shitarabaBoardMatch[1].split("/")[1] === scopeValue;
      }

      const eddibbBoardMatch =
        PATTERNS.EDDIBB_BOARD_2.exec(pathname) ?? PATTERNS.EDDIBB_BOARD.exec(pathname);
      return eddibbBoardMatch ? eddibbBoardMatch[1] === scopeValue : false;
    } catch {
      return false;
    }
  });
}

export function checkResNum(
  { start, finish }: InternalNGElement,
  resNum: number,
): boolean {
  return (
    start != null &&
    ((finish != null &&
      parseInt(start, 10) <= resNum &&
      resNum <= parseInt(finish, 10)) ||
      parseInt(start, 10) === resNum)
  );
}
