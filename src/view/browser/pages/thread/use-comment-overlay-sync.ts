import { useEffect, useRef } from "react";
import type { IRes } from "src/service-container/interfaces";
import type { CommentOverlayController } from "src/features/comment-overlay/application/controller";

type CommentOverlaySyncController = Pick<
  CommentOverlayController,
  "getSnapshot" | "start" | "stop" | "syncThread"
>;

interface UseCommentOverlaySyncOptions {
  controller: CommentOverlaySyncController;
  threadUrl: string;
  responses: readonly IRes[];
  isActive: boolean;
  autoRefreshEnabled: boolean;
  expired: boolean;
  missingFromSubject: boolean;
}

/** 表示中ThreadPageの確定snapshotを実況controllerへ共有し、終了条件を伝える。 */
export function useCommentOverlaySync({
  controller,
  threadUrl,
  responses,
  isActive,
  autoRefreshEnabled,
  expired,
  missingFromSubject,
}: UseCommentOverlaySyncOptions): void {
  const latestResponsesRef = useRef(responses);
  const requestedThreadUrlRef = useRef<string | null | undefined>(undefined);
  latestResponsesRef.current = responses;

  useEffect(() => {
    if (!isActive) return;

    // 取得結果の共有だけを行い、実況中でない場合の差分計算・送信はcontroller側で止める。
    controller.syncThread(threadUrl, responses);
  }, [controller, isActive, responses, threadUrl]);

  useEffect(() => {
    const requestedThreadUrl =
      isActive && autoRefreshEnabled && !expired && !missingFromSubject ? threadUrl : null;

    // 変更理由: responsesは新着取得や描画でも新しい配列になり得るため、依存させたまま
    // start/stopを判定すると自動更新中にnative window操作を何度も要求してしまう。
    // 自動更新のON/OFFまたは対象スレッドが実際に変わった時だけ一度遷移させる。
    if (requestedThreadUrlRef.current === requestedThreadUrl) return;
    requestedThreadUrlRef.current = requestedThreadUrl;

    // 変更理由: 2ペインのフォーカス移動で旧ペインのhideと新ペインのshowを競合させない。
    // 非フォーカス側は状態だけ更新し、停止はフォーカス側の状態表示へ一元化する。
    if (!isActive) return;

    const snapshot = controller.getSnapshot();
    const isTargetRunning =
      snapshot.state.status === "running" && snapshot.state.targetThreadUrl === threadUrl;

    if (expired || missingFromSubject) {
      if (!isTargetRunning) return;

      // 変更理由: dat落ち後も実況をrunningのまま残すと、Overlay表示状態だけが
      // 残留し、再表示時に終了したスレッドのsessionを再利用してしまう。通信一時失敗は
      // expiredにならないため、復旧可能な取得エラーでは実況を維持する。
      void controller.stop().catch((error: unknown) => {
        console.error("[ChLens] dat落ち後のコメント実況停止に失敗しました:", error);
      });
      return;
    }

    if (autoRefreshEnabled) {
      if (isTargetRunning) return;

      // 変更理由: 新着取得とOverlay開始を別操作にすると実況開始までのクリックが増えるため、
      // スレッド自動更新を実況の起動スイッチとして扱い、現在のsnapshotから自動開始する。
      void controller.start(threadUrl, latestResponsesRef.current).catch((error: unknown) => {
        console.error("[ChLens] 自動更新に連動したコメント実況開始に失敗しました:", error);
      });
      return;
    }

    if (!isTargetRunning) return;
    // 変更理由: 自動更新を止めた後に更新されない実況sessionだけを残さず、表示状態も
    // 同じ操作で閉じることで、自動更新とコメント実況のON/OFFを一つに揃える。
    void controller.stop().catch((error: unknown) => {
      console.error("[ChLens] 自動更新に連動したコメント実況停止に失敗しました:", error);
    });
  }, [autoRefreshEnabled, controller, expired, isActive, missingFromSubject, threadUrl]);
}
