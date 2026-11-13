/** 自動記録では未読の始まり、手動記録では指定した既読位置を示す。 */
export function ReadPositionLine({ manual = false }: { manual?: boolean }) {
  const label = manual ? "ここまで読んだ" : "ここから未読";
  return (
    <div className="thread-page__replay-position" role="separator" aria-label={label}>
      <span>{label}</span>
    </div>
  );
}
