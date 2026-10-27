import { getPageIdentity as getPageIdentityFromDefinition } from "src/view/browser/page-type-definitions";
import type { Page } from "src/view/browser/types";

// ページの同一性の判定は、新しいタブの生成（tab-store-new-tab）と状態の補助
// （tab-store-state-helpers）の両方から使う。片方に置くと互いに import する循環になるため、
// どちらにも依存しない葉のモジュールとして分ける（Phase E）。

export function getPageIdentity(page: Page): string {
  return getPageIdentityFromDefinition(page);
}
