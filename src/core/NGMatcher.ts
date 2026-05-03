import { TYPE, InternalNGElement } from "./NGTypes";
import { normalize } from "./jsutil";

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
  { all, name, mail, id, slip, mes, title, url, resCount }: Partial<NGResObj & NGThreadObj>
): string | null {
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
    (type === TYPE.TITLE && normalize(title || "").includes(word)) ||
    (type === TYPE.HIGHLIGHT_TITLE && normalize(title || "").includes(word)) ||
    (type === TYPE.NAME && normalize(name || "").includes(word)) ||
    (type === TYPE.MAIL && normalize(mail || "").includes(word)) ||
    (type === TYPE.ID && (id != null ? id.includes(word) : false)) ||
    (type === TYPE.SLIP && (slip != null ? slip.includes(word) : false)) ||
    (type === TYPE.BODY && normalize(mes || "").includes(word)) ||
    (type === TYPE.WORD && normalize(all || "").includes(word)) ||
    (type === TYPE.URL && (url || "").includes(word)) ||
    (type === TYPE.RES_COUNT && resCount != null && parseInt(word, 10) < resCount)
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

    const boardMatch = url.match(/\/test\/read\.cgi\/([^/]+)/);
    return boardMatch ? boardMatch[1] === scopeValue : false;
  });
}

export function checkResNum(
  { start, finish }: InternalNGElement,
  resNum: number
): boolean {
  return (
    start != null &&
    ((finish != null && parseInt(start, 10) <= resNum && resNum <= parseInt(finish, 10)) ||
      parseInt(start, 10) === resNum)
  );
}
