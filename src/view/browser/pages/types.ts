import type { IRes } from "src/service-container";
import type { ThreadPage as ThreadPageType } from "../types";


export type ThreadFilter = "all" | "popular" | "image" | "video" | "link";
export interface Props {
  page: ThreadPageType;
}
// --- ポップアップ状態 ---
export interface PopupState {
  x: number;
  y: number;
  items: IRes[];
  title: string;
}
export interface TreePopupState {
  x: number;
  y: number;
  resNum: number;
}
export interface ResContextMenuState {
  x: number;
  y: number;
  res: IRes;
}
export interface ViewerState {
  src: string;
  label: string;
}
export interface AnchorPreviewState {
  depth: number;
  x: number;
  y: number;
  items: IRes[];
  label: string;
}
