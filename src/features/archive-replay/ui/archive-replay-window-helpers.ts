import "./ArchiveReplayWindow.css";

import type { CommentCandidate } from "src/features/comment-overlay/domain";
import { projectCommentResponse } from "src/features/comment-overlay/domain";
import type { IThreadDetail } from "src/service-container/interfaces";

import { type ArchiveReplayTimeline } from "../domain";

export interface ArchiveReplayThreadSelection {
  threadUrl: string;
  responseNumber: number;
  title: string;
}

export function projectThreadComments(thread: IThreadDetail): readonly CommentCandidate[] {
  return thread.res
    .map((response) => projectCommentResponse(response))
    .filter((comment): comment is CommentCandidate => comment !== null);
}

export function createReplaySessionId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function formatReplayDuration(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(wholeSeconds / 3_600);
  const minutes = Math.floor((wholeSeconds % 3_600) / 60);
  const remainder = wholeSeconds % 60;
  return hours > 0
    ? `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${remainder
        .toString()
        .padStart(2, "0")}`
    : `${minutes.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`;
}

export function formatReplayClock(timestamp: number): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

export function resolveArchiveReplayThreadSelection(
  timeline: ArchiveReplayTimeline,
  position: number,
  syncOffset: number,
  threadTitles: Readonly<Record<string, string>>,
): ArchiveReplayThreadSelection | null {
  let firstInRange: ArchiveReplayTimeline["comments"][number] | null = null;
  let current: ArchiveReplayTimeline["comments"][number] | null = null;

  for (const comment of timeline.comments) {
    const effectiveOffset = comment.replayOffsetSeconds + syncOffset;
    if (effectiveOffset < 0 || effectiveOffset > timeline.durationSeconds) continue;
    firstInRange ??= comment;
    if (effectiveOffset <= position) {
      current = comment;
      continue;
    }
    break;
  }

  const selected = current ?? firstInRange;
  if (!selected) return null;

  return {
    threadUrl: selected.sourceThreadUrl,
    responseNumber: selected.responseNumber,
    title: threadTitles[selected.sourceThreadUrl] ?? selected.sourceThreadUrl,
  };
}
