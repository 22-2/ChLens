import React, {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getStore2String, setStore2String } from "src/app/Store2Storage";
import {
  type DetachedWindowOptions,
  useDetachedWindow,
} from "src/view/browser/hooks/use-detached-window";
import { useTabPanes, useTabStore } from "src/view/browser/hooks/use-tab-store";
import type { Page, Tab } from "src/view/browser/types";
import { getCurrentPage } from "src/view/browser/types";

const STORAGE_KEY = "chlens_write_session_v1";

export interface WriteTarget {
  threadUrl: string;
  title: string;
  paneId: string;
  tabId: string;
}

interface SavedWriteSession {
  selectedThreadUrl?: string | null;
}

interface WriteSessionState {
  selectedThreadUrl: string | null;
  drafts: Record<string, string>;
}

interface WriteSessionContextValue {
  selectedThreadUrl: string | null;
  targets: WriteTarget[];
  isWindowOpen: boolean;
  writeWindowRoot: HTMLElement | null;
  getDraft: (threadUrl: string) => string;
  selectThread: (threadUrl: string) => void;
  setDraft: (threadUrl: string, message: string) => void;
  appendDraft: (threadUrl: string, text: string) => void;
  openWriteWindow: () => void;
  closeWriteWindow: () => void;
}

const WRITE_WINDOW_OPTIONS: DetachedWindowOptions = {
  name: "chlens-write-window",
  features: "popup,width=720,height=520,resizable=yes",
  title: "書き込み - read.crx 2",
  shellClassName: "write-window-shell",
  logLabel: "WriteSession",
};

function loadSession(): WriteSessionState {
  try {
    const raw = getStore2String(STORAGE_KEY);
    if (!raw) {
      return { selectedThreadUrl: null, drafts: {} };
    }

    const saved = JSON.parse(raw) as SavedWriteSession;
    return {
      selectedThreadUrl:
        typeof saved.selectedThreadUrl === "string" ? saved.selectedThreadUrl : null,
      // 変更理由: 保存済みの下書きを復元すると、別窓や別スレを開いた直後に
      // 意図しない本文を投稿する危険があるため、旧形式のdraftsも復元しない。
      drafts: {},
    };
  } catch (error) {
    console.error("[WriteSession] 書き込みセッションの復元に失敗しました", error);
    return { selectedThreadUrl: null, drafts: {} };
  }
}

function getThreadPage(tab: Tab): Extract<Page, { type: "thread" }> | null {
  const page = getCurrentPage(tab);
  return page.type === "thread" ? page : null;
}

function collectWriteTargets(
  panes: ReadonlyArray<{ id: string; tabs: Tab[] }>,
  activePaneId: string,
): WriteTarget[] {
  const targets: WriteTarget[] = [];
  const seen = new Set<string>();
  const orderedPanes = [...panes].sort((left, right) => {
    if (left.id === activePaneId) return -1;
    if (right.id === activePaneId) return 1;
    return 0;
  });

  for (const pane of orderedPanes) {
    for (const tab of pane.tabs) {
      const page = getThreadPage(tab);
      if (!page || seen.has(page.threadUrl)) {
        continue;
      }

      seen.add(page.threadUrl);
      targets.push({
        threadUrl: page.threadUrl,
        title: page.title.trim() || page.threadUrl,
        paneId: pane.id,
        tabId: tab.id,
      });
    }
  }

  return targets;
}

const defaultContextValue: WriteSessionContextValue = {
  selectedThreadUrl: null,
  targets: [],
  isWindowOpen: false,
  writeWindowRoot: null,
  getDraft: () => "",
  selectThread: () => {},
  setDraft: () => {},
  appendDraft: () => {},
  openWriteWindow: () => {},
  closeWriteWindow: () => {},
};

const WriteSessionContext = createContext<WriteSessionContextValue>(defaultContextValue);

/**
 * アプリ全体で1つだけ存在する書き込みセッションを提供する。
 *
 * 変更理由: 書き込み欄をペインの現在タブへ直接結び付けると、別窓へ移したときに
 * 投稿先と下書きが表示場所ごとに分裂する。投稿先をURL単位で共有しておくことで、
 * 下部パネルから別窓へ表示場所を移しても同じセッションを表示できる。
 */
export const WriteSessionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { panes, activePaneId } = useTabPanes();
  const { currentPage } = useTabStore();
  const [session, setSession] = useState<WriteSessionState>(loadSession);
  const detachedWindow = useDetachedWindow(WRITE_WINDOW_OPTIONS);

  const targets = useMemo(() => collectWriteTargets(panes, activePaneId), [activePaneId, panes]);

  useEffect(() => {
    const currentTargetIsAvailable =
      session.selectedThreadUrl != null &&
      targets.some((target) => target.threadUrl === session.selectedThreadUrl);
    if (currentTargetIsAvailable) {
      return;
    }

    const fallbackTarget =
      currentPage.type === "thread" &&
      targets.some((target) => target.threadUrl === currentPage.threadUrl)
        ? currentPage.threadUrl
        : (targets[0]?.threadUrl ?? null);

    if (fallbackTarget !== session.selectedThreadUrl) {
      setSession((previous) => ({ ...previous, selectedThreadUrl: fallbackTarget }));
    }
  }, [currentPage, session.selectedThreadUrl, targets]);

  useEffect(() => {
    // 変更理由: 投稿先の選択だけは再起動後も扱いやすく保つ一方、本文は保存しない。
    // 下書きをストレージへ書かないことで、古い窓や別スレへの誤投稿を防ぐ。
    void setStore2String(
      STORAGE_KEY,
      JSON.stringify({ selectedThreadUrl: session.selectedThreadUrl }),
    ).catch((error: unknown) => {
      console.error("[WriteSession] 書き込みセッションの保存に失敗しました", error);
    });
  }, [session.selectedThreadUrl]);

  const selectThread = useCallback((threadUrl: string) => {
    setSession((previous) => ({ ...previous, selectedThreadUrl: threadUrl }));
  }, []);

  const getDraft = useCallback(
    (threadUrl: string) => (threadUrl ? (session.drafts[threadUrl] ?? "") : ""),
    [session.drafts],
  );

  const setDraft = useCallback((threadUrl: string, message: string) => {
    if (!threadUrl) {
      return;
    }

    setSession((previous) => {
      const drafts = { ...previous.drafts };
      if (message === "") {
        // 変更理由: 投稿済みの本文を空文字のまま蓄積すると、スレッド数に比例して
        // セッション保存領域だけが増え続けるため、空になった下書きはキーごと除去する。
        delete drafts[threadUrl];
      } else {
        drafts[threadUrl] = message;
      }
      return { ...previous, drafts };
    });
  }, []);

  const appendDraft = useCallback((threadUrl: string, text: string) => {
    if (!threadUrl || !text) {
      return;
    }

    setSession((previous) => {
      const currentMessage = previous.drafts[threadUrl] ?? "";
      const separator = currentMessage === "" || currentMessage.endsWith("\n") ? "" : "\n";
      return {
        ...previous,
        selectedThreadUrl: threadUrl,
        drafts: { ...previous.drafts, [threadUrl]: `${currentMessage}${separator}${text}` },
      };
    });
  }, []);

  const contextValue = useMemo<WriteSessionContextValue>(
    () => ({
      selectedThreadUrl: session.selectedThreadUrl,
      targets,
      isWindowOpen: detachedWindow.isOpen,
      writeWindowRoot: detachedWindow.root,
      getDraft,
      selectThread,
      setDraft,
      appendDraft,
      openWriteWindow: detachedWindow.open,
      closeWriteWindow: detachedWindow.close,
    }),
    [
      appendDraft,
      detachedWindow.close,
      getDraft,
      detachedWindow.open,
      selectThread,
      session.selectedThreadUrl,
      setDraft,
      targets,
      detachedWindow.isOpen,
      detachedWindow.root,
    ],
  );

  return (
    <WriteSessionContext.Provider value={contextValue}>{children}</WriteSessionContext.Provider>
  );
};

export function useWriteSession(): WriteSessionContextValue {
  return useContext(WriteSessionContext);
}
