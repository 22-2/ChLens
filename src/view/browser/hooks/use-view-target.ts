import { type Dispatch, useMemo } from "react";
import type { IToastService } from "src/service-container/interfaces";
import type { ScopedTabAction } from "src/view/browser/hooks/tab-store-types";
import { useTabDispatchForTab } from "src/view/browser/hooks/use-tab-store";
import { useToast } from "src/view/browser/hooks/use-toast";
import { useViewSurface, type ViewSurface } from "src/view/browser/hooks/use-view-surface";

export interface ViewTarget {
  tabId: string;
  dispatch: Dispatch<ScopedTabAction>;
  surface: ViewSurface;
  toast: IToastService;
}

/**
 * ページが操作するタブと表示環境をまとめて返す。
 *
 * 変更理由: 別窓対応でtabId・Window・通知先を各ページが個別に組み立てると、
 * 新しい表示ホストを追加した際に操作の一部だけ元のペインへ戻るため、同じ境界から注入する。
 */
export function useViewTarget(tabId: string): ViewTarget {
  const dispatch = useTabDispatchForTab(tabId);
  const surface = useViewSurface();
  const toast = useToast();

  return useMemo(() => ({ tabId, dispatch, surface, toast }), [dispatch, surface, tabId, toast]);
}
