import { cleanup, renderHook } from "@testing-library/react";
import { useThreadFilterReset } from "src/view/browser/pages/thread/use-thread-filter-reset";
import type { ThreadPage as ThreadPageType } from "src/view/browser/types";
import { requestThreadResJump } from "src/view/browser/utils/thread-read-state";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const THREAD_URL = "https://example.com/test/read.cgi/board/1000000001/";
const OTHER_THREAD_URL = "https://example.com/test/read.cgi/board/1000000002/";

function createPage(overrides: Partial<ThreadPageType> = {}): ThreadPageType {
  return { type: "thread", title: "テストスレ", threadUrl: THREAD_URL, ...overrides };
}

function renderFilterReset(options: { page?: ThreadPageType; tabId?: string } = {}) {
  const setFilter = vi.fn();
  const setSearchQuery = vi.fn();
  const hook = renderHook(
    ({ page }: { page: ThreadPageType }) =>
      useThreadFilterReset({ tabId: options.tabId ?? "tab-1", page, setFilter, setSearchQuery }),
    { initialProps: { page: options.page ?? createPage() } },
  );
  return { ...hook, setFilter, setSearchQuery };
}

describe("useThreadFilterReset", () => {
  afterEach(() => {
    cleanup();
  });

  it("初期表示のレス指定があると、保存済みの絞り込みと検索語を解除する", () => {
    const { setFilter, setSearchQuery } = renderFilterReset({
      page: createPage({ initialResNum: 12 }),
    });

    expect(setFilter).toHaveBeenCalledWith("all");
    expect(setSearchQuery).toHaveBeenCalledWith("");
  });

  it("初期表示のレス指定がなければ、絞り込みを変更しない", () => {
    const { setFilter, setSearchQuery } = renderFilterReset();

    expect(setFilter).not.toHaveBeenCalled();
    expect(setSearchQuery).not.toHaveBeenCalled();
  });

  it("同じタブと同じスレッドへのレス移動で絞り込み解除が指定されたら、絞り込みを解除する", () => {
    const { setFilter, setSearchQuery } = renderFilterReset();

    requestThreadResJump(THREAD_URL, 7, "tab-1", true);

    expect(setFilter).toHaveBeenCalledWith("all");
    expect(setSearchQuery).toHaveBeenCalledWith("");
  });

  it("絞り込み解除が指定されていないレス移動では、絞り込みを変更しない", () => {
    const { setFilter } = renderFilterReset();

    requestThreadResJump(THREAD_URL, 7, "tab-1", false);

    expect(setFilter).not.toHaveBeenCalled();
  });

  it("別のタブ宛てのレス移動では、絞り込みを変更しない", () => {
    const { setFilter } = renderFilterReset();

    requestThreadResJump(THREAD_URL, 7, "tab-2", true);

    expect(setFilter).not.toHaveBeenCalled();
  });

  it("別のスレッド宛てのレス移動では、絞り込みを変更しない", () => {
    const { setFilter } = renderFilterReset();

    requestThreadResJump(OTHER_THREAD_URL, 7, undefined, true);

    expect(setFilter).not.toHaveBeenCalled();
  });

  it("タブ指定のないレス移動は、同じスレッドのどのタブでも絞り込みを解除する", () => {
    const { setFilter } = renderFilterReset({ tabId: "tab-9" });

    requestThreadResJump(THREAD_URL, 7, undefined, true);

    expect(setFilter).toHaveBeenCalledWith("all");
  });

  it("返り値の関数を呼ぶと、絞り込みを全件表示に戻す", () => {
    const { result, setFilter } = renderFilterReset();

    result.current();

    expect(setFilter).toHaveBeenCalledWith("all");
  });

  it("アンマウント後は、レス移動の通知を受け取らない", () => {
    const { unmount, setFilter } = renderFilterReset();

    unmount();
    requestThreadResJump(THREAD_URL, 7, "tab-1", true);

    expect(setFilter).not.toHaveBeenCalled();
  });
});
