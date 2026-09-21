import { act, cleanup, renderHook } from "@testing-library/react";
import { container } from "src/service-container";
import type { IThread, IToastService } from "src/service-container/interfaces";
import { useThreadTitleNgDialog } from "src/view/browser/hooks/use-thread-title-ng-dialog";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const addNgRuleMock = vi.fn();
const toastErrorMock = vi.fn();
const toastInfoMock = vi.fn();
const toast: IToastService = {
  notify: vi.fn(),
  success: vi.fn(),
  error: toastErrorMock,
  info: toastInfoMock,
};

const thread: IThread = {
  title: "テストスレッド",
  url: "https://example.com/test/read.cgi/software/123/",
  resCount: 10,
  createdAt: 1_700_000_000_000,
};

describe("useThreadTitleNgDialog", () => {
  beforeEach(() => {
    addNgRuleMock.mockReset();
    toastErrorMock.mockReset();
    toastInfoMock.mockReset();
    container.ng = {
      isNGBoard: vi.fn().mockReturnValue(null),
      isNGThread: vi.fn().mockReturnValue(null),
      add: addNgRuleMock,
      invalidateCache: vi.fn(),
      execExpire: vi.fn(),
    };
  });

  afterEach(() => {
    cleanup();
  });

  it("スレタイをNG登録して成功時にダイアログを閉じる", async () => {
    addNgRuleMock.mockResolvedValue(undefined);
    const { result } = renderHook(() => useThreadTitleNgDialog({ toast, logLabel: "テスト" }));

    act(() => result.current.open(thread));
    act(() => result.current.setDraft("  編集後のタイトル  "));
    await act(async () => {
      await result.current.submit();
    });

    expect(addNgRuleMock).toHaveBeenCalledWith(
      expect.stringContaining("hide title contains:\n  編集後のタイトル"),
    );
    expect(toastInfoMock).toHaveBeenCalledWith("スレタイをNGに追加しました: 編集後のタイトル");
    expect(result.current.thread).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("NG登録に失敗した場合は入力とエラーを保持する", async () => {
    addNgRuleMock.mockRejectedValue(new Error("保存に失敗しました"));
    const { result } = renderHook(() => useThreadTitleNgDialog({ toast, logLabel: "テスト" }));

    act(() => result.current.open(thread));
    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.thread).toEqual(thread);
    expect(result.current.draft).toBe(thread.title);
    expect(result.current.error).toBe("保存に失敗しました");
    expect(toastErrorMock).toHaveBeenCalledWith("保存に失敗しました");
  });
});
