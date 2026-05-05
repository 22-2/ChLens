import React, { useMemo } from "react";
import type { ContextMenuItem } from "src/view/browser/components/ContextMenu";
import { ContextMenu } from "src/view/browser/components/ContextMenu";

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
    }
  | null;

interface ContextMenuHandlerProps {
  state: BoardContextMenuState;
  onRemoveBoard: (url: string) => void;
  onRemoveMenu: (menuName: string) => void;
  onRemoveCategory: (menuName: string, categoryName: string) => void;
  onClose: () => void;
}

/**
 * コンテキストメニューの表示と操作処理
 * - 板、メニュー、カテゴリの3種類の削除メニューに対応
 */
export const ContextMenuHandler: React.FC<ContextMenuHandlerProps> = ({
  state,
  onRemoveBoard,
  onRemoveMenu,
  onRemoveCategory,
  onClose,
}) => {
  const contextMenuItems = useMemo<ContextMenuItem[]>(() => {
    if (!state) {
      return [];
    }

    if (state.type === "menu") {
      return [
        {
          id: "remove-menu",
          label: `この板メニューを一覧から削除 (${state.menuName})`,
          danger: true,
          onSelect: () => onRemoveMenu(state.menuName),
        },
      ];
    }

    if (state.type === "category") {
      return [
        {
          id: "remove-category",
          label: `このカテゴリを一覧から削除 (${state.categoryName})`,
          danger: true,
          onSelect: () => onRemoveCategory(state.menuName, state.categoryName),
        },
      ];
    }

    return [
      {
        id: "remove-board",
        label: `この板を一覧から削除 (${state.boardName})`,
        danger: true,
        onSelect: () => onRemoveBoard(state.boardUrl),
      },
    ];
  }, [state, onRemoveBoard, onRemoveMenu, onRemoveCategory]);

  if (!state) {
    return null;
  }

  return (
    <ContextMenu
      x={state.x}
      y={state.y}
      items={contextMenuItems}
      onClose={onClose}
    />
  );
};
