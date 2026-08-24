import { createHash } from "node:crypto";

export type TriageRunMode = "dry-run" | "apply";

export interface TriageQueueStateLike {
  version?: number;
  mode?: TriageRunMode;
  reviewed_source_hashes?: string[];
  has_more_unreviewed_items?: boolean;
  remaining_count?: number;
  waiting_issue_numbers?: number[];
}

export interface TriageQueueProgress {
  reviewedSourceHashes: string[];
  hasMoreUnreviewedItems: boolean;
  remainingCount: number;
  waitingIssueNumbers: number[];
}

export interface QueueIssueSnapshotItem {
  number: number;
  state: "OPEN" | "CLOSED";
  labels: Array<{ name: string }>;
}

export function hashTriageSource(sourceText: string): string {
  return createHash("sha256").update(sourceText, "utf8").digest("hex");
}

export function readQueueProgress(
  state: TriageQueueStateLike | undefined,
  mode: TriageRunMode,
  force: boolean,
): TriageQueueProgress {
  // v1はファイル全体を処理済みとしていたため、未処理項目を取りこぼさないよう新しいキューとして開始する。
  if (force || state?.version !== 2 || state.mode !== mode) {
    return {
      reviewedSourceHashes: [],
      hasMoreUnreviewedItems: true,
      remainingCount: 0,
      waitingIssueNumbers: [],
    };
  }

  return {
    reviewedSourceHashes: [...new Set(state.reviewed_source_hashes ?? [])],
    hasMoreUnreviewedItems: state.has_more_unreviewed_items ?? true,
    remainingCount: Math.max(0, state.remaining_count ?? 0),
    waitingIssueNumbers: [...new Set(state.waiting_issue_numbers ?? [])],
  };
}

export function mergeReviewedSourceHashes(
  existingHashes: readonly string[],
  reviewedSourceTexts: readonly string[],
): string[] {
  return [...new Set([...existingHashes, ...reviewedSourceTexts.map(hashTriageSource)])];
}

export function getWaitingIssueNumbers(
  issues: readonly QueueIssueSnapshotItem[],
  trackedIssueNumbers: readonly number[],
): number[] {
  const tracked = new Set(trackedIssueNumbers);
  const humanWaitLabels = new Set(["needs-priority", "needs-info"]);
  return issues
    .filter(
      (issue) =>
        tracked.has(issue.number) &&
        issue.state === "OPEN" &&
        issue.labels.some((label) => humanWaitLabels.has(label.name)),
    )
    .map((issue) => issue.number);
}
