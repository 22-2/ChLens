import { useCallback, useEffect, useState } from "react";
import type { BBSMenu } from "src/core/BBSMenuParser";
import { container } from "src/service-container/index";
import {
  normalizeBoardUrlForRemove,
  parseOpenedBoardEntries,
  type OpenedBoardEntry,
} from "src/view/browser/pages/board-list/board-list-utils";

const BOARD_LIST_REMOVED_URLS_KEY = "board_list_removed_urls";
const BOARD_LIST_REMOVED_MENUS_KEY = "board_list_removed_menus";
const BOARD_LIST_REMOVED_CATEGORY_IDS_KEY = "board_list_removed_category_ids";
const OPENED_BOARDS_CONFIG_KEY = "opened_board_entries";

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
  const [removedBoardUrls, setRemovedBoardUrls] = useState<Set<string>>(
    new Set(),
  );
  const [removedMenuNames, setRemovedMenuNames] = useState<Set<string>>(
    new Set(),
  );
  const [removedCategoryIds, setRemovedCategoryIds] = useState<Set<string>>(
    new Set(),
  );
  const [openedBoardEntries, setOpenedBoardEntries] = useState<
    OpenedBoardEntry[]
  >([]);

  const fetchMenu = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 変更理由: 「一度開いた板」は config 依存で変化するため、
      // 板一覧表示時は最新結果を必ず再計算してキャッシュ取りこぼしを防ぐ。
      const result = await container.bbsMenu.get(true);
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

  // 開いたアコーディオン状態の復元
  useEffect(() => {
    const saved = container.config.get("board_list_open_states");
    if (saved) {
      try {
        setOpenStates(JSON.parse(saved));
      } catch {
        // ignore parse error
      }
    }
  }, []);

  // 削除された板 URL の復元
  useEffect(() => {
    const saved = container.config.get(BOARD_LIST_REMOVED_URLS_KEY);
    if (!saved) {
      return;
    }

    try {
      const parsed = JSON.parse(saved) as string[];
      if (!Array.isArray(parsed)) {
        return;
      }

      setRemovedBoardUrls(
        new Set(parsed.map((url) => normalizeBoardUrlForRemove(url))),
      );
    } catch {
      // 破損データは無視して通常表示を優先する。
    }
  }, []);

  // 削除されたメニュー名の復元
  useEffect(() => {
    const saved = container.config.get(BOARD_LIST_REMOVED_MENUS_KEY);
    if (!saved) {
      return;
    }

    try {
      const parsed = JSON.parse(saved) as string[];
      if (!Array.isArray(parsed)) {
        return;
      }

      setRemovedMenuNames(new Set(parsed));
    } catch {
      // 破損データは無視して通常表示を優先する。
    }
  }, []);

  // 削除されたカテゴリIDの復元
  useEffect(() => {
    const saved = container.config.get(BOARD_LIST_REMOVED_CATEGORY_IDS_KEY);
    if (!saved) {
      return;
    }

    try {
      const parsed = JSON.parse(saved) as string[];
      if (!Array.isArray(parsed)) {
        return;
      }

      setRemovedCategoryIds(new Set(parsed));
    } catch {
      // 破損データは無視して通常表示を優先する。
    }
  }, []);

  // 一度開いた板の同期と変更監視
  useEffect(() => {
    const syncOpenedBoards = () => {
      setOpenedBoardEntries(
        parseOpenedBoardEntries(container.config.get(OPENED_BOARDS_CONFIG_KEY)),
      );
    };

    syncOpenedBoards();

    const handleConfigUpdated = ({ key }: { key?: string }) => {
      if (key === OPENED_BOARDS_CONFIG_KEY) {
        syncOpenedBoards();
        // 「一度開いた板」が追加されたら、bbsMenu キャッシュを更新して
        // 「その他」メニューに反映させる
        void fetchMenu();
      }
    };

    container.message.on("config_updated", handleConfigUpdated);
    return () => {
      container.message.off("config_updated", handleConfigUpdated);
    };
  }, [fetchMenu]);

  // 初期ロード
  useEffect(() => {
    void fetchMenu();
  }, [fetchMenu]);

  const persistRemovedBoardUrls = useCallback((nextSet: Set<string>) => {
    void container.config.set(
      BOARD_LIST_REMOVED_URLS_KEY,
      JSON.stringify(Array.from(nextSet)),
    );
  }, []);

  const persistRemovedMenuNames = useCallback((nextSet: Set<string>) => {
    void container.config.set(
      BOARD_LIST_REMOVED_MENUS_KEY,
      JSON.stringify(Array.from(nextSet)),
    );
  }, []);

  const persistRemovedCategoryIds = useCallback((nextSet: Set<string>) => {
    void container.config.set(
      BOARD_LIST_REMOVED_CATEGORY_IDS_KEY,
      JSON.stringify(Array.from(nextSet)),
    );
  }, []);

  const handleRemoveBoard = useCallback(
    (url: string) => {
      const normalizedUrl = normalizeBoardUrlForRemove(url);
      setRemovedBoardUrls((prev) => {
        if (prev.has(normalizedUrl)) {
          return prev;
        }

        const next = new Set(prev);
        next.add(normalizedUrl);
        persistRemovedBoardUrls(next);
        return next;
      });
      container.toast.info("板一覧から削除しました");
    },
    [persistRemovedBoardUrls],
  );

  const handleRemoveMenu = useCallback(
    (menuName: string) => {
      setRemovedMenuNames((prev) => {
        if (prev.has(menuName)) {
          return prev;
        }

        const next = new Set(prev);
        next.add(menuName);
        persistRemovedMenuNames(next);
        return next;
      });
      container.toast.info(`板メニュー「${menuName}」を一覧から削除しました`);
    },
    [persistRemovedMenuNames],
  );

  const handleRemoveCategory = useCallback(
    (menuName: string, categoryName: string) => {
      const categoryId = `${menuName}:${categoryName}`;
      setRemovedCategoryIds((prev) => {
        if (prev.has(categoryId)) {
          return prev;
        }

        const next = new Set(prev);
        next.add(categoryId);
        persistRemovedCategoryIds(next);
        return next;
      });
      container.toast.info(`カテゴリ「${categoryName}」を一覧から削除しました`);
    },
    [persistRemovedCategoryIds],
  );

  const updateOpenStates = useCallback(
    (updater: (prev: Record<string, boolean>) => Record<string, boolean>) => {
      setOpenStates((prev) => {
        const next = updater(prev);
        void container.config.set(
          "board_list_open_states",
          JSON.stringify(next),
        );
        return next;
      });
    },
    [],
  );

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
