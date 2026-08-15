import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Divider,
  Group,
  Loader,
  NavLink,
  NumberInput,
  Paper,
  Radio,
  ScrollArea,
  Stack,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
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
import { SettingsSupplementaryPanels } from "src/view/browser/pages/settings/SettingsSupplementaryPanels";
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
          <Checkbox
            key={field.key}
            checked={toBooleanValue(value)}
            label={field.title}
            description={field.description}
            onChange={(event) => {
              updateFieldValue(sectionId, field.key, event.currentTarget.checked);
            }}
          />
        );
      }

      if (field.kind === "number") {
        return (
          <NumberInput
            key={field.key}
            label={field.title}
            description={field.description}
            value={toNumberValue(value)}
            min={field.minimum}
            max={field.maximum}
            step={field.step}
            onChange={(nextValue) => {
              const normalized =
                typeof nextValue === "number" && Number.isFinite(nextValue) ? nextValue : 0;
              updateFieldValue(sectionId, field.key, normalized);
            }}
          />
        );
      }

      if (field.options && field.options.length > 0) {
        return (
          <Radio.Group
            key={field.key}
            label={field.title}
            description={field.description}
            value={toStringValue(value)}
            onChange={(nextValue) => {
              updateFieldValue(sectionId, field.key, nextValue);
            }}
          >
            <Stack gap="xs" mt="xs">
              {field.options.map((option) => (
                <Radio key={option.const} value={option.const} label={option.title} />
              ))}
            </Stack>
          </Radio.Group>
        );
      }

      if (field.widget === "textarea") {
        return (
          <Textarea
            key={field.key}
            label={field.title}
            description={field.description}
            value={toStringValue(value)}
            autosize
            minRows={field.rows ?? 6}
            onChange={(event) => {
              updateFieldValue(sectionId, field.key, event.currentTarget.value);
            }}
          />
        );
      }

      if (field.widget === "ng_editor") {
        return (
          <Box key={field.key}>
            <Text fw={600} size="sm" mb={6}>
              {field.title}
            </Text>
            {field.description && (
              <Text size="xs" c="dimmed" mb="sm">
                {field.description}
              </Text>
            )}
            <NGEditor
              value={toStringValue(value)}
              onChange={(nextValue) => {
                updateFieldValue(sectionId, field.key, nextValue);
              }}
            />
          </Box>
        );
      }

      return (
        <Textarea
          key={field.key}
          label={field.title}
          description={field.description}
          value={toStringValue(value)}
          autosize
          minRows={2}
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
            <Stack key={`divider-${item.id}-${index}`} gap={6}>
              <Divider label={item.title} labelPosition="left" />
              {item.description && (
                <Text size="xs" c="dimmed">
                  {item.description}
                </Text>
              )}
            </Stack>
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
      <Group justify="center" py="xl">
        <Loader size="sm" />
        <Text size="sm" c="dimmed">
          設定を読み込み中...
        </Text>
      </Group>
    );
  }

  if (error || !formState) {
    return (
      <Stack align="center" py="xl">
        <Alert color="red" icon={<AlertTriangle size={16} />}>
          {error ?? "設定の読み込みに失敗しました"}
        </Alert>
        <Button variant="light" onClick={loadSettings}>
          再試行
        </Button>
      </Stack>
    );
  }

  return (
    <Box
      style={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: isCompact ? "1fr" : "300px minmax(0, 1fr)",
        gap: 16,
        padding: 16,
        height: "100%",
      }}
    >
      {!isCompact && (
        <Paper withBorder radius="lg" p="md">
          <Stack gap="xs">
            <Text fw={700} size="sm" c="dimmed">
              設定カテゴリ
            </Text>
            {SETTINGS_SECTIONS.map((section) => (
              <NavLink
                key={section.id}
                active={activeSectionId === section.id}
                onClick={() => setActiveSectionId(section.id)}
                leftSection={section.icon}
                label={section.title}
                description={section.description}
                variant="filled"
              />
            ))}
          </Stack>
        </Paper>
      )}

      {isCompact && (
        <>
          <Box
            role="button"
            tabIndex={0}
            aria-label="設定カテゴリメニューを開く"
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              width: 12,
              zIndex: 10,
            }}
            onMouseEnter={openCompactMenu}
            onFocus={openCompactMenu}
            onBlur={scheduleCompactMenuClose}
          />

          {isCompactMenuOpen && (
            <Paper
              withBorder
              radius="lg"
              p="md"
              style={{
                position: "absolute",
                top: 16,
                left: 16,
                width: "min(300px, calc(100vw - 32px))",
                maxHeight: "calc(100% - 32px)",
                zIndex: 20,
                overflow: "hidden",
              }}
              onMouseEnter={openCompactMenu}
              onMouseLeave={scheduleCompactMenuClose}
            >
              <ScrollArea style={{ height: "100%" }}>
                <Stack gap="xs">
                  <Text fw={700} size="sm" c="dimmed">
                    設定カテゴリ
                  </Text>
                  {SETTINGS_SECTIONS.map((section) => (
                    <NavLink
                      key={section.id}
                      active={activeSectionId === section.id}
                      onClick={() => {
                        setActiveSectionId(section.id);
                        setIsCompactMenuOpen(false);
                      }}
                      leftSection={section.icon}
                      label={section.title}
                      description={section.description}
                      variant="filled"
                    />
                  ))}
                </Stack>
              </ScrollArea>
            </Paper>
          )}
        </>
      )}

      <ScrollArea
        viewportRef={scrollViewportRef}
        onScrollPositionChange={(position) => {
          persistPageUiState(position.y);
        }}
      >
        <Stack gap="md" pb="md" pr={isCompact ? 0 : 6}>
          <Card withBorder radius="lg" p="lg">
            <Group justify="space-between" align="flex-start" wrap="wrap">
              <div>
                <Text size="xs" fw={700} c="dimmed">
                  SETTINGS
                </Text>
                <Title order={2} mt={4}>
                  {activeSection.title}
                </Title>
                <Text size="sm" c="dimmed" mt={6}>
                  {activeSection.description}
                </Text>
              </div>
              <Stack gap={6} align="flex-end">
                <Badge variant="light">自動保存</Badge>
                {savingSectionId === activeSection.id && (
                  <Group gap={6}>
                    <RefreshCw size={14} className="animate-spin" />
                    <Text size="xs" c="dimmed">
                      保存中...
                    </Text>
                  </Group>
                )}
              </Stack>
            </Group>

            {autoSaveError && (
              <Alert mt="md" color="red" icon={<AlertTriangle size={16} />}>
                {autoSaveError}
              </Alert>
            )}

            <Divider my="md" />

            {activeSection.id !== "ng" && (
              <Stack gap="xl">
                {activeSection.id !== "other" &&
                  renderSectionItems(activeSection.id, regularSectionItems)}

                {activeSection.id === "other" && (
                  <>
                    <Paper withBorder radius="md" p="md">
                      <Stack gap="sm">
                        {/* 変更理由: BBSMENU項目と操作は「その他」内でまとまりを持たせ、
                            他設定と混ざらない独立ブロックにして見通しを上げる。 */}
                        {renderSectionItems("other", otherBbsmenuSectionItems)}
                        <Group gap="sm" wrap="wrap">
                          <Button
                            variant="default"
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
                        </Group>
                      </Stack>
                    </Paper>

                    {renderSectionItems("other", otherNonBbsmenuSectionItems)}
                  </>
                )}
              </Stack>
            )}

            {activeSection.id === "ng" && (
              <Stack gap="lg">
                {renderSectionItems("ng", ngPrimarySectionItems)}

                <Button
                  variant="subtle"
                  justify="start"
                  leftSection={
                    <ChevronDown
                      size={16}
                      style={{
                        transform: isNgExamplesOpen ? "rotate(180deg)" : "rotate(0deg)",
                        transition: "transform 140ms ease",
                      }}
                    />
                  }
                  onClick={() => {
                    setIsNgExamplesOpen((prev) => !prev);
                  }}
                >
                  NG記法例
                </Button>

                {isNgExamplesOpen && (
                  <Card withBorder radius="md" p="sm">
                    <Stack gap="xs">
                      <Text size="xs" c="dimmed">
                        よく使う例をそのままコピーして調整できます。
                      </Text>
                      <Text size="xs" fw={600}>
                        基本
                      </Text>
                      <NGDslHelpSnippet code={NG_DSL_EXAMPLE} minHeight={140} />
                      <Text size="xs" fw={600}>
                        複数行
                      </Text>
                      <NGDslHelpSnippet code={NG_DSL_MULTILINE_EXAMPLE} minHeight={180} />
                    </Stack>
                  </Card>
                )}

                <Button
                  variant="subtle"
                  justify="start"
                  leftSection={
                    <ChevronDown
                      size={16}
                      style={{
                        transform: isNgAdvancedOpen ? "rotate(180deg)" : "rotate(0deg)",
                        transition: "transform 140ms ease",
                      }}
                    />
                  }
                  onClick={() => {
                    setIsNgAdvancedOpen((prev) => !prev);
                  }}
                >
                  高度なNG設定
                </Button>

                {isNgAdvancedOpen && (
                  <Stack gap="sm">{renderSectionItems("ng", ngAdvancedSectionItems)}</Stack>
                )}
              </Stack>
            )}
          </Card>

          <SettingsSupplementaryPanels
            panelIds={activeSection.supplementaryPanelIds}
            maintenanceActions={maintenanceActions}
          />
        </Stack>
      </ScrollArea>
    </Box>
  );
};
