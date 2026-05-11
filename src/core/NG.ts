import { decodeCharReference, normalize, stringToDate } from "src/core/jsutil";
import { convertInternalToUser, convertUserToDSL } from "src/core/NGConverter";
import { splitNgDslEntries } from "src/core/ngDsl";
import { container, INGResult } from "src/service-container/index";
import { createLogger } from "src/core/logger";

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
const GENERAL_DEBUG_CONFIG_KEY = "debug_log";

let _ng: Set<InternalNGElement> | null = null;
const logger = createLogger("NG");

// ─── ヘルパー ────────────────────────────────────────────────

/** 正規表現のロード失敗をトーストで通知する共通コールバック */
function onRegexError(type: string, word: string): void {
  container.toast.notify(
    `NG機能の正規表現(${type}: ${word})を読み込むのに失敗しました\nこの行は無効化されます`,
    { backgroundColor: "red" },
  );
}

/** setupNgRegex を共通コールバックで呼ぶラッパー */
function applyRegex(ng: Set<InternalNGElement>): void {
  setupNgRegex(ng, onRegexError);
}

/** NG変更を保存・通知する共通処理 */
async function commitNg(ng: Set<InternalNGElement>): Promise<void> {
  _ng = ng;
  applyRegex(ng);
  await _config.set(Array.from(ng));
  container.message.send("ng_changed");
  return;
}

// ─── config アクセサ ─────────────────────────────────────────

const _config = {
  get(): InternalNGElement[] {
    const data = container.config.get(_CONFIG_NAME);
    if (!data) return [];

    try {
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      // ngobj が壊れていると NG 全体が読み込めなくなるため、
      // 空配列にフォールバックして ngwords からの再構築へ進める。
      return [];
    }
  },
  set(str: InternalNGElement[]): Promise<void> {
    return Promise.resolve(container.config.set(_CONFIG_NAME, JSON.stringify(str)));
  },
  getString(): string {
    return container.config.get(_CONFIG_STRING_NAME) || "";
  },
  setString(str: string): Promise<void> {
    return Promise.resolve(container.config.set(_CONFIG_STRING_NAME, str));
  },
};

// ─── NG ルール共通フィルタ ───────────────────────────────────

type CommonFilterContext = {
  url: string;
  exceptionFlg: boolean;
  subType: string | null;
};

/**
 * type・スコープ・期限・例外フラグ・subType など、
 * isNGBoard / isNGThread で共通するガード条件をまとめたフィルタ。
 * false を返したルールはスキップ対象。
 */
function passesCommonFilters(
  n: InternalNGElement,
  ctx: CommonFilterContext,
  now: number,
): boolean {
  if (n.type === TYPE.INVALID || n.type === "" || n.word === "") return false;
  if (!checkScope(n, ctx.url)) return false;
  if (n.expire != null && now > n.expire) return false;
  if (n.exception !== ctx.exceptionFlg) return false;
  if (n.subType != null && ctx.subType && !n.subType.includes(ctx.subType))
    return false;
  return true;
}

// ─── 公開 API ────────────────────────────────────────────────

function getNgDebugTargetResNum(): number | null {
  const raw = container.config.get(GENERAL_DEBUG_CONFIG_KEY);
  const value = Number(raw ?? 0);
  return Number.isInteger(value) && value > 0 ? value : null;
}

export function get(): Set<InternalNGElement> {
  if (_ng != null) return _ng;

  const ngObjectRules = _config.get();
  const ngString = _config.getString();

  if (ngObjectRules.length > 0) {
    _ng = new Set(ngObjectRules);
    logger.debug("load.from_ngobj", { ruleCount: _ng.size });
  } else if (ngString.trim() !== "") {
    // ngobj が空/破損でも ngwords があれば復元可能にして、
    // 「設定はあるのに NG/ハイライトが効かない」状態を避ける。
    _ng = parse(ngString);
    void _config.set(Array.from(_ng));
    logger.debug("load.rebuild_from_ngwords", {
      dslLength: ngString.length,
      ruleCount: _ng.size,
    });
  } else {
    _ng = new Set();
    logger.debug("load.empty", { ruleCount: 0 });
  }

  applyRegex(_ng);
  return _ng;
}

export function parse(string: string): Set<InternalNGElement> {
  return parseNgString(string);
}

export function set(string: string): Promise<void> {
  logger.debug("set", { dslLength: string.length });
  return commitNg(parse(string));
}

export function invalidateCache(): void {
  _ng = null;
}

export async function add(string: string): Promise<void> {
  const current = new Set(get());
  const addNg = parse(string);

  for (const rule of addNg) {
    current.add(rule);
  }

  _ng = current;
  applyRegex(current);

  // 変更理由: 先にUI更新通知を飛ばすと「見た目だけ消えた直後にF5」で永続化前の状態へ戻りうる。
  // ngobj / ngwords の両方を書き終えてから通知することで、見えた状態と保存済み状態を一致させる。
  await _config.set(Array.from(current));

  // ngwords 文字列の先頭に追記
  const dslString = convertUserToDSL(convertInternalToUser(Array.from(addNg)));
  if (dslString) {
    await _config.setString(dslString + "\n" + _config.getString());
  }

  container.message.send("ng_changed");
}

// ─── NG 判定 ─────────────────────────────────────────────────

const BOARD_ALLOWED_TYPES: ReadonlySet<string> = new Set([
  TYPE.REG_EXP,
  TYPE.REG_EXP_TITLE,
  TYPE.REG_EXP_HIGHLIGHT_TITLE,
  TYPE.TITLE,
  TYPE.HIGHLIGHT_TITLE,
  TYPE.WORD,
  TYPE.REG_EXP_URL,
  TYPE.URL,
  TYPE.RES_COUNT,
]);

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

  const ctx: CommonFilterContext = { url, exceptionFlg, subType };
  const now = Date.now();
  let checkedCount = 0;

  for (const n of get()) {
    if (!BOARD_ALLOWED_TYPES.has(n.type)) continue;
    if (!passesCommonFilters(n, ctx, now)) {
      logger.debug("board.scope_miss", {
        ruleType: n.type,
        word: n.word,
        scope: n.scope?.value,
        url,
      });
      continue;
    }

    checkedCount += 1;

    if (
      n.subElements != null &&
      !n.subElements.every((sub) => checkWord(sub, threadObj))
    ) {
      continue;
    }

    const ngType = checkWord(n, threadObj);
    if (ngType) {
      logger.debug("board.hit", {
        matchedType: ngType,
        ruleType: n.type,
        word: n.word,
        scope: n.scope?.value,
        title: threadTitle,
        url,
        checkedCount,
      });
      return { type: ngType, name: n.name, params: n.params };
    }
  }

  logger.debug("board.no_hit", {
    title: threadTitle,
    url,
    checkedCount,
    totalRuleCount: get().size,
  });

  return null;
}

const THREAD_DENIED_TYPES: ReadonlySet<string> = new Set([
  TYPE.HIGHLIGHT_TITLE,
  TYPE.REG_EXP_HIGHLIGHT_TITLE,
]);

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

  const resObj: Partial<NGResObj & NGThreadObj> = {
    all: `${name} ${mail} ${other} ${mes}`,
    name,
    mail,
    id: res.id ?? null,
    slip: res.slip ?? null,
    mes,
    title,
    url,
  };

  const ctx: CommonFilterContext = { url, exceptionFlg, subType };
  const now = Date.now();
  let checkedCount = 0;
  const debugTargetResNum = getNgDebugTargetResNum();

  for (const n of get()) {
    if (THREAD_DENIED_TYPES.has(n.type)) continue;
    if (!passesCommonFilters(n, ctx, now)) continue;
    if (checkResNum(n, res.num)) continue;

    checkedCount += 1;

    if (
      n.subElements != null &&
      !n.subElements.every((sub) => checkWord(sub, resObj))
    ) {
      continue;
    }

    const ngType = checkWord(n, resObj);
    if (ngType) {
      logger.debug("thread.hit", {
        matchedType: ngType,
        ruleType: n.type,
        word: n.word,
        scope: n.scope?.value,
        title,
        url,
        resNum: res?.num,
        checkedCount,
      });
      return { type: ngType, name: n.name };
    }
  }

  // スレ本文はレス数が多く全件ログだと追えないため、
  // デフォルトは先頭数件のみ no_hit を出し、必要時は target res 指定で絞れる。
  const shouldLog =
    debugTargetResNum != null
      ? res?.num === debugTargetResNum
      : typeof res?.num === "number" && res.num <= 3;

  if (shouldLog) {
    logger.debug("thread.no_hit", {
      title,
      url,
      resNum: res?.num,
      checkedCount,
      totalRuleCount: get().size,
      debugTargetResNum,
    });
  }

  return null;
}

export function isIgnoreResNumForAuto(
  resNum: number,
  subType: string = "",
): boolean {
  for (const n of get()) {
    if (n.type !== TYPE.AUTO) continue;
    if (n.subType != null && !n.subType.includes(subType)) continue;
    if (checkResNum(n, resNum)) return true;
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
  const now = Date.now();
  let updateFlag = false;

  const newConfigStr = splitNgDslEntries(configStr)
    .map((entry) => entry.trim())
    .filter((entry) => {
      const m = entry.match(_expireDate);
      if (!m) return true;

      const expire = stringToDate(m[1] + " 23:59:59");
      if (expire && expire.valueOf() + 1000 < now) {
        updateFlag = true;
        return false; // 期限切れ → 除外
      }
      return true;
    })
    .join("\n");

  if (updateFlag) {
    void _config.setString(newConfigStr);
    void commitNg(parse(newConfigStr));
  }
}
