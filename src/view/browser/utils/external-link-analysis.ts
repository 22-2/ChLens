import { compileSanitizer, type Sanitizer } from "@url-sanitize/core";
import { mergedCatalog } from "@url-sanitize/merged";
import { createLogger } from "src/app/logger";

export const EXTERNAL_LINK_CONFIRM_CONFIG_KEY = "confirm_external_links";
const logger = createLogger("url");
let sanitizer: Sanitizer | undefined;

export interface ExternalLinkAnalysis {
  original: string;
  hostname: string;
  cleanedUrl: string | null;
  removedParameters: string[];
  warnings: string[];
  canOpen: boolean;
}

function parseWebUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

/** 通信せずURLを解析する。フィルタへの未一致を安全判定として扱わない。 */
export function analyzeExternalLink(original: string): ExternalLinkAnalysis {
  const parsed = parseWebUrl(original);
  const analysis: ExternalLinkAnalysis = {
    original,
    hostname: parsed?.hostname ?? "",
    cleanedUrl: null,
    removedParameters: [],
    warnings: [],
    canOpen: parsed !== null,
  };
  if (!parsed) {
    analysis.warnings.push("HTTP・HTTPS以外のURL、または不正なURLは開けません。");
    return analysis;
  }
  if (parsed.protocol === "http:") analysis.warnings.push("暗号化されていないHTTPのリンクです。");
  if (parsed.username || parsed.password) analysis.warnings.push("URLに認証情報が含まれています。");
  try {
    // 変更理由: OFF時や通常の再描画ではカタログをコンパイルせず、最初の確認時に一度だけ行う。
    sanitizer ??= compileSanitizer(mergedCatalog, { stripReferralMarketing: true });
    const result = sanitizer(original);
    if (result.kind === "blocked") {
      analysis.warnings.push("URLフィルタのブロックルールに一致しています。");
    } else if (result.kind === "cleaned" || result.kind === "redirected") {
      if (parseWebUrl(result.url) && result.url !== original) analysis.cleanedUrl = result.url;
      if (result.kind === "cleaned") {
        analysis.removedParameters = result.strippedParams;
        if (result.strippedParams.length) {
          analysis.warnings.push(
            `追跡・紹介用パラメータの除去候補: ${result.strippedParams.join("、")}`,
          );
        }
      } else {
        analysis.warnings.push("既知の転送URLです。ルールから展開した転送先候補を表示しています。");
      }
    }
  } catch (error) {
    logger.error("外部リンクのURL解析に失敗しました", error);
    analysis.warnings.push("追跡情報の解析に失敗しました。URLを確認してから開いてください。");
  }
  return analysis;
}
