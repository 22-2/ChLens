import { Spotlight, type SpotlightActionGroupData } from "@mantine/spotlight";
import { Search } from "lucide-react";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { container } from "src/service-container";
import {
  BROWSER_COMMAND_GROUP_LABELS,
  BROWSER_COMMAND_GROUP_ORDER,
  executeBrowserCommand,
  getBrowserCommandLabel,
  resolveBrowserCommands,
  type BrowserCommandContext,
} from "src/view/browser/commands/browser-commands";
import { useBottomPanel } from "src/view/browser/hooks/use-bottom-panel";
import { useTabPanes, useTabStore } from "src/view/browser/hooks/use-tab-store";

export const CommandPalette: React.FC = () => {
  const { state, activeTab, currentPage, dispatch } = useTabStore();
  const { panes } = useTabPanes();
  const { isOpen: isWritePanelOpen, togglePanel } = useBottomPanel();
  const [runningCommandIds, setRunningCommandIds] = useState<Set<string>>(
    () => new Set(),
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
    }),
    [
      activeTab,
      currentPage,
      dispatch,
      isWritePanelOpen,
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

  const execute = useCallback(async (commandId: string) => {
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
  }, []);

  const actions = useMemo<SpotlightActionGroupData[]>(
    () =>
      BROWSER_COMMAND_GROUP_ORDER.map((group) => ({
        group: BROWSER_COMMAND_GROUP_LABELS[group],
        actions: commands
          .filter((command) => command.group === group)
          .map((command) => {
            const Icon = command.icon;
            return {
              id: command.id,
              label: command.label,
              description: command.description,
              keywords: [...command.keywords],
              disabled: !command.enabled,
              leftSection: <Icon size={18} />,
              onClick: () => void execute(command.id),
            };
          }),
      })).filter((group) => group.actions.length > 0),
    [commands, execute],
  );

  return (
    <Spotlight
      actions={actions}
      shortcut="mod + shift + P"
      nothingFound="該当するコマンドがありません"
      highlightQuery
      scrollable
      maxHeight="min(420px, 60vh)"
      size={560}
      yOffset={72}
      zIndex={40000}
      searchProps={{
        "aria-label": "コマンドを検索",
        placeholder: "コマンドを検索...",
        leftSection: <Search size={18} />,
      }}
    />
  );
};
