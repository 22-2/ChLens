import { ChURL } from "@chlen/chlib";
import { extractThreadSequenceNumber } from "src/features/next-thread/domain/thread-sequence";
import {
  calculateBaseTitleSimilarity,
  EXPLICIT_SEQUENCE_PATTERN,
  normalizeThreadTitle,
  stripTitleDecoration,
} from "src/features/next-thread/domain/title-similarity";

import type { CollectionWindow } from "./collection-window";
import type {
  ArchivedThreadListing,
  ThreadCollectionCandidate,
  ThreadCollectionParams,
  ThreadCollectionSeed,
} from "./types";

export function defaultCollectionQuery(title: string): string {
  return stripTitleDecoration(title)
    .normalize("NFKC")
    .replace(EXPLICIT_SEQUENCE_PATTERN, "$3")
    .trim();
}

function identity(url: string): string {
  try {
    // dat形式やHTTP・HTTPS違いでも同じスレを二重に選ばない。
    const threadKey = new ChURL(url).getThreadKey();
    if (threadKey) return threadKey.replace(/\/+$/, "");
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    return parsed.href;
  } catch {
    return url.trim().replace(/\/+$/, "");
  }
}

export function collectThreadCandidates(
  listings: readonly ArchivedThreadListing[],
  query: string,
  window: CollectionWindow,
  params: ThreadCollectionParams,
  seed?: ThreadCollectionSeed,
): ThreadCollectionCandidate[] {
  const entries = new Map<string, ArchivedThreadListing>();
  for (const listing of listings) {
    if (
      listing.createdAtSeconds < window.startSeconds ||
      listing.createdAtSeconds > window.endSeconds
    )
      continue;
    const key = identity(listing.threadUrl);
    if (!entries.has(key)) entries.set(key, listing);
  }
  const candidates = new Map<string, ThreadCollectionCandidate>();
  if (seed) {
    const key = identity(seed.threadUrl);
    candidates.set(key, {
      listing: entries.get(key) ?? seed,
      kind: "seed",
      score: 1,
      reasons: ["種スレ"],
    });
    entries.delete(key);
  }
  const normalizedQuery = normalizeThreadTitle(query);
  for (const [key, listing] of entries) {
    if (normalizedQuery && normalizeThreadTitle(listing.title).includes(normalizedQuery)) {
      candidates.set(key, {
        listing,
        kind: "search-match",
        score: 1,
        reasons: ["検索語がタイトルに一致"],
      });
      entries.delete(key);
    }
  }
  // 各周回は直前までの候補だけを参照し、入力順により探索の深さが変わらないようにする。
  for (let pass = 0; pass < params.maxFollowPasses && entries.size; pass += 1) {
    const previous = [...candidates.values()];
    let added = 0;
    for (const [key, listing] of entries) {
      let bestScore = -1;
      let sequenceNext = false;
      for (const candidate of previous) {
        if (listing.createdAtSeconds < candidate.listing.createdAtSeconds) continue;
        const similarity = calculateBaseTitleSimilarity(candidate.listing.title, listing.title);
        if (similarity < params.followSimilarityThreshold) continue;
        const before = extractThreadSequenceNumber(candidate.listing.title);
        const after = extractThreadSequenceNumber(listing.title);
        const next =
          before.isExplicitSequence && after.isExplicitSequence && after.value === before.value + 1;
        const score = Math.min(1, similarity + (next ? params.sequenceBonus : 0));
        if (score > bestScore) {
          bestScore = score;
          sequenceNext = next;
        }
      }
      if (bestScore < 0) continue;
      candidates.set(key, {
        listing,
        kind: "sequence-follow",
        score: bestScore,
        reasons: sequenceNext ? ["候補と題名が類似", "連番が進行"] : ["候補と題名が類似"],
      });
      entries.delete(key);
      added += 1;
    }
    if (!added) break;
  }
  return [...candidates.values()].sort(
    (a, b) =>
      a.listing.createdAtSeconds - b.listing.createdAtSeconds ||
      a.listing.threadUrl.localeCompare(b.listing.threadUrl),
  );
}
