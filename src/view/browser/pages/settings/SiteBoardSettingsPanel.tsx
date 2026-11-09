import { MoreVertical } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createLogger } from "src/app/logger";
import { platformCookieManager } from "src/app/platform/CookieManager";
import { getBoardUrlKey } from "src/core/board/BoardUrlNormalizer";
import { container } from "src/service-container/index";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import { ScopedTextInput } from "src/view/browser/pages/settings/ScopedTextInput";
import { SettingsGroup, SettingsGroupNote } from "src/view/browser/pages/settings/SettingsGroup";
import {
  deriveBoardTitle,
  getDefaultValue,
  getOverride,
  getScopeUrl,
  mergeBoardOptions,
  type RawBoardOption,
  readBBSMenuBoards,
  readGlobalSettingValues,
  readOpenedBoards,
  readScopeBoards,
  SETTING_FIELDS,
  SOURCE_LABELS,
  toIntervalSeconds,
} from "src/view/browser/pages/settings/site-board-settings-model";
import { Button } from "src/view/browser/ui/Button";
import { Dialog } from "src/view/browser/ui/Dialog";
import { SettingRow } from "src/view/browser/ui/FormControls";
import { Spinner } from "src/view/browser/ui/Spinner";
import {
  clearAllSiteScopedSettings,
  clearSiteScopedSettings,
  normalizeBoardKey,
  normalizeSiteKey,
  persistScopedSetting,
  readScopedSettings,
  resolveScopedSetting,
  SCOPED_SETTINGS_CONFIG_KEY,
  type ScopedSettingKey,
  type ScopedSettingScope,
  type ScopedSettingsDocument,
  SITE_SHARED_SCOPE,
} from "src/view/browser/utils/scoped-settings";

const logger = createLogger("view/browser");

// 既存の公開位置を維持する。
export { mergeBoardOptions };

export function SiteBoardSettingsPanel() {
  const [document, setDocument] = useState<ScopedSettingsDocument>(() => readScopedSettings());
  const [menuBoards, setMenuBoards] = useState<RawBoardOption[]>([]);
  const [manualBoards, setManualBoards] = useState<RawBoardOption[]>([]);
  const [selectedSite, setSelectedSite] = useState("");
  const [selectedBoard, setSelectedBoard] = useState(SITE_SHARED_SCOPE);
  const [manualBoardUrl, setManualBoardUrl] = useState("");
  const [isAddBoardDialogOpen, setIsAddBoardDialogOpen] = useState(false);
  const [isSiteActionsDialogOpen, setIsSiteActionsDialogOpen] = useState(false);
  const [dialogPortalContainer, setDialogPortalContainer] = useState<HTMLElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<ScopedSettingKey | null>(null);
  const [isClearingCookies, setIsClearingCookies] = useState(false);
  const [isClearingSiteSettings, setIsClearingSiteSettings] = useState(false);
  const [isCheckingCookies, setIsCheckingCookies] = useState(true);
  const [hasSiteCookies, setHasSiteCookies] = useState(false);
  const [globalValues, setGlobalValues] =
    useState<Record<ScopedSettingKey, string>>(readGlobalSettingValues);

  // 別窓で開いた設定画面のモーダルが本窓へ出ないよう、表示先の窓から探す。
  const { document: viewDocument } = useViewSurface();

  useEffect(() => {
    setDialogPortalContainer(viewDocument.querySelector<HTMLElement>(".browser-shell"));
  }, [viewDocument]);

  useEffect(() => {
    const sync = () => setDocument(readScopedSettings());
    const handleConfigUpdated = ({ key }: { key?: string }) => {
      if (key === SCOPED_SETTINGS_CONFIG_KEY) {
        sync();
      }
      if (SETTING_FIELDS.some((field) => field.key === key)) {
        setGlobalValues(readGlobalSettingValues());
      }
    };
    container.message.on("config_updated", handleConfigUpdated);
    return () => {
      container.message.off("config_updated", handleConfigUpdated);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadBoards = async () => {
      setLoading(true);
      try {
        const result = await container.bbsMenu.get(false);
        if (!cancelled && result.status === "success") {
          setMenuBoards(readBBSMenuBoards(result.menu ?? []));
        }
      } catch (error) {
        logger.error("BBSMENUから板一覧を取得できませんでした", error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void loadBoards();
    return () => {
      cancelled = true;
    };
  }, []);

  const boards = useMemo(
    () =>
      mergeBoardOptions([
        ...menuBoards,
        ...manualBoards,
        ...readOpenedBoards(),
        ...readScopeBoards(document),
      ]),
    [document, manualBoards, menuBoards],
  );

  const sites = useMemo(() => {
    const keys = new Set(boards.map((board) => board.site));
    for (const site of Object.keys(document.sites)) {
      keys.add(site);
    }
    return Array.from(keys).sort((left, right) => left.localeCompare(right));
  }, [boards, document.sites]);

  // 変更理由: 選択中のドメインが候補から消えた場合は先頭へ勝手に移さず、「すべて」に戻す。
  // 描画中に直すのは、effect だと消えたドメインの表示が一度描かれるため。
  if (selectedSite && !sites.includes(selectedSite)) {
    setSelectedSite("");
  }

  const siteBoards = useMemo(
    () => boards.filter((board) => board.site === selectedSite),
    [boards, selectedSite],
  );

  if (
    selectedBoard !== SITE_SHARED_SCOPE &&
    !siteBoards.some((board) => board.key === selectedBoard)
  ) {
    setSelectedBoard(SITE_SHARED_SCOPE);
  }

  // 選択が変わったら前の確認結果を捨てて確認中に戻す。描画中に行い、古い結果を一度も描かないようにする。
  const [cookieCheckedSite, setCookieCheckedSite] = useState(selectedSite);
  if (cookieCheckedSite !== selectedSite) {
    setCookieCheckedSite(selectedSite);
    setHasSiteCookies(false);
    setIsCheckingCookies(true);
  }

  useEffect(() => {
    let cancelled = false;
    const checking = selectedSite
      ? platformCookieManager.hasSiteCookies(selectedSite)
      : platformCookieManager.hasAnyCookies();
    void checking
      .then((hasCookies) => {
        if (!cancelled) {
          setHasSiteCookies(hasCookies);
        }
      })
      .catch((error: unknown) => {
        logger.error("ドメインCookieの確認に失敗しました", error);
        if (!cancelled) {
          setHasSiteCookies(false);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsCheckingCookies(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSite]);

  const scope = useMemo<ScopedSettingScope | null>(() => {
    if (!selectedSite) {
      return null;
    }
    return {
      site: selectedSite,
      board: selectedBoard === SITE_SHARED_SCOPE ? undefined : selectedBoard,
    };
  }, [selectedBoard, selectedSite]);

  const saveOverride = useCallback(
    async (key: ScopedSettingKey, value: string | undefined) => {
      if (!scope) {
        return;
      }
      setSavingKey(key);
      try {
        await persistScopedSetting(scope, key, value);
        setDocument(readScopedSettings());
      } catch (error) {
        container.toast.error(
          error instanceof Error ? error.message : "スコープ設定の保存に失敗しました",
        );
      } finally {
        setSavingKey((current) => (current === key ? null : current));
      }
    },
    [scope],
  );

  const saveGlobalSetting = useCallback(async (key: ScopedSettingKey, value: string) => {
    setSavingKey(key);
    try {
      // 変更理由: 「すべて」は個別スコープではなく、継承元となる全体設定を編集する範囲として扱う。
      await container.config.set(key, value);
      setGlobalValues((current) => ({ ...current, [key]: value }));
    } catch (error) {
      logger.error(`全体設定 ${key} の保存に失敗しました`, error);
      container.toast.error(
        error instanceof Error ? error.message : "全体設定の保存に失敗しました",
      );
    } finally {
      setSavingKey((current) => (current === key ? null : current));
    }
  }, []);

  const clearSiteCookies = useCallback(async () => {
    if (isClearingCookies) {
      return;
    }
    const clearAll = selectedSite === "";
    const targetLabel = clearAll ? "すべてのドメイン" : `「${selectedSite}」`;
    if (
      !window.confirm(
        `${targetLabel}のCookieを削除します。保存した名前・メール欄は削除されません。よろしいっすか？`,
      )
    ) {
      return;
    }

    setIsClearingCookies(true);
    try {
      if (clearAll) {
        await platformCookieManager.clearAllCookies();
      } else {
        await platformCookieManager.clearSiteCookies(selectedSite);
      }
      setHasSiteCookies(false);
      container.toast.success(`${targetLabel}のCookieを削除しました`);
      setIsSiteActionsDialogOpen(false);
    } catch (error) {
      logger.error("Cookieの削除に失敗しました", error);
      container.toast.error(error instanceof Error ? error.message : "Cookieの削除に失敗しました");
    } finally {
      setIsClearingCookies(false);
    }
  }, [isClearingCookies, selectedSite]);

  const clearSiteSettings = useCallback(async () => {
    if (isClearingSiteSettings) {
      return;
    }
    const clearAll = selectedSite === "";
    const targetLabel = clearAll ? "すべてのドメインと各板" : `ドメイン「${selectedSite}」`;
    // 変更理由: ドメイン共通と各板の設定が一緒に消えることを確認時にも明示する。
    if (
      !window.confirm(
        `${targetLabel}の設定を削除します。削除後は「全体設定」の値が適用されます。よろしいっすか？`,
      )
    ) {
      return;
    }

    setIsClearingSiteSettings(true);
    try {
      if (clearAll) {
        await clearAllSiteScopedSettings();
      } else {
        await clearSiteScopedSettings(selectedSite);
      }
      setDocument(readScopedSettings());
      container.toast.success(`${targetLabel}の設定を削除しました`);
      setIsSiteActionsDialogOpen(false);
    } catch (error) {
      container.toast.error(error instanceof Error ? error.message : "設定の削除に失敗しました");
    } finally {
      setIsClearingSiteSettings(false);
    }
  }, [isClearingSiteSettings, selectedSite]);

  const addManualBoard = useCallback((): boolean => {
    const board = normalizeBoardKey(manualBoardUrl);
    const comparisonKey = getBoardUrlKey(manualBoardUrl);
    const site = normalizeSiteKey(manualBoardUrl);
    if (!board || !comparisonKey || !site) {
      container.toast.error("板URLを確認してください");
      return false;
    }

    const existingBoard = boards.find(
      (candidate) => getBoardUrlKey(candidate.key) === comparisonKey,
    );
    if (existingBoard) {
      // 変更理由: BBSMENUや過去の設定に同じ板がある場合は候補を増やさず、
      // 既存の正規化済み候補を選択して二重登録を防ぐ。
      setSelectedSite(existingBoard.site);
      setSelectedBoard(existingBoard.key);
      setManualBoardUrl("");
      setIsAddBoardDialogOpen(false);
      return true;
    }

    setManualBoards((current) => [...current, { url: board, title: deriveBoardTitle(board) }]);
    setSelectedSite(site);
    setSelectedBoard(board);
    setManualBoardUrl("");
    setIsAddBoardDialogOpen(false);
    return true;
  }, [boards, manualBoardUrl]);

  if (!selectedSite && loading) {
    return (
      <SettingsGroup title="設定する対象">
        <SettingsGroupNote>
          <div className="settings-page__site-board-loading">
            <Spinner size="sm" />
            <span>ドメインと板の一覧を読み込み中...</span>
          </div>
        </SettingsGroupNote>
      </SettingsGroup>
    );
  }

  const selectedBoardTitle = siteBoards.find((board) => board.key === scope?.board)?.title;
  const targetTitle = !scope
    ? "全体設定"
    : scope.board
      ? `板の設定（${selectedBoardTitle ?? scope.board}）`
      : `ドメイン共通の設定（${scope.site}）`;
  const targetDescription = !scope
    ? "個別設定がないドメイン・板に適用します。"
    : scope.board
      ? "この板だけに適用します。指定しない項目はドメイン共通の設定を使います。"
      : "このドメインのすべての板に適用します。指定しない項目は全体設定を使います。";

  const renderIntervalInput = (
    id: string,
    field: Extract<(typeof SETTING_FIELDS)[number], { kind: "interval" }>,
    value: number,
    onSave: (milliseconds: string) => void,
    ariaLabel?: string,
  ) => (
    <>
      <input
        id={id}
        type="number"
        aria-label={ariaLabel}
        min={field.min}
        max={field.max}
        step={1}
        value={value}
        onChange={(event) => {
          const nextValue = Number(event.currentTarget.value);
          if (!Number.isFinite(nextValue)) {
            return;
          }
          const clamped = Math.max(field.min ?? 1, Math.min(field.max ?? 300, nextValue));
          onSave(String(Math.round(clamped) * 1000));
        }}
      />
      <span className="browser-setting-row__unit">秒</span>
    </>
  );

  return (
    <>
      {/* 変更理由: 対象の選び方と、選んだ対象の設定値を別々の枠に分け、
          どの範囲の設定を編集しているかを見出しで示す。 */}
      <SettingsGroup
        title="設定する対象"
        description="ドメインの「すべて」では全体設定を編集します。ドメイン共通の設定はその中のすべての板に適用され、必要な板だけ個別に上書きできます。"
      >
        {/* 変更理由: ドメインと設定対象は左右に並べて選ぶ方が、継承の流れ（ドメイン→板）を追いやすい。
            枠と見出しだけをほかの項目に揃え、選択欄の配置は以前の2列のままにする。 */}
        <div className="settings-page__site-board-selectors">
          <div className="settings-page__site-board-field">
            <div className="settings-page__site-board-field-heading">
              <label htmlFor="site-board-site-select">ドメイン</label>
              {/* 変更理由: ドメイン単位の削除操作を選択欄の近くに置き、対象を分かりやすくする。 */}
              <Button
                className="settings-page__site-board-actions-trigger"
                variant="subtle"
                aria-label={selectedSite ? "ドメインの操作を開く" : "すべてのドメインの操作を開く"}
                aria-haspopup="dialog"
                onClick={() => setIsSiteActionsDialogOpen(true)}
              >
                <MoreVertical size={18} aria-hidden="true" />
              </Button>
            </div>
            <select
              id="site-board-site-select"
              value={selectedSite}
              onChange={(event) => {
                setSelectedSite(event.currentTarget.value);
                setSelectedBoard(SITE_SHARED_SCOPE);
              }}
            >
              <option value="">すべて</option>
              {sites.map((site) => (
                <option key={site} value={site}>
                  {site}
                </option>
              ))}
            </select>
          </div>
          <div className="settings-page__site-board-field">
            <div className="settings-page__site-board-field-heading">
              {/* 変更理由: ここでは板だけでなくドメイン共通の設定も選ぶため、選択肢の役割を示す。 */}
              <label htmlFor="site-board-board-select">設定対象</label>
              <Button
                className="settings-page__site-board-add-button"
                variant="subtle"
                onClick={() => setIsAddBoardDialogOpen(true)}
              >
                ＋ 板を追加
              </Button>
            </div>
            <select
              id="site-board-board-select"
              value={selectedBoard}
              disabled={!selectedSite}
              onChange={(event) => setSelectedBoard(event.currentTarget.value)}
            >
              <option value={SITE_SHARED_SCOPE}>ドメイン共通（すべての板）</option>
              {siteBoards.map((board) => (
                <option key={board.key} value={board.key}>
                  {board.title}
                </option>
              ))}
            </select>
          </div>
        </div>
      </SettingsGroup>

      <Dialog.Root
        open={isAddBoardDialogOpen}
        onOpenChange={(open) => {
          setIsAddBoardDialogOpen(open);
          if (!open) {
            setManualBoardUrl("");
          }
        }}
      >
        <Dialog.Portal container={dialogPortalContainer ?? undefined}>
          <Dialog.Overlay className="browser-dialog-overlay" />
          <Dialog.Content
            className="browser-dialog-content settings-page__site-board-add-dialog"
            aria-describedby="site-board-add-dialog-description"
          >
            <Dialog.Title className="browser-dialog-title">板を追加</Dialog.Title>
            <Dialog.Description
              id="site-board-add-dialog-description"
              className="browser-dialog-description"
            >
              BBSMENUにない板を設定対象へ追加します。URLからドメインと板を判定します。
            </Dialog.Description>
            <label className="settings-page__site-board-field">
              <span>板URL</span>
              <input
                autoFocus
                type="url"
                value={manualBoardUrl}
                placeholder="https://example.com/board/"
                onChange={(event) => setManualBoardUrl(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addManualBoard();
                  }
                }}
              />
            </label>
            <div className="settings-page__site-board-add-dialog-actions">
              <Dialog.Close asChild>
                <Button variant="subtle">キャンセル</Button>
              </Dialog.Close>
              <Button variant="light" onClick={addManualBoard} disabled={!manualBoardUrl.trim()}>
                追加
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={isSiteActionsDialogOpen} onOpenChange={setIsSiteActionsDialogOpen}>
        <Dialog.Portal container={dialogPortalContainer ?? undefined}>
          <Dialog.Overlay className="browser-dialog-overlay" />
          <Dialog.Content
            className="browser-dialog-content settings-page__site-actions-dialog"
            aria-describedby="site-actions-dialog-description"
          >
            <Dialog.Title className="browser-dialog-title">
              {selectedSite ? "このドメインのデータをクリア" : "すべてのドメインのデータをクリア"}
            </Dialog.Title>
            <Dialog.Description
              id="site-actions-dialog-description"
              className="browser-dialog-description"
            >
              対象: <strong>{selectedSite || "すべてのドメイン"}</strong>
            </Dialog.Description>
            {/* 変更理由: 削除対象の説明と操作を縦に並べ、各ボタンが消す内容を明確にする。 */}
            <div className="settings-page__site-actions-list">
              <section className="settings-page__site-action">
                <h3>{selectedSite ? "このドメインのCookie" : "すべてのCookie"}</h3>
                <p>
                  {selectedSite
                    ? "このドメインの書き込み確認に使うCookieを削除します。保存した名前・メール欄は残ります。"
                    : "すべてのCookieを削除します。保存した名前・メール欄は残ります。"}
                </p>
                <div className="settings-page__site-action-controls">
                  {!isCheckingCookies && !hasSiteCookies && (
                    <span className="settings-page__site-action-status">
                      削除するCookieはありません
                    </span>
                  )}
                  <Button
                    className="settings-page__site-action-button"
                    variant="danger"
                    loading={isClearingCookies || isCheckingCookies}
                    disabled={!hasSiteCookies || isClearingSiteSettings}
                    onClick={() => void clearSiteCookies()}
                  >
                    {selectedSite ? "このドメインのCookieをクリア" : "すべてのCookieをクリア"}
                  </Button>
                </div>
              </section>
              <section className="settings-page__site-action">
                <h3>{selectedSite ? "ドメイン共通の設定" : "ドメイン・板別の設定"}</h3>
                <p>
                  {selectedSite
                    ? "このドメイン共通の設定と各板で指定した上書き設定を削除します。削除後は「全体設定」の値が適用されます。"
                    : "すべてのドメイン共通設定と各板の上書き設定を削除します。削除後は「全体設定」の値が適用されます。"}
                </p>
                <div className="settings-page__site-action-controls">
                  {!(selectedSite
                    ? document.sites[selectedSite]
                    : Object.keys(document.sites).length > 0) && (
                    <span className="settings-page__site-action-status">
                      削除する個別設定はありません
                    </span>
                  )}
                  <Button
                    className="settings-page__site-action-button"
                    variant="danger"
                    loading={isClearingSiteSettings}
                    disabled={
                      !(selectedSite
                        ? document.sites[selectedSite]
                        : Object.keys(document.sites).length > 0) || isClearingCookies
                    }
                    onClick={() => void clearSiteSettings()}
                  >
                    {selectedSite ? "このドメインの設定をクリア" : "すべてのドメインの設定をクリア"}
                  </Button>
                </div>
              </section>
            </div>
            <div className="settings-page__site-actions-dialog-footer">
              <Dialog.Close asChild>
                <Button variant="subtle">閉じる</Button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <SettingsGroup title={targetTitle} description={targetDescription}>
        {SETTING_FIELDS.map((field) => {
          const id = `site-board-${field.key}`;
          const isSaving = savingKey === field.key;

          if (!scope) {
            const value = globalValues[field.key];
            return (
              <SettingRow
                key={field.key}
                htmlFor={id}
                label={field.title}
                description={field.description}
              >
                {isSaving && <span className="browser-setting-row__unit">保存中...</span>}
                {field.kind === "text" ? (
                  <ScopedTextInput
                    id={id}
                    value={value}
                    key={`${field.key}-${selectedSite}`}
                    onSave={(next) => void saveGlobalSetting(field.key, next)}
                  />
                ) : (
                  renderIntervalInput(
                    id,
                    field,
                    toIntervalSeconds(value, 20, field.min ?? 1, field.max ?? 300),
                    (milliseconds) => void saveGlobalSetting(field.key, milliseconds),
                  )
                )}
              </SettingRow>
            );
          }

          const resolved = resolveScopedSetting(
            field.key,
            getScopeUrl(scope.site, scope.board ?? SITE_SHARED_SCOPE),
          );
          const override = getOverride(document, scope, field.key);
          const isCustom = override !== undefined;
          const fallbackValue = resolved.value ?? getDefaultValue(field.key);
          const intervalValue =
            field.kind === "interval"
              ? toIntervalSeconds(fallbackValue, 20, field.min ?? 1, field.max ?? 300)
              : 0;
          const effectiveValueLabel =
            field.kind === "text" ? fallbackValue || "未入力" : `${intervalValue}秒`;
          const modeId = `${id}-mode`;

          return (
            <SettingRow
              key={field.key}
              htmlFor={modeId}
              label={field.title}
              description={
                <>
                  {field.description}
                  <span className="settings-page__site-board-source">
                    {isSaving
                      ? "保存中..."
                      : `現在: ${SOURCE_LABELS[resolved.source]}（${effectiveValueLabel}）`}
                  </span>
                </>
              }
            >
              <select
                id={modeId}
                value={isCustom ? "custom" : "inherit"}
                onChange={(event) => {
                  if (event.currentTarget.value === "inherit") {
                    void saveOverride(field.key, undefined);
                    return;
                  }
                  const value =
                    field.kind === "text" ? fallbackValue : String(intervalValue * 1000);
                  void saveOverride(field.key, value);
                }}
              >
                <option value="inherit">
                  {scope.board ? "ドメイン共通の設定を使う" : "全体設定を使う"}
                </option>
                <option value="custom">
                  {scope.board ? "この板だけに指定する" : "ドメイン内で共通に指定する"}
                </option>
              </select>
              {isCustom && field.kind === "text" && (
                <ScopedTextInput
                  id={id}
                  ariaLabel={`${field.title}の値`}
                  value={override ?? ""}
                  key={`${field.key}-${scope.site}-${scope.board ?? "site"}`}
                  onSave={(next) => void saveOverride(field.key, next)}
                />
              )}
              {isCustom &&
                field.kind === "interval" &&
                renderIntervalInput(
                  id,
                  field,
                  toIntervalSeconds(
                    override ?? null,
                    intervalValue,
                    field.min ?? 1,
                    field.max ?? 300,
                  ),
                  (milliseconds) => void saveOverride(field.key, milliseconds),
                  `${field.title}（秒）`,
                )}
            </SettingRow>
          );
        })}
      </SettingsGroup>
    </>
  );
}
