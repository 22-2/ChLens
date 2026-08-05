import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { getStore2String, setStore2String } from "src/app/Store2Storage";
import type { ContextMenuItem } from "src/view/browser/components/ContextMenu";
import type { ColumnDef } from "src/view/browser/components/SimpleDataTable";

type VisibleColumnDescriptor = {
  key: string;
  header: ReactNode;
  visibilityLabel?: string;
};

export interface ColumnVisibilityOptions {
  storageKey: string;
  lockedColumnKeys?: readonly string[];
}

function readHiddenColumnKeys(storageKey: string): Set<string> {
  try {
    const raw = getStore2String(storageKey);
    if (!raw) {
      return new Set();
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return new Set();
    }

    return new Set(parsed.filter((value): value is string => typeof value === "string"));
  } catch {
    return new Set();
  }
}

function clampHiddenColumnKeys(
  hiddenColumnKeys: ReadonlySet<string>,
  columns: ReadonlyArray<VisibleColumnDescriptor>,
  lockedColumnKeys: ReadonlySet<string>,
): Set<string> {
  const validColumnKeys = new Set(columns.map((column) => column.key));
  const nextHiddenColumnKeys = new Set<string>();

  for (const key of hiddenColumnKeys) {
    if (!validColumnKeys.has(key) || lockedColumnKeys.has(key)) {
      continue;
    }
    nextHiddenColumnKeys.add(key);
  }

  return nextHiddenColumnKeys;
}

function areSetsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  if (left.size !== right.size) {
    return false;
  }

  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }

  return true;
}

function readColumnVisibilityLabel(column: VisibleColumnDescriptor): string {
  if (typeof column.header === "string" && column.header.length > 0) {
    return column.header;
  }

  return column.visibilityLabel ?? column.key;
}

export function useColumnVisibility<TRow>(
  columns: ColumnDef<TRow>[],
  options: ColumnVisibilityOptions | undefined,
): {
  hiddenColumnKeys: ReadonlySet<string>;
  visibleColumns: ColumnDef<TRow>[];
  columnVisibilityMenuItems: ContextMenuItem[];
  openHeaderContextMenu: (x: number, y: number) => void;
  closeHeaderContextMenu: () => void;
  headerContextMenuState: { x: number; y: number } | null;
} {
  const lockedColumnKeySet = useMemo(
    () => new Set(options?.lockedColumnKeys ?? []),
    [options?.lockedColumnKeys],
  );
  const [headerContextMenuState, setHeaderContextMenuState] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [hiddenColumnKeys, setHiddenColumnKeys] = useState<Set<string>>(() =>
    options?.storageKey ? readHiddenColumnKeys(options.storageKey) : new Set(),
  );

  const normalizedHiddenColumnKeys = useMemo(
    () => clampHiddenColumnKeys(hiddenColumnKeys, columns, lockedColumnKeySet),
    [columns, hiddenColumnKeys, lockedColumnKeySet],
  );

  useEffect(() => {
    if (!options?.storageKey) {
      return;
    }

    if (!areSetsEqual(hiddenColumnKeys, normalizedHiddenColumnKeys)) {
      setHiddenColumnKeys(normalizedHiddenColumnKeys);
    }
  }, [hiddenColumnKeys, normalizedHiddenColumnKeys, options?.storageKey]);

  useEffect(() => {
    if (!options?.storageKey) {
      return;
    }

    try {
      void setStore2String(
        options.storageKey,
        JSON.stringify(Array.from(normalizedHiddenColumnKeys)),
      );
    } catch {
      // 列の表示状態は補助設定なので、保存に失敗しても一覧操作は止めない。
    }
  }, [normalizedHiddenColumnKeys, options?.storageKey]);

  const visibleColumns = useMemo(
    () => columns.filter((column) => !normalizedHiddenColumnKeys.has(column.key)),
    [columns, normalizedHiddenColumnKeys],
  );

  const toggleColumnVisibility = (columnKey: string): void => {
    if (lockedColumnKeySet.has(columnKey) || !options?.storageKey) {
      return;
    }

    setHiddenColumnKeys((prev) => {
      const next = new Set(prev);
      if (next.has(columnKey)) {
        next.delete(columnKey);
      } else {
        next.add(columnKey);
      }
      return clampHiddenColumnKeys(next, columns, lockedColumnKeySet);
    });
  };

  const columnVisibilityMenuItems = useMemo(
    () =>
      columns.map((column) => {
        const label = readColumnVisibilityLabel(column);
        const isLocked = lockedColumnKeySet.has(column.key);
        const isHidden = normalizedHiddenColumnKeys.has(column.key);

        if (isLocked) {
          return {
            id: `column-visibility:${column.key}:locked`,
            label: `${label}は非表示にできません`,
            disabled: true,
          } satisfies ContextMenuItem;
        }

        return {
          id: `column-visibility:${column.key}:${isHidden ? "show" : "hide"}`,
          label: isHidden ? `${label}を表示する` : `${label}を非表示にする`,
          onSelect: () => toggleColumnVisibility(column.key),
        } satisfies ContextMenuItem;
      }),
    [columns, lockedColumnKeySet, normalizedHiddenColumnKeys],
  );

  const openHeaderContextMenu = (x: number, y: number): void => {
    if (!options?.storageKey) {
      return;
    }

    setHeaderContextMenuState({ x, y });
  };

  const closeHeaderContextMenu = (): void => {
    setHeaderContextMenuState(null);
  };

  return {
    hiddenColumnKeys: normalizedHiddenColumnKeys,
    visibleColumns,
    columnVisibilityMenuItems,
    openHeaderContextMenu,
    closeHeaderContextMenu,
    headerContextMenuState,
  };
}
