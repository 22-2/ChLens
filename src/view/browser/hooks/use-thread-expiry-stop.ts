import { useLayoutEffect, useRef } from "react";
import { useLatestRef } from "src/view/browser/hooks/use-latest-ref";

interface UseThreadExpiryStopOptions {
  enabled: boolean;
  expired: boolean;
  /** スレッドが変わったら、記録・通知済みの印を戻すために使う。 */
  scopeUrl?: string;
  /** 次スレ探索中は、候補が見つかるまで dat 落ちによる解除通知を保留する。 */
  deferExpiredStop: boolean;
  /** dat落ちを検知して自動更新を止めるとき、一度だけ呼ぶ。 */
  onThreadExpired?: () => void;
  /** dat落ち確定をページの再マウント後も保つ停止キーを記録するときに呼ぶ。 */
  onThreadExpiredDetected?: () => void;
  /** 自動更新中に dat 落ちを検知したとき、保留中の更新と追従を破棄するために呼ぶ。 */
  onDiscardPendingRefresh: () => void;
}

/**
 * dat落ち（expired）を検知したときの記録と自動更新の停止通知を扱う。
 *
 * 同じスレの再取得では expired が一度 false に戻ることがあるため、
 * 記録と停止通知はスレッドごとに一度だけ行う。
 */
export function useThreadExpiryStop({
  enabled,
  expired,
  scopeUrl,
  deferExpiredStop,
  onThreadExpired,
  onThreadExpiredDetected,
  onDiscardPendingRefresh,
}: UseThreadExpiryStopOptions): void {
  const onThreadExpiredRef = useLatestRef(onThreadExpired);
  const onThreadExpiredDetectedRef = useLatestRef(onThreadExpiredDetected);
  const onDiscardPendingRefreshRef = useLatestRef(onDiscardPendingRefresh);
  const threadExpiredHandledRef = useRef(false);
  const threadExpiredRecordedRef = useRef(false);
  const expiryScopeUrlRef = useRef(scopeUrl);
  // 別スレへ移った最初の render で印を戻さないと、同じ render の layout effect が
  // 前のスレの処理済み印を見て新しいスレの dat 落ちを無視してしまう。
  if (expiryScopeUrlRef.current !== scopeUrl) {
    expiryScopeUrlRef.current = scopeUrl;
    threadExpiredHandledRef.current = false;
    threadExpiredRecordedRef.current = false;
  }

  useLayoutEffect(() => {
    if (!expired) {
      return;
    }

    // 自動更新OFF中も停止理由を記録する。満了後の次スレ探索中は、期限終了時に画面側で記録する。
    if (!deferExpiredStop && !threadExpiredRecordedRef.current) {
      threadExpiredRecordedRef.current = true;
      onThreadExpiredDetectedRef.current?.();
    }

    if (!enabled || threadExpiredHandledRef.current) {
      return;
    }

    // dat落ちになった時点で保留中の追従を破棄し、次スレ探索中だけ設定解除通知を保留する。
    onDiscardPendingRefreshRef.current();
    // Overlay表示中は停止通知先を一時的に外すため、callback未設定では処理済みにしない。
    if (deferExpiredStop || onThreadExpiredRef.current == null) {
      return;
    }

    threadExpiredHandledRef.current = true;
    onThreadExpiredRef.current?.();
    // onThreadExpired は ref で読むが、未設定から設定に変わったときに再判定するため依存に含める。
  }, [
    deferExpiredStop,
    enabled,
    expired,
    onDiscardPendingRefreshRef,
    onThreadExpired,
    onThreadExpiredDetectedRef,
    onThreadExpiredRef,
  ]);
}
