import { Button, Modal, TextInput } from "@mantine/core";
import { Spotlight } from "@mantine/spotlight";
import { Search } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const [runningCommandIds, setRunningCommandIds] = useState<Set<string>>(() => new Set());
  const [isResponseJumpDialogOpen, setIsResponseJumpDialogOpen] = useState(false);
  const [responseJumpValue, setResponseJumpValue] = useState("");
  const [responseJumpError, setResponseJumpError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [recentCommandIds, setRecentCommandIds] = useState<string[]>([]);
  const recentCommandIdsRef = useRef(recentCommandIds);
  recentCommandIdsRef.current = recentCommandIds;

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

  const openResponseJumpDialog = useCallback(() => {
    if (currentPage.type !== "thread") return;

    // コマンド実行後にSpotlightを確実に閉じ、数値入力へ操作を引き継ぐ。
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

  const selectFirstCommand = useCallback(() => {
    window.requestAnimationFrame(() => {
      const list = document.getElementById("command-palette-actions");
      const firstAction = list?.querySelector<HTMLElement>("[data-action]:not([disabled])");
      if (!firstAction) return;

      list?.querySelector("[data-selected]")?.removeAttribute("data-selected");
      firstAction.setAttribute("data-selected", "true");
      commandPaletteStore.updateState((current) => ({
        ...current,
        selected: 0,
      }));
    });
  }, []);

  useEffect(() => {
    if (!commandPaletteStore.getState().opened) return;
    selectFirstCommand();
  }, [filteredCommands, selectFirstCommand]);

  const execute = useCallback(
    async (commandId: string) => {
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
        // 変更理由: コマンドパレットは多種類の処理を集約するため、失敗時に
        // コマンドIDとページ種別を残さないと発生元を追跡できない。
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

  return (
    <>
      <Spotlight.Root
        store={commandPaletteStore}
        query={query}
        onQueryChange={setQuery}
        onSpotlightOpen={selectFirstCommand}
        shortcut="mod + shift + P"
        scrollable
        maxHeight="min(480px, 60vh)"
        size={800}
        yOffset={48}
        zIndex={40000}
        classNames={{
          content: "command-palette__content",
          search: "command-palette__search",
          actionsList: "command-palette__actions-list",
          action: "command-palette__action",
          actionBody: "command-palette__action-body",
          actionLabel: "command-palette__action-label",
          actionSection: "command-palette__action-section",
          empty: "command-palette__empty",
          footer: "command-palette__footer",
        }}
      >
        <Spotlight.Search
          aria-label="コマンドを検索"
          placeholder="コマンドを検索..."
          leftSection={<Search size={17} />}
        />
        {filteredCommands.length > 0 ? (
          <Spotlight.ActionsList id="command-palette-actions">
            {filteredCommands.map((command) => {
              const Icon = command.icon;
              return (
                <Spotlight.Action
                  key={command.id}
                  id={command.id}
                  label={command.label}
                  aria-label={`${command.label} (${command.englishLabel})`}
                  highlightQuery
                  disabled={!command.enabled}
                  leftSection={<Icon size={16} />}
                  rightSection={
                    <span className="command-palette__english-label">{command.englishLabel}</span>
                  }
                  onClick={() => void execute(command.id)}
                />
              );
            })}
          </Spotlight.ActionsList>
        ) : (
          <Spotlight.Empty>該当するコマンドがありません</Spotlight.Empty>
        )}
        <Spotlight.Footer>
          <span>コマンド</span>
          <span className="command-palette__result-count">
            {filteredCommands.length} / {commands.length}
          </span>
        </Spotlight.Footer>
      </Spotlight.Root>
      <Modal
        opened={isResponseJumpDialogOpen}
        onClose={closeResponseJumpDialog}
        title="レス番号へジャンプ"
        centered
        zIndex={40001}
      >
        <form onSubmit={submitResponseJump}>
          <TextInput
            autoFocus
            label="レス番号"
            placeholder="例: 42"
            inputMode="numeric"
            value={responseJumpValue}
            onChange={(event) => setResponseJumpValue(event.currentTarget.value)}
            error={responseJumpError}
          />
          <Button type="submit" mt="md" fullWidth>
            ジャンプ
          </Button>
        </form>
      </Modal>
    </>
  );
};
