import { useState } from "react";

/** 自動更新の有効化やタブ復帰のときに、最下部へ移動すべきかを返す。 */
export function useThreadMoveToBottomOnEnable({
  isActive,
  isAutoRefreshEnabled,
  liveChatFollowing,
}: {
  isActive: boolean;
  isAutoRefreshEnabled: boolean;
  liveChatFollowing: boolean;
}) {
  const [activation, setActivation] = useState({
    isActive,
    isAutoRefreshEnabled,
    followedBeforeLeaving: false,
    moveToBottom: false,
  });
  let currentActivation = activation;
  if (
    activation.isActive !== isActive ||
    activation.isAutoRefreshEnabled !== isAutoRefreshEnabled
  ) {
    // 別タブに移る直前の追従状態を覚え、復帰時はその位置を引き継ぐ。
    currentActivation = {
      isActive,
      isAutoRefreshEnabled,
      followedBeforeLeaving: !isActive ? liveChatFollowing : activation.followedBeforeLeaving,
      moveToBottom:
        (isAutoRefreshEnabled && !activation.isAutoRefreshEnabled) ||
        (isActive && !activation.isActive && activation.followedBeforeLeaving),
    };
    setActivation(currentActivation);
  }
  return currentActivation.moveToBottom;
}
