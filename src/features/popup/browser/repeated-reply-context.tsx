import { createContext, type ReactNode, useContext, useMemo } from "react";
import { useIsNgTemporarilyDisabled } from "src/features/ng/browser/use-ng-status";
import { findRepeatedReplyNums } from "src/features/popup/browser/repeated-reply";
import type { IRes } from "src/service-container";

const RepeatedReplyContext = createContext<ReadonlySet<number>>(new Set());

export function RepeatedReplyProvider({
  responses,
  children,
}: {
  responses: readonly IRes[];
  children: ReactNode;
}) {
  const ngDisabled = useIsNgTemporarilyDisabled();
  const repeated = useMemo(
    () =>
      findRepeatedReplyNums(
        responses.filter(
          // 隠したNGレスの存在を、他のIDの強調から推測できないよう集計から除く。
          (res) => ngDisabled || (res.ng == null && !res.class?.includes("ng")),
        ),
      ),
    [responses, ngDisabled],
  );
  return <RepeatedReplyContext value={repeated}>{children}</RepeatedReplyContext>;
}

export function useIsRepeatedReply(num: number): boolean {
  return useContext(RepeatedReplyContext).has(num);
}
