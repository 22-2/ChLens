import { AlertTriangle, ChevronDown, RefreshCw } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getStore2String, setStore2String } from "src/app/Store2Storage";
import { container } from "src/service-container/index";
import {
  NGDslHelpSnippet,
  NGEditor,
  NG_DSL_EXAMPLE,
  NG_DSL_MULTILINE_EXAMPLE,
} from "src/view/browser/components/NGEditor";
import { useMediaQuery } from "src/view/browser/hooks/use-media-query";
import { SettingsSupplementaryPanels } from "src/view/browser/pages/settings/SettingsSupplementaryPanels";
import {
  CheckboxField,
  NumberField,
  RadioField,
  TextareaField,
} from "src/view/browser/ui/FormControls";
import { Alert } from "src/view/browser/ui/Alert";
import { Button } from "src/view/browser/ui/Button";
import { Spinner } from "src/view/browser/ui/Spinner";
import {
  Surface,
  SurfaceActions,
  SurfaceBody,
  SurfaceDescription,
  SurfaceHeader,
  SurfaceStack,
  SurfaceTitle,
} from "src/view/browser/ui/Surface";
import {
  AUTO_SAVE_DELAY_MS,
  NG_PRIMARY_FIELD_KEYS,
  SETTINGS_PAGE_STATE_KEY,
  SETTINGS_SECTIONS,
  SETTINGS_SECTION_MAP,
  isSettingsSectionId,
  readAllSettings,
  saveSectionFormData,
} from "src/view/browser/pages/settings/settings-sections";
import type {
  SettingsFieldDefinition,
  SettingsFormState,
  SettingsFormValue,
  SettingsPageUiState,
  SettingsSectionFormData,
  SettingsSectionId,
  SettingsSectionItem,
} from "src/view/browser/pages/settings/settings-types";
import {
  isSettingsDividerItem,
  isSettingsFieldItem,
} from "src/view/browser/pages/settings/settings-types";
import { useSettingsMaintenanceActions } from "src/view/browser/pages/settings/use-settings-maintenance";
import type { SettingsPage as SettingsPageType } from "src/view/browser/types";

function toStringValue(value: SettingsFormValue): string {
  return typeof value === "string" ? value : "";
}

function toNumberValue(value: SettingsFormValue): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function toBooleanValue(value: SettingsFormValue): boolean {
  return value === true;
}

export const SettingsPage: React.FC<{ page: SettingsPageType }> = ({ page }) => {
  const isCompact = useMediaQuery("(max-width: 980px)") ?? false;
  const [activeSectionId, setActiveSectionId] = useState<SettingsSectionId>("general");
  const [formState, setFormState] = useState<SettingsFormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingSectionId, setSavingSectionId] = useState<SettingsSectionId | null>(null);
  const [autoSaveError, setAutoSaveError] = useState<string | null>(null);
  const [isNgExamplesOpen, setIsNgExamplesOpen] = useState(false);
  const [isNgAdvancedOpen, setIsNgAdvancedOpen] = useState(false);
  const [isCompactMenuOpen, setIsCompactMenuOpen] = useState(false);
  const autoSaveTimerRef = useRef<number | null>(null);
  const saveAttemptRef = useRef(0);
  const formStateRef = useRef<SettingsFormState | null>(null);
  const compactMenuCloseTimerRef = useRef<number | null>(null);
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const restoredScrollTopRef = useRef(0);
  const shouldRestoreScrollRef = useRef(false);

  const activeSection = useMemo(
    () => SETTINGS_SECTION_MAP.get(activeSectionId) ?? SETTINGS_SECTIONS[0],
    [activeSectionId],
  );

  const maintenanceActions = useSettingsMaintenanceActions({
    formState,
    autoSaveTimerRef,
    onResetFormState: (nextState) => {
      formStateRef.current = nextState;
      setFormState(nextState);
    },
    onResetError: (message) => setAutoSaveError(message),
  });

  useEffect(() => {
    formStateRef.current = formState;
  }, [formState]);

  useEffect(() => {
    if (page.sectionId && isSettingsSectionId(page.sectionId)) {
      setActiveSectionId(page.sectionId);
    }
  }, [page.sectionId]);

  useEffect(() => {
    if (page.sectionId) {
      return;
    }

    try {
      const rawState = getStore2String(SETTINGS_PAGE_STATE_KEY);
      if (!rawState) {
        return;
      }

      const parsed = JSON.parse(rawState) as SettingsPageUiState;
      if (parsed.activeSectionId && isSettingsSectionId(parsed.activeSectionId)) {
        setActiveSectionId(parsed.activeSectionId);
      }
      if (typeof parsed.ngAdvancedOpen === "boolean") {
        setIsNgAdvancedOpen(parsed.ngAdvancedOpen);
      }
      if (typeof parsed.ngExamplesOpen === "boolean") {
        setIsNgExamplesOpen(parsed.ngExamplesOpen);
      }
      if (
        typeof parsed.mainScrollTop === "number" &&
        Number.isFinite(parsed.mainScrollTop) &&
        parsed.mainScrollTop >= 0
      ) {
        restoredScrollTopRef.current = parsed.mainScrollTop;
        shouldRestoreScrollRef.current = true;
      }
    } catch {
      // 破損した localStorage を読んで画面全体が壊れるのを避ける。
    }
  }, [page.sectionId]);

  const persistPageUiState = useCallback(
    (nextScrollTop?: number) => {
      const scrollTop = nextScrollTop ?? scrollViewportRef.current?.scrollTop ?? 0;

      const nextState: SettingsPageUiState = {
        activeSectionId,
        mainScrollTop: scrollTop,
        ngExamplesOpen: isNgExamplesOpen,
        ngAdvancedOpen: isNgAdvancedOpen,
      };

      try {
        void setStore2String(SETTINGS_PAGE_STATE_KEY, JSON.stringify(nextState));
      } catch {
        // 一部環境では localStorage が使えないため、永続化失敗は黙殺する。
      }
    },
    [activeSectionId, isNgAdvancedOpen, isNgExamplesOpen],
  );

  const loadSettings = useCallback(() => {
    setLoading(true);
    setError(null);

    container.config.ready(() => {
      try {
        const nextState = readAllSettings();
        formStateRef.current = nextState;
        setFormState(nextState);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "設定の読み込みに失敗しました");
      } finally {
        setLoading(false);
      }
    });
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    persistPageUiState();
  }, [persistPageUiState]);

  useEffect(() => {
    if (loading || !shouldRestoreScrollRef.current || !scrollViewportRef.current) {
      return;
    }

    scrollViewportRef.current.scrollTop = restoredScrollTopRef.current;
    shouldRestoreScrollRef.current = false;
  }, [loading]);

  const scheduleAutoSave = useCallback(
    (sectionId: SettingsSectionId, sectionFormData: SettingsSectionFormData) => {
      const section = SETTINGS_SECTION_MAP.get(sectionId);
      if (!section) {
        return;
      }

      if (autoSaveTimerRef.current != null) {
        window.clearTimeout(autoSaveTimerRef.current);
      }

      // 新しい編集が始まった時点で、前回の保存結果を古いものとして扱う。
      // 保存中に次の入力が入った場合、古い失敗結果が修正後の画面へ戻らないようにする。
      const attemptId = ++saveAttemptRef.current;
      setAutoSaveError(null);

      // 変更理由: キー入力ごとの同期書き込みを避け、設定保存の体感速度を維持する。
      autoSaveTimerRef.current = window.setTimeout(() => {
        autoSaveTimerRef.current = null;
        setSavingSectionId(sectionId);
        setAutoSaveError(null);

        void (async () => {
          try {
            await saveSectionFormData(section, sectionFormData);
            if (attemptId === saveAttemptRef.current) {
              setAutoSaveError(null);
            }
          } catch (saveError) {
            if (attemptId !== saveAttemptRef.current) {
              return;
            }
            const message =
              saveError instanceof Error ? saveError.message : "設定の自動保存に失敗しました";
            setAutoSaveError(message);
            container.toast.error(message);
          } finally {
            if (attemptId === saveAttemptRef.current) {
              setSavingSectionId((prev) => (prev === sectionId ? null : prev));
            }
          }
        })();
      }, AUTO_SAVE_DELAY_MS);
    },
    [],
  );

  const updateFieldValue = useCallback(
    (sectionId: SettingsSectionId, fieldKey: string, value: SettingsFormValue) => {
      const currentState = formStateRef.current;
      if (!currentState) {
        return;
      }

      const nextSectionData: SettingsSectionFormData = {
        ...currentState[sectionId],
        [fieldKey]: value,
      };
      const nextState: SettingsFormState = {
        ...currentState,
        [sectionId]: nextSectionData,
      };
      // Reactのstate updater内で次の保存値を組み立てると、バッチ更新時に
      // 保存予約が抜けることがあるため、refへ先に反映してから保存を予約する。
      formStateRef.current = nextState;
      setFormState(nextState);
      scheduleAutoSave(sectionId, nextSectionData);
    },
    [scheduleAutoSave],
  );

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current != null) {
        window.clearTimeout(autoSaveTimerRef.current);
      }

      if (compactMenuCloseTimerRef.current != null) {
        window.clearTimeout(compactMenuCloseTimerRef.current);
      }
    };
  }, []);

  const clearCompactMenuCloseTimer = useCallback(() => {
    if (compactMenuCloseTimerRef.current != null) {
      window.clearTimeout(compactMenuCloseTimerRef.current);
      compactMenuCloseTimerRef.current = null;
    }
  }, []);

  const openCompactMenu = useCallback(() => {
    clearCompactMenuCloseTimer();
    setIsCompactMenuOpen(true);
  }, [clearCompactMenuCloseTimer]);

  const scheduleCompactMenuClose = useCallback(() => {
    clearCompactMenuCloseTimer();
    // 変更理由: ホットゾーンからメニュー本体へカーソルを移動する短時間で閉じないよう遅延を設ける。
    compactMenuCloseTimerRef.current = window.setTimeout(() => {
      compactMenuCloseTimerRef.current = null;
      setIsCompactMenuOpen(false);
    }, 120);
  }, [clearCompactMenuCloseTimer]);

  useEffect(() => {
    if (!isCompact) {
      clearCompactMenuCloseTimer();
      setIsCompactMenuOpen(false);
    }
  }, [clearCompactMenuCloseTimer, isCompact]);

  const renderField = useCallback(
    (sectionId: SettingsSectionId, field: SettingsFieldDefinition) => {
      const sectionData = formState?.[sectionId] ?? {};
      const value = sectionData[field.key];

      if (field.kind === "boolean") {
        return (
          <CheckboxField
            key={field.key}
            id={`settings-${field.key}`}
            checked={toBooleanValue(value)}
            label={field.title}
            description={field.description}
            onCheckedChange={(checked) => updateFieldValue(sectionId, field.key, checked)}
          />
        );
      }

      if (field.kind === "number") {
        return (
          <NumberField
            key={field.key}
            id={`settings-${field.key}`}
            label={field.title}
            description={field.description}
            value={toNumberValue(value)}
            min={field.minimum}
            max={field.maximum}
            step={field.step}
            onChange={(nextValue) => updateFieldValue(sectionId, field.key, nextValue)}
          />
        );
      }

      if (field.options && field.options.length > 0) {
        return (
          <RadioField
            key={field.key}
            id={`settings-${field.key}`}
            label={field.title}
            description={field.description}
            value={toStringValue(value)}
            options={field.options}
            onValueChange={(nextValue) => updateFieldValue(sectionId, field.key, nextValue)}
          />
        );
      }

      if (field.widget === "textarea") {
        return (
          <TextareaField
            key={field.key}
            id={`settings-${field.key}`}
            label={field.title}
            description={field.description}
            value={toStringValue(value)}
            rows={field.rows ?? 6}
            onChange={(event) => {
              updateFieldValue(sectionId, field.key, event.currentTarget.value);
            }}
          />
        );
      }

      if (field.widget === "ng_editor") {
        return (
          <div key={field.key} className="settings-page__ng-field">
            <h3 className="settings-page__ng-field-title">{field.title}</h3>
            {field.description && (
              <p className="settings-page__ng-field-description">{field.description}</p>
            )}
            <NGEditor
              value={toStringValue(value)}
              onChange={(nextValue) => {
                updateFieldValue(sectionId, field.key, nextValue);
              }}
            />
          </div>
        );
      }

      return (
        <TextareaField
          key={field.key}
          id={`settings-${field.key}`}
          label={field.title}
          description={field.description}
          value={toStringValue(value)}
          rows={2}
          onChange={(event) => {
            updateFieldValue(sectionId, field.key, event.currentTarget.value);
          }}
        />
      );
    },
    [formState, updateFieldValue],
  );

  const renderSectionItems = useCallback(
    (sectionId: SettingsSectionId, items: readonly SettingsSectionItem[]) =>
      items.map((item, index) => {
        if (isSettingsDividerItem(item)) {
          return (
            <div key={`divider-${item.id}-${index}`} className="settings-page__section-divider">
              <div className="settings-page__section-divider-line">
                <span>{item.title}</span>
              </div>
              {item.description && (
                <p className="settings-page__section-divider-description">{item.description}</p>
              )}
            </div>
          );
        }

        return renderField(sectionId, item);
      }),
    [renderField],
  );

  const regularSectionItems = useMemo(() => {
    if (activeSection.id === "ng") {
      return [] as SettingsSectionItem[];
    }

    return activeSection.fields;
  }, [activeSection]);

  const otherBbsmenuSectionItems = useMemo(() => {
    if (activeSection.id !== "other") {
      return [] as SettingsSectionItem[];
    }

    return activeSection.fields.filter(
      (item) =>
        (isSettingsDividerItem(item) && item.id === "external-data") ||
        (isSettingsFieldItem(item) && item.key.startsWith("bbsmenu")),
    );
  }, [activeSection]);

  const otherNonBbsmenuSectionItems = useMemo(() => {
    if (activeSection.id !== "other") {
      return [] as SettingsSectionItem[];
    }

    return activeSection.fields.filter(
      (item) =>
        (isSettingsDividerItem(item) && item.id !== "external-data") ||
        (isSettingsFieldItem(item) && !item.key.startsWith("bbsmenu")),
    );
  }, [activeSection]);

  const ngPrimarySectionItems = useMemo(() => {
    if (activeSection.id !== "ng") {
      return [] as SettingsSectionItem[];
    }

    return activeSection.fields.filter(
      (item) => isSettingsFieldItem(item) && NG_PRIMARY_FIELD_KEYS.has(item.key),
    );
  }, [activeSection]);

  const ngAdvancedSectionItems = useMemo(() => {
    if (activeSection.id !== "ng") {
      return [] as SettingsSectionItem[];
    }

    return activeSection.fields.filter(
      (item) =>
        isSettingsDividerItem(item) ||
        (isSettingsFieldItem(item) && !NG_PRIMARY_FIELD_KEYS.has(item.key)),
    );
  }, [activeSection]);

  if (loading) {
    return (
      <div className="settings-page__loading">
        <Spinner size="sm" />
        <span>設定を読み込み中...</span>
      </div>
    );
  }

  if (error || !formState) {
    return (
      <div className="settings-page__error-state">
        <Alert color="red" icon={<AlertTriangle size={16} />}>
          {error ?? "設定の読み込みに失敗しました"}
        </Alert>
        <Button variant="light" onClick={loadSettings}>
          再試行
        </Button>
      </div>
    );
  }

  return (
    <div className={`settings-page__shell${isCompact ? " settings-page__shell--compact" : ""}`}>
      {!isCompact && (
        <aside className="settings-page__sidebar">
          <div className="settings-page__sidebar-title">設定カテゴリ</div>
          <nav className="settings-page__section-list" aria-label="設定カテゴリ">
            {SETTINGS_SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                className={`settings-page__section-btn${
                  activeSectionId === section.id ? " settings-page__section-btn--active" : ""
                }`}
                aria-current={activeSectionId === section.id ? "page" : undefined}
                onClick={() => setActiveSectionId(section.id)}
              >
                <span className="settings-page__section-icon" aria-hidden="true">
                  {section.icon}
                </span>
                <span className="settings-page__section-content">
                  <span className="settings-page__section-name">{section.title}</span>
                  <span className="settings-page__section-desc">{section.description}</span>
                </span>
              </button>
            ))}
          </nav>
        </aside>
      )}

      {isCompact && (
        <>
          <div
            className="settings-page__compact-hotzone"
            role="button"
            tabIndex={0}
            aria-label="設定カテゴリメニューを開く"
            onMouseEnter={openCompactMenu}
            onFocus={openCompactMenu}
            onBlur={scheduleCompactMenuClose}
          />

          {isCompactMenuOpen && (
            <aside
              className="settings-page__compact-menu"
              onMouseEnter={openCompactMenu}
              onMouseLeave={scheduleCompactMenuClose}
            >
              <div className="settings-page__compact-menu-scroll">
                <div className="settings-page__sidebar-title">設定カテゴリ</div>
                <nav className="settings-page__section-list" aria-label="設定カテゴリ">
                  {SETTINGS_SECTIONS.map((section) => (
                    <button
                      key={section.id}
                      type="button"
                      className={`settings-page__section-btn${
                        activeSectionId === section.id ? " settings-page__section-btn--active" : ""
                      }`}
                      aria-current={activeSectionId === section.id ? "page" : undefined}
                      onClick={() => {
                        setActiveSectionId(section.id);
                        setIsCompactMenuOpen(false);
                      }}
                    >
                      <span className="settings-page__section-icon" aria-hidden="true">
                        {section.icon}
                      </span>
                      <span className="settings-page__section-content">
                        <span className="settings-page__section-name">{section.title}</span>
                        <span className="settings-page__section-desc">{section.description}</span>
                      </span>
                    </button>
                  ))}
                </nav>
              </div>
            </aside>
          )}
        </>
      )}

      <main
        ref={scrollViewportRef}
        className="settings-page__main"
        onScroll={(event) => persistPageUiState(event.currentTarget.scrollTop)}
      >
        <SurfaceStack className="settings-page__content-stack">
          <Surface>
            <SurfaceHeader className="settings-page__header">
              <div>
                <div className="settings-page__eyebrow">SETTINGS</div>
                <h2 className="settings-page__title">{activeSection.title}</h2>
                <p className="settings-page__description">{activeSection.description}</p>
              </div>
              <div className="settings-page__status-row">
                <span className="settings-page__note">自動保存</span>
                {savingSectionId === activeSection.id && (
                  <span className="settings-page__saving">
                    <RefreshCw size={14} className="animate-spin" aria-hidden="true" />
                    保存中...
                  </span>
                )}
              </div>
            </SurfaceHeader>

            <SurfaceBody>
              {autoSaveError && (
                <Alert
                  className="settings-page__auto-save-error"
                  color="red"
                  icon={<AlertTriangle size={16} />}
                >
                  {autoSaveError}
                </Alert>
              )}

              <hr className="settings-page__divider" />

              {activeSection.id !== "ng" && (
                <div className="settings-page__section-stack">
                  {activeSection.id !== "other" &&
                    renderSectionItems(activeSection.id, regularSectionItems)}

                  {activeSection.id === "other" && (
                    <>
                      <Surface as="section" tone="muted" variant="flat">
                        <SurfaceHeader>
                          <SurfaceTitle>BBSMenu</SurfaceTitle>
                          <SurfaceDescription>
                            掲示板一覧の取得・更新を行います。
                          </SurfaceDescription>
                        </SurfaceHeader>
                        <SurfaceBody>
                          {renderSectionItems("other", otherBbsmenuSectionItems)}
                          <SurfaceActions>
                            <Button
                              onClick={() => void maintenanceActions.handleBBSMenuCheck()}
                              loading={maintenanceActions.isBbsMenuChecking}
                              disabled={maintenanceActions.isBbsMenuRefreshing}
                            >
                              URLチェック
                            </Button>
                            <Button
                              onClick={() => void maintenanceActions.handleBBSMenuRefresh()}
                              loading={maintenanceActions.isBbsMenuRefreshing}
                              disabled={maintenanceActions.isBbsMenuChecking}
                            >
                              BBSMenuリフレッシュ
                            </Button>
                          </SurfaceActions>
                        </SurfaceBody>
                      </Surface>

                      {renderSectionItems("other", otherNonBbsmenuSectionItems)}
                    </>
                  )}
                </div>
              )}

              {activeSection.id === "ng" && (
                <div className="settings-page__section-stack settings-page__section-stack--ng">
                  {renderSectionItems("ng", ngPrimarySectionItems)}

                  <Button
                    className="settings-page__toggle"
                    variant="subtle"
                    aria-expanded={isNgExamplesOpen}
                    onClick={() => setIsNgExamplesOpen((prev) => !prev)}
                  >
                    <ChevronDown
                      size={16}
                      className={`settings-page__toggle-icon${
                        isNgExamplesOpen ? " settings-page__toggle-icon--open" : ""
                      }`}
                      aria-hidden="true"
                    />
                    NG記法例
                  </Button>

                  {isNgExamplesOpen && (
                    <Surface as="section" tone="muted" variant="flat">
                      <SurfaceHeader>
                        <SurfaceDescription>
                          よく使う例をそのままコピーして調整できます。
                        </SurfaceDescription>
                      </SurfaceHeader>
                      <SurfaceBody>
                        <h3 className="settings-page__help-label">基本</h3>
                        <NGDslHelpSnippet code={NG_DSL_EXAMPLE} minHeight={140} />
                        <h3 className="settings-page__help-label">複数行</h3>
                        <NGDslHelpSnippet code={NG_DSL_MULTILINE_EXAMPLE} minHeight={180} />
                      </SurfaceBody>
                    </Surface>
                  )}

                  <Button
                    className="settings-page__toggle"
                    variant="subtle"
                    aria-expanded={isNgAdvancedOpen}
                    onClick={() => setIsNgAdvancedOpen((prev) => !prev)}
                  >
                    <ChevronDown
                      size={16}
                      className={`settings-page__toggle-icon${
                        isNgAdvancedOpen ? " settings-page__toggle-icon--open" : ""
                      }`}
                      aria-hidden="true"
                    />
                    高度なNG設定
                  </Button>

                  {isNgAdvancedOpen && (
                    <div className="settings-page__section-stack--nested">
                      {renderSectionItems("ng", ngAdvancedSectionItems)}
                    </div>
                  )}
                </div>
              )}

              <SettingsSupplementaryPanels
                panelIds={activeSection.supplementaryPanelIds}
                maintenanceActions={maintenanceActions}
              />
            </SurfaceBody>
          </Surface>
        </SurfaceStack>
      </main>
    </div>
  );
};
