import { describe, expect, it } from "vite-plus/test";

import {
  getWaitingIssueNumbers,
  hashTriageSource,
  mergeReviewedSourceHashes,
  readQueueProgress,
} from "../../scripts/triage-todo-queue.ts";

describe("triage todo queue", () => {
  it("starts a fresh queue when reading the legacy whole-file state", () => {
    expect(
      readQueueProgress(
        {
          mode: "apply",
        },
        "apply",
        false,
      ),
    ).toEqual({
      reviewedSourceHashes: [],
      hasMoreUnreviewedItems: true,
      remainingCount: 0,
      waitingIssueNumbers: [],
    });
  });

  it("restores version 2 progress without duplicate entries", () => {
    expect(
      readQueueProgress(
        {
          version: 2,
          mode: "apply",
          reviewed_source_hashes: ["a", "a", "b"],
          has_more_unreviewed_items: true,
          remaining_count: 12,
          waiting_issue_numbers: [21, 21, 22],
        },
        "apply",
        false,
      ),
    ).toEqual({
      reviewedSourceHashes: ["a", "b"],
      hasMoreUnreviewedItems: true,
      remainingCount: 12,
      waitingIssueNumbers: [21, 22],
    });
  });

  it("records reviewed source text by content hash", () => {
    expect(mergeReviewedSourceHashes(["existing"], ["todo A", "todo A", "todo B"])).toEqual([
      "existing",
      hashTriageSource("todo A"),
      hashTriageSource("todo B"),
    ]);
  });

  it("waits only for tracked open issues requiring human input", () => {
    const issues = [
      { number: 1, state: "OPEN" as const, labels: [{ name: "needs-priority" }] },
      { number: 2, state: "OPEN" as const, labels: [{ name: "ready" }] },
      { number: 3, state: "CLOSED" as const, labels: [{ name: "needs-priority" }] },
      { number: 4, state: "OPEN" as const, labels: [{ name: "needs-info" }] },
    ];

    expect(getWaitingIssueNumbers(issues, [1, 2, 3, 4])).toEqual([1, 4]);
  });
});
