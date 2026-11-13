/** 表示中のレスの末尾を示し、スレ自体の終了とは区別する。 */
export function ThreadEndLine({ filtered }: { filtered: boolean }) {
  const label = filtered ? "絞り込み結果の末尾" : "END";
  return (
    <div className="thread-page__end" role="separator" aria-label={label}>
      <span>{label}</span>
    </div>
  );
}
