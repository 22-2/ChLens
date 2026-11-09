import {
  type Dispatch,
  type FocusEvent,
  type KeyboardEvent,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createLogger } from "src/app/logger";
import type { ResolvedBrowserCommand } from "src/view/browser/commands/command-definition";
import { filterAndSortBrowserCommands } from "src/view/browser/commands/command-search";
import {
  buildOmnibarSuggestions,
  type OmnibarMergedEntry,
  type OmnibarSuggestion,
} from "src/view/browser/utils/omnibar";

const logger = createLogger("view/browser");

export type OmnibarInputMode =
  | "navigation"
  | "command"
  | "bookmark"
  | "board"
  | "history"
  | "writeHistory";
export type OmnibarSearchMode = Exclude<OmnibarInputMode, "navigation">;
export const OMNIBAR_MODES: ReadonlyArray<{
  id: OmnibarSearchMode;
  label: string;
  search: string;
  description: string;
}> = [
  { id: "command", label: "コマンド", search: "command", description: "操作を実行" },
  { id: "bookmark", label: "お気に入り", search: "bookmark", description: "保存したスレ・板" },
  { id: "board", label: "板", search: "board", description: "板一覧" },
  { id: "history", label: "閲覧履歴", search: "history", description: "最近開いたスレ・板" },
  { id: "writeHistory", label: "書き込み履歴", search: "write history", description: "自分の投稿" },
];

interface UseOmnibarOptions {
  displayUrl: string;
  maxSuggestions: number;
  loadEntries: () => Promise<OmnibarMergedEntry[]>;
  loadWriteHistory: () => Promise<OmnibarSuggestion[]>;
  onSelectSuggestion: (suggestion: OmnibarSuggestion) => void;
  onSubmitInput: (inputValue: string) => void;
  commands?: readonly ResolvedBrowserCommand[];
  recentCommandIds?: readonly string[];
  onSelectCommand?: (command: ResolvedBrowserCommand) => void;
  getDirectInputSuggestion?: (
    inputValue: string,
    displayUrl: string,
  ) => OmnibarSuggestion | OmnibarSuggestion[] | null;
}

interface UseOmnibarResult {
  inputValue: string;
  mode: OmnibarInputMode;
  isOpen: boolean;
  isLoading: boolean;
  suggestions: OmnibarSuggestion[];
  commandSuggestions: ResolvedBrowserCommand[];
  totalSuggestionCount: number;
  shouldShowNoMatch: boolean;
  activeSuggestionIndex: number;
  setActiveSuggestionIndex: Dispatch<SetStateAction<number>>;
  activate: (mode: OmnibarInputMode) => void;
  handleInputChange: (value: string) => void;
  handleKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  handleFocus: (e: FocusEvent<HTMLInputElement>) => void;
  handleBlur: () => void;
  handleSelectSuggestion: (suggestion: OmnibarSuggestion) => void;
  enterMode: (mode: OmnibarSearchMode) => void;
  returnToRoot: () => void;
  availableModes: typeof OMNIBAR_MODES;
}

/** 候補の選択位置を、現在の候補の中で有効な位置へ寄せる。 */
function resolveActiveSuggestionIndex({
  activeIndex,
  suggestionCount,
  isCommandMode,
  commandSuggestions,
}: {
  activeIndex: number;
  suggestionCount: number;
  isCommandMode: boolean;
  commandSuggestions: readonly { enabled: boolean }[];
}): number {
  if (activeIndex >= suggestionCount) {
    return 0;
  }
  if (isCommandMode && !commandSuggestions[activeIndex]?.enabled) {
    const firstEnabled = commandSuggestions.findIndex((command) => command.enabled);
    return firstEnabled >= 0 ? firstEnabled : 0;
  }
  return activeIndex;
}

export function useOmnibar({
  displayUrl,
  maxSuggestions,
  loadEntries,
  loadWriteHistory,
  onSelectSuggestion,
  onSubmitInput,
  commands = [],
  recentCommandIds = [],
  onSelectCommand = () => undefined,
  getDirectInputSuggestion,
}: UseOmnibarOptions): UseOmnibarResult {
  const [inputValue, setInputValue] = useState(displayUrl);
  const [isFocused, setIsFocused] = useState(false);
  const [omnibarEntries, setOmnibarEntries] = useState<OmnibarMergedEntry[]>([]);
  const [isOmnibarLoaded, setIsOmnibarLoaded] = useState(false);
  const [isOmnibarLoading, setIsOmnibarLoading] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [writeEntries, setWriteEntries] = useState<OmnibarSuggestion[]>([]);
  const [isWriteLoading, setIsWriteLoading] = useState(false);
  // 入力文字とは独立してモードを保持し、ルートへ戻る操作を可能にする。
  const [mode, setMode] = useState<OmnibarInputMode>("navigation");
  // フォーカス直後は現在のURLを選択状態で見せるだけで、候補の絞り込みには使わない。
  // 利用者が入力するまで空の検索語として扱い、通常の候補一覧を維持する。
  const [isInputPristine, setIsInputPristine] = useState(false);
  const [hasMovedSelection, setHasMovedSelection] = useState(false);
  // activate を安定した参照に保つため、最新の表示URLは ref から読む。
  // 参照が変わると、編集中に開いたパレットの effect が再実行されて入力が巻き戻る。
  const displayUrlRef = useRef(displayUrl);
  useEffect(() => {
    displayUrlRef.current = displayUrl;
  }, [displayUrl]);
  const searchQuery = isInputPristine ? "" : inputValue;
  const availableModes = useMemo(
    () =>
      mode === "navigation"
        ? OMNIBAR_MODES.filter((item) => {
            const query = searchQuery.trim().toLowerCase();
            return (
              !query || item.label.toLowerCase().includes(query) || item.search.includes(query)
            );
          })
        : [],
    [searchQuery, mode],
  );

  // 変更理由: 非フォーカス時の表示URLへの追従は描画中に行う。effect で行うと古い入力が一度描かれるため。
  // 条件は値が一致すると偽になるので、描画中の更新は一度で終わる。
  if (!isFocused && inputValue !== displayUrl) {
    setInputValue(displayUrl);
  }

  // コマンドモードでは履歴ソースを待たずに候補を表示し、ルートに戻った時だけ遅延ロードする。
  const needsOmnibarEntries =
    isFocused && mode !== "command" && mode !== "writeHistory" && !isOmnibarLoaded;
  // 取得中は前回の候補を保ち、初回だけ不確かな空結果の表示を避ける。
  if (needsOmnibarEntries && !isOmnibarLoading) {
    setIsOmnibarLoading(true);
  }

  useEffect(() => {
    if (!needsOmnibarEntries) {
      return;
    }

    let cancelled = false;
    void loadEntries()
      .then((entries) => {
        if (cancelled) {
          return;
        }
        setOmnibarEntries(entries);
        setIsOmnibarLoaded(true);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        // 変更理由: 候補取得に失敗してもURLの直接入力は継続できるようにしつつ、
        // 履歴・お気に入りが消えた原因はログから追跡できるようにする。
        logger.error("Failed to load omnibar entries", { error });
        setIsOmnibarLoaded(true);
      })
      .finally(() => {
        if (!cancelled) {
          setIsOmnibarLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loadEntries, needsOmnibarEntries]);

  // 変更理由: 履歴取得中にコマンドへ切り替えても、古いナビゲーション用spinnerで
  // コマンド候補を隠さず、入力モードの切り替えを即時に反映する。
  if ((mode === "command" || mode === "writeHistory") && isOmnibarLoading) {
    setIsOmnibarLoading(false);
  }

  useEffect(() => {
    if (!isFocused || mode !== "writeHistory") return;
    let cancelled = false;
    // 書き込み直後も反映するため、モードに入るたびに取得する。
    void Promise.resolve()
      .then(() => {
        if (!cancelled) setIsWriteLoading(true);
        return loadWriteHistory();
      })
      .then((entries) => {
        if (!cancelled) setWriteEntries(entries);
      })
      .catch((error: unknown) => {
        logger.error("書き込み履歴の取得に失敗しました", error);
      })
      .finally(() => {
        if (!cancelled) setIsWriteLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isFocused, loadWriteHistory, mode]);

  const navigationSuggestions = useMemo(() => {
    if (mode === "writeHistory") {
      const query = searchQuery.trim().toLowerCase();
      return writeEntries.filter((entry) =>
        [entry.title, entry.url, entry.message ?? ""].some((value) =>
          value.toLowerCase().includes(query),
        ),
      );
    }
    const entries =
      mode === "navigation"
        ? omnibarEntries
        : omnibarEntries.filter((entry) =>
            entry.sources.includes(mode as "bookmark" | "board" | "history"),
          );
    return buildOmnibarSuggestions(entries, searchQuery, Number.MAX_SAFE_INTEGER);
  }, [searchQuery, mode, omnibarEntries, writeEntries]);

  const directInputSuggestions = useMemo(() => {
    if (mode !== "navigation") {
      return [];
    }

    const result = getDirectInputSuggestion?.(searchQuery, displayUrl) ?? null;
    if (!result) {
      return [];
    }

    return Array.isArray(result) ? result : [result];
  }, [displayUrl, getDirectInputSuggestion, searchQuery, mode]);

  const allSuggestions = useMemo(() => {
    if (directInputSuggestions.length === 0) {
      return navigationSuggestions;
    }

    // 変更理由: 同一URLの履歴候補があるとき通常の「URLを開く」は重複のため隠すが、
    // 「新しいタブで開く」は明示的な別タブ要求なので残し、直入力の選択肢を保つ。
    const filteredDirect = directInputSuggestions.filter((direct) => {
      if (direct.openInNewTab) {
        return true;
      }

      return !navigationSuggestions.some(
        (suggestion) => suggestion.url.trim() === direct.url.trim(),
      );
    });

    if (filteredDirect.length === 0) {
      return navigationSuggestions;
    }

    // URLとして認識できた入力は、履歴候補と同じリスト内に「URLを開く」操作として置く。
    return [...filteredDirect, ...navigationSuggestions];
  }, [directInputSuggestions, navigationSuggestions]);
  const suggestions = useMemo(
    () => allSuggestions.slice(0, maxSuggestions),
    [allSuggestions, maxSuggestions],
  );

  const allCommandSuggestions = useMemo(
    () =>
      mode === "command"
        ? filterAndSortBrowserCommands(commands, searchQuery, recentCommandIds)
        : [],
    [commands, searchQuery, mode, recentCommandIds],
  );

  const commandSuggestions = useMemo(
    () => allCommandSuggestions.slice(0, maxSuggestions),
    [allCommandSuggestions, maxSuggestions],
  );
  // 全件数は表示上限を適用する前に数え、実際に並ぶモードと直入力も含める。
  const totalSuggestionCount =
    mode === "command"
      ? allCommandSuggestions.length
      : allSuggestions.length + availableModes.length;

  const activeSuggestionCount =
    mode === "command" ? commandSuggestions.length : suggestions.length + availableModes.length;

  // 候補が減ったときや無効なコマンドを選んでいるときは、描画中に有効な候補へ寄せる。
  // 結果が現在値と同じなら更新しないため、描画中の更新は繰り返されない。
  const resolvedSuggestionIndex = resolveActiveSuggestionIndex({
    activeIndex: activeSuggestionIndex,
    suggestionCount: activeSuggestionCount,
    isCommandMode: mode === "command",
    commandSuggestions,
  });
  if (resolvedSuggestionIndex !== activeSuggestionIndex) {
    setActiveSuggestionIndex(resolvedSuggestionIndex);
  }

  const shouldShowNoMatch =
    isFocused &&
    !isOmnibarLoading &&
    (mode !== "writeHistory" || !isWriteLoading) &&
    (mode !== "navigation" || searchQuery.trim().length > 0) &&
    activeSuggestionCount === 0;

  const isOpen =
    isFocused &&
    (isOmnibarLoading ||
      (mode === "writeHistory" && isWriteLoading) ||
      activeSuggestionCount > 0 ||
      shouldShowNoMatch);

  const enterMode = useCallback((nextMode: OmnibarSearchMode) => {
    setMode(nextMode);
    if (nextMode === "writeHistory") {
      setIsWriteLoading(true);
    }
    setInputValue("");
    setActiveSuggestionIndex(0);
  }, []);

  const returnToRoot = useCallback(() => {
    setMode("navigation");
    setInputValue("");
    // ルートの検索語は消えるため、絞り込み前の一覧で戻り先を探す。
    const modeIndex = OMNIBAR_MODES.findIndex((item) => item.id === mode);
    setActiveSuggestionIndex(Math.max(0, modeIndex));
  }, [mode]);

  const handleSelectSuggestion = useCallback(
    (suggestion: OmnibarSuggestion) => {
      onSelectSuggestion(suggestion);
      setInputValue(suggestion.url);
      setIsFocused(false);
      setActiveSuggestionIndex(0);
    },
    [onSelectSuggestion],
  );

  const handleSelectCommand = useCallback(
    (command: ResolvedBrowserCommand) => {
      if (!command.enabled) {
        return;
      }
      onSelectCommand(command);
      setInputValue(displayUrl);
      setIsFocused(false);
      setActiveSuggestionIndex(0);
    },
    [displayUrl, onSelectCommand],
  );

  const moveSelection = useCallback(
    (direction: 1 | -1) => {
      if (activeSuggestionCount === 0) {
        return;
      }

      const isSelectable = (index: number) =>
        mode !== "command" || commandSuggestions[index]?.enabled === true;
      // 端では折り返さず、無効なコマンドも飛ばして同じ方向へ探す。
      for (
        let index = activeSuggestionIndex + direction;
        index >= 0 && index < activeSuggestionCount;
        index += direction
      ) {
        if (isSelectable(index)) {
          setHasMovedSelection(true);
          setActiveSuggestionIndex(index);
          return;
        }
      }
    },
    [activeSuggestionCount, activeSuggestionIndex, commandSuggestions, mode],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        moveSelection(1);
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        moveSelection(-1);
        return;
      }

      if (e.key === "Enter") {
        if (mode === "command") {
          const selected = commandSuggestions[activeSuggestionIndex] ?? commandSuggestions[0];
          if (selected?.enabled) {
            e.preventDefault();
            handleSelectCommand(selected);
          }
          return;
        }

        // 現在のURLを選択しただけの状態でEnterを押した時は、先頭候補へ進まず入力欄の値を確定する。
        if (isInputPristine && !hasMovedSelection) {
          onSubmitInput(inputValue);
          e.currentTarget.blur();
          return;
        }

        if (activeSuggestionIndex < availableModes.length) {
          e.preventDefault();
          enterMode(availableModes[activeSuggestionIndex].id);
          return;
        }
        const selected =
          suggestions[activeSuggestionIndex - availableModes.length] ?? suggestions[0];
        if (selected) {
          e.preventDefault();
          handleSelectSuggestion(selected);
          return;
        }

        if (mode !== "navigation") return;
        onSubmitInput(inputValue);
        e.currentTarget.blur();
        return;
      }

      // 検索語が空のときだけ戻し、入力中の文字削除は通常どおり扱う。
      if (
        e.key === "Backspace" &&
        mode !== "navigation" &&
        inputValue === "" &&
        !e.nativeEvent.isComposing
      ) {
        e.preventDefault();
        e.stopPropagation();
        returnToRoot();
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setIsFocused(false);
        setInputValue(displayUrl);
        setActiveSuggestionIndex(0);
        e.currentTarget.blur();
      }
    },
    [
      activeSuggestionIndex,
      enterMode,
      availableModes,
      returnToRoot,
      commandSuggestions,
      displayUrl,
      handleSelectCommand,
      handleSelectSuggestion,
      hasMovedSelection,
      inputValue,
      isInputPristine,
      mode,
      moveSelection,
      onSubmitInput,
      suggestions,
    ],
  );

  const activate = useCallback((nextMode: OmnibarInputMode) => {
    setMode(nextMode);
    // URL表示の通常モードでは、現在のURLを選択状態で見せつつ候補は絞り込まない。
    // タイトルバーのクリックもこの経路を通るため、ここでも空にしない。
    const keepsDisplayUrl = nextMode === "navigation";
    setInputValue(keepsDisplayUrl ? displayUrlRef.current : "");
    setIsInputPristine(keepsDisplayUrl);
    setHasMovedSelection(false);
    setIsFocused(true);
    setActiveSuggestionIndex(0);
  }, []);

  const handleFocus = useCallback((e: FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    setActiveSuggestionIndex(0);
    setHasMovedSelection(false);
    setIsInputPristine(true);
    e.target.select();
  }, []);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    setMode("navigation");
    setIsOmnibarLoaded(false);
    setActiveSuggestionIndex(0);
    setIsInputPristine(false);
    setInputValue(displayUrl);
  }, [displayUrl]);

  const handleInputChange = useCallback((value: string) => {
    setIsInputPristine(false);
    setInputValue(value);
    setActiveSuggestionIndex(0);
  }, []);

  return {
    inputValue,
    mode,
    isOpen,
    isLoading: mode === "writeHistory" ? isWriteLoading : isOmnibarLoading,
    suggestions,
    commandSuggestions,
    totalSuggestionCount,
    shouldShowNoMatch,
    activeSuggestionIndex,
    setActiveSuggestionIndex,
    activate,
    handleInputChange,
    handleKeyDown,
    handleFocus,
    handleBlur,
    handleSelectSuggestion,
    enterMode,
    returnToRoot,
    availableModes,
  };
}
