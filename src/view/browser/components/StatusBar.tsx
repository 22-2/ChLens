import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type StatusBarAlignment = "left" | "right";
export type StatusBarAppearance = "default" | "active";

interface StatusBarEntry {
  id: string;
  alignment: StatusBarAlignment;
  priority: number;
  title?: string;
  className?: string;
  interactive: boolean;
  content: ReactNode;
}

interface StatusBarContextValue {
  items: StatusBarEntry[];
  appearance: StatusBarAppearance;
}

interface StatusBarRegistryContextValue {
  setItem: (item: StatusBarEntry) => void;
  removeItem: (id: string) => void;
  setAppearance: (id: string, appearance: StatusBarAppearance | null) => void;
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
  children: ReactNode;
}

interface StatusBarModeProps {
  id: string;
  appearance: StatusBarAppearance | null;
}

const StatusBarContext = createContext<StatusBarContextValue | null>(null);
const StatusBarRegistryContext =
  createContext<StatusBarRegistryContextValue | null>(null);

function useStatusBarContext(): StatusBarContextValue {
  const context = useContext(StatusBarContext);
  if (context == null) {
    throw new Error(
      "StatusBar components must be used within StatusBarProvider",
    );
  }
  return context;
}

function useStatusBarRegistryContext(): StatusBarRegistryContextValue {
  const context = useContext(StatusBarRegistryContext);
  if (context == null) {
    throw new Error(
      "StatusBar components must be used within StatusBarProvider",
    );
  }
  return context;
}

export const StatusBarProvider: React.FC<StatusBarProviderProps> = ({
  children,
}) => {
  const [itemsById, setItemsById] = useState<Record<string, StatusBarEntry>>(
    {},
  );
  const [appearanceById, setAppearanceById] = useState<
    Record<string, StatusBarAppearance>
  >({});

  const setItem = useCallback((item: StatusBarEntry) => {
    setItemsById((prev) => {
      const current = prev[item.id];
      if (
        current != null &&
        current.alignment === item.alignment &&
        current.priority === item.priority &&
        current.title === item.title &&
        current.className === item.className &&
        current.interactive === item.interactive &&
        current.content === item.content
      ) {
        return prev;
      }
      return { ...prev, [item.id]: item };
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

  const setAppearance = useCallback(
    (id: string, nextAppearance: StatusBarAppearance | null) => {
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
    },
    [],
  );

  const items = useMemo(
    () =>
      Object.values(itemsById).sort((left, right) => {
        if (left.alignment !== right.alignment) {
          return left.alignment === "left" ? -1 : 1;
        }
        return left.alignment === "left"
          ? left.priority - right.priority
          : right.priority - left.priority;
      }),
    [itemsById],
  );

  const appearance = useMemo<StatusBarAppearance>(() => {
    if (Object.values(appearanceById).includes("active")) {
      return "active";
    }
    return "default";
  }, [appearanceById]);

  const value = useMemo<StatusBarContextValue>(
    () => ({ items, appearance }),
    [appearance, items],
  );
  const registryValue = useMemo<StatusBarRegistryContextValue>(
    () => ({ setItem, removeItem, setAppearance }),
    [removeItem, setAppearance, setItem],
  );

  return (
    <StatusBarRegistryContext.Provider value={registryValue}>
      <StatusBarContext.Provider value={value}>
        {children}
      </StatusBarContext.Provider>
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
  children,
}) => {
  const { removeItem, setItem } = useStatusBarRegistryContext();

  useEffect(() => {
    setItem({
      id,
      alignment,
      priority,
      title,
      className,
      interactive,
      content: children,
    });

    return () => {
      removeItem(id);
    };
  }, [
    alignment,
    children,
    className,
    id,
    interactive,
    priority,
    removeItem,
    setItem,
    title,
  ]);

  return null;
};

export const StatusBarMode: React.FC<StatusBarModeProps> = ({
  id,
  appearance,
}) => {
  const { setAppearance } = useStatusBarRegistryContext();

  useEffect(() => {
    setAppearance(id, appearance);

    return () => {
      setAppearance(id, null);
    };
  }, [appearance, id, setAppearance]);

  return null;
};

export const StatusBar: React.FC = () => {
  const { appearance, items } = useStatusBarContext();
  const leftItems = items.filter((item) => item.alignment === "left");
  const rightItems = items.filter((item) => item.alignment === "right");

  return (
    <footer className={`status-bar status-bar--${appearance}`}>
      <div className="status-bar__group status-bar__group--left">
        {leftItems.map((item) => (
          <div
            key={item.id}
            className={`status-bar__item${
              item.interactive ? " status-bar__item--interactive" : ""
            }${item.className ? ` ${item.className}` : ""}`}
            title={item.title}
          >
            {item.content}
          </div>
        ))}
      </div>
      <div className="status-bar__group status-bar__group--right">
        {rightItems.map((item) => (
          <div
            key={item.id}
            className={`status-bar__item${
              item.interactive ? " status-bar__item--interactive" : ""
            }${item.className ? ` ${item.className}` : ""}`}
            title={item.title}
          >
            {item.content}
          </div>
        ))}
      </div>
    </footer>
  );
};
