import { CHLENS_BUILD_INFO } from "src/app/build-info";
import { BuildInfoList } from "src/view/browser/components/BuildInfoList";

/** ハンバーガーメニューの「ChLensについて」。配布物の版・ビルド・作者・リポジトリを表示する。 */
export function AboutPage() {
  return (
    <article className="about-page">
      <header>
        <h1 className="about-page__title">ChLens</h1>
        <p className="about-page__summary">5ch 互換掲示板ブラウザ</p>
      </header>
      <BuildInfoList info={CHLENS_BUILD_INFO} />
    </article>
  );
}
