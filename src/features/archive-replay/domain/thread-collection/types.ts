export interface ThreadCollectionSeed {
  threadUrl: string;
  title: string;
  createdAtSeconds: number;
}

export interface ArchivedThreadListing extends ThreadCollectionSeed {
  responseCount?: number;
}

export interface ThreadCollectionCandidate {
  listing: ArchivedThreadListing;
  kind: "seed" | "search-match" | "sequence-follow";
  score: number;
  reasons: readonly string[];
}

export interface ThreadCollectionParams {
  beforeSeconds: number;
  afterSeconds: number;
  followSimilarityThreshold: number;
  defaultCheckedThreshold: number;
  maxFollowPasses: number;
  sequenceBonus: number;
}

export const DEFAULT_THREAD_COLLECTION_PARAMS: ThreadCollectionParams = {
  beforeSeconds: 30 * 60,
  afterSeconds: 3 * 60 * 60,
  followSimilarityThreshold: 0.7,
  defaultCheckedThreshold: 0.8,
  maxFollowPasses: 20,
  sequenceBonus: 0.1,
};
