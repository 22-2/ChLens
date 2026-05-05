import { Alert, Box, Button, Loader, Text } from "@mantine/core";
import React from "react";
import type { BBSMenu } from "src/core/BBSMenuParser";
import { MenuAccordion } from "src/view/browser/pages/board-list/MenuAccordion";
import { buildCategoryId } from "src/view/browser/pages/board-list/board-list-utils";

interface Board {
  name: string;
  url: string;
}

interface Category {
  name: string;
  boards: Board[];
}

interface Menu {
  name: string;
  categories: Category[];
}

type BoardContextMenuState =
  | {
      type: "board";
      x: number;
      y: number;
      boardName: string;
      boardUrl: string;
    }
  | {
      type: "menu";
      x: number;
      y: number;
      menuName: string;
    }
  | {
      type: "category";
      x: number;
      y: number;
      menuName: string;
      categoryName: string;
    };

interface BoardListContentProps {
  loading: boolean;
  error: string | null;
  displayMenus: Menu[];
  openStates: Record<string, boolean>;
  openedMenuValues: string[];
  onMenuAccordionChange: (openedMenuNames: string[]) => void;
  onCategoryAccordionChange: (
    menuName: string,
    openedCategoryIds: string[],
  ) => void;
  onBoardClick: (boardUrl: string, boardTitle: string) => void;
  onBoardMiddleClick: (boardUrl: string, boardTitle: string) => void;
  onContextMenu: (state: BoardContextMenuState) => void;
  onRetry: () => void;
}

/**
 * 板一覧メインコンテンツ
 * ローディング、エラー、正常表示の3つの状態を管理
 */
export const BoardListContent: React.FC<BoardListContentProps> = ({
  loading,
  error,
  displayMenus,
  openStates,
  openedMenuValues,
  onMenuAccordionChange,
  onCategoryAccordionChange,
  onBoardClick,
  onBoardMiddleClick,
  onContextMenu,
  onRetry,
}) => {
  if (loading) {
    return (
      <Box className="board-list-page board-list-page__status">
        <Box className="home-page__status">
          <Text size="sm" c="dimmed">
            読み込み中...
          </Text>
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box className="board-list-page">
        <Alert color="red" title="板一覧の取得に失敗しました">
          <Text size="sm">{error}</Text>
          <Button mt="xs" variant="subtle" onClick={onRetry}>
            再試行
          </Button>
        </Alert>
      </Box>
    );
  }

  if (displayMenus.length === 0) {
    return (
      <Box className="board-list-page">
        <Alert color="gray" title="表示できる板がありません">
          削除条件に一致しない板が見つかりませんでした。
        </Alert>
      </Box>
    );
  }

  return (
    <Box className="board-list-page">
      <MenuAccordion
        menus={displayMenus}
        openStates={openStates}
        openedMenuValues={openedMenuValues}
        onMenuAccordionChange={onMenuAccordionChange}
        onCategoryAccordionChange={onCategoryAccordionChange}
        onBoardClick={onBoardClick}
        onBoardMiddleClick={onBoardMiddleClick}
        onContextMenu={onContextMenu}
      />
    </Box>
  );
};
