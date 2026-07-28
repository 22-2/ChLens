import type { BBSMenu } from "src/core/BBSMenuParser";

// itest（携帯版）URLは板キーしか持たずサーバー名が分からないため、
// bbsmenu から板キー→実サーバーホスト名の対応表を作って解決する。
// フォーク元では URL.convertFromPhone() + pushServerInfo() が担っていた変換だが、
// 本フォークのURL処理は link-routing.ts（同期）に集約されているので、
// 同期で引ける対応表としてここに分離した。

const STORAGE_KEY = "itestServerMap";

// board key -> hostname (例: "adultgoods" -> "mercury.bbspink.com")
let serverMap = new Map<string, string>();

const BOARD_URL_REG = /^https?:\/\/(\w+)\.(5ch\.net|5ch\.io|bbspink\.com)\/(\w+)\/?$/;

function loadPersistedMap(): void {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      serverMap = new Map(
        Object.entries(parsed).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      );
    }
  } catch {
    // 壊れたキャッシュは無視し、次回のbbsmenu適用で再生成する
  }
}

function persistMap(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(serverMap)));
  } catch {
    // 保存失敗してもメモリ上の対応表で動作は継続できる
  }
}

// 初回起動直後（bbsmenu未取得）でも itest URL を解決できるよう、
// 前回セッションで保存した対応表をモジュール読込時に復元する。
if (typeof window !== "undefined" && "localStorage" in window) {
  loadPersistedMap();
}

/** bbsmenu の板URLから itest 解決用の対応表を構築する。 */
export function applyBBSMenuToItestServerMap(menus: readonly BBSMenu[]): void {
  const next = new Map<string, string>();

  for (const menu of menus) {
    for (const category of menu.categories) {
      for (const board of category.boards) {
        const match = BOARD_URL_REG.exec(board.url);
        if (!match) continue;
        const [, server, domain, boardKey] = match;
        // アプリ内では 5ch.net を 5ch.io へ正規化して扱う規約に合わせる
        const host = domain === "5ch.net" ? `${server}.5ch.io` : `${server}.${domain}`;
        if (!next.has(boardKey)) {
          next.set(boardKey, host);
        }
      }
    }
  }

  if (next.size === 0) return;
  serverMap = next;
  persistMap();
}

/** 板キーから実サーバーのホスト名を返す。未知の板は null。 */
export function resolveItestServerHostname(boardKey: string): string | null {
  return serverMap.get(boardKey) ?? null;
}

/** テスト用: 対応表を直接設定する。 */
export function setItestServerMapForTesting(entries: readonly [string, string][]): void {
  serverMap = new Map(entries);
}
