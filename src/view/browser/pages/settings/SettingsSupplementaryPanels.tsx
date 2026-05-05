import { Alert, Button, Card, Skeleton, Stack, Text } from "@mantine/core";
import { AlertTriangle } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { container } from "src/service-container/index";
import type { SettingsMaintenanceActions } from "src/view/browser/pages/settings/use-settings-maintenance";
import type { SettingsSupplementaryPanelId } from "src/view/browser/pages/settings/settings-types";
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
        loadError instanceof Error
          ? loadError.message
          : "ブックマーク保存先の取得に失敗しました",
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

                <Button
                  onClick={() =>
                    container.message.send("bookmark_root_selector_open")
                  }
                >
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
                  onClick={() =>
                    void maintenanceActions.handleResetAllSettings()
                  }
                  loading={maintenanceActions.isResettingAllSettings}
                >
                  すべての設定をデフォルトに戻す
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
    maintenanceActions,
    panelIds,
  ]);

  if (panels.length === 0) {
    return null;
  }

  // 変更理由: 追加カードを section 定義側の id から描画し、ページ本体の条件分岐を増やさない。
  return <Stack gap="md">{panels}</Stack>;
}
