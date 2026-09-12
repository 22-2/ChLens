import type { IRes } from "src/service-container/interfaces";

const isLegacySubjectPadding = (res: IRes): boolean =>
  res.id == null &&
  res.name === "あぼーん" &&
  res.mail === "あぼーん" &&
  res.message === "あぼーん" &&
  res.other === "あぼーん" &&
  res.date === "";

/**
 * 表示用にだけ追加された末尾のあぼーん補填をキャッシュから取り除く。
 *
 * 変更理由: subject.txtのレス数を使った補填は取得結果を一時的に埋めるためのもので、
 * UIキャッシュへ保存すると次回読み込みの先行表示に混ざり、直後の実レス数と入れ替わる
 * 瞬間に「あぼーん」が点滅する。末尾だけを対象にして、本文中の欠番補完は保持する。
 */
export function stripTrailingSyntheticAbobunResponses(responses: readonly IRes[]): IRes[] {
  let end = responses.length;
  while (end > 0 && isLegacySubjectPadding(responses[end - 1])) {
    end -= 1;
  }
  return end === responses.length ? [...responses] : responses.slice(0, end);
}
