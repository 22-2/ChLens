import { act, renderHook } from "@testing-library/react";
import type { FocusEvent } from "react";
import { useOmnibar } from "src/view/browser/hooks/use-omnibar";
import type { OmnibarMergedEntry } from "src/view/browser/utils/omnibar";
import { describe, expect, it, vi } from "vite-plus/test";

const DISPLAY_URL = "https://example.com/test/read.cgi/board/1/";
const entries: OmnibarMergedEntry[] = [
  {
    title: "別のスレ",
    url: "https://example.com/test/read.cgi/board/2/",
    boardTitle: "テスト板",
    isBookmark: false,
    sources: ["history"],
    historyRank: 0,
    viewedDate: 0,
  },
];

function renderOmnibar() {
  return renderHook(() =>
    useOmnibar({
      displayUrl: DISPLAY_URL,
      maxSuggestions: 10,
      loadEntries: vi.fn(async () => entries),
      loadWriteHistory: vi.fn(async () => []),
      onSelectSuggestion: vi.fn(),
      onSubmitInput: vi.fn(),
    }),
  );
}

function focusEvent(): FocusEvent<HTMLInputElement> {
  return { target: { select: vi.fn() } } as unknown as FocusEvent<HTMLInputElement>;
}

describe("オムニバーのフォーカス", () => {
  it("フォーカスすると現在のURLを入力欄に残したまま、絞り込まない候補を表示する", async () => {
    const { result } = renderOmnibar();
    await act(async () => {
      result.current.handleFocus(focusEvent());
    });

    expect(result.current.inputValue).toBe(DISPLAY_URL);
    expect(result.current.suggestions.map((item) => item.url)).toContain(entries[0].url);
  });

  it("入力を始めると、入力した文字で候補を絞り込む", async () => {
    const { result } = renderOmnibar();
    await act(async () => {
      result.current.handleFocus(focusEvent());
    });
    act(() => result.current.handleInputChange("存在しない語"));

    expect(result.current.suggestions.map((item) => item.url)).not.toContain(entries[0].url);
  });
});
