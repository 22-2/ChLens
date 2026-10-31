import { CHLENS_BUILD_INFO } from "src/app/build-info";
import { ConfirmableLink } from "src/view/browser/ui/ConfirmableLink";
import { formatCompactDateTime } from "src/view/browser/utils/date-time";

/** ハンバーガーメニューの「ChLensについて」。配布物の版・ビルド・作者・リポジトリを表示する。 */
export function AboutPage() {
  const info = CHLENS_BUILD_INFO;
  return (
    <article className="about-page">
      <header>
        <h1 className="about-page__title">ChLens</h1>
        <p className="about-page__summary">5ch 互換掲示板ブラウザ</p>
      </header>
      <dl className="about-page__details">
        <dt>バージョン</dt>
        <dd>{info.version}</dd>
        <dt>ビルド時刻</dt>
        <dd>
          <time dateTime={info.buildTime}>{formatCompactDateTime(Date.parse(info.buildTime))}</time>
        </dd>
        <dt>Gitハッシュ</dt>
        <dd>
          <code className="about-page__hash">{info.gitHash}</code>
        </dd>
        <dt>作者</dt>
        <dd>{info.author}</dd>
        <dt>リポジトリ</dt>
        <dd>
          <ConfirmableLink
            className="about-page__link"
            href={info.repositoryUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {info.repositoryUrl}
          </ConfirmableLink>
        </dd>
        <dt>ライセンス</dt>
        <dd>{info.license}</dd>
      </dl>
    </article>
  );
}
