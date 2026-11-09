import type { ParsedBBSMenu } from "packages/chlib/src/index";
import { DEFAULT_CONFIG } from "src/app/config-defaults";
import { getBoardUrlKey } from "src/core/board/BoardUrlNormalizer";
import {
  OPENED_BOARDS_CONFIG_KEY,
  parseOpenedBoardEntries,
} from "src/core/board/opened-board-entries";
import {
  MAX_BOARD_AUTO_REFRESH_MS,
  MAX_THREAD_AUTO_REFRESH_MS,
  MIN_BOARD_AUTO_REFRESH_MS,
  MIN_THREAD_AUTO_REFRESH_SETTING_MS,
} from "src/features/auto-refresh/browser/auto-refresh-config";
import { container } from "src/service-container/index";
import {
  normalizeBoardKey,
  normalizeSiteKey,
  type ScopedSettingKey,
  type ScopedSettingScope,
  type ScopedSettingsDocument,
  SITE_SHARED_SCOPE,
} from "src/view/browser/utils/scoped-settings";
import { WRITE_SETTING_COPY } from "src/view/browser/utils/write-settings";

export interface BoardOption {
  site: string;
  key: string;
  title: string;
}

export interface RawBoardOption {
  url: string;
  title: string;
}

export const SOURCE_LABELS = {
  board: "この板",
  site: "ドメイン共通",
  global: "全体設定",
} as const;

export const SETTING_FIELDS = [
  { key: "default_name", ...WRITE_SETTING_COPY.default_name, kind: "text" },
  { key: "default_mail", ...WRITE_SETTING_COPY.default_mail, kind: "text" },
  {
    key: "auto_load_second",
    title: "スレッドの自動更新間隔",
    description: "スレッドを自動更新する間隔です。",
    kind: "interval",
    min: MIN_THREAD_AUTO_REFRESH_SETTING_MS / 1000,
    max: MAX_THREAD_AUTO_REFRESH_MS / 1000,
  },
  {
    key: "auto_load_second_board",
    title: "板一覧の自動更新間隔",
    description: "板一覧を自動更新する間隔です。",
    kind: "interval",
    min: MIN_BOARD_AUTO_REFRESH_MS / 1000,
    max: MAX_BOARD_AUTO_REFRESH_MS / 1000,
  },
] as const satisfies readonly {
  key: ScopedSettingKey;
  title: string;
  description: string;
  kind: "interval" | "text";
  min?: number;
  max?: number;
}[];

export function deriveBoardTitle(boardUrl: string): string {
  try {
    const parsed = new URL(boardUrl);
    const path = parsed.pathname.replace(/^\/+|\/+$/gu, "");
    return path ? `${parsed.hostname}/${path}` : parsed.hostname;
  } catch {
    return boardUrl;
  }
}

export function readOpenedBoards(): RawBoardOption[] {
  // 変更理由: 保存形式の解釈は core/OpenedBoards に集約し、取得確認済みの独自ホストの板も
  // ホーム・板一覧と同じ判断で設定の選択肢へ含める。
  return parseOpenedBoardEntries(container.config.get(OPENED_BOARDS_CONFIG_KEY)).map((entry) => ({
    url: entry.url,
    title: entry.title ? entry.title : entry.url,
  }));
}

export function readBBSMenuBoards(menu: readonly ParsedBBSMenu[]): RawBoardOption[] {
  return menu.flatMap((source) =>
    source.categories.flatMap((category) =>
      category.boards.map((board) => ({ url: board.url, title: board.name })),
    ),
  );
}

export function readScopeBoards(document: ScopedSettingsDocument): RawBoardOption[] {
  return Object.values(document.sites).flatMap((site) =>
    Object.keys(site.boards).map((url) => ({ url, title: deriveBoardTitle(url) })),
  );
}

export function mergeBoardOptions(sources: readonly RawBoardOption[]): BoardOption[] {
  const boards = new Map<string, BoardOption>();
  for (const source of sources) {
    const key = normalizeBoardKey(source.url);
    const comparisonKey = getBoardUrlKey(source.url);
    const site = normalizeSiteKey(source.url);
    if (!key || !comparisonKey || !site || boards.has(comparisonKey)) {
      continue;
    }
    // 変更理由: 設定データ・BBSMENU・開いた板でURL表記が異なっても、
    // プロトコルを含まない板識別子で同じ選択肢へまとめる。
    boards.set(comparisonKey, {
      key,
      site,
      title: source.title.trim() || deriveBoardTitle(key),
    });
  }
  return Array.from(boards.values()).sort((left, right) =>
    left.title.localeCompare(right.title, "ja"),
  );
}

export function toIntervalSeconds(
  rawValue: string | null,
  fallback: number,
  min: number,
  max: number,
) {
  const parsed = Number.parseInt(rawValue ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(parsed / 1000)));
}

export function getOverride(
  document: ScopedSettingsDocument,
  scope: ScopedSettingScope,
  key: ScopedSettingKey,
): string | undefined {
  const site = document.sites[scope.site];
  if (!site) {
    return undefined;
  }
  const override = scope.board ? site.boards[scope.board] : site.overrides;
  return override && Object.prototype.hasOwnProperty.call(override, key)
    ? override[key]
    : undefined;
}

export function getDefaultValue(key: ScopedSettingKey): string {
  const raw = container.config.get(key) ?? DEFAULT_CONFIG[key];
  if (key === "default_name" || key === "default_mail") return raw;
  return Number.parseInt(raw, 10) > 0 ? raw : DEFAULT_CONFIG[key];
}

export function readGlobalSettingValues(): Record<ScopedSettingKey, string> {
  return Object.fromEntries(
    SETTING_FIELDS.map((field) => [field.key, getDefaultValue(field.key)]),
  ) as Record<ScopedSettingKey, string>;
}

export function getScopeUrl(site: string, board: string): string {
  return board === SITE_SHARED_SCOPE ? `https://${site}/` : board;
}
