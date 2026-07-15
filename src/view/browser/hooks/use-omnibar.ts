import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type FocusEvent,
  type KeyboardEvent,
  type SetStateAction,
} from "react";
import {
  buildOmnibarSuggestions,
  type OmnibarMergedEntry,
  type OmnibarSuggestion,
} from "src/view/browser/utils/omnibar";

interface UseOmnibarOptions {
  displayUrl: string;
  maxSuggestions: number;
  loadEntries: () => Promise<OmnibarMergedEntry[]>;
  onSelectSuggestion: (suggestion: OmnibarSuggestion) => void;
  onSubmitInput: (inputValue: string) => void;
}

interface UseOmnibarResult {
  inputValue: string;
  isOpen: boolean;
  isLoading: boolean;
  suggestions: OmnibarSuggestion[];
  shouldShowNoMatch: boolean;
  activeSuggestionIndex: number;
  setActiveSuggestionIndex: Dispatch<SetStateAction<number>>;
  handleInputChange: (value: string) => void;
  handleKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  handleFocus: (e: FocusEvent<HTMLInputElement>) => void;
  handleBlur: () => void;
  handleSelectSuggestion: (suggestion: OmnibarSuggestion) => void;
}

export function useOmnibar({
  displayUrl,
  maxSuggestions,
  loadEntries,
  onSelectSuggestion,
  onSubmitInput,
}: UseOmnibarOptions): UseOmnibarResult {
  const [inputValue, setInputValue] = useState(displayUrl);
  const [isFocused, setIsFocused] = useState(false);
  const [omnibarEntries, setOmnibarEntries] = useState<OmnibarMergedEntry[]>([]);
  const [isOmnibarLoaded, setIsOmnibarLoaded] = useState(false);
  const [isOmnibarLoading, setIsOmnibarLoading] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);

  useEffect(() => {
    if (!isFocused) {
      setInputValue(displayUrl);
    }
  }, [displayUrl, isFocused]);

  useEffect(() => {
    // 変更理由: ロード状態を依存配列に入れると state 変更だけで effect が再走し、
    // 進行中ロードをキャンセルするループを作るため、フォーカスとロード完了のみで制御する。
    if (!isFocused || isOmnibarLoaded) {
      return;
    }

    setIsOmnibarLoading(true);

    let cancelled = false;
    void loadEntries()
      .then((entries) => {
        if (cancelled) {
          return;
        }
        setOmnibarEntries(entries);
        setIsOmnibarLoaded(true);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setOmnibarEntries([]);
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
  }, [isFocused, isOmnibarLoaded, loadEntries]);

  const suggestions = useMemo(
    () => buildOmnibarSuggestions(omnibarEntries, inputValue, maxSuggestions),
    [inputValue, maxSuggestions, omnibarEntries],
  );

  useEffect(() => {
    if (activeSuggestionIndex < suggestions.length) {
      return;
    }
    setActiveSuggestionIndex(0);
  }, [activeSuggestionIndex, suggestions.length]);

  const shouldShowNoMatch =
    isFocused && !isOmnibarLoading && inputValue.trim().length > 0 && suggestions.length === 0;

  const isOpen = isFocused && (isOmnibarLoading || suggestions.length > 0 || shouldShowNoMatch);

  const handleSelectSuggestion = useCallback(
    (suggestion: OmnibarSuggestion) => {
      onSelectSuggestion(suggestion);
      setInputValue(suggestion.url);
      setIsFocused(false);
      setActiveSuggestionIndex(0);
    },
    [onSelectSuggestion],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        if (suggestions.length > 0) {
          e.preventDefault();
          setActiveSuggestionIndex((prev) => (prev + 1 >= suggestions.length ? 0 : prev + 1));
        }
        return;
      }

      if (e.key === "ArrowUp") {
        if (suggestions.length > 0) {
          e.preventDefault();
          setActiveSuggestionIndex((prev) => (prev - 1 < 0 ? suggestions.length - 1 : prev - 1));
        }
        return;
      }

      if (e.key === "Enter") {
        const selected = suggestions[activeSuggestionIndex] ?? suggestions[0];
        if (selected) {
          e.preventDefault();
          handleSelectSuggestion(selected);
          return;
        }

        onSubmitInput(inputValue);
        e.currentTarget.blur();
        return;
      }

      if (e.key === "Escape") {
        setIsFocused(false);
        setInputValue(displayUrl);
        setActiveSuggestionIndex(0);
        e.currentTarget.blur();
      }
    },
    [
      activeSuggestionIndex,
      displayUrl,
      handleSelectSuggestion,
      inputValue,
      onSubmitInput,
      suggestions,
    ],
  );

  const handleFocus = useCallback((e: FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    setActiveSuggestionIndex(0);
    // Chrome風: フォーカス時に全選択
    e.target.select();
  }, []);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    setActiveSuggestionIndex(0);
    setInputValue(displayUrl);
  }, [displayUrl]);

  const handleInputChange = useCallback((value: string) => {
    setInputValue(value);
    setActiveSuggestionIndex(0);
  }, []);

  return {
    inputValue,
    isOpen,
    isLoading: isOmnibarLoading,
    suggestions,
    shouldShowNoMatch,
    activeSuggestionIndex,
    setActiveSuggestionIndex,
    handleInputChange,
    handleKeyDown,
    handleFocus,
    handleBlur,
    handleSelectSuggestion,
  };
}
