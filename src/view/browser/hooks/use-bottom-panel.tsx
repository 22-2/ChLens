import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getStore2String, setStore2String } from "src/app/Store2Storage";

export interface PanelTab {
  id: string;
  label: string;
}

export interface WritePanelInsertRequest {
  id: number;
  text: string;
}

const STORAGE_KEY = "chlens_bottom_panel_v1";
const DEFAULT_HEIGHT = 200;
const MIN_HEIGHT = 80;
const MAX_HEIGHT = 600;

// 追加するタブはここに加えるだけでパネルに反映される
export const BOTTOM_PANEL_TABS: PanelTab[] = [{ id: "write", label: "書き込み" }];

interface SavedState {
  isOpen?: boolean;
  height?: number;
  activeTabId?: string;
}

function loadSaved(): SavedState {
  try {
    const raw = getStore2String(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as SavedState;
  } catch {
    // パース失敗は無視
  }
  return {};
}

function persist(patch: SavedState): void {
  try {
    const prev = loadSaved();
    void setStore2String(STORAGE_KEY, JSON.stringify({ ...prev, ...patch }));
  } catch {
    // 書き込み失敗は無視
  }
}

interface BottomPanelContextValue {
  isOpen: boolean;
  height: number;
  activeTabId: string;
  tabs: PanelTab[];
  writePanelInsertRequest: WritePanelInsertRequest | null;
  openPanel: (tabId?: string) => void;
  openWritePanelWithText: (text: string) => void;
  closePanel: () => void;
  togglePanel: (tabId?: string) => void;
  setHeight: (h: number) => void;
  setActiveTab: (id: string) => void;
  clearWritePanelInsertRequest: (requestId: number) => void;
}

const BottomPanelContext = createContext<BottomPanelContextValue | null>(null);

export const BottomPanelProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const saved = loadSaved();
  const nextWritePanelInsertIdRef = useRef(0);
  const [isOpen, setIsOpen] = useState(saved.isOpen ?? false);
  const [height, setHeightState] = useState(() =>
    Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, saved.height ?? DEFAULT_HEIGHT)),
  );
  const [activeTabId, setActiveTabIdState] = useState(saved.activeTabId ?? BOTTOM_PANEL_TABS[0].id);
  const [writePanelInsertRequest, setWritePanelInsertRequest] =
    useState<WritePanelInsertRequest | null>(null);

  const setHeight = useCallback((h: number) => {
    const clamped = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, h));
    setHeightState(clamped);
    persist({ height: clamped });
  }, []);

  const setActiveTab = useCallback((id: string) => {
    setActiveTabIdState(id);
    persist({ activeTabId: id });
  }, []);

  const openPanel = useCallback((tabId?: string) => {
    setIsOpen(true);
    persist({ isOpen: true });
    if (tabId) {
      setActiveTabIdState(tabId);
      persist({ activeTabId: tabId });
    }
  }, []);

  const openWritePanelWithText = useCallback(
    (text: string) => {
      // 変更理由: 右クリックの「返信」はクリップボード経由だと既存入力を壊しやすいため、
      // 書き込みパネルを開いたうえで本文へ直接追記できる要求として扱う。
      openPanel("write");
      nextWritePanelInsertIdRef.current += 1;
      setWritePanelInsertRequest({
        id: nextWritePanelInsertIdRef.current,
        text,
      });
    },
    [openPanel],
  );

  const closePanel = useCallback(() => {
    setIsOpen(false);
    persist({ isOpen: false });
  }, []);

  const togglePanel = useCallback((tabId?: string) => {
    setIsOpen((prev) => {
      const next = !prev;
      persist({ isOpen: next });
      return next;
    });
    if (tabId) {
      setActiveTabIdState(tabId);
      persist({ activeTabId: tabId });
    }
  }, []);

  const clearWritePanelInsertRequest = useCallback((requestId: number) => {
    setWritePanelInsertRequest((prev) => {
      if (prev?.id !== requestId) {
        return prev;
      }
      return null;
    });
  }, []);

  return (
    <BottomPanelContext.Provider
      value={{
        isOpen,
        height,
        activeTabId,
        tabs: BOTTOM_PANEL_TABS,
        writePanelInsertRequest,
        openPanel,
        openWritePanelWithText,
        closePanel,
        togglePanel,
        setHeight,
        setActiveTab,
        clearWritePanelInsertRequest,
      }}
    >
      {children}
    </BottomPanelContext.Provider>
  );
};

export function useBottomPanel(): BottomPanelContextValue {
  const ctx = useContext(BottomPanelContext);
  if (!ctx) {
    throw new Error("useBottomPanel must be used within BottomPanelProvider");
  }
  return ctx;
}
