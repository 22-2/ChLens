import { renderHook } from "@testing-library/react";
import { useThreadExpiryStop } from "src/features/auto-refresh/browser/use-thread-expiry-stop";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const THREAD_A = "https://example.com/test/read.cgi/board/1000000001/";
const THREAD_B = "https://example.com/test/read.cgi/board/1000000002/";

type Props = Parameters<typeof useThreadExpiryStop>[0];

/**
 * 画面の再描画をまねて、props を部分的に変えながら同じフックを動かす。
 * 呼び出し回数は通知の関数ごとに数え、通知が重ならないことを確かめる。
 */
function setup(initial: Partial<Props> = {}) {
  const onThreadExpired = vi.fn();
  const onThreadExpiredDetected = vi.fn();
  const onDiscardPendingRefresh = vi.fn();
  let current: Props = {
    enabled: true,
    expired: false,
    scopeUrl: THREAD_A,
    deferExpiredStop: false,
    onThreadExpired,
    onThreadExpiredDetected,
    onDiscardPendingRefresh,
    ...initial,
  };
  const view = renderHook((props: Props) => useThreadExpiryStop(props), {
    initialProps: current,
  });
  const update = (patch: Partial<Props>) => {
    current = { ...current, ...patch };
    view.rerender(current);
  };
  return {
    update,
    onThreadExpired,
    onThreadExpiredDetected,
    onDiscardPendingRefresh,
  };
}

describe("dat落ちの記録と自動更新の停止通知", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("有効なスレッドで dat落ちになると、記録と停止通知を一度ずつ行い、保留中の追従を破棄する", () => {
    const { update, onThreadExpired, onThreadExpiredDetected, onDiscardPendingRefresh } = setup();

    update({ expired: true });

    expect(onThreadExpiredDetected).toHaveBeenCalledTimes(1);
    expect(onThreadExpired).toHaveBeenCalledTimes(1);
    expect(onDiscardPendingRefresh).toHaveBeenCalledTimes(1);
  });

  it("自動更新がOFFのときの dat落ちは、記録だけ行い、停止通知や追従の破棄はしない", () => {
    const { update, onThreadExpired, onThreadExpiredDetected, onDiscardPendingRefresh } = setup({
      enabled: false,
    });

    update({ expired: true });

    expect(onThreadExpiredDetected).toHaveBeenCalledTimes(1);
    expect(onThreadExpired).not.toHaveBeenCalled();
    expect(onDiscardPendingRefresh).not.toHaveBeenCalled();
  });

  it("OFFの間に記録された dat落ちは、後から有効になったときに停止通知を一度行う", () => {
    const { update, onThreadExpired, onThreadExpiredDetected } = setup({ enabled: false });
    update({ expired: true });

    update({ enabled: true });
    update({ enabled: true });

    expect(onThreadExpiredDetected).toHaveBeenCalledTimes(1);
    expect(onThreadExpired).toHaveBeenCalledTimes(1);
  });

  it("最初から dat落ちのスレッドを有効にしても、停止通知は一度だけ行う", () => {
    const { update, onThreadExpired, onThreadExpiredDetected } = setup({ expired: true });

    update({ enabled: true });
    update({ enabled: true });

    expect(onThreadExpiredDetected).toHaveBeenCalledTimes(1);
    expect(onThreadExpired).toHaveBeenCalledTimes(1);
  });

  it("同じスレッドで expired が一度 false に戻っても、再び dat落ちになった時に通知を重ねない", () => {
    const { update, onThreadExpired, onThreadExpiredDetected } = setup();
    update({ expired: true });

    update({ expired: false });
    update({ expired: true });

    expect(onThreadExpiredDetected).toHaveBeenCalledTimes(1);
    expect(onThreadExpired).toHaveBeenCalledTimes(1);
  });

  it("自動更新をOFFにしてから ONに戻しても、停止通知は一度だけ", () => {
    const { update, onThreadExpired } = setup();
    update({ expired: true });

    update({ enabled: false });
    update({ enabled: true });

    expect(onThreadExpired).toHaveBeenCalledTimes(1);
  });

  it("スレッドが変わると、前のスレッドの処理済みの印を引き継がず、新しいスレッドの dat落ちを扱う", () => {
    const { update, onThreadExpired, onThreadExpiredDetected } = setup();
    update({ expired: true });

    update({ scopeUrl: THREAD_B, expired: false });
    update({ expired: true });

    expect(onThreadExpiredDetected).toHaveBeenCalledTimes(2);
    expect(onThreadExpired).toHaveBeenCalledTimes(2);
  });

  it("スレッドが変わったときに dat落ちが続いていても、新しいスレッドの停止通知を行う", () => {
    // 呼び出し側が関数を作り直さない場合でも、スレッドが変わった時点で新しいスレッドとして扱う。
    const onThreadExpired = vi.fn();
    const onThreadExpiredDetected = vi.fn();
    const onDiscardPendingRefresh = vi.fn();
    const base = {
      enabled: true,
      expired: true,
      deferExpiredStop: false,
      onThreadExpired,
      onThreadExpiredDetected,
      onDiscardPendingRefresh,
    };
    const { rerender } = renderHook((props: Props) => useThreadExpiryStop(props), {
      initialProps: { ...base, scopeUrl: THREAD_A },
    });
    expect(onThreadExpired).toHaveBeenCalledTimes(1);

    rerender({ ...base, scopeUrl: THREAD_B });

    expect(onThreadExpired).toHaveBeenCalledTimes(2);
    expect(onThreadExpiredDetected).toHaveBeenCalledTimes(2);
  });

  it("停止通知先が一時的に未設定の間は処理済みにせず、設定されたら一度だけ通知する", () => {
    const { update, onThreadExpired } = setup({ onThreadExpired: undefined });
    update({ expired: true });
    expect(onThreadExpired).not.toHaveBeenCalled();

    update({ onThreadExpired });
    update({ onThreadExpired });

    expect(onThreadExpired).toHaveBeenCalledTimes(1);
  });

  it("次スレ探索の保留中は、記録も停止通知もしないが、追従は破棄する", () => {
    const { update, onThreadExpired, onThreadExpiredDetected, onDiscardPendingRefresh } = setup({
      deferExpiredStop: true,
    });

    update({ expired: true });

    expect(onThreadExpiredDetected).not.toHaveBeenCalled();
    expect(onThreadExpired).not.toHaveBeenCalled();
    expect(onDiscardPendingRefresh).toHaveBeenCalledTimes(1);
  });

  it("保留が解けたら、記録と停止通知を一度ずつ行い、その後の保留の切り替えでは重ねない", () => {
    const { update, onThreadExpired, onThreadExpiredDetected } = setup({ deferExpiredStop: true });
    update({ expired: true });

    update({ deferExpiredStop: false });
    update({ deferExpiredStop: true });
    update({ deferExpiredStop: false });

    expect(onThreadExpiredDetected).toHaveBeenCalledTimes(1);
    expect(onThreadExpired).toHaveBeenCalledTimes(1);
  });
});
