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

export const BOTTOM_PANEL_THREAD_LIST_TAB_ID = "thread-list";
export const BOTTOM_PANEL_WRITE_TAB_ID = "write";
export const THREAD_LIST_AUTO_REFRESH_INTERVALS_SEC = [10, 15, 30, 60] as const;
export type ThreadListAutoRefreshIntervalSec =
  (typeof THREAD_LIST_AUTO_REFRESH_INTERVALS_SEC)[number];

export interface WritePanelInsertRequest {
  id: number;
  text: string;
}

const STORAGE_KEY = "chlens_bottom_panel_v1";
const DEFAULT_HEIGHT = 200;
const MIN_HEIGHT = 80;
const MAX_HEIGHT = 600;
// 既存の保存状態にタブ情報がない場合は、従来の書き込みパネルを既定にして
// アップデート後も起動時の表示を変えない。
const DEFAULT_ACTIVE_TAB_ID = BOTTOM_PANEL_WRITE_TAB_ID;
const DEFAULT_THREAD_LIST_AUTO_REFRESH_INTERVAL_SEC: ThreadListAutoRefreshIntervalSec = 30;

// 追加するタブはここに加えるだけでパネルに反映される
export const BOTTOM_PANEL_TABS: PanelTab[] = [
  { id: BOTTOM_PANEL_THREAD_LIST_TAB_ID, label: "スレ一覧" },
  { id: BOTTOM_PANEL_WRITE_TAB_ID, label: "書き込み" },
];

interface SavedState {
  isOpen?: boolean;
  height?: number;
  activeTabId?: string;
  threadListAutoRefreshEnabled?: boolean;
  threadListAutoRefreshIntervalSec?: number;
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
  threadListAutoRefreshEnabled: boolean;
  threadListAutoRefreshIntervalSec: ThreadListAutoRefreshIntervalSec;
  tabs: PanelTab[];
  writePanelInsertRequest: WritePanelInsertRequest | null;
  openPanel: (tabId?: string) => void;
  openWritePanelWithText: (text: string) => void;
  closePanel: () => void;
  togglePanel: (tabId?: string) => void;
  setHeight: (h: number) => void;
  setActiveTab: (id: string) => void;
  setThreadListAutoRefreshEnabled: (enabled: boolean) => void;
  setThreadListAutoRefreshIntervalSec: (seconds: number) => void;
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
  const [activeTabId, setActiveTabIdState] = useState(() =>
    BOTTOM_PANEL_TABS.some((tab) => tab.id === saved.activeTabId)
      ? (saved.activeTabId ?? DEFAULT_ACTIVE_TAB_ID)
      : DEFAULT_ACTIVE_TAB_ID,
  );
  const [threadListAutoRefreshEnabled, setThreadListAutoRefreshEnabledState] = useState(
    saved.threadListAutoRefreshEnabled ?? false,
  );
  const [threadListAutoRefreshIntervalSec, setThreadListAutoRefreshIntervalSecState] = useState(
    () =>
      THREAD_LIST_AUTO_REFRESH_INTERVALS_SEC.includes(
        saved.threadListAutoRefreshIntervalSec as ThreadListAutoRefreshIntervalSec,
      )
        ? (saved.threadListAutoRefreshIntervalSec as ThreadListAutoRefreshIntervalSec)
        : DEFAULT_THREAD_LIST_AUTO_REFRESH_INTERVAL_SEC,
  );
  const [writePanelInsertRequest, setWritePanelInsertRequest] =
    useState<WritePanelInsertRequest | null>(null);

  const setHeight = useCallback((h: number) => {
    const clamped = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, h));
    setHeightState(clamped);
    persist({ height: clamped });
  }, []);

  const setActiveTab = useCallback((id: string) => {
    if (!BOTTOM_PANEL_TABS.some((tab) => tab.id === id)) {
      return;
    }
    setActiveTabIdState(id);
    persist({ activeTabId: id });
  }, []);

  const openPanel = useCallback((tabId?: string) => {
    setIsOpen(true);
    persist({ isOpen: true });
    if (tabId && BOTTOM_PANEL_TABS.some((tab) => tab.id === tabId)) {
      setActiveTabIdState(tabId);
      persist({ activeTabId: tabId });
    }
  }, []);

  const openWritePanelWithText = useCallback(
    (text: string) => {
      // 変更理由: 右クリックの「返信」はクリップボード経由だと既存入力を壊しやすいため、
      // 書き込みパネルを開いたうえで本文へ直接追記できる要求として扱う。
      openPanel(BOTTOM_PANEL_WRITE_TAB_ID);
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

  const togglePanel = useCallback(
    (tabId?: string) => {
      if (tabId) {
        if (!BOTTOM_PANEL_TABS.some((tab) => tab.id === tabId)) {
          return;
        }

        // 別タブのボタンはパネルを閉じずに内容だけ切り替え、同じボタンだけを開閉に使う。
        // 書き込みとスレ一覧をどちらも1クリックで開けるようにするための挙動。
        if (activeTabId !== tabId) {
          setActiveTabIdState(tabId);
          persist({ activeTabId: tabId, isOpen: true });
          setIsOpen(true);
          return;
        }
      }

      setIsOpen((prev) => {
        const next = !prev;
        persist({ isOpen: next });
        return next;
      });
    },
    [activeTabId],
  );

  const setThreadListAutoRefreshEnabled = useCallback((enabled: boolean) => {
    setThreadListAutoRefreshEnabledState(enabled);
    persist({ threadListAutoRefreshEnabled: enabled });
  }, []);

  const setThreadListAutoRefreshIntervalSec = useCallback((seconds: number) => {
    if (
      !THREAD_LIST_AUTO_REFRESH_INTERVALS_SEC.includes(seconds as ThreadListAutoRefreshIntervalSec)
    ) {
      return;
    }

    const interval = seconds as ThreadListAutoRefreshIntervalSec;
    setThreadListAutoRefreshIntervalSecState(interval);
    persist({ threadListAutoRefreshIntervalSec: interval });
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
        threadListAutoRefreshEnabled,
        threadListAutoRefreshIntervalSec,
        tabs: BOTTOM_PANEL_TABS,
        writePanelInsertRequest,
        openPanel,
        openWritePanelWithText,
        closePanel,
        togglePanel,
        setHeight,
        setActiveTab,
        setThreadListAutoRefreshEnabled,
        setThreadListAutoRefreshIntervalSec,
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
