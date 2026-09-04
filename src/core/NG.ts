import { createLogger } from "src/core/logger";
import { countReplyAnchorTargets } from "src/core/reply-index";
import {
  clearRuleRegexCache,
  evaluateBoardRules,
  evaluateResponseRules,
  formatRuleDsl,
  type Rule,
  type RuleMatchResult,
  type RuleRepository,
  validateRuleDsl,
} from "@chlen/ch-lib";
import type { INGResult } from "src/service-container/index";
import { container } from "src/service-container/index";

const CONFIG_STRING_NAME = "ngwords";
const GENERAL_DEBUG_CONFIG_KEY = "debug_log";
const logger = createLogger("NG");

let rulesCache: readonly Rule[] | null = null;

// Chlensの既存設定を壊さないため、保存キーだけはconfigの`ngwords`を維持し、
// DSLの読み書き処理からconfig singletonへの依存をadapter内へ閉じ込める。
const chlensRuleRepository: RuleRepository = {
  load: () => container.config.get(CONFIG_STRING_NAME),
  save: (source) => container.config.set(CONFIG_STRING_NAME, source),
};

function isCommentOrWhitespace(line: string): boolean {
  const trimmed = line.replace(/^[\uFEFF\u200B\u200C\u200D]+/u, "").trim();
  return (
    trimmed === "" ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("*/")
  );
}

function parseConfiguredRules(source: string): readonly Rule[] {
  const parsed = validateRuleDsl(source);
  const hasContent = source.split(/\r?\n/u).some((line) => !isCommentOrWhitespace(line));
  if (!parsed.recognized && hasContent) {
    const error = new Error("NG設定は新しいブロックDSLで記述してください。");
    logger.error("NG設定の形式が旧式または不正です", { error });
    throw error;
  }
  if (parsed.diagnostics.length > 0) {
    const details = parsed.diagnostics
      .map(({ line, column, message }) => `${line}:${column} ${message}`)
      .join("\n");
    logger.error("DSLの構文エラーにより設定を適用できません", {
      diagnostics: parsed.diagnostics,
    });
    throw new Error(`NG設定に構文エラーがあります\n${details}`);
  }
  return parsed.rules;
}

function readSource(): string {
  return chlensRuleRepository.load() ?? "";
}

function toText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  return "";
}

function updateRulesCache(rules: readonly Rule[]): void {
  rulesCache = [...rules];
  clearRuleRegexCache();
}

/** 複数条件を持つルールでも、実際に一致した条件だけをNG理由として表示する。 */
function formatMatchedRule(matched: RuleMatchResult): string {
  return formatRuleDsl([{ ...matched.rule, matchers: [matched.matcher] }]);
}

/** 設定保存済みのDSLを判定へ反映する。保存処理は呼び出し側が担当する。 */
export function apply(source: string): void {
  updateRulesCache(parseConfiguredRules(source));
}

/** 設定を書き換えずにDSLだけを検証する。保存前の入力チェックで使用する。 */
export function validate(source: string): void {
  parseConfiguredRules(source);
}

async function commitRules(rules: readonly Rule[]): Promise<void> {
  const nextSource = formatRuleDsl(rules);
  await chlensRuleRepository.save(nextSource);
  updateRulesCache(rules);
  container.message.send("ng_changed");
}

function onRegexError(source: string, error: unknown): void {
  logger.error("NG機能の正規表現を読み込めません", { source, error });
  container.toast.notify(
    `NG機能の正規表現(${source})を読み込むのに失敗しました\nこの条件は無効化されます`,
    { backgroundColor: "red" },
  );
}

function getNgDebugTargetResNum(): number | null {
  const value = Number(container.config.get(GENERAL_DEBUG_CONFIG_KEY) ?? 0);
  return Number.isInteger(value) && value > 0 ? value : null;
}

export function get(): readonly Rule[] {
  if (rulesCache != null) return rulesCache;
  const source = readSource();
  try {
    rulesCache = [...parseConfiguredRules(source)];
  } catch (error) {
    logger.error("NG設定の読込に失敗しました", { error });
    rulesCache = [];
  }
  return rulesCache;
}

/** 画像ハッシュ判定は本文NGと異なる非同期処理のため、専用hookへルールだけ渡す。 */
export function getSimilarImageRules(): readonly Rule[] {
  return get().filter((rule) => rule.action === "blur" && rule.target === "similar-image");
}

export function set(source: string): Promise<void> {
  logger.debug("set", { dslLength: source.length });
  try {
    const rules = parseConfiguredRules(source);
    return commitRules(rules);
  } catch (error) {
    return Promise.reject(error);
  }
}

export function invalidateCache(): void {
  rulesCache = null;
  clearRuleRegexCache();
}

export async function add(source: string): Promise<void> {
  const addedRules = parseConfiguredRules(source);
  const currentRules = get();
  // メニューや選択範囲からの半自動登録は、既存の設定順を維持して末尾へ追加する。
  // 先頭へ挿入すると、設定画面で手動管理しているルールの並びが毎回ずれてしまう。
  await commitRules([...currentRules, ...addedRules]);
}

export function isNGBoard(threadTitle: string, url: string, resCount: number): INGResult | null {
  const rules = get();
  const matched = evaluateBoardRules(rules, { title: threadTitle, url, resCount }, onRegexError);
  return matched
    ? {
        type: matched.type,
        action: matched.rule.action,
        ruleDescription: formatMatchedRule(matched),
        ruleIndex: rules.indexOf(matched.rule),
        name: matched.rule.name,
        params: matched.params,
        disabled: false,
      }
    : null;
}

export function isNGThread(res: unknown, title: string, url: string): INGResult | null {
  const raw = res as Record<string, unknown>;
  // 外部レスデータを表示用の文字列へ変換し、Rule Engineへ渡す境界をここに集約する。
  const name = toText(raw.name);
  const mail = toText(raw.mail);
  const other = toText(raw.other);
  const body = toText(raw.message);
  const resNum = typeof raw.num === "number" ? raw.num : undefined;
  const debugTargetResNum = getNgDebugTargetResNum();
  const anchorCount =
    typeof raw.anchorCount === "number" && Number.isFinite(raw.anchorCount)
      ? raw.anchorCount
      : countReplyAnchorTargets(body);
  const rules = get();
  const matched = evaluateResponseRules(
    rules,
    {
      all: `${name} ${mail} ${other} ${body}`,
      title,
      body,
      name,
      mail,
      id: typeof raw.id === "string" ? raw.id : null,
      slip: typeof raw.slip === "string" ? raw.slip : null,
      url,
      replyCount: typeof raw.replyCount === "number" ? raw.replyCount : undefined,
      anchorCount,
    },
    onRegexError,
  );
  if (matched) {
    logger.debug("thread.hit", { matchedType: matched.type, title, url, resNum });
    return {
      type: matched.type,
      action: matched.rule.action,
      ruleDescription: formatMatchedRule(matched),
      name: matched.rule.name,
      params: matched.params,
      disabled: false,
    };
  }
  if (debugTargetResNum != null ? resNum === debugTargetResNum : resNum != null && resNum <= 3) {
    logger.debug("thread.no_hit", { title, url, resNum, totalRuleCount: rules.length });
  }
  return null;
}

export function execExpire(): void {
  const activeRules = get();
  const now = Date.now();
  const remaining = activeRules.filter((rule) => rule.expiresAt == null || now <= rule.expiresAt);
  if (remaining.length !== activeRules.length) {
    // 期限切れの自動掃除は呼び出し元の判定を止めないが、保存失敗はログに残す。
    void commitRules(remaining).catch((error: unknown) => {
      logger.error("期限切れNGルールの保存に失敗しました", { error });
    });
  }
}
