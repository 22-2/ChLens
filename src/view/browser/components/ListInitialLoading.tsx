import { Spinner } from "src/view/browser/ui/Spinner";

interface ListInitialLoadingProps {
  visible: boolean;
  label: string;
}

/**
 * 一覧をまだ1行も表示していないときの読み込み表示。
 *
 * 変更理由: すぐ終わる読み込みで「読み込み中」が一瞬だけ出るとちらついて見えるため、
 * 待ちが続いたときだけ中身を出し、それまでは空の領域にしておく。
 */
export function ListInitialLoading({ visible, label }: ListInitialLoadingProps) {
  return (
    <div className="page-status" aria-busy="true">
      {visible ? (
        <>
          <Spinner size="sm" aria-label={label} />
          <span>読み込み中...</span>
        </>
      ) : null}
    </div>
  );
}
