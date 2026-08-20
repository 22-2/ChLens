import { ChevronRight } from "lucide-react";
import React, { useCallback } from "react";
import { buildCategoryId } from "src/view/browser/pages/board-list/board-list-utils";
import { Accordion } from "src/view/browser/ui/Accordion";

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
    <Accordion.Root
      className="board-list-page__menu-accordion"
      type="multiple"
      value={openedMenuValues}
      onValueChange={onMenuAccordionChange}
    >
      {menus.map((menu) => (
        <Accordion.Item key={menu.name} value={menu.name} className="board-menu">
          <Accordion.Header asChild>
            <div className="board-menu__header">
              <Accordion.Trigger asChild>
                <button
                  type="button"
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
                  <ChevronRight size={16} className="board-list-page__chevron" />
                  {menu.name}
                </button>
              </Accordion.Trigger>
            </div>
          </Accordion.Header>
          <Accordion.Content asChild>
            <div className="board-menu__content">
              <Accordion.Root
                className="board-list-page__category-accordion"
                type="multiple"
                value={menu.categories
                  .map((category) => buildCategoryId(menu.name, category.name))
                  .filter((id) => openStates[id] ?? false)}
                onValueChange={(values) => onCategoryAccordionChange(menu.name, values)}
              >
                {menu.categories.map((category) => {
                  const categoryId = buildCategoryId(menu.name, category.name);
                  return (
                    <Accordion.Item key={categoryId} value={categoryId} className="board-category">
                      <Accordion.Header asChild>
                        <div className="board-category__header">
                          <Accordion.Trigger asChild>
                            <button
                              type="button"
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
                              <ChevronRight size={16} className="board-list-page__chevron" />
                              {category.name}
                            </button>
                          </Accordion.Trigger>
                        </div>
                      </Accordion.Header>
                      <Accordion.Content asChild>
                        <div className="board-category__panel">
                          <div className="board-category__list">
                            {category.boards.map((board) => (
                              <button
                                type="button"
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
                                <span>{board.name}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </Accordion.Content>
                    </Accordion.Item>
                  );
                })}
              </Accordion.Root>
            </div>
          </Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
};
