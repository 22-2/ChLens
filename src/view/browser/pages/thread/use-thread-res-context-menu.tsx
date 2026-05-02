import {
  ArrowDown,
  Ban,
  Copy,
  FilterX,
  Globe,
  History,
  Reply,
  RotateCw,
  Search,
  Type,
} from "lucide-react";
import React, { useCallback, useEffect, useRef } from "react";
import { container } from "src/service-container/index";
import type { IRes } from "src/service-container/interfaces";
import type { ContextMenuItem } from "src/view/browser/components/ContextMenu";
import type { Props, ThreadFilter } from "src/view/browser/utils/types";
import {
  buildKyodemoUrl,
  copyText,
  stripHtml,
} from "src/view/browser/utils/utils";

type AddPopupContextMenu = (
  x: number,
  y: number,
  items: ContextMenuItem[],
  parentId?: string,
) => void;

interface UseThreadResContextMenuParams {
  addPopupContextMenu: AddPopupContextMenu;
  closePopup: () => void;
  fetchThread: () => Promise<void> | void;
  filter: ThreadFilter;
  filteredResponses: IRes[];
  handleAnchorClick: (resNum: number) => void;
  hideAnchorPreviewImmediately: () => void;
  miniAaResNums: Set<number>;
  page: Props["page"];
  setFilter: (filter: ThreadFilter) => void;
  setMiniAaResNums: React.Dispatch<React.SetStateAction<Set<number>>>;
  setResponses: React.Dispatch<React.SetStateAction<IRes[]>>;
}

interface UseThreadResContextMenuResult {
  openPopupResContextMenu: (
    parentId: string,
  ) => (targetRes: IRes, e: React.MouseEvent) => void;
  openThreadResContextMenu: (e: React.MouseEvent, res: IRes) => void;
}

export function useThreadResContextMenu({
  addPopupContextMenu,
  closePopup,
  fetchThread,
  filter,
  filteredResponses,
  handleAnchorClick,
  hideAnchorPreviewImmediately,
  miniAaResNums,
  page,
  setFilter,
  setMiniAaResNums,
  setResponses,
}: UseThreadResContextMenuParams): UseThreadResContextMenuResult {
  // フィルタ解除直後のDOM更新完了を待ってからジャンプしないと、
  // 対象レスがまだ存在せずスクロールに失敗するため hook 内で保留する。
  const pendingJumpNumRef = useRef<number | null>(null);

  const addIdToNg = useCallback(
    async (id: string | undefined) => {
      if (!id) {
        return;
      }
      const ngWord = id.startsWith("ID:") ? id : `ID:${id}`;
      // 既存実装の「ID/IPをNG指定」と同じくNGサービスへ直接追加
      container.ng.add(ngWord);
      // サービス側への追加だけでは再取得するまでUIに反映されないため、ローカルのstateも即時更新する。
      // id は targetRes.id そのもの（"ID:xxx" 形式の場合もある）なので、そのまま res.id と比較する。
      setResponses((prev) =>
        prev.map((res) =>
          res.id === id
            ? {
                ...res,
                // res.ng を設定することで ResItem の isNG 判定が即座に true になる
                ng: { type: "id" },
                class: [
                  ...(res.class ?? []).filter(
                    (className) => className !== "ng",
                  ),
                  "ng",
                ],
              }
            : res,
        ),
      );
      container.notification.info(`NGに追加しました: ${ngWord}`);
    },
    [setResponses],
  );

  const addSelectionToNg = useCallback(
    async (selectedText: string) => {
      const ngWord = selectedText.trim();
      if (!ngWord) {
        return;
      }
      // 選択テキストNGはID NGと違って局所更新だと取りこぼしやすいため、
      // 追加後に再取得して既存NG判定ロジックの結果でUIを揃える。
      container.ng.add(ngWord);
      container.notification.info(`NGに追加しました: ${ngWord}`);
      await fetchThread();
    },
    [fetchThread],
  );

  const addWriteHistory = useCallback(
    async (res: IRes) => {
      const globalObj = window as unknown as {
        app?: {
          WriteHistory?: {
            add: (item: {
              date: number;
              mail: string;
              message: string;
              name: string;
              res: number;
              title: string;
              url: string;
            }) => Promise<void> | void;
          };
        };
      };

      if (!globalObj.app?.WriteHistory?.add) {
        container.notification.info("書込履歴サービスが利用できません");
        return;
      }

      const name = stripHtml(res.name);
      const message = stripHtml(res.message);
      const baseTime = Date.parse(res.date ?? res.other ?? "");
      await globalObj.app.WriteHistory.add({
        url: page.threadUrl,
        res: res.num,
        title: document.title,
        name,
        mail: res.mail,
        message,
        date: Number.isNaN(baseTime) ? Date.now() : baseTime,
      });
      container.notification.success("書込履歴に追加しました");
    },
    [page.threadUrl],
  );

  const buildContextMenuItems = useCallback(
    (targetRes: IRes, fromPopup: boolean): ContextMenuItem[] => {
      const plainName = stripHtml(targetRes.name);
      const plainMessage = stripHtml(targetRes.message);
      const rawId = targetRes.id ?? "";
      const kyodemoUrl = rawId ? buildKyodemoUrl(page.threadUrl, rawId) : null;
      const permalink = `${page.threadUrl}${targetRes.num}`;
      const isMiniAa = miniAaResNums.has(targetRes.num);
      const selectedText = window.getSelection()?.toString().trim() ?? "";
      const hasSelection = selectedText.length > 0;

      return [
        // 選択テキスト向け操作は誤クリックを減らすため最上段に固定する。
        ...(hasSelection
          ? [
              {
                id: "copy-selection",
                label: "選択範囲をコピー",
                icon: <Copy size={14} />,
                onSelect: async () => {
                  await copyText(selectedText);
                },
              },
              {
                id: "search-selection",
                label: "選択範囲をGoogle検索",
                icon: <Search size={14} />,
                onSelect: () => {
                  const encoded = encodeURIComponent(selectedText);
                  window.open(
                    `https://www.google.co.jp/search?q=${encoded}`,
                    "_blank",
                    "noopener,noreferrer",
                  );
                },
              },
              {
                id: "add-selection-to-ng",
                label: "選択範囲をNG指定",
                icon: <Ban size={14} />,
                onSelect: () => {
                  void addSelectionToNg(selectedText);
                },
              },
              { id: "sep-selection-top", separator: true },
            ]
          : []),
        ...(fromPopup
          ? [
              {
                id: "jump-to-res",
                label: "このレスにジャンプ",
                icon: <ArrowDown size={14} />,
                onSelect: () => {
                  handleAnchorClick(targetRes.num);
                  closePopup();
                },
              },
              { id: "sep-jump", separator: true },
            ]
          : []),
        // フィルタ適用中のみ「フィルタを解除してジャンプ」を先頭に挿入する。
        // setFilter後はDOMがまだ更新されていないため、pendingJumpNumRefとeffectで遅延ジャンプする。
        ...(filter !== "all" && !fromPopup
          ? [
              {
                id: "clear-filter-jump",
                label: "フィルタリングを解除してこのレスにジャンプ",
                icon: <FilterX size={14} />,
                onSelect: () => {
                  pendingJumpNumRef.current = targetRes.num;
                  setFilter("all");
                },
              },
              { id: "sep-filter", separator: true },
            ]
          : []),
        {
          id: "refresh-thread",
          label: "スレッドを更新",
          icon: <RotateCw size={14} />,
          onSelect: () => {
            void fetchThread();
          },
        },
        { id: "sep-1", separator: true },
        {
          id: "copy-res",
          label: "レスをコピー",
          icon: <Copy size={14} />,
          onSelect: async () => {
            const copyBody = `${page.title}\n${page.threadUrl}${
              targetRes.num
            }\n${targetRes.num} ${plainName}  ${
              targetRes.date ?? targetRes.other ?? ""
            }\n${plainMessage}`;
            await copyText(copyBody);
          },
        },
        {
          id: "copy-id",
          label: "ID/IPをコピー",
          icon: <Copy size={14} />,
          disabled: !rawId,
          onSelect: async () => {
            await copyText(rawId);
          },
        },
        {
          id: "search-id",
          label: "IDを必死チェッカーで検索",
          icon: <Search size={14} />,
          disabled: !kyodemoUrl,
          onSelect: () => {
            if (kyodemoUrl) {
              window.open(kyodemoUrl, "_blank", "noopener,noreferrer");
            }
          },
        },
        {
          id: "add-ng-id",
          label: "ID/IPをNG指定",
          icon: <Ban size={14} />,
          disabled: !rawId,
          onSelect: () => {
            void addIdToNg(rawId);
          },
        },
        { id: "sep-1", separator: true },
        {
          id: "reply",
          label: "返信",
          icon: <Reply size={14} />,
          onSelect: () => {
            void copyText(`>>${targetRes.num}\n`);
            container.notification.info("返信アンカーをコピーしました");
          },
        },
        {
          id: "quote-reply",
          label: "引用して返信",
          icon: <Reply size={14} />,
          onSelect: () => {
            const quoted = plainMessage
              .split(/\r?\n/)
              .map((line) => `>${line}`)
              .join("\n");
            void copyText(`>>${targetRes.num}\n${quoted}\n`);
            container.notification.info("引用テンプレートをコピーしました");
          },
        },
        {
          id: "add-write-history",
          label: "書込履歴に追加",
          icon: <History size={14} />,
          onSelect: () => {
            void addWriteHistory(targetRes);
          },
        },
        {
          id: "toggle-aa",
          label: isMiniAa ? "AA表示モードを解除" : "AA表示モードに変更",
          icon: <Type size={14} />,
          onSelect: () => {
            setMiniAaResNums((prev) => {
              const next = new Set(prev);
              if (next.has(targetRes.num)) {
                next.delete(targetRes.num);
              } else {
                next.add(targetRes.num);
              }
              return next;
            });
          },
        },
        {
          id: "open-browser",
          label: "ブラウザで開く",
          icon: <Globe size={14} />,
          onSelect: () => {
            window.open(permalink, "_blank", "noopener,noreferrer");
          },
        },
      ];
    },
    [
      addIdToNg,
      addSelectionToNg,
      addWriteHistory,
      closePopup,
      fetchThread,
      filter,
      handleAnchorClick,
      miniAaResNums,
      page.threadUrl,
      page.title,
      setFilter,
      setMiniAaResNums,
    ],
  );

  const openResContextMenu = useCallback(
    (
      targetRes: IRes,
      e: React.MouseEvent,
      fromPopup: boolean,
      parentId?: string,
    ) => {
      e.preventDefault();
      if (!fromPopup) {
        hideAnchorPreviewImmediately();
      }

      // メニュー本体も同じスタックへ積み、parentId で親ポップアップとの寿命を揃える。
      addPopupContextMenu(
        e.clientX,
        e.clientY,
        buildContextMenuItems(targetRes, fromPopup),
        parentId,
      );
    },
    [addPopupContextMenu, buildContextMenuItems, hideAnchorPreviewImmediately],
  );

  useEffect(() => {
    if (pendingJumpNumRef.current == null) {
      return;
    }
    const num = pendingJumpNumRef.current;
    pendingJumpNumRef.current = null;
    handleAnchorClick(num);
  }, [filteredResponses, handleAnchorClick]);

  return {
    openPopupResContextMenu: useCallback(
      (parentId: string) => (targetRes: IRes, e: React.MouseEvent) => {
        openResContextMenu(targetRes, e, true, parentId);
      },
      [openResContextMenu],
    ),
    openThreadResContextMenu: useCallback(
      (e: React.MouseEvent, res: IRes) => {
        openResContextMenu(res, e, false);
      },
      [openResContextMenu],
    ),
  };
}
