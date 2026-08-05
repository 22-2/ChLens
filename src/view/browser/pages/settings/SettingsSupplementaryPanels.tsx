import { Alert, Button, Card, Checkbox, Group, Skeleton, Stack, Text } from "@mantine/core";
import { AlertTriangle } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Cache from "src/core/Cache";
import { container } from "src/service-container/index";
import {
  buildDataExportFilename,
  exportDataArchive,
  importDataArchive,
} from "src/view/browser/pages/settings/settings-data-transfer";
import type { SettingsSupplementaryPanelId } from "src/view/browser/pages/settings/settings-types";
import type { SettingsMaintenanceActions } from "src/view/browser/pages/settings/use-settings-maintenance";
import {
  readBookmarkFolderName,
  readConfiguredBookmarkFolderId,
  supportsBookmarkFolderSelection,
} from "src/view/browser/utils/bookmark-root";

interface SettingsSupplementaryPanelsProps {
  panelIds?: readonly SettingsSupplementaryPanelId[];
  maintenanceActions: SettingsMaintenanceActions;
}

export function SettingsSupplementaryPanels({
  panelIds,
  maintenanceActions,
}: SettingsSupplementaryPanelsProps) {
  const [folderName, setFolderName] = useState<string | null>(null);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);
  const [bookmarkError, setBookmarkError] = useState<string | null>(null);
  const [includeHistoryInExport, setIncludeHistoryInExport] = useState(false);
  const [includeWriteHistoryInExport, setIncludeWriteHistoryInExport] = useState(false);
  const [isExportingArchive, setIsExportingArchive] = useState(false);
  const [isImportingArchive, setIsImportingArchive] = useState(false);
  const [isDeletingLogs, setIsDeletingLogs] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadBookmarkFolder = useCallback(async () => {
    if (!supportsBookmarkFolderSelection()) {
      setBookmarkLoading(false);
      setFolderName(null);
      setBookmarkError(null);
      return;
    }

    setBookmarkLoading(true);
    setBookmarkError(null);

    try {
      const bookmarkId = readConfiguredBookmarkFolderId();
      if (!bookmarkId) {
        setFolderName(null);
        return;
      }

      const nextFolderName = await readBookmarkFolderName(bookmarkId);
      setFolderName(nextFolderName);

      if (!nextFolderName) {
        setBookmarkError("保存先フォルダが未設定か、すでに削除されています");
      }
    } catch (loadError) {
      setBookmarkError(
        loadError instanceof Error ? loadError.message : "ブックマーク保存先の取得に失敗しました",
      );
      setFolderName(null);
    } finally {
      setBookmarkLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!panelIds?.includes("externalIntegration")) {
      return;
    }

    void loadBookmarkFolder();
  }, [loadBookmarkFolder, panelIds]);

  useEffect(() => {
    const handleConfigUpdated = ({ key }: { key?: string }) => {
      if (key === "bookmark_id") {
        void loadBookmarkFolder();
      }
    };

    container.message.on("config_updated", handleConfigUpdated);

    return () => {
      container.message.off("config_updated", handleConfigUpdated);
    };
  }, [loadBookmarkFolder]);

  const handleExportArchive = useCallback(async () => {
    if (isExportingArchive) {
      return;
    }

    setIsExportingArchive(true);
    try {
      const blob = await exportDataArchive({
        includeHistory: includeHistoryInExport,
        includeWriteHistory: includeWriteHistoryInExport,
      });

      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = buildDataExportFilename();
      anchor.click();
      URL.revokeObjectURL(objectUrl);

      container.toast.success("データをzipでエクスポートしました");
    } catch (error) {
      const message = error instanceof Error ? error.message : "データのエクスポートに失敗しました";
      container.toast.error(message);
    } finally {
      setIsExportingArchive(false);
    }
  }, [includeHistoryInExport, includeWriteHistoryInExport, isExportingArchive]);

  const handleImportArchiveFile = useCallback(
    async (file: File) => {
      if (isImportingArchive) {
        return;
      }

      setIsImportingArchive(true);
      try {
        const result = await importDataArchive(file);

        const historySummary =
          result.importedHistoryCount > 0
            ? `閲覧履歴 ${result.importedHistoryCount}件`
            : "閲覧履歴 0件";
        const writeHistorySummary =
          result.importedWriteHistoryCount > 0
            ? `書込履歴 ${result.importedWriteHistoryCount}件`
            : "書込履歴 0件";

        container.toast.success(
          `インポート完了: 設定 ${result.importedSettingsCount}件 / ${historySummary} / ${writeHistorySummary}`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "データのインポートに失敗しました";
        container.toast.error(message);
      } finally {
        setIsImportingArchive(false);
      }
    },
    [isImportingArchive],
  );

  const handleImportButtonClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleDeleteLogs = useCallback(async () => {
    if (isDeletingLogs) {
      return;
    }
    // 恒久保存されたログを消すため、誤操作防止の確認を挟む。
    if (
      !window.confirm(
        "保存済みのログ（過去ログ）をすべて削除します。元に戻せません。よろしいっすか？",
      )
    ) {
      return;
    }

    setIsDeletingLogs(true);
    try {
      await Cache.deleteLogs();
      container.message.send("log_updated", { type: "cleared" });
      container.toast.success("ログをすべて削除しました");
    } catch (error) {
      const message = error instanceof Error ? error.message : "ログの削除に失敗しました";
      container.toast.error(message);
    } finally {
      setIsDeletingLogs(false);
    }
  }, [isDeletingLogs]);

  const panels = useMemo(() => {
    if (!panelIds || panelIds.length === 0) {
      return [] as React.ReactNode[];
    }

    return panelIds.map((panelId) => {
      switch (panelId) {
        case "externalIntegration":
          if (!supportsBookmarkFolderSelection()) {
            return null;
          }

          return (
            <Card key={panelId} withBorder radius="lg" p="md">
              <Stack gap="sm">
                <Text fw={700} size="sm">
                  外部連携
                </Text>
                <Text size="xs" c="dimmed">
                  ブックマーク連携の保存先を確認・変更します。
                </Text>

                {bookmarkLoading ? (
                  <Skeleton height={32} radius="md" />
                ) : (
                  <Card withBorder p="sm" radius="md">
                    <Text size="sm" fw={600}>
                      {folderName ?? "未設定"}
                    </Text>
                  </Card>
                )}

                {bookmarkError && (
                  <Alert color="red" icon={<AlertTriangle size={16} />}>
                    {bookmarkError}
                  </Alert>
                )}

                <Button onClick={() => container.message.send("bookmark_root_selector_open")}>
                  {folderName ? "保存先を変更" : "保存先を選択"}
                </Button>
              </Stack>
            </Card>
          );
        case "dangerZone":
          return (
            <Card key={panelId} withBorder radius="lg" p="md">
              <Stack gap="sm">
                <Text fw={700} size="sm">
                  設定の初期化
                </Text>
                <Alert color="red" icon={<AlertTriangle size={16} />}>
                  すべての設定をデフォルト値へ戻します。
                </Alert>
                <Button
                  color="red"
                  variant="light"
                  onClick={() => void maintenanceActions.handleResetAllSettings()}
                  loading={maintenanceActions.isResettingAllSettings}
                >
                  すべての設定をデフォルトに戻す
                </Button>
              </Stack>
            </Card>
          );
        case "dataManagement":
          return (
            <Card key={panelId} withBorder radius="lg" p="md">
              <Stack gap="sm">
                <Text fw={700} size="sm">
                  データ管理
                </Text>
                <Text size="xs" c="dimmed">
                  設定や履歴をzip（JSON複数ファイル）でバックアップ/復元します。
                </Text>

                <Checkbox
                  checked={includeHistoryInExport}
                  label="閲覧履歴を含める"
                  onChange={(event) => setIncludeHistoryInExport(event.currentTarget.checked)}
                />
                <Checkbox
                  checked={includeWriteHistoryInExport}
                  label="書き込み履歴を含める"
                  onChange={(event) => setIncludeWriteHistoryInExport(event.currentTarget.checked)}
                />

                <Group wrap="wrap" gap="sm">
                  <Button onClick={() => void handleExportArchive()} loading={isExportingArchive}>
                    zipをエクスポート
                  </Button>
                  <Button
                    variant="light"
                    onClick={handleImportButtonClick}
                    loading={isImportingArchive}
                  >
                    zipをインポート
                  </Button>
                </Group>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip,application/zip"
                  style={{ display: "none" }}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0] ?? null;
                    if (file) {
                      void handleImportArchiveFile(file);
                    }
                    // 同じzipを連続選択できるようvalueを毎回クリアする。
                    event.currentTarget.value = "";
                  }}
                />

                <Text fw={600} size="xs" mt="sm">
                  ログ（過去ログ）
                </Text>
                <Text size="xs" c="dimmed">
                  閲覧したスレの本文を恒久保存したログをすべて削除します。
                </Text>
                <Button
                  color="red"
                  variant="light"
                  onClick={() => void handleDeleteLogs()}
                  loading={isDeletingLogs}
                >
                  ログをすべて削除
                </Button>
              </Stack>
            </Card>
          );
      }
    });
  }, [
    bookmarkError,
    bookmarkLoading,
    folderName,
    handleDeleteLogs,
    handleExportArchive,
    handleImportArchiveFile,
    handleImportButtonClick,
    includeHistoryInExport,
    includeWriteHistoryInExport,
    isDeletingLogs,
    isExportingArchive,
    isImportingArchive,
    maintenanceActions,
    panelIds,
  ]);

  if (panels.length === 0) {
    return null;
  }

  // 変更理由: 追加カードを section 定義側の id から描画し、ページ本体の条件分岐を増やさない。
  return <Stack gap="md">{panels}</Stack>;
}
