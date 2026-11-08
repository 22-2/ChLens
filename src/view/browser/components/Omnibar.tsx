import {
  Bookmark,
  Command,
  ExternalLink,
  History,
  List,
  type LucideIcon,
  Pencil,
} from "lucide-react";
import type { ReactNode, RefObject } from "react";
import React, { useLayoutEffect, useRef } from "react";
import type { ResolvedBrowserCommand } from "src/view/browser/commands/command-definition";
import {
  OMNIBAR_MODES,
  type OmnibarInputMode,
  type OmnibarSearchMode,
} from "src/view/browser/hooks/use-omnibar";
import { Spinner } from "src/view/browser/ui/Spinner";
import type { OmnibarSource, OmnibarSuggestion } from "src/view/browser/utils/omnibar";

interface OmnibarProps {
  inputRef: RefObject<HTMLInputElement | null>;
  inputValue: string;
  placeholder: string;
  isOpen: boolean;
  isLoading: boolean;
  suggestions: OmnibarSuggestion[];
  commandSuggestions: ResolvedBrowserCommand[];
  totalSuggestionCount: number;
  mode: OmnibarInputMode;
  activeSuggestionIndex: number;
  shouldShowNoMatch: boolean;
  onInputChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onFocus: (e: React.FocusEvent<HTMLInputElement>) => void;
  onBlur: (e: React.FocusEvent<HTMLDivElement>) => void;
  onSuggestionHover: (index: number) => void;
  onSuggestionSelect: (suggestion: OmnibarSuggestion) => void;
  onSuggestionContextMenu?: (suggestion: OmnibarSuggestion, x: number, y: number) => void;
  onCommandSelect: (command: ResolvedBrowserCommand) => void;
  availableModes: typeof OMNIBAR_MODES;
  onEnterMode: (mode: OmnibarSearchMode) => void;
  onReturnToRoot: () => void;
  trailingAction?: ReactNode;
}

const SOURCE_METADATA: Record<OmnibarSource, { label: string; Icon: LucideIcon }> = {
  bookmark: { label: "ブックマーク", Icon: Bookmark },
  history: { label: "閲覧履歴", Icon: History },
  board: { label: "板一覧", Icon: List },
  direct: { label: "入力URL", Icon: ExternalLink },
  writeHistory: { label: "書き込み履歴", Icon: Pencil },
};

function SourceIcons({ sources }: { sources: readonly OmnibarSource[] }) {
  return (
    <span
      className="nav-bar__omnibar-sources"
      role="img"
      aria-label={sources.map((source) => SOURCE_METADATA[source].label).join("・")}
    >
      {sources.map((source) => {
        const { Icon } = SOURCE_METADATA[source];
        return <Icon key={source} size={14} aria-hidden="true" />;
      })}
    </span>
  );
}

export const Omnibar: React.FC<OmnibarProps> = ({
  inputRef,
  inputValue,
  placeholder,
  isOpen,
  isLoading,
  suggestions,
  commandSuggestions,
  totalSuggestionCount,
  mode,
  activeSuggestionIndex,
  shouldShowNoMatch,
  onInputChange,
  onKeyDown,
  onFocus,
  onBlur,
  onSuggestionHover,
  onSuggestionSelect,
  onSuggestionContextMenu,
  onCommandSelect,
  availableModes,
  onEnterMode,
  onReturnToRoot,
  trailingAction,
}) => {
  const listRef = useRef<HTMLDivElement>(null);
  const keyboardScrollRef = useRef(false);
  const previousModeRef = useRef(mode);
  useLayoutEffect(() => {
    const modeChanged = previousModeRef.current !== mode;
    previousModeRef.current = mode;
    // ホイール中にカーソル下の行が変わっても、自動スクロールを重ねない。
    if (!modeChanged && !keyboardScrollRef.current) return;
    keyboardScrollRef.current = false;
    const list = listRef.current;
    const selected = list?.querySelector<HTMLElement>('[role="option"][aria-selected="true"]');
    if (!list || !selected) return;
    // 長い候補一覧でも矢印キーで選択した行を表示範囲に保つ。
    const top = selected.offsetTop;
    const bottom = top + selected.offsetHeight;
    const visibleBottom =
      list.scrollTop +
      list.clientHeight -
      (list.querySelector<HTMLElement>(".nav-bar__omnibar-count")?.offsetHeight ?? 0);
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > visibleBottom) list.scrollTop += bottom - visibleBottom;
  }, [activeSuggestionIndex, isOpen, mode]);
  const visibleCount =
    mode === "command" ? commandSuggestions.length : suggestions.length + availableModes.length;
  return (
    <div
      className={`nav-bar__url${trailingAction ? " nav-bar__url--has-action" : ""}`}
      onBlur={onBlur}
    >
      {mode !== "navigation" ? (
        <button
          type="button"
          className="nav-bar__url-action-btn icon-button"
          title={`${OMNIBAR_MODES.find((item) => item.id === mode)?.label}：ルートに戻る (Backspace)`}
          aria-label="ルートに戻る"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onReturnToRoot}
        >
          <Command size={15} />
        </button>
      ) : null}
      <input
        ref={inputRef}
        className="nav-bar__url-input"
        type="text"
        value={inputValue}
        onChange={(e) => onInputChange(e.target.value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Backspace") {
            keyboardScrollRef.current = true;
          }
          onKeyDown(event);
        }}
        onFocus={onFocus}
        placeholder={placeholder}
        spellCheck={false}
      />

      {trailingAction ? <div className="nav-bar__url-action">{trailingAction}</div> : null}

      {isOpen ? (
        <div
          ref={listRef}
          className="nav-bar__omnibar"
          role="listbox"
          aria-label={mode === "command" ? "コマンド候補" : "候補"}
        >
          {isLoading ? (
            <div className="nav-bar__omnibar-empty nav-bar__omnibar-empty--loading">
              <Spinner size="xs" aria-label="候補を読み込み中" />
              <span>候補を読み込み中...</span>
            </div>
          ) : null}

          {availableModes.length > 0 ? (
            <div className="nav-bar__omnibar-section" role="presentation">
              モード
            </div>
          ) : null}
          {availableModes.map((item, index) => {
            const Icon = item.id === "command" ? Command : SOURCE_METADATA[item.id].Icon;
            return (
              <button
                key={item.id}
                type="button"
                className={`nav-bar__omnibar-item nav-bar__omnibar-item--command${activeSuggestionIndex === index ? " nav-bar__omnibar-item--active" : ""}`}
                role="option"
                aria-selected={activeSuggestionIndex === index}
                aria-label={`${item.label} モード`}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => {
                  keyboardScrollRef.current = false;
                  onSuggestionHover(index);
                }}
                onClick={() => onEnterMode(item.id)}
              >
                <span className="nav-bar__omnibar-command-icon" aria-hidden="true">
                  <Icon size={15} />
                </span>
                <span className="nav-bar__omnibar-title">{item.label}</span>
                <span className="nav-bar__omnibar-url">{item.description}</span>
              </button>
            );
          })}

          {!isLoading && mode === "navigation" && suggestions.length > 0 ? (
            <div className="nav-bar__omnibar-section" role="presentation">
              候補
            </div>
          ) : null}
          {!isLoading && mode !== "command" && suggestions.length > 0
            ? suggestions.map((suggestion, index) => (
                <button
                  key={`${suggestion.url}::${suggestion.actionLabel ?? ""}::${
                    suggestion.openInNewTab ? "new-tab" : "current-tab"
                  }::${suggestion.writtenRes ?? ""}::${index}`}
                  type="button"
                  className={`nav-bar__omnibar-item nav-bar__omnibar-item--navigation${
                    index + availableModes.length === activeSuggestionIndex
                      ? " nav-bar__omnibar-item--active"
                      : ""
                  }`}
                  role="option"
                  aria-selected={index + availableModes.length === activeSuggestionIndex}
                  onMouseDown={(e) => {
                    // blur が先に発火して候補クリックが失われるのを防ぐ。
                    if (e.button === 0) e.preventDefault();
                  }}
                  onMouseEnter={() => {
                    keyboardScrollRef.current = false;
                    onSuggestionHover(index + availableModes.length);
                  }}
                  onClick={() => onSuggestionSelect(suggestion)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onSuggestionContextMenu?.(suggestion, event.clientX, event.clientY);
                  }}
                  title={`${suggestion.title} ${suggestion.url}`}
                >
                  <SourceIcons sources={suggestion.sources} />
                  <span className="nav-bar__omnibar-title">
                    {suggestion.actionLabel ?? suggestion.title}
                    {suggestion.writtenRes ? ` #${suggestion.writtenRes}` : ""}
                  </span>
                  <span className="nav-bar__omnibar-url">
                    {suggestion.message || suggestion.url}
                  </span>
                </button>
              ))
            : null}

          {!isLoading && mode === "command" && commandSuggestions.length > 0
            ? commandSuggestions.map((command, index) => {
                const Icon = command.icon;
                return (
                  <button
                    key={command.id}
                    type="button"
                    className={`nav-bar__omnibar-item nav-bar__omnibar-item--command${
                      index === activeSuggestionIndex ? " nav-bar__omnibar-item--active" : ""
                    }`}
                    role="option"
                    aria-selected={index === activeSuggestionIndex}
                    aria-label={`${command.label} (${command.englishLabel})`}
                    disabled={!command.enabled}
                    onMouseDown={(e) => {
                      // blur が先に発火してコマンドクリックが失われるのを防ぐ。
                      e.preventDefault();
                    }}
                    onMouseEnter={() => {
                      keyboardScrollRef.current = false;
                      onSuggestionHover(index);
                    }}
                    onClick={() => onCommandSelect(command)}
                    title={command.description ?? `${command.label} (${command.englishLabel})`}
                  >
                    <span className="nav-bar__omnibar-command-icon" aria-hidden="true">
                      <Icon size={15} />
                    </span>
                    <span className="nav-bar__omnibar-title">{command.label}</span>
                    <span className="nav-bar__omnibar-url">{command.englishLabel}</span>
                  </button>
                );
              })
            : null}

          {shouldShowNoMatch ? (
            <div className="nav-bar__omnibar-empty">一致する候補がありません</div>
          ) : null}
          {!isLoading ? (
            <div
              className="nav-bar__omnibar-count"
              role="status"
              title="検索対象内の表示件数 / 一致件数"
              aria-label={`表示 ${visibleCount} 件 / 一致 ${totalSuggestionCount} 件`}
            >
              {visibleCount} / {totalSuggestionCount}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
