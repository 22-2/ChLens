import { Bookmark, ExternalLink, History, List, type LucideIcon } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import React from "react";
import type { ResolvedBrowserCommand } from "src/view/browser/commands/browser-commands";
import type { OmnibarInputMode } from "src/view/browser/hooks/use-omnibar";
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
  mode: OmnibarInputMode;
  activeSuggestionIndex: number;
  shouldShowNoMatch: boolean;
  onInputChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onFocus: (e: React.FocusEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  onSuggestionHover: (index: number) => void;
  onSuggestionSelect: (suggestion: OmnibarSuggestion) => void;
  onCommandSelect: (command: ResolvedBrowserCommand) => void;
  trailingAction?: ReactNode;
}

const SOURCE_METADATA: Record<OmnibarSource, { label: string; Icon: LucideIcon }> = {
  bookmark: { label: "ブックマーク", Icon: Bookmark },
  history: { label: "閲覧履歴", Icon: History },
  board: { label: "板一覧", Icon: List },
  direct: { label: "入力URL", Icon: ExternalLink },
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
  mode,
  activeSuggestionIndex,
  shouldShowNoMatch,
  onInputChange,
  onKeyDown,
  onFocus,
  onBlur,
  onSuggestionHover,
  onSuggestionSelect,
  onCommandSelect,
  trailingAction,
}) => {
  return (
    <div className={`nav-bar__url${trailingAction ? " nav-bar__url--has-action" : ""}`}>
      <input
        ref={inputRef}
        className="nav-bar__url-input"
        type="text"
        value={inputValue}
        onChange={(e) => onInputChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
        spellCheck={false}
      />

      {trailingAction ? <div className="nav-bar__url-action">{trailingAction}</div> : null}

      {isOpen ? (
        <div
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

          {!isLoading && mode === "navigation" && suggestions.length > 0
            ? suggestions.map((suggestion, index) => (
                <button
                  key={suggestion.url}
                  type="button"
                  className={`nav-bar__omnibar-item nav-bar__omnibar-item--navigation${
                    index === activeSuggestionIndex ? " nav-bar__omnibar-item--active" : ""
                  }`}
                  role="option"
                  aria-selected={index === activeSuggestionIndex}
                  onMouseDown={(e) => {
                    // blur が先に発火して候補クリックが失われるのを防ぐ。
                    e.preventDefault();
                  }}
                  onMouseEnter={() => onSuggestionHover(index)}
                  onClick={() => onSuggestionSelect(suggestion)}
                  title={`${suggestion.title} ${suggestion.url}`}
                >
                  <SourceIcons sources={suggestion.sources} />
                  <span className="nav-bar__omnibar-title">
                    {suggestion.actionLabel ?? suggestion.title}
                  </span>
                  <span className="nav-bar__omnibar-url">{suggestion.url}</span>
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
                    onMouseEnter={() => onSuggestionHover(index)}
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
        </div>
      ) : null}
    </div>
  );
};
