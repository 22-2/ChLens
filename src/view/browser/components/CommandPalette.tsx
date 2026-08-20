import { Search } from "lucide-react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { container } from "src/service-container";
import {
  executeBrowserCommand,
  getBrowserCommandLabel,
  resolveBrowserCommands,
  type BrowserCommandContext,
} from "src/view/browser/commands/browser-commands";
import {
  addRecentCommandId,
  normalizeRecentCommandIds,
} from "src/view/browser/commands/command-history";
import {
  loadRecentCommandIds,
  saveRecentCommandIds,
} from "src/view/browser/commands/command-palette-history";
import {
  commandPalette,
  commandPaletteStore,
} from "src/view/browser/commands/command-palette-store";
import { filterAndSortBrowserCommands } from "src/view/browser/commands/command-search";
import { useBottomPanel } from "src/view/browser/hooks/use-bottom-panel";
import { useTabPanes, useTabStore } from "src/view/browser/hooks/use-tab-store";
import { Button } from "src/view/browser/ui/Button";
import { Dialog } from "src/view/browser/ui/Dialog";
import { requestThreadResJump } from "src/view/browser/utils/thread-read-state";

function parseResponseJumpResNum(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;

  const resNum = Number.parseInt(value, 10);
  return Number.isSafeInteger(resNum) && resNum > 0 ? resNum : null;
}

export const CommandPalette: React.FC = () => {
  const { state, activeTab, currentPage, dispatch } = useTabStore();
  const { panes } = useTabPanes();
  const { isOpen: isWritePanelOpen, togglePanel } = useBottomPanel();
  const paletteState = useSyncExternalStore(
    commandPaletteStore.subscribe,
    commandPaletteStore.getState,
    commandPaletteStore.getState,
  );
  const [runningCommandIds, setRunningCommandIds] = useState<Set<string>>(() => new Set());
  const [isResponseJumpDialogOpen, setIsResponseJumpDialogOpen] = useState(false);
  const [responseJumpValue, setResponseJumpValue] = useState("");
  const [responseJumpError, setResponseJumpError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [recentCommandIds, setRecentCommandIds] = useState<string[]>([]);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const recentCommandIdsRef = useRef(recentCommandIds);
  recentCommandIdsRef.current = recentCommandIds;

  useEffect(() => {
    setPortalContainer(document.querySelector<HTMLElement>(".browser-shell"));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadRecentCommandIds().then((loaded) => {
      if (cancelled) return;
      // 保存済み履歴の読み込み前にコマンドを実行しても、その実行を古い履歴で
      // 上書きしないよう、現在のメモリ上の履歴を優先して結合する。
      const merged = normalizeRecentCommandIds([...recentCommandIdsRef.current, ...loaded]);
      recentCommandIdsRef.current = merged;
      setRecentCommandIds(merged);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.key.toLowerCase() !== "p") {
        return;
      }
      event.preventDefault();
      commandPalette.toggle();
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  const openResponseJumpDialog = useCallback(() => {
    if (currentPage.type !== "thread") return;

    // コマンド実行後にパレットを確実に閉じ、数値入力へ操作を引き継ぐ。
    commandPalette.close();
    setResponseJumpValue("");
    setResponseJumpError(null);
    setIsResponseJumpDialogOpen(true);
  }, [currentPage.type]);

  const closeResponseJumpDialog = useCallback(() => {
    setIsResponseJumpDialogOpen(false);
    setResponseJumpError(null);
  }, []);

  const submitResponseJump = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (currentPage.type !== "thread") return;

      const resNum = parseResponseJumpResNum(responseJumpValue);
      if (resNum == null) {
        setResponseJumpError("1以上のレス番号を入力してください");
        return;
      }

      requestThreadResJump(currentPage.threadUrl, resNum);
      closeResponseJumpDialog();
    },
    [closeResponseJumpDialog, currentPage, responseJumpValue],
  );

  const context = useMemo<BrowserCommandContext>(
    () => ({
      currentPage,
      activeTab,
      tabs: state.tabs,
      isTwoPane: panes.length >= 2,
      isWritePanelOpen,
      dispatch,
      toggleWritePanel: () => togglePanel("write"),
      openResponseJumpDialog,
    }),
    [
      activeTab,
      currentPage,
      dispatch,
      isWritePanelOpen,
      openResponseJumpDialog,
      panes.length,
      state.tabs,
      togglePanel,
    ],
  );
  const contextRef = useRef(context);
  contextRef.current = context;

  const commands = useMemo(
    () => resolveBrowserCommands(context, runningCommandIds),
    [context, runningCommandIds],
  );
  const filteredCommands = useMemo(
    () => filterAndSortBrowserCommands(commands, query, recentCommandIds),
    [commands, query, recentCommandIds],
  );

  const recordCommand = useCallback((commandId: string) => {
    const next = addRecentCommandId(recentCommandIdsRef.current, commandId);
    recentCommandIdsRef.current = next;
    setRecentCommandIds(next);
    void saveRecentCommandIds(next);
  }, []);

  const filteredCommandsRef = useRef(filteredCommands);
  filteredCommandsRef.current = filteredCommands;
  useEffect(() => {
    if (!paletteState.opened) return;
    const frame = window.requestAnimationFrame(() => {
      const selected = filteredCommandsRef.current.findIndex((command) => command.enabled);
      if (commandPaletteStore.getState().selected === selected) return;
      commandPaletteStore.updateState((current) => ({ ...current, selected }));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [paletteState.opened, query]);

  const execute = useCallback(
    async (commandId: string) => {
      commandPalette.close();
      recordCommand(commandId);
      setRunningCommandIds((current) => {
        if (current.has(commandId)) return current;
        return new Set(current).add(commandId);
      });

      const currentContext = contextRef.current;
      try {
        await executeBrowserCommand(commandId, currentContext);
      } catch (error: unknown) {
        const label = getBrowserCommandLabel(commandId, currentContext);
        // コマンドIDとページ種別を残し、複数機能を集約したパレットの失敗元を追跡できるようにする。
        console.error("Browser command execution failed", {
          commandId,
          pageType: currentContext.currentPage.type,
          error,
        });
        container.toast.error(`${label}に失敗しました`);
      } finally {
        setRunningCommandIds((current) => {
          if (!current.has(commandId)) return current;
          const next = new Set(current);
          next.delete(commandId);
          return next;
        });
      }
    },
    [recordCommand],
  );

  const enabledCommandIndexes = useMemo(
    () => filteredCommands.flatMap((command, index) => (command.enabled ? [index] : [])),
    [filteredCommands],
  );

  const moveSelection = useCallback(
    (direction: 1 | -1) => {
      if (enabledCommandIndexes.length === 0) return;
      const currentPosition = enabledCommandIndexes.indexOf(paletteState.selected);
      const nextPosition =
        currentPosition < 0
          ? direction > 0
            ? 0
            : enabledCommandIndexes.length - 1
          : (currentPosition + direction + enabledCommandIndexes.length) %
            enabledCommandIndexes.length;
      commandPaletteStore.updateState((current) => ({
        ...current,
        selected: enabledCommandIndexes[nextPosition],
      }));
    },
    [enabledCommandIndexes, paletteState.selected],
  );

  const handleSearchKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveSelection(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        moveSelection(-1);
      } else if (event.key === "Enter") {
        const command = filteredCommands[paletteState.selected];
        if (command?.enabled) {
          event.preventDefault();
          void execute(command.id);
        }
      }
    },
    [execute, filteredCommands, moveSelection, paletteState.selected],
  );

  return (
    <>
      <Dialog.Root
        open={paletteState.opened}
        onOpenChange={(open) => (open ? commandPalette.open() : commandPalette.close())}
      >
        <Dialog.Portal container={portalContainer ?? undefined}>
          <Dialog.Overlay className="browser-dialog-overlay" />
          <Dialog.Content className="browser-dialog-content command-palette__content">
            <Dialog.Title className="command-palette__title">コマンドパレット</Dialog.Title>
            <Dialog.Description className="command-palette__description">
              実行する操作を検索します
            </Dialog.Description>
            <div className="command-palette__search-wrapper">
              <Search size={17} aria-hidden="true" />
              <input
                autoFocus
                className="command-palette__search"
                aria-label="コマンドを検索"
                placeholder="コマンドを検索..."
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                onKeyDown={handleSearchKeyDown}
              />
            </div>
            {filteredCommands.length > 0 ? (
              <div
                id="command-palette-actions"
                className="command-palette__actions-list"
                role="listbox"
                aria-label="コマンド一覧"
              >
                {filteredCommands.map((command, index) => {
                  const Icon = command.icon;
                  const selected = paletteState.selected === index;
                  return (
                    <button
                      key={command.id}
                      id={command.id}
                      type="button"
                      data-action
                      data-selected={selected ? "true" : undefined}
                      className="command-palette__action"
                      aria-label={`${command.label} (${command.englishLabel})`}
                      disabled={!command.enabled}
                      onMouseEnter={() =>
                        commandPaletteStore.updateState((current) => ({
                          ...current,
                          selected: index,
                        }))
                      }
                      onClick={() => void execute(command.id)}
                    >
                      <span
                        className="command-palette__action-section"
                        data-position="left"
                        aria-hidden="true"
                      >
                        <Icon size={16} />
                      </span>
                      <span className="command-palette__action-body">
                        <span className="command-palette__action-label">{command.label}</span>
                      </span>
                      <span className="command-palette__action-section" data-position="right">
                        <span className="command-palette__english-label">
                          {command.englishLabel}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="command-palette__empty">該当するコマンドがありません</div>
            )}
            <div className="command-palette__footer">
              <span>コマンド</span>
              <span className="command-palette__result-count">
                {filteredCommands.length} / {commands.length}
              </span>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={isResponseJumpDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeResponseJumpDialog();
        }}
      >
        <Dialog.Portal container={portalContainer ?? undefined}>
          <Dialog.Overlay
            className="browser-dialog-overlay"
            style={{ zIndex: "calc(var(--sys-z-dialog) + 1)" }}
          />
          <Dialog.Content
            className="browser-dialog-content command-palette__dialog-content"
            style={{ zIndex: "calc(var(--sys-z-dialog) + 1)" }}
          >
            <Dialog.Title className="browser-dialog-title">レス番号へジャンプ</Dialog.Title>
            <form onSubmit={submitResponseJump}>
              <label className="command-palette__input-label" htmlFor="response-jump-number">
                レス番号
              </label>
              <input
                id="response-jump-number"
                autoFocus
                className="command-palette__input"
                placeholder="例: 42"
                inputMode="numeric"
                value={responseJumpValue}
                onChange={(event) => setResponseJumpValue(event.currentTarget.value)}
                aria-invalid={responseJumpError ? "true" : undefined}
                aria-describedby={responseJumpError ? "response-jump-error" : undefined}
              />
              {responseJumpError ? (
                <p id="response-jump-error" className="command-palette__input-error">
                  {responseJumpError}
                </p>
              ) : null}
              <Button type="submit" className="command-palette__submit">
                ジャンプ
              </Button>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
};
