/** 配布物のビルド時の情報。値は vite.config.ts が注入し、テストは vitest.config.ts が固定値を入れる。 */
export interface ChlensBuildInfo {
  /** package.json の version。 */
  version: string;
  /** ビルドを実行した時刻（ISO 8601）。開発版の watch では監視を始めた時刻になる。 */
  buildTime: string;
  /** ビルド時の HEAD の短いコミットハッシュ。git が使えない環境では "unknown"。 */
  gitHash: string;
  author: string;
  license: string;
  repositoryUrl: string;
}

export const CHLENS_BUILD_INFO: ChlensBuildInfo = __CHLENS_BUILD_INFO__;
