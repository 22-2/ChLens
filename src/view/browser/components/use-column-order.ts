import { useCallback, useEffect, useMemo, useState } from "react";
import { createLogger } from "src/app/logger";
import { getStore2String, setStore2String } from "src/app/Store2Storage";

const logger = createLogger("view/browser");
const COLUMN_ORDER_CHANGED_EVENT = "chlens:column-order-changed";

interface ColumnOrderChangedDetail {
  storageKey: string;
  order: string[];
}

function normalizeColumnOrder(value: unknown, columnKeys: readonly string[]): string[] {
  const validKeys = new Set(columnKeys);
  const normalized = Array.isArray(value)
    ? value.filter((key): key is string => typeof key === "string" && validKeys.has(key))
    : [];
  const uniqueKeys = Array.from(new Set(normalized));
  return [...uniqueKeys, ...columnKeys.filter((key) => !uniqueKeys.includes(key))];
}

function readColumnOrder(storageKey: string | undefined, columnKeys: readonly string[]): string[] {
  if (!storageKey) return [...columnKeys];

  try {
    const raw = getStore2String(storageKey);
    return normalizeColumnOrder(raw ? JSON.parse(raw) : null, columnKeys);
  } catch (error) {
    logger.error("列の並び順を読み込めませんでした", { storageKey, error });
    return [...columnKeys];
  }
}

function areOrdersEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((key, index) => key === right[index]);
}

function persistColumnOrder(storageKey: string, order: readonly string[]): void {
  try {
    void setStore2String(storageKey, JSON.stringify(order)).catch((error: unknown) => {
      logger.error("列の並び順を保存できませんでした", { storageKey, error });
    });
  } catch (error) {
    logger.error("列の並び順を保存できませんでした", { storageKey, error });
  }
}

export function useColumnOrder(
  columns: readonly { key: string }[],
  storageKey: string | undefined,
): {
  columnOrder: readonly string[];
  moveColumnBy: (key: string, offset: number) => void;
  resetColumnOrder: () => void;
} {
  const columnKeys = useMemo(() => columns.map(({ key }) => key), [columns]);
  const [columnOrder, setColumnOrder] = useState<string[]>(() =>
    readColumnOrder(storageKey, columnKeys),
  );
  const normalizedColumnOrder = useMemo(
    () => normalizeColumnOrder(columnOrder, columnKeys),
    [columnKeys, columnOrder],
  );

  const commitColumnOrder = useCallback(
    (nextOrder: readonly string[]) => {
      const normalized = normalizeColumnOrder(nextOrder, columnKeys);
      setColumnOrder((current) => (areOrdersEqual(current, normalized) ? current : normalized));
      if (!storageKey) return;

      persistColumnOrder(storageKey, normalized);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new window.CustomEvent<ColumnOrderChangedDetail>(COLUMN_ORDER_CHANGED_EVENT, {
            detail: { storageKey, order: normalized },
          }),
        );
      }
    },
    [columnKeys, storageKey],
  );

  useEffect(() => {
    if (storageKey && !areOrdersEqual(columnOrder, normalizedColumnOrder)) {
      persistColumnOrder(storageKey, normalizedColumnOrder);
    }
  }, [columnKeys, columnOrder, normalizedColumnOrder, storageKey]);

  useEffect(() => {
    if (!storageKey) return;

    const handleColumnOrderChanged = (event: Event) => {
      const detail = (event as CustomEvent<ColumnOrderChangedDetail>).detail;
      if (detail?.storageKey !== storageKey) return;
      const normalized = normalizeColumnOrder(detail.order, columnKeys);
      setColumnOrder((current) => (areOrdersEqual(current, normalized) ? current : normalized));
    };

    window.addEventListener(COLUMN_ORDER_CHANGED_EVENT, handleColumnOrderChanged);
    return () => window.removeEventListener(COLUMN_ORDER_CHANGED_EVENT, handleColumnOrderChanged);
  }, [columnKeys, storageKey]);

  const moveColumnBy = useCallback(
    (key: string, offset: number) => {
      const currentIndex = normalizedColumnOrder.indexOf(key);
      if (currentIndex < 0) return;
      const targetIndex = Math.max(
        0,
        Math.min(normalizedColumnOrder.length - 1, currentIndex + offset),
      );
      if (currentIndex === targetIndex) return;

      const nextOrder = [...normalizedColumnOrder];
      nextOrder.splice(currentIndex, 1);
      nextOrder.splice(targetIndex, 0, key);
      commitColumnOrder(nextOrder);
    },
    [commitColumnOrder, normalizedColumnOrder],
  );

  const resetColumnOrder = useCallback(
    () => commitColumnOrder(columnKeys),
    [columnKeys, commitColumnOrder],
  );

  return {
    columnOrder: normalizedColumnOrder,
    moveColumnBy,
    resetColumnOrder,
  };
}
