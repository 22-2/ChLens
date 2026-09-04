import { DifferenceHashBuilder, Hash, HexadecimalToHash } from "browser-image-hash";
import { matchesRuleSites, type Rule } from "@chlen/ch-lib";
import { createLogger } from "src/core/logger";
import { container } from "src/service-container/index";
import type { IRes } from "src/service-container/interfaces";
import { extractUrlsFromMessage, toViewerImageUrl } from "src/view/browser/utils/url-media";

const DEFAULT_SIMILAR_IMAGE_THRESHOLD = 10;
const MAX_DHASH_DISTANCE = 64;
const DEFAULT_IMAGE_HASH_TIMEOUT_MS = 10_000;
const BINARY_DHASH_PATTERN = /^[01]{64}$/u;
const HEX_DHASH_PATTERN = /^[0-9a-f]{16}$/iu;
const logger = createLogger("SimilarImageNG");

export interface SimilarImageNgRule {
  readonly hash: Hash;
  readonly threshold: number;
}

export interface SimilarImageHashBuilder {
  build(url: URL): Promise<Hash>;
}

export interface SimilarImageCheckOptions {
  readonly hashBuilder?: SimilarImageHashBuilder;
  readonly timeoutMs?: number;
}

/** dHashの二進表記と、browser-image-hashの16進表記の両方を設定値として受け付ける。 */
export function parseSimilarImageHash(value: string): Hash | null {
  const normalized = value.trim();
  if (BINARY_DHASH_PATTERN.test(normalized)) {
    return new Hash(normalized);
  }
  if (HEX_DHASH_PATTERN.test(normalized)) {
    return HexadecimalToHash(normalized);
  }
  return null;
}

function parseSimilarImageThreshold(rule: Rule): number | null {
  const rawThreshold = rule.parameters?.threshold;
  const threshold = rawThreshold == null ? DEFAULT_SIMILAR_IMAGE_THRESHOLD : Number(rawThreshold);
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > MAX_DHASH_DISTANCE) {
    logger.error("類似画像NGルールのthresholdが不正です", {
      threshold: rawThreshold,
      rule,
    });
    return null;
  }
  return threshold;
}

function readConfiguredRules(): readonly Rule[] {
  try {
    return container.ng.getSimilarImageRules?.() ?? [];
  } catch (error) {
    logger.error("類似画像NGルールの取得に失敗しました", { error });
    return [];
  }
}

/** 設定済みRuleから、画像ハッシュ判定に必要な値だけを安全に取り出す。 */
export function getSimilarImageNgRules(
  sourceRules: readonly Rule[] = readConfiguredRules(),
  threadUrl?: string,
): SimilarImageNgRule[] {
  const now = Date.now();
  const rules: SimilarImageNgRule[] = [];

  for (const rule of sourceRules) {
    if (rule.action !== "blur" || rule.target !== "similar-image" || !rule.enabled) continue;
    if (rule.expiresAt != null && now > rule.expiresAt) continue;
    if (threadUrl != null && !matchesRuleSites(rule.scope?.sites, threadUrl)) continue;

    const threshold = parseSimilarImageThreshold(rule);
    if (threshold == null) continue;

    for (const matcher of rule.matchers) {
      if (matcher.kind !== "contains") {
        logger.error("類似画像NGルールの条件種別が不正です", { matcher, rule });
        continue;
      }
      const hash = parseSimilarImageHash(matcher.value);
      if (!hash) {
        logger.error("類似画像NGルールのdHashが不正です", { hash: matcher.value, rule });
        continue;
      }
      rules.push({ hash, threshold });
    }
  }

  return rules;
}

/** レスの表示経路と同じURL変換を使い、ハッシュ計算可能な画像だけを抽出する。 */
export function extractImageUrlsFromRes(res: IRes): string[] {
  const imageUrls = new Set<string>();
  for (const rawUrl of extractUrlsFromMessage(res.message)) {
    const imageUrl = toViewerImageUrl(rawUrl);
    if (imageUrl) imageUrls.add(imageUrl);
  }
  return [...imageUrls];
}

function buildHashWithTimeout(
  builder: SimilarImageHashBuilder,
  url: URL,
  timeoutMs: number,
): Promise<Hash> {
  return new Promise<Hash>((resolve, reject) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      settled = true;
      reject(new Error(`画像ハッシュ計算が${timeoutMs}msでタイムアウトしました`));
    }, timeoutMs);

    void Promise.resolve()
      .then(() => builder.build(url))
      .then(
        (hash: Hash) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          resolve(hash);
        },
        (error: unknown) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          reject(error);
        },
      );
  });
}

/** 画像を1枚ずつ評価し、取得失敗時はその画像だけをスキップして処理を継続する。 */
export async function checkSimilarImages(
  imageUrls: readonly string[],
  rules: readonly SimilarImageNgRule[],
  options: SimilarImageCheckOptions = {},
): Promise<boolean> {
  if (imageUrls.length === 0 || rules.length === 0) return false;

  const builder: SimilarImageHashBuilder = options.hashBuilder ?? new DifferenceHashBuilder();
  const timeoutMs = Math.max(1, options.timeoutMs ?? DEFAULT_IMAGE_HASH_TIMEOUT_MS);

  for (const imageUrl of imageUrls) {
    let url: URL;
    try {
      url = new URL(imageUrl);
    } catch (error) {
      logger.error("類似画像NGの対象URLが不正です", { imageUrl, error });
      continue;
    }

    try {
      const imageHash = await buildHashWithTimeout(builder, url, timeoutMs);
      for (const rule of rules) {
        if (rule.hash.getHammingDistance(imageHash) <= rule.threshold) return true;
      }
    } catch (error) {
      // 404・CORS・canvas制限・タイムアウトは、他の画像やレスの表示を妨げない。
      logger.error("類似画像NGの画像ハッシュ計算に失敗しました", { imageUrl, error });
    }
  }

  return false;
}
