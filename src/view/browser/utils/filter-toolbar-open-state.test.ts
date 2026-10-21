import { act, renderHook } from "@testing-library/react";
import {
  setFilterToolbarOpen,
  useAnyFilterToolbarOpen,
} from "src/view/browser/utils/filter-toolbar-open-state";
import { afterEach, describe, expect, it } from "vite-plus/test";

describe("useAnyFilterToolbarOpen", () => {
  afterEach(() => {
    setFilterToolbarOpen("tab-a", false);
    setFilterToolbarOpen("tab-b", false);
  });

  it("どのタブのフィルタバーも開いていなければ false を返す", () => {
    const { result } = renderHook(() => useAnyFilterToolbarOpen());

    expect(result.current).toBe(false);
  });

  it("いずれかのタブでフィルタバーが開くと true になり、すべて閉じると false に戻る", () => {
    const { result } = renderHook(() => useAnyFilterToolbarOpen());

    act(() => setFilterToolbarOpen("tab-a", true));
    expect(result.current).toBe(true);

    act(() => setFilterToolbarOpen("tab-b", true));
    act(() => setFilterToolbarOpen("tab-a", false));
    expect(result.current).toBe(true);

    act(() => setFilterToolbarOpen("tab-b", false));
    expect(result.current).toBe(false);
  });
});
