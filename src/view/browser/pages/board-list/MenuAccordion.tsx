import { Accordion, Box, Text, UnstyledButton } from "@mantine/core";
import { ChevronRight } from "lucide-react";
import React, { useCallback } from "react";
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

const BOARD_ACCORDION_STYLES = {
  item: {
    background: "transparent",
    border: "none",
    borderRadius: "0",
  },
  control: {
    padding: "0",
    borderRadius: "0",
  },
  label: {
    padding: "0",
  },
  panel: {
    padding: "0",
  },
  content: {
    padding: "0",
  },
  chevron: {
    transition: "none",
  },
} as const;

interface MenuAccordionProps {
  menus: Menu[];
  openStates: Record<string, boolean>;
  openedMenuValues: string[];
  onMenuAccordionChange: (openedMenuNames: string[]) => void;
  onCategoryAccordionChange: (menuName: string, openedCategoryIds: string[]) => void;
  onBoardClick: (boardUrl: string, boardTitle: string) => void;
  onBoardMiddleClick: (boardUrl: string, boardTitle: string) => void;
  onContextMenu: (state: BoardContextMenuState) => void;
}

/**
 * 階層化されたアコーディオンUIで板メニューを表示
 * - メニューレベルのアコーディオン
 * - カテゴリレベルのアコーディオン
 * - 板項目のリスト
 */
export const MenuAccordion: React.FC<MenuAccordionProps> = ({
  menus,
  openStates,
  openedMenuValues,
  onMenuAccordionChange,
  onCategoryAccordionChange,
  onBoardClick,
  onBoardMiddleClick,
  onContextMenu,
}) => {
  const handleBoardMouseDown = useCallback(
    (boardUrl: string, boardName: string, e: React.MouseEvent) => {
      if (e.button === 0) {
        onBoardClick(boardUrl, boardName);
      } else if (e.button === 1) {
        onBoardMiddleClick(boardUrl, boardName);
      }
    },
    [onBoardClick, onBoardMiddleClick],
  );

  return (
    <Accordion
      className="board-list-page__menu-accordion"
      multiple
      value={openedMenuValues}
      onChange={onMenuAccordionChange}
      variant="unstyled"
      chevronPosition="left"
      chevron={<ChevronRight size={16} className="board-list-page__chevron" />}
      transitionDuration={0}
      styles={BOARD_ACCORDION_STYLES}
    >
      {menus.map((menu) => (
        <Accordion.Item key={menu.name} value={menu.name} className="board-menu">
          <Accordion.Control
            className="board-menu__title"
            onContextMenu={(event) => {
              event.preventDefault();
              onContextMenu({
                type: "menu",
                x: event.clientX,
                y: event.clientY,
                menuName: menu.name,
              });
            }}
          >
            {menu.name}
          </Accordion.Control>
          <Accordion.Panel className="board-menu__content">
            <Accordion
              className="board-list-page__category-accordion"
              multiple
              variant="unstyled"
              chevronPosition="left"
              chevron={<ChevronRight size={16} className="board-list-page__chevron" />}
              transitionDuration={0}
              styles={BOARD_ACCORDION_STYLES}
              value={menu.categories
                .map((category) => buildCategoryId(menu.name, category.name))
                .filter((id) => openStates[id] ?? false)}
              onChange={(values) => onCategoryAccordionChange(menu.name, values)}
            >
              {menu.categories.map((category) => {
                const categoryId = buildCategoryId(menu.name, category.name);
                return (
                  <Accordion.Item key={categoryId} value={categoryId} className="board-category">
                    <Accordion.Control
                      className="board-category__title"
                      onContextMenu={(event) => {
                        event.preventDefault();
                        onContextMenu({
                          type: "category",
                          x: event.clientX,
                          y: event.clientY,
                          menuName: menu.name,
                          categoryName: category.name,
                        });
                      }}
                    >
                      {category.name}
                    </Accordion.Control>
                    <Accordion.Panel>
                      <Box className="board-category__list">
                        {category.boards.map((board) => (
                          <UnstyledButton
                            key={board.url}
                            className="board-item"
                            onMouseDown={(e) => handleBoardMouseDown(board.url, board.name, e)}
                            onContextMenu={(event) => {
                              event.preventDefault();
                              onContextMenu({
                                type: "board",
                                x: event.clientX,
                                y: event.clientY,
                                boardName: board.name,
                                boardUrl: board.url,
                              });
                            }}
                          >
                            <Text size="sm">{board.name}</Text>
                          </UnstyledButton>
                        ))}
                      </Box>
                    </Accordion.Panel>
                  </Accordion.Item>
                );
              })}
            </Accordion>
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion>
  );
};
