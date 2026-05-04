import { decodeCharReference, normalize, stringToDate } from "src/core/jsutil";
import { convertInternalToUser, convertUserToDSL } from "src/core/NGConverter";
import { splitNgDslEntries } from "src/core/ngDsl";
import { container, INGResult } from "src/service-container/index";

import {
  checkResNum,
  checkScope,
  checkWord,
  NGResObj,
  NGThreadObj,
} from "src/core/NGMatcher";
import { parseNgString, setupNgRegex } from "src/core/NGParser";
import { InternalNGElement, TYPE } from "src/core/NGTypes";

export { TYPE };

const _CONFIG_NAME = "ngobj";
const _CONFIG_STRING_NAME = "ngwords";
const _expireDate = /^expireDate:(\d{4}\/\d{1,2}\/\d{1,2}),(.*)$/;

let _ng: Set<InternalNGElement> | null = null;

const _config = {
  get(): InternalNGElement[] {
    const data = container.config.get(_CONFIG_NAME);
    return data ? JSON.parse(data) : [];
  },
  set(str: InternalNGElement[]): void {
    container.config.set(_CONFIG_NAME, JSON.stringify(str));
  },
  getString(): string {
    return container.config.get(_CONFIG_STRING_NAME) || "";
  },
  setString(str: string): void {
    container.config.set(_CONFIG_STRING_NAME, str);
  },
};

export function get(): Set<InternalNGElement> {
  if (_ng == null) {
    _ng = new Set(_config.get());
    setupNgRegex(_ng, (type, word) => {
      container.toast.notify(
        `NG機能の正規表現(${type}: ${word})を読み込むのに失敗しました\nこの行は無効化されます`,
        { backgroundColor: "red" },
      );
    });
  }
  return _ng;
}

export function parse(string: string): Set<InternalNGElement> {
  return parseNgString(string);
}

export function set(string: string): void {
  _ng = parse(string);
  _config.set(Array.from(_ng));
  setupNgRegex(_ng, (type, word) => {
    container.toast.notify(
      `NG機能の正規表現(${type}: ${word})を読み込むのに失敗しました\nこの行は無効化されます`,
      { backgroundColor: "red" },
    );
  });
  container.message.send("ng_changed");
}

export function invalidateCache(): void {
  _ng = null;
}

export function add(string: string): void {
  get();

  const addNg = parse(string);

  const dslString = convertUserToDSL(convertInternalToUser(Array.from(addNg)));
  if (dslString) {
    _config.setString(dslString + "\n" + _config.getString());
  }

  _config.set([..._config.get(), ...Array.from(addNg)]);

  setupNgRegex(addNg, (type, word) => {
    container.toast.notify(
      `NG機能の正規表現(${type}: ${word})を読み込むのに失敗しました\nこの行は無効化されます`,
      { backgroundColor: "red" },
    );
  });

  if (_ng) {
    for (const ang of addNg) {
      _ng.add(ang);
    }
  }

  container.message.send("ng_changed");
}

export function isNGBoard(
  threadTitle: string,
  url: string,
  resCount: number,
  exceptionFlg: boolean = false,
  subType: string | null = null,
): INGResult | null {
  const threadObj: Partial<NGResObj & NGThreadObj> = {
    all: normalize(threadTitle),
    title: threadTitle,
    url,
    resCount,
  };

  const now = Date.now();
  for (const n of get()) {
    if (n.type === TYPE.INVALID || n.type === "" || n.word === "") {
      continue;
    }
    if (
      ![
        TYPE.REG_EXP,
        TYPE.REG_EXP_TITLE,
        TYPE.REG_EXP_HIGHLIGHT_TITLE,
        TYPE.TITLE,
        TYPE.HIGHLIGHT_TITLE,
        TYPE.WORD,
        TYPE.REG_EXP_URL,
        TYPE.URL,
        TYPE.RES_COUNT,
      ].includes(n.type as any)
    ) {
      continue;
    }
    if (!checkScope(n, url)) {
      continue;
    }
    if (n.expire != null && now > n.expire) {
      continue;
    }
    if (n.exception !== exceptionFlg) {
      continue;
    }
    if (n.subType != null && subType && !n.subType.includes(subType)) {
      continue;
    }

    if (n.subElements != null) {
      if (
        !n.subElements.every((subElement) => checkWord(subElement, threadObj))
      ) {
        continue;
      }
    }
    const ngType = checkWord(n, threadObj);
    if (ngType) {
      return { type: ngType, name: n.name, params: n.params };
    }
  }
  return null;
}

export function isNGThread(
  res: any,
  title: string,
  url: string,
  exceptionFlg: boolean = false,
  subType: string | null = null,
): INGResult | null {
  const name = decodeCharReference(res.name);
  const mail = decodeCharReference(res.mail);
  const other = decodeCharReference(res.other);
  const mes = decodeCharReference(res.message);
  const all = name + " " + mail + " " + other + " " + mes;
  const resObj: Partial<NGResObj & NGThreadObj> = {
    all,
    name,
    mail,
    id: res.id != null ? res.id : null,
    slip: res.slip != null ? res.slip : null,
    mes,
    title,
    url,
  };

  const now = Date.now();
  for (const n of get()) {
    if (n.type === TYPE.INVALID || n.type === "" || n.word === "") {
      continue;
    }
    if (
      [TYPE.HIGHLIGHT_TITLE, TYPE.REG_EXP_HIGHLIGHT_TITLE].includes(
        n.type as any,
      )
    ) {
      continue;
    }
    if (!checkScope(n, url)) {
      continue;
    }
    if (checkResNum(n, res.num)) {
      continue;
    }
    if (n.expire != null && now > n.expire) {
      continue;
    }
    if (n.exception !== exceptionFlg) {
      continue;
    }
    if (n.subType != null && subType && !n.subType.includes(subType)) {
      continue;
    }

    if (n.subElements != null) {
      if (!n.subElements.every((subElement) => checkWord(subElement, resObj))) {
        continue;
      }
    }
    const ngType = checkWord(n, resObj);
    if (ngType) {
      return { type: ngType, name: n.name };
    }
  }
  return null;
}

export function isIgnoreResNumForAuto(
  resNum: number,
  subType: string = "",
): boolean {
  for (const n of get()) {
    if (n.type !== TYPE.AUTO) {
      continue;
    }
    if (n.subType != null && !n.subType.includes(subType)) {
      continue;
    }
    if (checkResNum(n, resNum)) {
      return true;
    }
  }
  return false;
}

export function isThreadIgnoreNgType(
  res: any,
  threadTitle: string,
  url: string,
  ngType: string,
): INGResult | null {
  return isNGThread(res, threadTitle, url, true, ngType);
}

export function execExpire(): void {
  const configStr = _config.getString();
  let newConfigStr = "";
  let updateFlag = false;

  const ngStrSplit = splitNgDslEntries(configStr);
  const now = Date.now();
  for (let ngWord of ngStrSplit) {
    ngWord = ngWord.trim();
    if (_expireDate.test(ngWord)) {
      const m = ngWord.match(_expireDate)!;
      const expire = stringToDate(m[1] + " 23:59:59");
      if (expire && expire.valueOf() + 1000 < now) {
        updateFlag = true;
        continue;
      }
    }
    if (newConfigStr !== "") {
      newConfigStr += "\n";
    }
    newConfigStr += ngWord;
  }

  if (updateFlag) {
    _config.setString(newConfigStr);
    _ng = parse(newConfigStr);
    _config.set(Array.from(_ng));
    setupNgRegex(_ng, (type, word) => {
      container.toast.notify(
        `NG機能の正規表現(${type}: ${word})を読み込むのに失敗しました\nこの行は無効化されます`,
        { backgroundColor: "red" },
      );
    });
    container.message.send("ng_changed");
  }
}
