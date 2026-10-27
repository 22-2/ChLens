import type { ParsedBBSMenu } from "packages/chlib/src/index";
import { useCallback, useEffect, useRef, useState } from "react";
import { createLogger } from "src/app/logger";
import {
  OPENED_BOARDS_CONFIG_KEY,
  type OpenedBoardEntry,
  parseOpenedBoardEntries,
} from "src/core/board/opened-board-entries";
import { container } from "src/service-container/index";
import { normalizeBoardUrlForRemove } from "src/view/browser/pages/board-list/board-list-utils";
import { useTabViewState } from "src/view/browser/state/tabs/use-tab-store";

// ─── 定数 ────────────────────────────────────────────────────────────────────

const logger = createLogger("useBoardListLogic");
const CONFIG_KEYS = {
  REMOVED_BOARD_URLS: "board_list_removed_urls",
  REMOVED_MENU_NAMES: "board_list_removed_menus",
  REMOVED_CATEGORY_IDS: "board_list_removed_category_ids",
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
    // transform は呼び出し側がモジュールスコープの関数を渡す前提。インライン関数を渡すと毎回再読込になる。
  }, [configKey, transform]);

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
export function useBoardListLogic(refreshKey = 0, tabId = "") {
  const { state: viewState, update: updateViewState } = useTabViewState(tabId, {
    type: "boardList",
    title: "板一覧",
  });
  const [categories, setCategories] = useState<ParsedBBSMenu[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 検索中のセッション復元でも、検索フックが保存前の初期値を退避しないよう先に読み込む。
  const [openStates, setOpenStates] = useState<Record<string, boolean>>(() => {
    const saved = viewState.boardListOpenStates;
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
    return Object.fromEntries(
      Object.entries(saved).filter(
        (entry): entry is [string, boolean] => typeof entry[1] === "boolean",
      ),
    );
  });
  const openStatesRef = useRef(openStates);
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

  // ─── 一度開いた板の同期と変更監視 ───────────────────────────────────────

  useEffect(() => {
    const syncOpenedBoards = () => {
      const raw = container.config.get(OPENED_BOARDS_CONFIG_KEY);
      const parsed = parseOpenedBoardEntries(raw);
      setOpenedBoardEntries(parsed);

      // 変更理由: URLの正規化・外部サイトの除外を一度だけ永続化し、
      // 次回起動時にも古い「一度開いた板」が一覧へ戻らないようにする。
      if (raw !== null && raw !== JSON.stringify(parsed)) {
        void container.config.set(OPENED_BOARDS_CONFIG_KEY, JSON.stringify(parsed));
      }
    };

    syncOpenedBoards();

    const handleConfigUpdated = ({ key }: { key?: string }) => {
      if (key !== OPENED_BOARDS_CONFIG_KEY) return;
      syncOpenedBoards();
      // 「一度開いた板」は openedBoardEntries を通じて表示側が「その他」に統合するため、
      // ここでBBSMenuを再取得してローディング表示を挟まない。
    };

    container.message.on("config_updated", handleConfigUpdated);
    return () => {
      container.message.off("config_updated", handleConfigUpdated);
    };
  }, []);

  useEffect(() => {
    const handleBBSMenuUpdated = () => {
      // 設定画面からのリフレッシュ結果を、すでに開いている板一覧にも反映する。
      void fetchMenu(false);
    };

    container.message.on("bbs_menu_updated", handleBBSMenuUpdated);
    return () => {
      container.message.off("bbs_menu_updated", handleBBSMenuUpdated);
    };
  }, [fetchMenu]);

  // ─── 初期ロード ──────────────────────────────────────────────────────────

  useEffect(() => {
    // 変更理由: コンテキストメニューやタイトルバーの更新操作はRELOADでreloadKeyを進めるため、
    // 初回だけキャッシュを使い、明示的な更新時だけBBSメニューを強制取得する。
    void fetchMenu(refreshKey > 0);
  }, [fetchMenu, refreshKey]);

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
      const next = updater(openStatesRef.current);
      if (next === openStatesRef.current) return;
      openStatesRef.current = next;
      setOpenStates(next);
      updateViewState({ boardListOpenStates: next });
    },
    [updateViewState],
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
