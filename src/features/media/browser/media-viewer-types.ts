// Media viewerのstoreとcontrollerが共有する表示対象の状態。
// ポップアップやページとは異なるライフサイクルを持つため、media viewer側に寄せる。
export interface ViewerState {
  src: string;
  label: string;
  /** 同じレス内の画像URL一覧（前後移動に使用） */
  images?: string[];
  currentIndex?: number;
}
