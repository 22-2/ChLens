import { normalize } from "src/core/jsutil";
import { InternalNGElement, TYPE } from "src/core/NGTypes";
import { matchesRuleSites } from "src/core/rules/scope";

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
  replyCount?: number;
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
    replyCount,
  }: Partial<NGResObj & NGThreadObj>,
): string | null {
  // キャッシュ(ngobj)からロードしたwordは正規化されていない場合があるため、
  // 比較対象と同じnormalizeを両辺に適用する。これにより全角/半角・カタカナ/ひらがな・
  // 大文字/小文字の違いを吸収してケースインセンシティブなマッチングも実現する。
  const normalizedWord = normalize(word);
  const normalizedId = id != null ? normalize(id) : null;
  const normalizedSlip = slip != null ? normalize(slip) : null;
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
    (type === TYPE.ID && (normalizedId != null ? normalizedId.includes(normalizedWord) : false)) ||
    (type === TYPE.SLIP &&
      (normalizedSlip != null ? normalizedSlip.includes(normalizedWord) : false)) ||
    (type === TYPE.BODY && normalize(mes || "").includes(normalizedWord)) ||
    (type === TYPE.WORD && normalize(all || "").includes(normalizedWord)) ||
    (type === TYPE.URL && (url || "").includes(word)) ||
    (type === TYPE.RES_COUNT && resCount != null && parseInt(word, 10) < resCount) ||
    (type === TYPE.REPLY_COUNT && replyCount != null && parseInt(word, 10) <= replyCount)
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
  return matchesRuleSites(scopeValues, url);
}

export function checkResNum({ start, finish }: InternalNGElement, resNum: number): boolean {
  return (
    start != null &&
    ((finish != null && parseInt(start, 10) <= resNum && resNum <= parseInt(finish, 10)) ||
      parseInt(start, 10) === resNum)
  );
}
