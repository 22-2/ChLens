import React, {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useRef,
  useState,
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
  threadUrl?: string;
}

const STORAGE_KEY = "chlens_bottom_panel_v1";
export const DEFAULT_BOTTOM_PANEL_HEIGHT = 200;
const MIN_HEIGHT = 80;
// 画面高の半分で一覧を開けるよう、従来の上限を一般的な表示領域より余裕のある値にする。
const MAX_HEIGHT = 1000;
// 既存の保存状態にタブ情報がない場合は、従来の書き込みパネルを既定にして
// アップデート後も起動時の表示を変えない。
const DEFAULT_ACTIVE_PANEL_TAB_ID = BOTTOM_PANEL_WRITE_TAB_ID;
const DEFAULT_THREAD_LIST_AUTO_REFRESH_INTERVAL_SEC: ThreadListAutoRefreshIntervalSec = 30;

// 追加するタブはここに加えるだけでパネルに反映される
export const BOTTOM_PANEL_TABS: PanelTab[] = [
  { id: BOTTOM_PANEL_WRITE_TAB_ID, label: "書き込み" },
  { id: BOTTOM_PANEL_THREAD_LIST_TAB_ID, label: "スレ一覧" },
];

interface SavedState {
  isOpen?: boolean;
  height?: number;
  // 保存済み設定のキーは既存データとの互換性のため変更しない。
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
  activePanelTabId: string;
  threadListAutoRefreshEnabled: boolean;
  threadListAutoRefreshIntervalSec: ThreadListAutoRefreshIntervalSec;
  tabs: PanelTab[];
  writePanelInsertRequest: WritePanelInsertRequest | null;
  openPanel: (tabId?: string) => void;
  openWritePanelWithText: (text: string, threadUrl?: string) => void;
  closePanel: () => void;
  togglePanel: (tabId?: string, openHeight?: number) => void;
  setHeight: (h: number) => void;
  setActivePanelTab: (id: string) => void;
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
    Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, saved.height ?? DEFAULT_BOTTOM_PANEL_HEIGHT)),
  );
  const [activePanelTabId, setActivePanelTabIdState] = useState(() =>
    BOTTOM_PANEL_TABS.some((tab) => tab.id === saved.activeTabId)
      ? (saved.activeTabId ?? DEFAULT_ACTIVE_PANEL_TAB_ID)
      : DEFAULT_ACTIVE_PANEL_TAB_ID,
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

  const setActivePanelTab = useCallback((id: string) => {
    if (!BOTTOM_PANEL_TABS.some((tab) => tab.id === id)) {
      return;
    }
    setActivePanelTabIdState(id);
    persist({ activeTabId: id });
  }, []);

  const openPanel = useCallback((tabId?: string) => {
    setIsOpen(true);
    persist({ isOpen: true });
    if (tabId && BOTTOM_PANEL_TABS.some((tab) => tab.id === tabId)) {
      setActivePanelTabIdState(tabId);
      persist({ activeTabId: tabId });
    }
  }, []);

  const openWritePanelWithText = useCallback(
    (text: string, threadUrl?: string) => {
      // 変更理由: 右クリックの「返信」はクリップボード経由だと既存入力を壊しやすいため、
      // 書き込みパネルを開いたうえで本文へ直接追記できる要求として扱う。
      openPanel(BOTTOM_PANEL_WRITE_TAB_ID);
      nextWritePanelInsertIdRef.current += 1;
      setWritePanelInsertRequest({
        id: nextWritePanelInsertIdRef.current,
        text,
        threadUrl,
      });
    },
    [openPanel],
  );

  const closePanel = useCallback(() => {
    setIsOpen(false);
    persist({ isOpen: false });
  }, []);

  const togglePanel = useCallback(
    (tabId?: string, openHeight?: number) => {
      if (tabId) {
        if (!BOTTOM_PANEL_TABS.some((tab) => tab.id === tabId)) {
          return;
        }

        // 別タブのボタンはパネルを閉じずに内容だけ切り替え、同じボタンだけを開閉に使う。
        // 書き込みとスレ一覧をどちらも1クリックで開けるようにするための挙動。
        if (activePanelTabId !== tabId) {
          setActivePanelTabIdState(tabId);
          const patch: SavedState = { activeTabId: tabId, isOpen: true };
          if (openHeight !== undefined) {
            const clamped = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, openHeight));
            setHeightState(clamped);
            patch.height = clamped;
          }
          persist(patch);
          setIsOpen(true);
          return;
        }
      }

      // サイズ指定はパネルを開く操作にだけ適用し、閉じるクリックで高さ設定を変えない。
      const next = !isOpen;
      if (next && openHeight !== undefined) {
        const clamped = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, openHeight));
        setHeightState(clamped);
        persist({ height: clamped });
      }
      setIsOpen(next);
      persist({ isOpen: next });
    },
    [activePanelTabId, isOpen],
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
        activePanelTabId,
        threadListAutoRefreshEnabled,
        threadListAutoRefreshIntervalSec,
        tabs: BOTTOM_PANEL_TABS,
        writePanelInsertRequest,
        openPanel,
        openWritePanelWithText,
        closePanel,
        togglePanel,
        setHeight,
        setActivePanelTab,
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

// 別窓のポータルはペイン配下のBottomPanelProviderを持たないため、
// 書き込みUIの表示場所を移しても同じコンポーネントを再利用できるようにする。
export function useOptionalBottomPanel(): BottomPanelContextValue | null {
  return useContext(BottomPanelContext);
}
