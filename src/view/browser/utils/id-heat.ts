export const ID_HEAT_MIN_ACTIVE_COUNT = 2;
export const ID_HEAT_COOL_PEAK_COUNT = 4;
export const ID_HEAT_HOT_MAX_COUNT = 12;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * IDの出現回数に応じて「灰色 -> 青 -> 赤」の連続色へ変換する。
 * クラス閾値だけだと急に色が変わって読みにくいため、段階間を補間して視認性を上げる。
 */
export function getIdHeatColor(idCount: number): string {
  if (idCount <= 1) {
    return "var(--browser-color-res-id-muted)";
  }

  if (idCount <= ID_HEAT_COOL_PEAK_COUNT) {
    const range = Math.max(ID_HEAT_COOL_PEAK_COUNT - ID_HEAT_MIN_ACTIVE_COUNT, 1);
    const ratio = clamp01((idCount - ID_HEAT_MIN_ACTIVE_COUNT) / range);
    const coolPercent = Math.round(ratio * 100);
    const mutedPercent = 100 - coolPercent;
    return `color-mix(in srgb, var(--browser-color-res-id-muted) ${mutedPercent}%, var(--browser-color-res-id-cool) ${coolPercent}%)`;
  }

  const hotRange = Math.max(ID_HEAT_HOT_MAX_COUNT - ID_HEAT_COOL_PEAK_COUNT, 1);
  const hotRatio = clamp01((idCount - ID_HEAT_COOL_PEAK_COUNT) / hotRange);
  const hotPercent = Math.round(hotRatio * 100);
  const coolPercent = 100 - hotPercent;
  return `color-mix(in srgb, var(--browser-color-res-id-cool) ${coolPercent}%, var(--browser-color-res-heat-hot) ${hotPercent}%)`;
}
