import { Box } from "@mantine/core";
import React, { useCallback, useState } from "react";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";
import { useQuickAccessFilterToolbar } from "src/view/browser/hooks/use-quick-access-filter-toolbar";
import { useBoardListLogic } from "src/view/browser/pages/board-list/use-board-list-logic";
import { useBoardListDisplay } from "src/view/browser/pages/board-list/use-board-list-display";
import { BoardListContent } from "src/view/browser/pages/board-list/BoardListContent";
import { SearchBarSection } from "src/view/browser/pages/board-list/SearchBarSection";
import { ContextMenuHandler } from "src/view/browser/pages/board-list/ContextMenuHandler";
import { buildCategoryId } from "src/view/browser/pages/board-list/board-list-utils";

interface BoardListPageProps {
  tabId: string;
  isActive: boolean;
}

export const BoardListPage: React.FC<BoardListPageProps> = ({
  tabId,
  isActive,
}) => {
  const { dispatch } = useTabStore();
  const {
    categories,
    loading,
    error,
    openStates,
    removedBoardUrls,
    removedMenuNames,
    removedCategoryIds,
    openedBoardEntries,
    fetchMenu,
    handleRemoveBoard,
    handleRemoveMenu,
    handleRemoveCategory,
    updateOpenStates,
  } = useBoardListLogic();

  const { displayMenus, searchQuery, setSearchQuery, openedMenuValues } =
    useBoardListDisplay({
      categories,
      openStates,
      removedBoardUrls,
      removedMenuNames,
      removedCategoryIds,
      openedBoardEntries,
      updateOpenStates,
    });

  const { isFilterOpen, closeFilterToolbar } = useQuickAccessFilterToolbar({
    pageType: "boardList",
    tabId,
    isActive,
    searchQuery,
    setSearchQuery,
  });

  const [contextMenuState, setContextMenuState] = useState<
    | { type: "board"; x: number; y: number; boardName: string; boardUrl: string }
    | { type: "menu"; x: number; y: number; menuName: string }
    | { type: "category"; x: number; y: number; menuName: string; categoryName: string }
    | null
  >(null);

  const handleBoardClick = useCallback(
    (boardUrl: string, boardTitle: string) => {
      dispatch({
        type: "NAVIGATE",
        page: {
          type: "threadList",
          title: boardTitle,
          boardUrl,
          boardTitle,
        },
      });
    },
    [dispatch],
  );

  const handleBoardMiddleClick = useCallback(
    (boardUrl: string, boardTitle: string) => {
      dispatch({
        type: "OPEN_IN_NEW_TAB",
        page: {
          type: "threadList",
          title: boardTitle,
          boardUrl,
          boardTitle,
        },
      });
    },
    [dispatch],
  );

  const handleMenuAccordionChange = useCallback(
    (openedMenuNames: string[]) => {
      updateOpenStates((prev) => {
        const next = { ...prev };
        for (const menu of categories) {
          next[menu.name] = openedMenuNames.includes(menu.name);
        }
        return next;
      });
    },
    [categories, updateOpenStates],
  );

  const handleCategoryAccordionChange = useCallback(
    (menuName: string, openedCategoryIds: string[]) => {
      updateOpenStates((prev) => {
        const next = { ...prev };
        const menu = categories.find((entry) => entry.name === menuName);
        if (!menu) {
          return next;
        }

        for (const category of menu.categories) {
          const categoryId = buildCategoryId(menuName, category.name);
          next[categoryId] = openedCategoryIds.includes(categoryId);
        }

        return next;
      });
    },
    [categories, updateOpenStates],
  );

  // 表示されている板数をカウント
  const hitCount = displayMenus.reduce(
    (sum, menu) =>
      sum +
      menu.categories.reduce(
        (categorySum, category) => categorySum + category.boards.length,
        0,
      ),
    0,
  );

  return (
    <Box>
      <SearchBarSection
        isOpen={isFilterOpen}
        query={searchQuery}
        onQueryChange={setSearchQuery}
        onClose={closeFilterToolbar}
        hitCount={hitCount}
      />

      <BoardListContent
        loading={loading}
        error={error}
        displayMenus={displayMenus}
        openStates={openStates}
        openedMenuValues={openedMenuValues}
        onMenuAccordionChange={handleMenuAccordionChange}
        onCategoryAccordionChange={handleCategoryAccordionChange}
        onBoardClick={handleBoardClick}
        onBoardMiddleClick={handleBoardMiddleClick}
        onContextMenu={setContextMenuState}
        onRetry={fetchMenu}
      />

      <ContextMenuHandler
        state={contextMenuState}
        onRemoveBoard={handleRemoveBoard}
        onRemoveMenu={handleRemoveMenu}
        onRemoveCategory={handleRemoveCategory}
        onClose={() => setContextMenuState(null)}
      />
    </Box>
  );
};
