import type { ReactNode, RefObject } from "react";
import React from "react";
import type { OmnibarSuggestion } from "src/view/browser/utils/omnibar";

interface OmnibarProps {
  inputRef: RefObject<HTMLInputElement | null>;
  inputValue: string;
  placeholder: string;
  isOpen: boolean;
  isLoading: boolean;
  suggestions: OmnibarSuggestion[];
  activeSuggestionIndex: number;
  shouldShowNoMatch: boolean;
  onInputChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onFocus: (e: React.FocusEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  onSuggestionHover: (index: number) => void;
  onSuggestionSelect: (suggestion: OmnibarSuggestion) => void;
  trailingAction?: ReactNode;
}

export const Omnibar: React.FC<OmnibarProps> = ({
  inputRef,
  inputValue,
  placeholder,
  isOpen,
  isLoading,
  suggestions,
  activeSuggestionIndex,
  shouldShowNoMatch,
  onInputChange,
  onKeyDown,
  onFocus,
  onBlur,
  onSuggestionHover,
  onSuggestionSelect,
  trailingAction,
}) => {
  return (
    <div
      className={`nav-bar__url${trailingAction ? " nav-bar__url--has-action" : ""}`}
    >
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

      {trailingAction ? (
        <div className="nav-bar__url-action">{trailingAction}</div>
      ) : null}

      {isOpen ? (
        <div className="nav-bar__omnibar" role="listbox" aria-label="候補">
          {isLoading ? (
            <div className="nav-bar__omnibar-empty">候補を読み込み中...</div>
          ) : null}

          {!isLoading && suggestions.length > 0
            ? suggestions.map((suggestion, index) => (
                <button
                  key={suggestion.url}
                  type="button"
                  className={`nav-bar__omnibar-item${
                    index === activeSuggestionIndex
                      ? " nav-bar__omnibar-item--active"
                      : ""
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
                  <span className="nav-bar__omnibar-title">
                    {suggestion.title}
                  </span>
                  <span className="nav-bar__omnibar-url">{suggestion.url}</span>
                </button>
              ))
            : null}

          {shouldShowNoMatch ? (
            <div className="nav-bar__omnibar-empty">
              一致する候補がありません
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
