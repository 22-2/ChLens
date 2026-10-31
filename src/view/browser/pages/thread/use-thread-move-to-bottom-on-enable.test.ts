import { cleanup, renderHook } from "@testing-library/react";
import { useThreadMoveToBottomOnEnable } from "src/view/browser/pages/thread/use-thread-move-to-bottom-on-enable";
import { afterEach, describe, expect, it } from "vite-plus/test";

type Props = Parameters<typeof useThreadMoveToBottomOnEnable>[0];

const ACTIVE_PROPS: Props = {
  isActive: true,
  isAutoRefreshEnabled: false,
  liveChatFollowing: false,
};

function renderMoveToBottom(initialProps: Props = ACTIVE_PROPS) {
  return renderHook((props: Props) => useThreadMoveToBottomOnEnable(props), { initialProps });
}

describe("useThreadMoveToBottomOnEnable", () => {
  afterEach(() => {
    cleanup();
  });

  it("初期表示では最下部へ移動しない", () => {
    const { result } = renderMoveToBottom();

    expect(result.current).toBe(false);
  });

  it("自動更新をONにすると最下部へ移動する", () => {
    const { result, rerender } = renderMoveToBottom();

    rerender({ ...ACTIVE_PROPS, isAutoRefreshEnabled: true });

    expect(result.current).toBe(true);
  });

  it("自動更新をOFFにしただけでは最下部へ移動しない", () => {
    const { result, rerender } = renderMoveToBottom({
      ...ACTIVE_PROPS,
      isAutoRefreshEnabled: true,
    });

    rerender({ ...ACTIVE_PROPS, isAutoRefreshEnabled: false });

    expect(result.current).toBe(false);
  });

  it("別のタブから戻ったとき、離れる前に追従していれば最下部へ移動する", () => {
    const { result, rerender } = renderMoveToBottom({
      ...ACTIVE_PROPS,
      liveChatFollowing: true,
    });

    rerender({ ...ACTIVE_PROPS, isActive: false, liveChatFollowing: true });
    expect(result.current).toBe(false);

    rerender({ ...ACTIVE_PROPS, isActive: true, liveChatFollowing: false });
    expect(result.current).toBe(true);
  });

  it("離れる前に追従していなければ、戻っても最下部へ移動しない", () => {
    const { result, rerender } = renderMoveToBottom({
      ...ACTIVE_PROPS,
      liveChatFollowing: false,
    });

    rerender({ ...ACTIVE_PROPS, isActive: false, liveChatFollowing: false });
    rerender({ ...ACTIVE_PROPS, isActive: true, liveChatFollowing: true });

    expect(result.current).toBe(false);
  });

  it("追従状態は離れた瞬間の値を使い、離れている間の変化で上書きしない", () => {
    const { result, rerender } = renderMoveToBottom({
      ...ACTIVE_PROPS,
      liveChatFollowing: true,
    });

    rerender({ ...ACTIVE_PROPS, isActive: false, liveChatFollowing: true });
    rerender({ ...ACTIVE_PROPS, isActive: false, liveChatFollowing: false });
    rerender({ ...ACTIVE_PROPS, isActive: true, liveChatFollowing: false });

    expect(result.current).toBe(true);
  });
});
