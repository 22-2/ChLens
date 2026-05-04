import type { IThread } from "src/service-container/interfaces";

const TITLE_DECORATION_PATTERN =
  / ?(?:\[(?:無断)?転載禁止\]|(?:\(c\)|©|�|&copy;|&#169;)(?:2ch\.net|@?bbspink\.com)) ?/g;
const KATAKANA_PATTERN = /[\u30a1-\u30f6]/g;
const THREAD_NUMBER_PATTERN = /(\d*\.\d+|\d+)/g;
const STAR_NUMBER_PATTERN = /★(\d+)$/;
const PART_DOT_NUMBER_PATTERN = /Part\.(\d+)$/i;
const PART_NUMBER_PATTERN = /Part(\d+)$/i;
const PART2_PATTERN = /(★2|Part\.2|Part2)(?:\s+.*)?$/i;

const NEXT_THREAD_MIN_SIMILARITY = 0.3;
const REFLECTION_MIN_SIMILARITY = 0.6;
const CURRENT_NUMBER_LOWER_BOUND_OFFSET = 2;
const CURRENT_NUMBER_UPPER_BOUND_OFFSET = 3;

export interface NextThreadMatch {
  thread: IThread;
  reason: "mark" | "number" | "reflection" | "mainstream";
  similarity: number;
}

interface ThreadNumberResult {
  value: number;
  hasNumber: boolean;
  isStar: boolean;
}

interface CandidateScore {
  thread: IThread;
  similarity: number;
  number: number;
  hasNumber: boolean;
  isStar: boolean;
}

export interface MainstreamSearchOptions {
  originalThreadUrl: string;
  originalThreadTitle: string;
  currentThreadUrl: string;
  minimumResCount?: number;
  momentumRatio?: number;
  now?: number;
}

function stripTitleDecoration(title: string): string {
  const withoutDecoration = title.replace(TITLE_DECORATION_PATTERN, "");
  const normalizedTitle = withoutDecoration === "" ? title : withoutDecoration;
  return normalizedTitle.replaceAll("<mark>", "").replaceAll("</mark>", "");
}

function katakanaToHiragana(character: string): string {
  return String.fromCodePoint((character.codePointAt(0) ?? 0) - 0x60);
}

export function normalizeThreadTitle(title: string): string {
  return stripTitleDecoration(title)
    .normalize("NFKC")
    .replace(KATAKANA_PATTERN, katakanaToHiragana)
    .replaceAll(" ", "")
    .replaceAll("\u3000", "")
    .toLowerCase();
}

interface LongestCommonSubstringResult {
  aIndex: number;
  bIndex: number;
  size: number;
}

function findLongestCommonSubstring(
  left: string,
  right: string,
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
): LongestCommonSubstringResult {
  const previous = new Uint16Array(rightEnd - rightStart + 1);
  let best = { aIndex: leftStart, bIndex: rightStart, size: 0 };

  for (let leftIndex = leftStart; leftIndex < leftEnd; leftIndex += 1) {
    const current = new Uint16Array(rightEnd - rightStart + 1);
    for (let rightIndex = rightStart; rightIndex < rightEnd; rightIndex += 1) {
      if (left[leftIndex] !== right[rightIndex]) {
        continue;
      }

      const offset = rightIndex - rightStart + 1;
      const size = previous[offset - 1] + 1;
      current[offset] = size;
      if (size > best.size) {
        best = {
          aIndex: leftIndex - size + 1,
          bIndex: rightIndex - size + 1,
          size,
        };
      }
    }
    previous.set(current);
  }

  return best;
}

function countSequenceMatches(
  left: string,
  right: string,
  leftStart = 0,
  leftEnd = left.length,
  rightStart = 0,
  rightEnd = right.length,
): number {
  if (leftStart >= leftEnd || rightStart >= rightEnd) {
    return 0;
  }

  const match = findLongestCommonSubstring(
    left,
    right,
    leftStart,
    leftEnd,
    rightStart,
    rightEnd,
  );

  if (match.size === 0) {
    return 0;
  }

  return (
    match.size +
    countSequenceMatches(
      left,
      right,
      leftStart,
      match.aIndex,
      rightStart,
      match.bIndex,
    ) +
    countSequenceMatches(
      left,
      right,
      match.aIndex + match.size,
      leftEnd,
      match.bIndex + match.size,
      rightEnd,
    )
  );
}

export function calculateTitleSimilarity(
  leftTitle: string,
  rightTitle: string,
): number {
  const left = normalizeThreadTitle(leftTitle);
  const right = normalizeThreadTitle(rightTitle);

  if (left === "" || right === "") {
    return left === right ? 1 : 0;
  }

  const matches = countSequenceMatches(left, right);
  return (2 * matches) / (left.length + right.length);
}

export function extractThreadSequenceNumber(title: string): ThreadNumberResult {
  const trimmedTitle = title.trim();
  const starMatch = trimmedTitle.match(STAR_NUMBER_PATTERN);
  if (starMatch) {
    return {
      value: Number.parseFloat(starMatch[1]),
      hasNumber: true,
      isStar: true,
    };
  }

  const partDotMatch = trimmedTitle.match(PART_DOT_NUMBER_PATTERN);
  if (partDotMatch) {
    return {
      value: Number.parseFloat(partDotMatch[1]),
      hasNumber: true,
      isStar: false,
    };
  }

  const partMatch = trimmedTitle.match(PART_NUMBER_PATTERN);
  if (partMatch) {
    return {
      value: Number.parseFloat(partMatch[1]),
      hasNumber: true,
      isStar: false,
    };
  }

  const matches = trimmedTitle.match(THREAD_NUMBER_PATTERN);
  if (!matches || matches.length === 0) {
    return { value: 0, hasNumber: false, isStar: false };
  }

  return {
    value: Number.parseFloat(matches[matches.length - 1]),
    hasNumber: true,
    isStar: false,
  };
}

function extractThreadTimestamp(url: string): number {
  try {
    const parsed = new window.URL(url);
    const matched = parsed.pathname.match(/\/(\d+)\/?$/);
    return matched ? Number.parseInt(matched[1], 10) : 0;
  } catch {
    return 0;
  }
}

function getThreadSortKey(thread: IThread): number {
  return extractThreadTimestamp(thread.url) || thread.createdAt || 0;
}

function buildCandidateScores(
  threads: readonly IThread[],
  currentThreadTitle: string,
): CandidateScore[] {
  return threads
    .map((thread) => {
      const similarity = calculateTitleSimilarity(currentThreadTitle, thread.title);
      const number = extractThreadSequenceNumber(thread.title);

      return {
        thread,
        similarity,
        number: number.value,
        hasNumber: number.hasNumber,
        isStar: number.isStar,
      };
    })
    .filter((candidate) => candidate.similarity >= NEXT_THREAD_MIN_SIMILARITY);
}

function sortBySimilarity(candidates: readonly CandidateScore[]): CandidateScore[] {
  return [...candidates].sort((left, right) => {
    if (right.similarity !== left.similarity) {
      return right.similarity - left.similarity;
    }
    return getThreadSortKey(right.thread) - getThreadSortKey(left.thread);
  });
}

function buildExpectedNumbers(currentTitle: string): {
  expectedNumbers: number[];
  hasCurrentNumber: boolean;
} {
  const current = extractThreadSequenceNumber(currentTitle);
  if (!current.hasNumber) {
    return { expectedNumbers: [1, 2], hasCurrentNumber: false };
  }

  const start = Math.max(
    1,
    Math.floor(current.value) - CURRENT_NUMBER_LOWER_BOUND_OFFSET,
  );
  const end = Math.floor(current.value) + CURRENT_NUMBER_UPPER_BOUND_OFFSET;
  const expectedNumbers: number[] = [];
  for (let number = start; number <= end; number += 1) {
    expectedNumbers.push(number);
  }

  return { expectedNumbers, hasCurrentNumber: true };
}

function isMarkedThread(title: string): boolean {
  return title.trimStart().startsWith("●");
}

export function getBoardUrlFromThreadUrl(threadUrl: string): string {
  const parsed = new window.URL(threadUrl);
  const chMatch = parsed.pathname.match(/^\/test\/read\.cgi\/([^/]+)\//);
  if (chMatch) {
    return `${parsed.origin}/${chMatch[1]}/`;
  }

  const shitarabaMatch = parsed.pathname.match(
    /^\/bbs\/read(?:_archive)?\.cgi\/([^/]+\/[^/]+)\//,
  );
  if (shitarabaMatch) {
    return `${parsed.origin}/bbs/read.cgi/${shitarabaMatch[1]}/`;
  }

  const machiMatch = parsed.pathname.match(/^\/bbs\/read\.cgi\/([^/]+)\//);
  if (machiMatch) {
    return `${parsed.origin}/${machiMatch[1]}/`;
  }

  const eddibbMatch = parsed.pathname.match(/^\/([^/]+)\/\d+\/?$/);
  if (eddibbMatch) {
    return `${parsed.origin}/${eddibbMatch[1]}/`;
  }

  return threadUrl;
}

export function calculateThreadMomentum(
  thread: IThread,
  now = Date.now(),
): number {
  if (
    !Number.isFinite(thread.createdAt) ||
    thread.createdAt <= 0 ||
    thread.createdAt > now
  ) {
    return 0;
  }

  const elapsedDays =
    Math.max((now - thread.createdAt) / 1000, 1) / (24 * 60 * 60);
  return thread.resCount / elapsedDays;
}

export function findNextThreadMatch(
  threads: readonly IThread[],
  currentThread: Pick<IThread, "title" | "url">,
): NextThreadMatch | null {
  const availableThreads = threads.filter(
    (thread) => thread.url !== currentThread.url && thread.resCount < 1000,
  );

  if (availableThreads.length === 0) {
    return null;
  }

  if (isMarkedThread(currentThread.title)) {
    const markedCandidates = availableThreads.filter((thread) =>
      isMarkedThread(thread.title),
    );
    if (markedCandidates.length > 0) {
      const thread = [...markedCandidates].sort(
        (left, right) => getThreadSortKey(right) - getThreadSortKey(left),
      )[0];
      return {
        thread,
        reason: "mark",
        similarity: calculateTitleSimilarity(currentThread.title, thread.title),
      };
    }
  }

  const candidateScores = buildCandidateScores(availableThreads, currentThread.title);
  const { expectedNumbers, hasCurrentNumber } = buildExpectedNumbers(
    currentThread.title,
  );
  const validCandidates = sortBySimilarity(
    candidateScores.filter((candidate) => {
      if (expectedNumbers.includes(candidate.number)) {
        return true;
      }
      if (
        candidate.isStar &&
        (candidate.number === 1 || candidate.number === 2)
      ) {
        return true;
      }
      return (
        !hasCurrentNumber &&
        candidate.number === 2 &&
        PART2_PATTERN.test(candidate.thread.title)
      );
    }),
  );

  if (validCandidates.length > 0) {
    const best = validCandidates[0];
    return {
      thread: best.thread,
      reason: "number",
      similarity: best.similarity,
    };
  }

  const reflectionCandidates = sortBySimilarity(
    candidateScores.filter(
      (candidate) =>
        candidate.thread.title.includes("反省会") &&
        candidate.similarity >= REFLECTION_MIN_SIMILARITY,
    ),
  );

  if (reflectionCandidates.length === 0) {
    return null;
  }

  return {
    thread: reflectionCandidates[0].thread,
    reason: "reflection",
    similarity: reflectionCandidates[0].similarity,
  };
}

function filterMainstreamCandidates(
  threads: readonly IThread[],
  options: Required<
    Pick<
      MainstreamSearchOptions,
      "originalThreadTitle" | "originalThreadUrl" | "currentThreadUrl"
    >
  > & {
    minimumResCount: number;
  },
): CandidateScore[] {
  const {
    originalThreadTitle,
    originalThreadUrl,
    currentThreadUrl,
    minimumResCount,
  } = options;
  const candidates = threads.filter((thread) => {
    if (thread.url === currentThreadUrl || thread.url === originalThreadUrl) {
      return false;
    }
    if (thread.resCount >= 1000 || thread.resCount < minimumResCount) {
      return false;
    }
    return true;
  });

  if (isMarkedThread(originalThreadTitle)) {
    return buildCandidateScores(
      candidates.filter((thread) => isMarkedThread(thread.title)),
      originalThreadTitle,
    );
  }

  const current = extractThreadSequenceNumber(originalThreadTitle);
  const expectedNumbers = current.hasNumber ? [current.value + 1, current.value] : [2];

  return buildCandidateScores(candidates, originalThreadTitle).filter((candidate) => {
    if (expectedNumbers.includes(candidate.number)) {
      return true;
    }
    if (candidate.isStar && (candidate.number === 1 || candidate.number === 2)) {
      return true;
    }
    return (
      !current.hasNumber &&
      candidate.number === 2 &&
      PART2_PATTERN.test(candidate.thread.title)
    );
  });
}

export function findMainstreamThreadMatch(
  threads: readonly IThread[],
  options: MainstreamSearchOptions,
): NextThreadMatch | null {
  const {
    originalThreadUrl,
    originalThreadTitle,
    currentThreadUrl,
    minimumResCount = 10,
    momentumRatio = 1.5,
    now = Date.now(),
  } = options;
  const currentThread = threads.find((thread) => thread.url === currentThreadUrl);

  if (!currentThread) {
    return null;
  }

  const currentMomentum = calculateThreadMomentum(currentThread, now);
  if (currentMomentum <= 0) {
    return null;
  }

  const candidates = filterMainstreamCandidates(threads, {
    originalThreadTitle,
    originalThreadUrl,
    currentThreadUrl,
    minimumResCount,
  });

  const viableCandidates = candidates
    .map((candidate) => ({
      ...candidate,
      momentum: calculateThreadMomentum(candidate.thread, now),
    }))
    .filter((candidate) => candidate.momentum > currentMomentum * momentumRatio)
    .sort((left, right) => {
      if (right.momentum !== left.momentum) {
        return right.momentum - left.momentum;
      }
      if (right.similarity !== left.similarity) {
        return right.similarity - left.similarity;
      }
      return getThreadSortKey(right.thread) - getThreadSortKey(left.thread);
    });

  if (viableCandidates.length === 0) {
    return null;
  }

  return {
    thread: viableCandidates[0].thread,
    reason: "mainstream",
    similarity: viableCandidates[0].similarity,
  };
}
