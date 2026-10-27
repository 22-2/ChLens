import { createLogger } from "src/app/logger";
import browser from "webextension-polyfill";

const logger = createLogger("platform");

// 拡張機能のバックグラウンドからのfetchではUser-Agentを上書きできないため、
// 取得先ホストごとのDNRセッションルールで差し替える。既存ルールのIDと衝突しないよう上位の範囲を使う。
const RULE_ID_BASE = 100_000;
const RULE_PRIORITY = 2;
// タブに紐づかない要求（バックグラウンドのfetch）だけを対象にし、画面側の通信へ影響させない。
const TAB_ID_NONE = -1;

type DnrRule = browser.DeclarativeNetRequest.Rule;

const appliedByHost = new Map<string, { id: number; userAgent: string }>();
let isSynced = false;
let queue: Promise<void> = Promise.resolve();

function userAgentOf(rule: DnrRule): string | null {
  const header = rule.action.requestHeaders?.find((h) => h.header.toLowerCase() === "user-agent");
  return header?.value ?? null;
}

function isOwnRule(rule: DnrRule): boolean {
  return (
    rule.id >= RULE_ID_BASE &&
    rule.condition.requestDomains?.length === 1 &&
    userAgentOf(rule) !== null
  );
}

// サービスワーカーの再起動後は、メモリ上の記録が空でもルールは残っているため一度だけ読み直す。
async function syncFromExistingRules(dnr: NonNullable<typeof browser.declarativeNetRequest>) {
  if (isSynced) return;
  const rules = await dnr.getSessionRules();
  for (const rule of rules) {
    if (!isOwnRule(rule)) continue;
    appliedByHost.set(rule.condition.requestDomains![0]!, {
      id: rule.id,
      userAgent: userAgentOf(rule)!,
    });
  }
  isSynced = true;
}

function nextRuleId(): number {
  const used = new Set([...appliedByHost.values()].map((entry) => entry.id));
  let id = RULE_ID_BASE;
  while (used.has(id)) id += 1;
  return id;
}

async function apply(requestUrl: string, userAgent: string): Promise<void> {
  const dnr = browser.declarativeNetRequest;
  if (!dnr?.updateSessionRules || !dnr.getSessionRules) {
    logger.warn("declarativeNetRequest is not available");
    return;
  }
  const host = new URL(requestUrl).hostname;
  const wanted = userAgent.trim();

  try {
    await syncFromExistingRules(dnr);
    const current = appliedByHost.get(host);
    if (!wanted) {
      // 設定が空に戻されたら、以前のルールを外して標準のUser-Agentに戻す。
      if (!current) return;
      await dnr.updateSessionRules({ removeRuleIds: [current.id] });
      appliedByHost.delete(host);
      return;
    }
    if (current?.userAgent === wanted) return;

    const id = current?.id ?? nextRuleId();
    await dnr.updateSessionRules({
      removeRuleIds: current ? [current.id] : [],
      addRules: [
        {
          id,
          priority: RULE_PRIORITY,
          action: {
            type: "modifyHeaders",
            requestHeaders: [{ header: "User-Agent", operation: "set", value: wanted }],
          },
          condition: {
            requestDomains: [host],
            resourceTypes: ["xmlhttprequest"],
            tabIds: [TAB_ID_NONE],
          },
        },
      ],
    });
    appliedByHost.set(host, { id, userAgent: wanted });
  } catch (error) {
    logger.error("User-Agentルールの更新に失敗しました:", error);
  }
}

/** 板・スレ取得の前に、取得先ホスト向けのUser-Agentルールを設定値へ合わせる。空文字は標準に戻す。 */
export function applyUserAgentRule(requestUrl: string, userAgent: string): Promise<void> {
  // 同時に走る取得でルールIDを取り合わないよう、更新は1件ずつ行う。
  const task = queue.then(() => apply(requestUrl, userAgent));
  queue = task.catch(() => undefined);
  return task;
}
