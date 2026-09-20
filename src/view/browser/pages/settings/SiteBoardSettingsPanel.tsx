import { useCallback, useEffect, useMemo, useState } from "react";
import { platformCookieManager } from "src/app/platform/CookieManager";
import type { BBSMenu } from "src/core/BBSMenuParser";
import { getBoardUrlKey, normalizeBoardUrl } from "src/core/BoardUrlNormalizer";
import { container } from "src/service-container/index";
import {
  MAX_BOARD_AUTO_REFRESH_SEC,
  MAX_THREAD_AUTO_REFRESH_SEC,
  MIN_BOARD_AUTO_REFRESH_SEC,
  MIN_THREAD_AUTO_REFRESH_SEC,
} from "src/view/browser/hooks/auto-refresh-config";
import { Button } from "src/view/browser/ui/Button";
import { Dialog } from "src/view/browser/ui/Dialog";
import { Spinner } from "src/view/browser/ui/Spinner";
import {
  Surface,
  SurfaceBody,
  SurfaceDescription,
  SurfaceHeader,
  SurfaceTitle,
} from "src/view/browser/ui/Surface";
import {
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

interface BoardOption {
  site: string;
  key: string;
  title: string;
}

interface RawBoardOption {
  url: string;
  title: string;
}

const SOURCE_LABELS = {
  board: "この板",
  site: "このサイト",
  global: "全体設定",
} as const;

const SETTING_FIELDS = [
  {
    key: "sage_flag",
    title: "sage",
    description: "メール欄へsageを自動設定して投稿します。",
    kind: "boolean",
  },
  {
    key: "auto_load_second",
    title: "スレッドの自動更新間隔",
    description: "スレッドを自動更新する間隔です。",
    kind: "interval",
    min: MIN_THREAD_AUTO_REFRESH_SEC,
    max: MAX_THREAD_AUTO_REFRESH_SEC,
  },
  {
    key: "auto_load_second_board",
    title: "板一覧の自動更新間隔",
    description: "板一覧を自動更新する間隔です。",
    kind: "interval",
    min: MIN_BOARD_AUTO_REFRESH_SEC,
    max: MAX_BOARD_AUTO_REFRESH_SEC,
  },
] as const satisfies readonly {
  key: ScopedSettingKey;
  title: string;
  description: string;
  kind: "boolean" | "interval";
  min?: number;
  max?: number;
}[];

function deriveBoardTitle(boardUrl: string): string {
  try {
    const parsed = new URL(boardUrl);
    const path = parsed.pathname.replace(/^\/+|\/+$/gu, "");
    return path ? `${parsed.hostname}/${path}` : parsed.hostname;
  } catch {
    return boardUrl;
  }
}

function readOpenedBoards(): RawBoardOption[] {
  const raw = container.config.get("opened_board_entries");
  if (!raw) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.flatMap((entry: unknown) => {
      if (typeof entry !== "object" || entry === null) {
        return [];
      }
      const value = entry as { url?: unknown; title?: unknown };
      if (typeof value.url !== "string") {
        return [];
      }
      const normalizedUrl = normalizeBoardUrl(value.url, { requireCompatibleHost: true });
      if (normalizedUrl === null) {
        return [];
      }
      return [
        {
          url: normalizedUrl,
          title: typeof value.title === "string" && value.title ? value.title : normalizedUrl,
        },
      ];
    });
  } catch (error) {
    console.error("[SiteBoardSettings] 開いた板一覧の読み込みに失敗しました", error);
    return [];
  }
}

function readBBSMenuBoards(menu: readonly BBSMenu[]): RawBoardOption[] {
  return menu.flatMap((source) =>
    source.categories.flatMap((category) =>
      category.boards.map((board) => ({ url: board.url, title: board.name })),
    ),
  );
}

function readScopeBoards(document: ScopedSettingsDocument): RawBoardOption[] {
  return Object.values(document.sites).flatMap((site) =>
    Object.keys(site.boards).map((url) => ({ url, title: deriveBoardTitle(url) })),
  );
}

export function mergeBoardOptions(sources: readonly RawBoardOption[]): BoardOption[] {
  const boards = new Map<string, BoardOption>();
  for (const source of sources) {
    const key = normalizeBoardKey(source.url);
    const comparisonKey = getBoardUrlKey(source.url);
    const site = normalizeSiteKey(source.url);
    if (!key || !comparisonKey || !site || boards.has(comparisonKey)) {
      continue;
    }
    // 変更理由: 設定データ・BBSMENU・開いた板でURL表記が異なっても、
    // プロトコルを含まない板識別子で同じ選択肢へまとめる。
    boards.set(comparisonKey, {
      key,
      site,
      title: source.title.trim() || deriveBoardTitle(key),
    });
  }
  return Array.from(boards.values()).sort((left, right) =>
    left.title.localeCompare(right.title, "ja"),
  );
}

function toIntervalSeconds(rawValue: string | null, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(rawValue ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(parsed / 1000)));
}

function getOverride(
  document: ScopedSettingsDocument,
  scope: ScopedSettingScope,
  key: ScopedSettingKey,
): string | undefined {
  const site = document.sites[scope.site];
  if (!site) {
    return undefined;
  }
  const override = scope.board ? site.boards[scope.board] : site.overrides;
  return override && Object.prototype.hasOwnProperty.call(override, key)
    ? override[key]
    : undefined;
}

function getDefaultValue(key: ScopedSettingKey): string {
  if (key === "sage_flag") {
    return container.config.get(key) === "on" ? "on" : "off";
  }
  const raw = container.config.get(key);
  return raw && Number.parseInt(raw, 10) > 0 ? raw : "20000";
}

function getScopeUrl(site: string, board: string): string {
  return board === SITE_SHARED_SCOPE ? `https://${site}/` : board;
}

export function SiteBoardSettingsPanel() {
  const [document, setDocument] = useState<ScopedSettingsDocument>(() => readScopedSettings());
  const [menuBoards, setMenuBoards] = useState<RawBoardOption[]>([]);
  const [manualBoards, setManualBoards] = useState<RawBoardOption[]>([]);
  const [selectedSite, setSelectedSite] = useState("");
  const [selectedBoard, setSelectedBoard] = useState(SITE_SHARED_SCOPE);
  const [manualBoardUrl, setManualBoardUrl] = useState("");
  const [isAddBoardDialogOpen, setIsAddBoardDialogOpen] = useState(false);
  const [dialogPortalContainer, setDialogPortalContainer] = useState<HTMLElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<ScopedSettingKey | null>(null);
  const [isClearingCookies, setIsClearingCookies] = useState(false);

  useEffect(() => {
    setDialogPortalContainer(globalThis.document.querySelector<HTMLElement>(".browser-shell"));
  }, []);

  useEffect(() => {
    const sync = () => setDocument(readScopedSettings());
    const handleConfigUpdated = ({ key }: { key?: string }) => {
      if (key === SCOPED_SETTINGS_CONFIG_KEY) {
        sync();
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
          setMenuBoards(readBBSMenuBoards(result.menu));
        }
      } catch (error) {
        console.error("[SiteBoardSettings] BBSMENUから板一覧を取得できませんでした", error);
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

  useEffect(() => {
    if (selectedSite && sites.includes(selectedSite)) {
      return;
    }
    setSelectedSite(sites[0] ?? "");
  }, [selectedSite, sites]);

  const siteBoards = useMemo(
    () => boards.filter((board) => board.site === selectedSite),
    [boards, selectedSite],
  );

  useEffect(() => {
    if (
      selectedBoard === SITE_SHARED_SCOPE ||
      siteBoards.some((board) => board.key === selectedBoard)
    ) {
      return;
    }
    setSelectedBoard(SITE_SHARED_SCOPE);
  }, [selectedBoard, siteBoards]);

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

  const clearSiteCookies = useCallback(async () => {
    if (!selectedSite || isClearingCookies) {
      return;
    }
    if (
      !window.confirm(
        `「${selectedSite}」のCookieを削除します。保存した名前・メール欄は削除されません。よろしいっすか？`,
      )
    ) {
      return;
    }

    setIsClearingCookies(true);
    try {
      await platformCookieManager.clearSiteCookies(selectedSite);
      container.toast.success(`${selectedSite}のCookieを削除しました`);
    } catch (error) {
      console.error("[SiteBoardSettings] サイトCookieの削除に失敗しました", error);
      container.toast.error(
        error instanceof Error ? error.message : "サイトCookieの削除に失敗しました",
      );
    } finally {
      setIsClearingCookies(false);
    }
  }, [isClearingCookies, selectedSite]);

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
      <Surface variant="flat">
        <SurfaceBody className="settings-page__site-board-loading">
          <Spinner size="sm" />
          <span>サイトと板の一覧を読み込み中...</span>
        </SurfaceBody>
      </Surface>
    );
  }

  return (
    <Surface variant="flat">
      <SurfaceHeader>
        <SurfaceTitle>サイト・板ごとの設定</SurfaceTitle>
        <SurfaceDescription>
          板の設定はサイトの設定を引き継ぎ、ここで指定した項目だけを上書きします。対象が見つからないときは板URLを追加できます。
        </SurfaceDescription>
      </SurfaceHeader>
      <SurfaceBody>
        <div className="settings-page__site-board-selectors">
          <label className="settings-page__site-board-field">
            <span>サイト</span>
            <select
              value={selectedSite}
              onChange={(event) => {
                setSelectedSite(event.currentTarget.value);
                setSelectedBoard(SITE_SHARED_SCOPE);
              }}
            >
              <option value="">サイトを選択</option>
              {sites.map((site) => (
                <option key={site} value={site}>
                  {site}
                </option>
              ))}
            </select>
            <Button
              className="settings-page__site-board-cookie-button"
              variant="danger"
              loading={isClearingCookies}
              disabled={!selectedSite}
              onClick={() => void clearSiteCookies()}
            >
              このサイトのCookieをクリア
            </Button>
            <span className="settings-page__site-board-cookie-description">
              書き込み確認に使う認証Cookieを削除します。保存した名前・メール欄は残ります。
            </span>
          </label>
          <div className="settings-page__site-board-field">
            <div className="settings-page__site-board-field-heading">
              <span>板</span>
              <Button
                className="settings-page__site-board-add-button"
                variant="subtle"
                onClick={() => setIsAddBoardDialogOpen(true)}
              >
                ＋ 板を追加
              </Button>
            </div>
            <select
              value={selectedBoard}
              disabled={!selectedSite}
              onChange={(event) => setSelectedBoard(event.currentTarget.value)}
            >
              <option value={SITE_SHARED_SCOPE}>サイト共通</option>
              {siteBoards.map((board) => (
                <option key={board.key} value={board.key}>
                  {board.title}
                </option>
              ))}
            </select>
          </div>
        </div>

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
                BBSMENUにない板を設定対象へ追加します。URLからサイトと板を判定します。
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

        {!scope && (
          <p className="settings-page__site-board-empty">サイトを選ぶと設定を編集できます。</p>
        )}

        {scope && (
          <div className="settings-page__site-board-settings">
            {SETTING_FIELDS.map((field) => {
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
                field.kind === "boolean"
                  ? fallbackValue === "on"
                    ? "ON"
                    : "OFF"
                  : `${intervalValue}秒`;

              return (
                <div key={field.key} className="settings-page__site-board-setting">
                  <div className="settings-page__site-board-setting-header">
                    <div>
                      <h4>{field.title}</h4>
                      <p>{field.description}</p>
                    </div>
                    <span className="settings-page__site-board-source">
                      {savingKey === field.key
                        ? "保存中..."
                        : `現在: ${SOURCE_LABELS[resolved.source]}（${effectiveValueLabel}）`}
                    </span>
                  </div>
                  <select
                    value={isCustom ? "custom" : "inherit"}
                    onChange={(event) => {
                      if (event.currentTarget.value === "inherit") {
                        void saveOverride(field.key, undefined);
                        return;
                      }
                      const value =
                        field.kind === "boolean"
                          ? fallbackValue === "on"
                            ? "on"
                            : "off"
                          : String(intervalValue * 1000);
                      void saveOverride(field.key, value);
                    }}
                  >
                    <option value="inherit">
                      {scope.board ? "サイトの設定を使う" : "全体の設定を使う"}
                    </option>
                    <option value="custom">この{scope.board ? "板" : "サイト"}で指定する</option>
                  </select>

                  {isCustom && field.kind === "boolean" && (
                    <label className="settings-page__site-board-checkbox">
                      <input
                        type="checkbox"
                        checked={override === "on"}
                        onChange={(event) =>
                          void saveOverride(field.key, event.currentTarget.checked ? "on" : "off")
                        }
                      />
                      sageを有効にする
                    </label>
                  )}

                  {isCustom && field.kind === "interval" && (
                    <label className="settings-page__site-board-interval">
                      <input
                        type="number"
                        min={field.min}
                        max={field.max}
                        step={1}
                        value={toIntervalSeconds(
                          override ?? null,
                          intervalValue,
                          field.min ?? 1,
                          field.max ?? 300,
                        )}
                        onChange={(event) => {
                          const nextValue = Number(event.currentTarget.value);
                          if (!Number.isFinite(nextValue)) {
                            return;
                          }
                          const clamped = Math.max(
                            field.min ?? 1,
                            Math.min(field.max ?? 300, nextValue),
                          );
                          void saveOverride(field.key, String(Math.round(clamped) * 1000));
                        }}
                      />
                      <span>秒</span>
                    </label>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SurfaceBody>
    </Surface>
  );
}
