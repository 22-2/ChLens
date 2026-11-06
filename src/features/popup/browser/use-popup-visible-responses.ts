import { useCallback } from "react";
import {
  useIsNgTemporarilyDisabled,
  useNgDisplayMode,
} from "src/features/ng/browser/use-ng-status";
import type { IRes } from "src/service-container";
import { resolveNgDisplayMode } from "src/view/browser/utils/ng-display-mode";

/** 描画だけでなくコピーやツリーの索引からも完全非表示のレスを除く。 */
export function usePopupResponseVisibility() {
  const disabled = useIsNgTemporarilyDisabled();
  const mode = useNgDisplayMode();
  return useCallback(
    (res: IRes) =>
      disabled ||
      !(res.ng != null || res.class?.includes("ng")) ||
      resolveNgDisplayMode(mode, res.ng) !== "hard-ng",
    [disabled, mode],
  );
}
