/** 「ここまで読んだ」の区切り線。仮想リストの中に、読んだ位置の境目として差し込む。 */
export function ReadPositionLine() {
  return (
    <div className="thread-page__replay-position" role="separator" aria-label="ここまで読んだ">
      <span>ここまで読んだ</span>
    </div>
  );
}
