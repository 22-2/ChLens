import "src/view/browser/styles/components/ContextMenu.css";

import React, { useEffect } from "react";
import type { IRes } from "src/service-container";

/** 右クリックメニューが対象にしているレス。表示の種類によらず同じ形で扱う。 */
export interface ResMenuTarget {
  resNum: number;
  /** メニューを開いたレス（またはその要約）の要素。開いている間だけ強調する。 */
  element: HTMLElement | null;
}

/**
 * レスの右クリックイベントからメニューの対象を作る。
 * 変更理由: 本文・ポップアップ・返信プレビュー・抽出ビューのどこから開いても、
 * 対象を同じ方法で決めて、ヘッダーと強調の表示を揃える。
 * currentTarget はイベント処理の間しか使えないため、メニューを開く時点で取り出す。
 */
export function createResMenuTarget(
  event: React.MouseEvent,
  res: Pick<IRes, "num">,
): ResMenuTarget {
  return {
    resNum: res.num,
    element: event.currentTarget instanceof HTMLElement ? event.currentTarget : null,
  };
}

/** メニュー上部の細い見出し。どのレスのメニューかを示す。 */
export const ResMenuTargetHeader: React.FC<{ resNum: number }> = ({ resNum }) => (
  <div className="context-menu__target">&gt;&gt;{resNum} のメニュー</div>
);

/** メニューが開いている間だけ、対象のレスを強調する。 */
export const ResMenuTargetMarker: React.FC<{ element: HTMLElement | null }> = ({ element }) => {
  useEffect(() => {
    if (!element) return;
    element.classList.add("res-menu-target");
    return () => element.classList.remove("res-menu-target");
  }, [element]);
  return null;
};
