import type { ChlensBuildInfo } from "src/app/build-info";
import { formatJstTimestamp } from "src/app/debug/log-persistence";

export interface BuildInfoRow {
  key: keyof ChlensBuildInfo;
  label: string;
  value: string;
}

/**
 * 版情報の項目名・順番・表示形式の正本。
 *
 * 変更理由: 「ChLensについて」のページ・デバッグ画面・報告用の環境情報で、項目名や時刻の形式が
 * 別々に書かれてずれていた。ここで一度だけ決め、どの表示も同じ行を使う。
 * 時刻は報告で突き合わせやすいよう、ログと同じ日本時間の形式にそろえる。
 */
export function buildInfoRows(info: ChlensBuildInfo): BuildInfoRow[] {
  return [
    { key: "version", label: "バージョン", value: info.version },
    {
      key: "buildTime",
      label: "ビルド時刻",
      value: formatJstTimestamp(Date.parse(info.buildTime)),
    },
    { key: "gitHash", label: "Gitハッシュ", value: info.gitHash },
    { key: "author", label: "作者", value: info.author },
    { key: "repositoryUrl", label: "リポジトリ", value: info.repositoryUrl },
    { key: "license", label: "ライセンス", value: info.license },
  ];
}
