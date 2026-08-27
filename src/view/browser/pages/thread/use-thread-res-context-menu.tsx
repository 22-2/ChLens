import {
  ArrowDown,
  Ban,
  Copy,
  FilterX,
  History,
  Pause,
  RefreshCw,
  Reply,
  RotateCw,
  Search,
  Type,
} from "lucide-react";
import React, { useCallback, useEffect, useRef } from "react";
import { stringifyNgDslValue } from "src/core/ngDsl";
import { container } from "src/service-container/index";
import type { IRes } from "src/service-container/interfaces";
import { useBottomPanel } from "src/view/browser/hooks/use-bottom-panel";
import { useTabDispatch, useTabStore } from "src/view/browser/hooks/use-tab-store";
import type { ThreadFilter, ThreadPage as ThreadPageType } from "src/view/browser/types";
import type { ContextMenuItem } from "src/view/browser/ui/ContextMenu";
import {
  getAutoRefreshPageKey,
  isAutoRefreshEnabledForPage,
} from "src/view/browser/utils/auto-refresh-pages";
import { getLegacyWriteHistoryService } from "src/view/browser/utils/legacy-app";
import { copyText } from "src/view/browser/utils/clipboard";
import { formatResForCopy, stripHtml } from "src/view/browser/utils/response-format";
import { buildKyodemoUrl } from "src/view/browser/utils/url-media";

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
  ownResNums: Set<number>;
  page: ThreadPageType;
  onWriteHistoryAdded?: (resNum: number) => void;
  onWriteHistoryRemoved?: (resNum: number) => void;
  searchQuery: string;
  setFilter: (filter: ThreadFilter) => void;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  setMiniAaResNums: React.Dispatch<React.SetStateAction<Set<number>>>;
  setResponses: React.Dispatch<React.SetStateAction<IRes[]>>;
}

interface UseThreadResContextMenuResult {
  openPopupResContextMenu: (parentId: string) => (targetRes: IRes, e: React.MouseEvent) => void;
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
  ownResNums,
  page,
  onWriteHistoryAdded,
  onWriteHistoryRemoved,
  searchQuery,
  setFilter,
  setSearchQuery,
  setMiniAaResNums,
  setResponses,
}: UseThreadResContextMenuParams): UseThreadResContextMenuResult {
  // フィルタ解除直後のDOM更新完了を待ってからジャンプしないと、
  // 対象レスがまだ存在せずスクロールに失敗するため hook 内で保留する。
  const pendingJumpNumRef = useRef<number | null>(null);
  const dispatch = useTabDispatch();
  const { activeTab } = useTabStore();
  const { openWritePanelWithText } = useBottomPanel();
  const isAutoRefreshEnabled = isAutoRefreshEnabledForPage(activeTab, page);

  const addIdToNg = useCallback(
    async (id: string | undefined) => {
      if (!id) {
        return;
      }
      const normalizedId = id.startsWith("ID:") ? id.slice(3) : id;
      if (!normalizedId) {
        return;
      }
      // 変更理由: 旧式の `ID:xxx` を保存すると再読込後に「ただの本文NG」として扱われるため、
      // 永続化時点で DSL の ID ルール形式へ正規化して再起動後も同じ判定になるようにする。
      const ngWord = `hide id contains:\n  ${stringifyNgDslValue(normalizedId)}`;
      // 変更理由: 保存完了前に「追加済み」扱いへ進むと、直後の F5 で永続化前の状態へ戻りうる。
      // ここでは保存完了を待ってから UI を成功状態へ進める。
      await container.ng.add(ngWord);
      // サービス側への追加だけでは再取得するまでUIに反映されないため、ローカルのstateも即時更新する。
      // targetRes.id の形式が "ID:xxx" / "xxx" で揺れても即時反映を落とさないよう、比較前に正規化する。
      setResponses((prev) =>
        prev.map((res) =>
          (res.id?.startsWith("ID:") ? res.id.slice(3) : res.id) === normalizedId
            ? {
                ...res,
                // res.ng を設定することで ResItem の isNG 判定が即座に true になる
                ng: { type: "id", ruleDescription: ngWord },
                class: [...(res.class ?? []).filter((className) => className !== "ng"), "ng"],
              }
            : res,
        ),
      );
      container.toast.info(`NGに追加しました: ${ngWord}`);
    },
    [setResponses],
  );

  const addSelectionToNg = useCallback(
    async (selectedText: string) => {
      const selectedValue = selectedText.trim();
      if (!selectedValue) {
        return;
      }
      const ngWord = `hide body contains:\n  ${stringifyNgDslValue(selectedValue)}`;
      // 選択テキストNGはID NGと違って局所更新だと取りこぼしやすいため、
      // 追加後に再取得して既存NG判定ロジックの結果でUIを揃える。
      await container.ng.add(ngWord);
      container.toast.info(`NGに追加しました: ${ngWord}`);
      await fetchThread();
    },
    [fetchThread],
  );

  const addWriteHistory = useCallback(
    async (res: IRes) => {
      const writeHistoryService = getLegacyWriteHistoryService();

      if (!writeHistoryService?.add) {
        container.toast.info("書込履歴サービスが利用できません");
        return;
      }

      const name = stripHtml(res.name);
      const message = stripHtml(res.message);
      const baseTime = Date.parse(res.date ?? res.other ?? "");
      await writeHistoryService.add({
        url: page.threadUrl,
        res: res.num,
        title: document.title,
        name,
        mail: res.mail,
        message,
        date: Number.isNaN(baseTime) ? Date.now() : baseTime,
      });
      // 変更理由: 右クリックから書込履歴へ追加した直後も強調表示を即時反映し、
      // 再読込しないと「自分のレス」扱いにならないズレを避ける。
      onWriteHistoryAdded?.(res.num);
      container.toast.success("書込履歴に追加しました");
    },
    [onWriteHistoryAdded, page.threadUrl],
  );

  const removeWriteHistory = useCallback(
    async (res: IRes) => {
      const writeHistoryService = getLegacyWriteHistoryService();

      if (!writeHistoryService?.remove) {
        container.toast.info("書込履歴サービスが利用できません");
        return;
      }

      await writeHistoryService.remove(page.threadUrl, res.num);
      // 変更理由: 追加時と同様に削除直後も「自分のレス」強調を即時解除し、
      // 再読込しないと強調が残るズレを避ける。
      onWriteHistoryRemoved?.(res.num);
      container.toast.success("書込履歴から削除しました");
    },
    [onWriteHistoryRemoved, page.threadUrl],
  );

  // レスIDの要素上で右クリックした場合、ID系操作をメニュー最上部へ移動するためのフラグ。
  const buildIdItems = useCallback(
    (rawId: string, kyodemoUrl: string | null): ContextMenuItem[] => [
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
      { id: "sep-id", separator: true },
    ],
    [addIdToNg],
  );

  const buildContextMenuItems = useCallback(
    (targetRes: IRes, fromPopup: boolean, clickedOnId: boolean): ContextMenuItem[] => {
      const rawId = targetRes.id ?? "";
      const kyodemoUrl = rawId ? buildKyodemoUrl(page.threadUrl, rawId) : null;
      const isMiniAa = miniAaResNums.has(targetRes.num);
      const isInWriteHistory = ownResNums.has(targetRes.num);
      const selectedText = window.getSelection()?.toString().trim() ?? "";
      const hasSelection = selectedText.length > 0;
      const hasKeywordFilter = searchQuery.trim().length > 0;

      const idItems = buildIdItems(rawId, kyodemoUrl);

      // 先頭の条件付き項目（フィルタ解除ジャンプ、ポップアップ用ジャンプ）
      const conditionalTopItems: ContextMenuItem[] = [
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
        ...((filter !== "all" || hasKeywordFilter) && !fromPopup
          ? [
              {
                id: "clear-filter-jump",
                label: "フィルタリングを解除してこのレスにジャンプ",
                icon: <FilterX size={14} />,
                onSelect: () => {
                  pendingJumpNumRef.current = targetRes.num;
                  setFilter("all");
                  setSearchQuery("");
                },
              },
              { id: "sep-filter", separator: true },
            ]
          : []),
      ];

      // ID系メニューの前後に分割。ID系は通常「コピー」と「返信」の間に配置される。
      const itemsBeforeIdSlot: ContextMenuItem[] = [
        {
          id: "refresh-thread",
          label: "スレッドを更新",
          icon: <RotateCw size={14} />,
          onSelect: () => {
            void fetchThread();
          },
        },
        {
          id: "auto-refresh",
          label: isAutoRefreshEnabled ? "スレッドの自動更新を停止" : "スレッドを自動更新",
          icon: isAutoRefreshEnabled ? <Pause size={14} /> : <RefreshCw size={14} />,
          onSelect: () => {
            const nextEnabled = !isAutoRefreshEnabled;
            dispatch({
              type: "SET_AUTO_REFRESH_ENABLED",
              enabled: nextEnabled,
              pageKey: getAutoRefreshPageKey(page) ?? undefined,
            });
            container.toast.info(
              nextEnabled ? "スレッドの自動更新を開始しました" : "スレッドの自動更新を停止しました",
            );
          },
        },
        { id: "sep-1", separator: true },
        {
          id: "copy-res",
          label: "レスをコピー",
          icon: <Copy size={14} />,
          onSelect: async () => {
            const copyBody = `${page.title}\n${page.threadUrl}${targetRes.num}\n${formatResForCopy(
              targetRes,
            )}`;
            await copyText(copyBody);
          },
        },
      ];

      const itemsAfterIdSlot: ContextMenuItem[] = [
        {
          id: "reply",
          label: "返信",
          icon: <Reply size={14} />,
          onSelect: () => {
            openWritePanelWithText(`>>${targetRes.num}\n`);
          },
        },
        {
          id: "add-write-history",
          label: isInWriteHistory ? "書込履歴から削除" : "書込履歴に追加",
          icon: <History size={14} />,
          onSelect: () => {
            if (isInWriteHistory) {
              void removeWriteHistory(targetRes);
            } else {
              void addWriteHistory(targetRes);
            }
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
      ];

      const selectionItems: ContextMenuItem[] = hasSelection
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
        : [];

      // ID要素上で右クリックした場合、ID系メニューを最上部（選択テキストの直下）に表示する。
      // 選択テキスト向け操作 → ID系操作 → その他の操作 の順で並べる。
      return clickedOnId
        ? [
            ...selectionItems,
            ...idItems,
            ...conditionalTopItems,
            ...itemsBeforeIdSlot,
            ...itemsAfterIdSlot,
          ]
        : [
            ...selectionItems,
            ...conditionalTopItems,
            ...itemsBeforeIdSlot,
            ...idItems,
            ...itemsAfterIdSlot,
          ];
    },
    [
      addSelectionToNg,
      addWriteHistory,
      buildIdItems,
      closePopup,
      dispatch,
      fetchThread,
      filter,
      handleAnchorClick,
      isAutoRefreshEnabled,
      miniAaResNums,
      openWritePanelWithText,
      ownResNums,
      page,
      removeWriteHistory,
      searchQuery,
      setFilter,
      setSearchQuery,
      setMiniAaResNums,
    ],
  );

  const openResContextMenu = useCallback(
    (targetRes: IRes, e: React.MouseEvent, fromPopup: boolean, parentId?: string) => {
      e.preventDefault();
      if (!fromPopup) {
        hideAnchorPreviewImmediately();
      }

      // ID要素（.res__id）上で右クリックしたかどうかを判定し、
      // 該当時はID系メニューを最上部へ移動する。
      const clickedOnId = e.target instanceof Element && e.target.closest(".res__id") !== null;

      // メニュー本体も同じスタックへ積み、parentId で親ポップアップとの寿命を揃える。
      addPopupContextMenu(
        e.clientX,
        e.clientY,
        buildContextMenuItems(targetRes, fromPopup, clickedOnId),
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
