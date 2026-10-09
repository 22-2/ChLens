export interface ViewerTransform {
  scale: number;
  x: number;
  y: number;
}

export function approachViewerTransform(
  current: ViewerTransform,
  target: ViewerTransform,
  elapsedMs: number,
): ViewerTransform {
  // 経過時間と45msの時定数で補間し、フレームレートが違っても同じ速さで目標へ追従させる。
  const progress = 1 - Math.exp(-elapsedMs / 45);
  return {
    // 対数空間で補間すると、拡大と縮小で倍率の変化を対称に感じられる。
    scale: Math.exp(
      Math.log(current.scale) + (Math.log(target.scale) - Math.log(current.scale)) * progress,
    ),
    x: current.x + (target.x - current.x) * progress,
    y: current.y + (target.y - current.y) * progress,
  };
}

export function isViewerTransformSettled(
  current: ViewerTransform,
  target: ViewerTransform,
): boolean {
  return (
    Math.abs(current.scale / target.scale - 1) < 0.001 &&
    Math.abs(current.x - target.x) < 0.25 &&
    Math.abs(current.y - target.y) < 0.25
  );
}
