import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { useThreadRefreshController } from "src/view/browser/hooks/use-thread-refresh-controller";

describe("useThreadRefreshController", () => {
  it("内部RELOADと外部RELOADを識別し、完了処理を一回だけ保留する", () => {
    const { result, rerender } = renderHook(
      ({ refreshKey }: { refreshKey: number }) => useThreadRefreshController(refreshKey),
      { initialProps: { refreshKey: 0 } },
    );

    expect(result.current.consumeRefreshKeyChange()).toBeNull();

    act(() => {
      result.current.markInternalRefreshRequest();
    });
    rerender({ refreshKey: 1 });

    expect(result.current.consumeRefreshKeyChange()).toBe("internal");
    expect(result.current.consumeRefreshCompletionGate()).toBe(true);
    expect(result.current.consumeRefreshCompletionGate()).toBe(false);

    rerender({ refreshKey: 2 });
    expect(result.current.consumeRefreshKeyChange()).toBe("external");
  });

  it("最新リクエストだけを有効と判定する", () => {
    const { result } = renderHook(() => useThreadRefreshController(0));

    const firstRequestId = result.current.beginRequest();
    const secondRequestId = result.current.beginRequest();

    expect(result.current.isLatestRequest(firstRequestId)).toBe(false);
    expect(result.current.isLatestRequest(secondRequestId)).toBe(true);
  });
});
