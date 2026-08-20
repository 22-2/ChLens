import { useCallback, useEffect, useState } from "react";
import type { BBSMenu } from "src/core/BBSMenuParser";
import { createLogger } from "src/core/logger";
import { container } from "src/service-container/index";
import {
  normalizeBoardUrlForRemove,
  parseOpenedBoardEntries,
  type OpenedBoardEntry,
} from "src/view/browser/pages/board-list/board-list-utils";

// ─── 定数 ────────────────────────────────────────────────────────────────────

const logger = createLogger("useBoardListLogic");
const CONFIG_KEYS = {
  OPEN_STATES: "board_list_open_states",
  REMOVED_BOARD_URLS: "board_list_removed_urls",
  REMOVED_MENU_NAMES: "board_list_removed_menus",
  REMOVED_CATEGORY_IDS: "board_list_removed_category_ids",
  OPENED_BOARDS: "opened_board_entries",
} as const;

// ─── ユーティリティ ──────────────────────────────────────────────────────────

/**
 * config から string[] を安全にパースして返す。
 * パース失敗時は空配列を返し、破損データは無視して通常表示を優先する。
 */
function loadStringArrayFromConfig(key: string): string[] {
  const raw = container.config.get(key);
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      logger.warn(`[useBoardListLogic] Config key "${key}" is not an array, resetting to empty.`);
      return [];
    }
    return parsed as string[];
  } catch (e) {
    logger.warn(`[useBoardListLogic] Failed to parse config key "${key}", resetting to empty.`, e);
    return [];
  }
}

// ─── カスタムフック：永続化された Set ───────────────────────────────────────

/**
 * config へ自動永続化される Set<string> を管理する汎用フック。
 * - transform: 読み込み時に各値へ適用する正規化関数（例: URL の正規化）
 */
function usePersistedSet(
  configKey: string,
  transform?: (value: string) => string,
): [Set<string>, (item: string) => void] {
  const [set, setSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    const arr = loadStringArrayFromConfig(configKey);
    setSet(new Set(transform ? arr.map(transform) : arr));
    // transform は外部で定義された純粋関数なので deps 不要
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [configKey]);

  const add = useCallback(
    (item: string) => {
      setSet((prev) => {
        if (prev.has(item)) return prev;
        const next = new Set(prev);
        next.add(item);
        void container.config.set(configKey, JSON.stringify(Array.from(next)));
        return next;
      });
    },
    [configKey],
  );

  return [set, add];
}

// ─── メインフック ─────────────────────────────────────────────────────────────

/**
 * 板一覧ページのデータ取得と状態管理ロジック
 * - BBSメニューの取得とリロード
 * - 削除状態（板、メニュー、カテゴリ）の永続化
 * - 開かれたアコーディオンの状態管理
 * - 一度開いた板のトラッキング
 */
export function useBoardListLogic() {
  const [categories, setCategories] = useState<BBSMenu[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openStates, setOpenStates] = useState<Record<string, boolean>>({});
  const [openedBoardEntries, setOpenedBoardEntries] = useState<OpenedBoardEntry[]>([]);

  const [removedBoardUrls, addRemovedBoardUrl] = usePersistedSet(
    CONFIG_KEYS.REMOVED_BOARD_URLS,
    normalizeBoardUrlForRemove,
  );
  const [removedMenuNames, addRemovedMenuName] = usePersistedSet(CONFIG_KEYS.REMOVED_MENU_NAMES);
  const [removedCategoryIds, addRemovedCategoryId] = usePersistedSet(
    CONFIG_KEYS.REMOVED_CATEGORY_IDS,
  );

  // ─── BBSメニュー取得 ─────────────────────────────────────────────────────

  const fetchMenu = useCallback(async (forceReload = false) => {
    setLoading(true);
    setError(null);
    try {
      // 初回表示はモデルのメモリ/永続キャッシュを優先し、明示的な再試行だけ通信する。
      const result = await container.bbsMenu.get(forceReload);
      if (result.status === "success" && result.menu) {
        setCategories(result.menu);
      } else {
        setError(result.message ?? "板一覧の取得に失敗しました");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラー");
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── アコーディオン状態の復元 ────────────────────────────────────────────

  useEffect(() => {
    const raw = container.config.get(CONFIG_KEYS.OPEN_STATES);
    if (!raw) return;
    try {
      setOpenStates(JSON.parse(raw) as Record<string, boolean>);
    } catch (e) {
      logger.warn(
        `[useBoardListLogic] Failed to parse "${CONFIG_KEYS.OPEN_STATES}", using defaults.`,
        e,
      );
    }
  }, []);

  // ─── 一度開いた板の同期と変更監視 ───────────────────────────────────────

  useEffect(() => {
    const syncOpenedBoards = () => {
      setOpenedBoardEntries(
        parseOpenedBoardEntries(container.config.get(CONFIG_KEYS.OPENED_BOARDS)),
      );
    };

    syncOpenedBoards();

    const handleConfigUpdated = ({ key }: { key?: string }) => {
      if (key !== CONFIG_KEYS.OPENED_BOARDS) return;
      syncOpenedBoards();
      // 「一度開いた板」は openedBoardEntries を通じて表示側が「その他」に統合するため、
      // ここでBBSMenuを再取得してローディング表示を挟まない。
    };

    container.message.on("config_updated", handleConfigUpdated);
    return () => {
      container.message.off("config_updated", handleConfigUpdated);
    };
  }, []);

  // ─── 初期ロード ──────────────────────────────────────────────────────────

  useEffect(() => {
    void fetchMenu();
  }, [fetchMenu]);

  // ─── ハンドラ ────────────────────────────────────────────────────────────

  const handleRemoveBoard = useCallback(
    (url: string) => {
      addRemovedBoardUrl(normalizeBoardUrlForRemove(url));
      container.toast.info("板一覧から削除しました");
    },
    [addRemovedBoardUrl],
  );

  const handleRemoveMenu = useCallback(
    (menuName: string) => {
      addRemovedMenuName(menuName);
      container.toast.info(`板メニュー「${menuName}」を一覧から削除しました`);
    },
    [addRemovedMenuName],
  );

  const handleRemoveCategory = useCallback(
    (menuName: string, categoryName: string) => {
      addRemovedCategoryId(`${menuName}:${categoryName}`);
      container.toast.info(`カテゴリ「${categoryName}」を一覧から削除しました`);
    },
    [addRemovedCategoryId],
  );

  const updateOpenStates = useCallback(
    (updater: (prev: Record<string, boolean>) => Record<string, boolean>) => {
      setOpenStates((prev) => {
        const next = updater(prev);
        void container.config.set(CONFIG_KEYS.OPEN_STATES, JSON.stringify(next));
        return next;
      });
    },
    [],
  );

  // ─── 公開 API ────────────────────────────────────────────────────────────

  return {
    // state
    categories,
    loading,
    error,
    openStates,
    removedBoardUrls,
    removedMenuNames,
    removedCategoryIds,
    openedBoardEntries,
    // handlers
    fetchMenu,
    handleRemoveBoard,
    handleRemoveMenu,
    handleRemoveCategory,
    updateOpenStates,
  };
}
