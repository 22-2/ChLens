import React, {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";

export type StatusBarAlignment = "left" | "right";
export type StatusBarAppearance = "default" | "active" | "waiting";

interface StatusBarEntry {
  id: string;
  alignment: StatusBarAlignment;
  priority: number;
  title?: string;
  className?: string;
  interactive: boolean;
  operationRank?: number;
  sequence: number;
}

interface StatusBarContextValue {
  items: StatusBarEntry[];
  appearance: StatusBarAppearance;
}

interface StatusBarRegistryContextValue {
  setItem: (item: Omit<StatusBarEntry, "sequence">) => void;
  removeItem: (id: string) => void;
  setAppearance: (id: string, appearance: StatusBarAppearance | null) => void;
  setSlot: (id: string, element: HTMLElement | null) => void;
}

interface StatusBarProviderProps {
  children: ReactNode;
}

interface StatusBarItemProps {
  id: string;
  alignment?: StatusBarAlignment;
  priority?: number;
  title?: string;
  className?: string;
  interactive?: boolean;
  operationRank?: number;
  children: ReactNode;
}

interface StatusBarModeProps {
  id: string;
  appearance: StatusBarAppearance | null;
}

const StatusBarContext = createContext<StatusBarContextValue | null>(null);
const StatusBarRegistryContext = createContext<StatusBarRegistryContextValue | null>(null);
const StatusBarSlotContext = createContext<Readonly<Record<string, HTMLElement>>>({});

function useStatusBarContext(): StatusBarContextValue {
  const context = useContext(StatusBarContext);
  if (context == null) {
    throw new Error("StatusBar components must be used within StatusBarProvider");
  }
  return context;
}

function useStatusBarRegistryContext(): StatusBarRegistryContextValue {
  const context = useContext(StatusBarRegistryContext);
  if (context == null) {
    throw new Error("StatusBar components must be used within StatusBarProvider");
  }
  return context;
}

export const StatusBarProvider: React.FC<StatusBarProviderProps> = ({ children }) => {
  const [itemsById, setItemsById] = useState<Record<string, StatusBarEntry>>({});
  const [appearanceById, setAppearanceById] = useState<Record<string, StatusBarAppearance>>({});
  const [slotsById, setSlotsById] = useState<Record<string, HTMLElement>>({});

  const setItem = useCallback((item: Omit<StatusBarEntry, "sequence">) => {
    setItemsById((prev) => {
      const current = prev[item.id];
      if (
        current != null &&
        current.alignment === item.alignment &&
        current.priority === item.priority &&
        current.title === item.title &&
        current.className === item.className &&
        current.interactive === item.interactive &&
        current.operationRank === item.operationRank
      ) {
        return prev;
      }
      const sequence = Math.max(0, ...Object.values(prev).map((entry) => entry.sequence)) + 1;
      return { ...prev, [item.id]: { ...item, sequence } };
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    setItemsById((prev) => {
      if (!(id in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const setAppearance = useCallback((id: string, nextAppearance: StatusBarAppearance | null) => {
    setAppearanceById((prev) => {
      if (nextAppearance == null) {
        if (!(id in prev)) {
          return prev;
        }
        const next = { ...prev };
        delete next[id];
        return next;
      }
      if (prev[id] === nextAppearance) {
        return prev;
      }
      return { ...prev, [id]: nextAppearance };
    });
  }, []);

  const setSlot = useCallback((id: string, element: HTMLElement | null) => {
    setSlotsById((prev) => {
      if (element == null) {
        if (!(id in prev)) {
          return prev;
        }
        const next = { ...prev };
        delete next[id];
        return next;
      }
      if (prev[id] === element) {
        return prev;
      }
      return { ...prev, [id]: element };
    });
  }, []);

  const items = useMemo(() => {
    const entries = Object.values(itemsById);
    // 通信元は別々に保持し、表示だけを一枠に集約する。完了した操作が他の通信を消さず、
    // エラー・処理中・完了結果の順、同順位では最後に更新された文言を優先する。
    const operation = entries
      .filter((entry) => entry.operationRank != null)
      .sort(
        (left, right) =>
          (right.operationRank ?? 0) - (left.operationRank ?? 0) || right.sequence - left.sequence,
      )[0];
    return entries
      .filter((entry) => entry.operationRank == null || entry === operation)
      .sort((left, right) => {
        if (left.alignment !== right.alignment) {
          return left.alignment === "left" ? -1 : 1;
        }
        return left.alignment === "left"
          ? left.priority - right.priority
          : right.priority - left.priority;
      });
  }, [itemsById]);

  const appearance = useMemo<StatusBarAppearance>(() => {
    const appearances = Object.values(appearanceById);
    // 変更理由: 次スレ待機は自動更新中の表示と同時に出ないが、出ている時は待機を優先して見せる。
    if (appearances.includes("waiting")) {
      return "waiting";
    }
    if (appearances.includes("active")) {
      return "active";
    }
    return "default";
  }, [appearanceById]);

  const value = useMemo<StatusBarContextValue>(() => ({ items, appearance }), [appearance, items]);
  const registryValue = useMemo<StatusBarRegistryContextValue>(
    () => ({ setItem, removeItem, setAppearance, setSlot }),
    [removeItem, setAppearance, setItem, setSlot],
  );

  return (
    <StatusBarRegistryContext.Provider value={registryValue}>
      <StatusBarSlotContext.Provider value={slotsById}>
        <StatusBarContext.Provider value={value}>{children}</StatusBarContext.Provider>
      </StatusBarSlotContext.Provider>
    </StatusBarRegistryContext.Provider>
  );
};

export const StatusBarItem: React.FC<StatusBarItemProps> = ({
  id,
  alignment = "left",
  priority = 0,
  title,
  className,
  interactive = false,
  operationRank,
  children,
}) => {
  const { removeItem, setItem } = useStatusBarRegistryContext();
  const slot = useContext(StatusBarSlotContext)[id];

  useEffect(() => {
    setItem({
      id,
      alignment,
      priority,
      title,
      className,
      interactive,
      operationRank,
    });

    return () => {
      removeItem(id);
    };
  }, [alignment, className, id, interactive, operationRank, priority, removeItem, setItem, title]);

  // 変更理由: 以前は children の JSX を Provider の state に保存し、StatusBar 側で描画していた。
  // Preact は初回描画した JSX 要素自体に親 VNode への参照（_parent）を書き込むため、保存した要素が
  // その時点のアプリ全体の VNode ツリーを保持し、さらにそのツリー内の StatusBar が一つ前の要素を
  // 保持する連鎖ができた。自動更新でレス数表示が変わるたびに古いツリーが解放されず、メモリが増え続けた。
  // JSX は保存せず、StatusBar が用意した置き場へ自分の位置から portal で描画する。
  return slot ? createPortal(children, slot) : null;
};

export const StatusBarMode: React.FC<StatusBarModeProps> = ({ id, appearance }) => {
  const { setAppearance } = useStatusBarRegistryContext();

  useEffect(() => {
    setAppearance(id, appearance);

    return () => {
      setAppearance(id, null);
    };
  }, [appearance, id, setAppearance]);

  return null;
};

interface StatusBarSlotProps {
  item: StatusBarEntry;
}

const StatusBarSlot: React.FC<StatusBarSlotProps> = ({ item }) => {
  const { setSlot } = useStatusBarRegistryContext();
  const { id } = item;
  // ref を描画ごとに作り直すと null と要素の登録が毎回交互に起き、再描画が続くため固定する。
  const slotRef = useCallback(
    (element: HTMLDivElement | null) => setSlot(id, element),
    [id, setSlot],
  );

  return (
    <div
      ref={slotRef}
      className={`status-bar__item${
        item.interactive ? " status-bar__item--interactive" : ""
      }${item.className ? ` ${item.className}` : ""}`}
      title={item.title}
    />
  );
};

export const StatusBar: React.FC = () => {
  const { appearance, items } = useStatusBarContext();
  const leftItems = items.filter((item) => item.alignment === "left");
  const rightItems = items.filter((item) => item.alignment === "right");

  return (
    <footer className={`status-bar status-bar--${appearance}`}>
      <div className="status-bar__group status-bar__group--left">
        {leftItems.map((item) => (
          <StatusBarSlot key={item.id} item={item} />
        ))}
      </div>
      <div className="status-bar__group status-bar__group--right">
        {rightItems.map((item) => (
          <StatusBarSlot key={item.id} item={item} />
        ))}
      </div>
    </footer>
  );
};
