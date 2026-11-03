import { Fragment, type ReactNode } from "react";
import type { ChlensBuildInfo } from "src/app/build-info";
import { type BuildInfoRow, buildInfoRows } from "src/app/debug/build-info-rows";
import { ConfirmableLink } from "src/view/browser/ui/ConfirmableLink";

/**
 * 版情報を項目名つきの一覧で出す。「ChLensについて」とデバッグ画面で同じ表記にする。
 *
 * 変更理由: 2か所で同じ一覧を別々に組むと、項目の追加や見た目の修正が片方だけに入ってずれるため。
 * 項目の中身は buildInfoRows、見た目はここで決める。
 */
export function BuildInfoList({ info }: { info: ChlensBuildInfo }) {
  return (
    <dl className="build-info-list">
      {buildInfoRows(info).map((row) => (
        <Fragment key={row.key}>
          <dt>{row.label}</dt>
          <dd>{renderValue(row, info)}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

function renderValue(row: BuildInfoRow, info: ChlensBuildInfo): ReactNode {
  switch (row.key) {
    case "buildTime":
      return <time dateTime={info.buildTime}>{row.value}</time>;
    case "gitHash":
      return <code className="build-info-list__hash">{row.value}</code>;
    case "repositoryUrl":
      return (
        <ConfirmableLink
          className="build-info-list__link"
          href={row.value}
          target="_blank"
          rel="noopener noreferrer"
        >
          {row.value}
        </ConfirmableLink>
      );
    default:
      return row.value;
  }
}
