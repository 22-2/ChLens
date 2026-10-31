import { useMemo } from "react";
import type { useTabCommandRunner } from "src/features/tabs/browser/use-tab-command-runner";
import type { useToast } from "src/view/browser/hooks/use-toast";
import type { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import type { useTabPanes, useTabStore } from "src/view/browser/state/tabs/use-tab-store";
import type { ContextMenuItem } from "src/view/browser/ui/ContextMenu";
import type { OmnibarSuggestion } from "src/view/browser/utils/omnibar";

import {
  buildOmnibarSuggestionMenuEntries,
  type OmnibarSuggestionMenuEntry,
} from "./omnibar-suggestion-menu";
import {
  type OmnibarSuggestionMenuDeps,
  runOmnibarSuggestionMenuAction,
} from "./omnibar-suggestion-menu-actions";
import type { useOmnibarNavigation } from "./use-omnibar-navigation";

export interface MenuPosition {
  x: number;
  y: number;
}

export interface SuggestionMenuState extends MenuPosition {
  suggestion: OmnibarSuggestion;
}

function toContextMenuItem(
  entry: OmnibarSuggestionMenuEntry,
  deps: OmnibarSuggestionMenuDeps,
): ContextMenuItem {
  if ("separator" in entry) return { id: entry.id, separator: true };

  const { action, ...item } = entry;
  return { ...item, onSelect: () => runOmnibarSuggestionMenuAction(action, deps) };
}

/** オムニバーの候補を右クリックしたときのメニュー項目を返す。項目の組み立てと実行は別モジュールに分けている。 */
export function useOmnibarSuggestionMenuItems({
  suggestionMenuState,
  openSuggestion,
  dispatch,
  panes,
  runTabCommand,
  toast,
  viewSurface,
}: {
  suggestionMenuState: SuggestionMenuState | null;
  openSuggestion: ReturnType<typeof useOmnibarNavigation>["openSuggestion"];
  dispatch: ReturnType<typeof useTabStore>["dispatch"];
  panes: ReturnType<typeof useTabPanes>["panes"];
  runTabCommand: ReturnType<typeof useTabCommandRunner>;
  toast: ReturnType<typeof useToast>;
  viewSurface: ReturnType<typeof useViewSurface>;
}): ContextMenuItem[] {
  return useMemo<ContextMenuItem[]>(() => {
    if (!suggestionMenuState) return [];

    const deps: OmnibarSuggestionMenuDeps = {
      openSuggestion,
      dispatch,
      runTabCommand,
      toast,
      viewSurface,
    };
    return buildOmnibarSuggestionMenuEntries(suggestionMenuState.suggestion, panes).map((entry) =>
      toContextMenuItem(entry, deps),
    );
  }, [dispatch, openSuggestion, panes, runTabCommand, suggestionMenuState, toast, viewSurface]);
}
