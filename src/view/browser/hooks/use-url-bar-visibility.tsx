import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type FC,
  type ReactNode,
} from "react";

interface UrlBarVisibilityContextValue {
  expandedPaneIds: ReadonlySet<string>;
  setExpanded: (paneId: string, expanded: boolean) => void;
}

const UrlBarVisibilityContext = createContext<UrlBarVisibilityContextValue>({
  expandedPaneIds: new Set<string>(),
  setExpanded: () => undefined,
});

export const UrlBarVisibilityProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [expandedPaneIds, setExpandedPaneIds] = useState<Set<string>>(() => new Set());

  const setExpanded = useCallback((paneId: string, expanded: boolean) => {
    setExpandedPaneIds((current) => {
      const next = new Set(current);
      if (expanded) {
        next.add(paneId);
      } else {
        next.delete(paneId);
      }

      if (next.size === current.size && [...next].every((id) => current.has(id))) {
        return current;
      }
      return next;
    });
  }, []);

  const value = useMemo(() => ({ expandedPaneIds, setExpanded }), [expandedPaneIds, setExpanded]);

  return (
    <UrlBarVisibilityContext.Provider value={value}>{children}</UrlBarVisibilityContext.Provider>
  );
};

export function useUrlBarVisibility(paneId?: string): {
  isAnyExpanded: boolean;
  isExpanded: boolean;
  setExpanded: (expanded: boolean) => void;
} {
  const context = useContext(UrlBarVisibilityContext);
  const { setExpanded: setExpandedInContext } = context;
  const setPaneExpanded = useCallback(
    (expanded: boolean) => {
      if (paneId) {
        setExpandedInContext(paneId, expanded);
      }
    },
    [paneId, setExpandedInContext],
  );

  return {
    isAnyExpanded: context.expandedPaneIds.size > 0,
    isExpanded: paneId ? context.expandedPaneIds.has(paneId) : false,
    setExpanded: setPaneExpanded,
  };
}
