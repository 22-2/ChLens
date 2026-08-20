import type { INGResult } from "src/service-container";
import { Tooltip } from "src/view/browser/ui/Tooltip";
import { getNgBadgeLabel } from "src/view/browser/utils/ng-badge";

export function NgBadge({ result }: { result: INGResult | undefined }) {
  return (
    <Tooltip label={<span className="res__ng-tooltip">{getNgBadgeLabel(result)}</span>}>
      <span className="res__badge res__badge--ng">NG</span>
    </Tooltip>
  );
}
