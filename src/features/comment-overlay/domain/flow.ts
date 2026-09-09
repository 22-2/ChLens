/** コメント投入の揺らぎと混雑時の追いつきに使う設定。 */
export interface NaturalCommentFlowOptions {
  queueSize: number;
  batchSize: number;
  updateIntervalMilliseconds: number;
  randomValue?: number;
}

/** 取得バッチを機械的な等間隔にせず、混雑度に応じた揺らぎと追いつきを加える。 */
export function calculateNaturalCommentFlowInterval({
  queueSize,
  batchSize,
  updateIntervalMilliseconds,
  randomValue = Math.random(),
}: NaturalCommentFlowOptions): number {
  if (queueSize > 50) return 20;
  if (queueSize > 30) return 50;
  if (queueSize > 15) return 100;
  if (batchSize <= 0 || updateIntervalMilliseconds <= 0) return 200;

  const commentsPerSecond = batchSize / (updateIntervalMilliseconds / 1_000);
  const unitRandom = Math.min(1, Math.max(0, randomValue));
  if (commentsPerSecond <= 2) return Math.round(300 + unitRandom * 200);

  const baseInterval = updateIntervalMilliseconds / batchSize;
  const variance = baseInterval * 0.2;
  const lowerBound = Math.max(50, baseInterval - variance);
  const upperBound = Math.min(500, baseInterval + variance);
  return Math.round(lowerBound + unitRandom * Math.max(0, upperBound - lowerBound));
}

/** EdgeLiveViewerの追いつき段階と同じく、滞留量が多い時だけ投入数を増やす。 */
export function calculateNaturalCommentFlowCount(queueSize: number): number {
  if (queueSize > 50) return 5;
  if (queueSize > 30) return 4;
  if (queueSize > 20) return 3;
  if (queueSize > 10) return 2;
  return 1;
}
