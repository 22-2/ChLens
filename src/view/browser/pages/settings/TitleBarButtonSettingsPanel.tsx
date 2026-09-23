import React, { useState } from "react";
import { TitleBarButtonSettingsDialog } from "src/view/browser/components/TitleBarButtonSettingsDialog";
import { useTitleBarButtonSettings } from "src/view/browser/hooks/use-title-bar-navigation-setting";
import { Button } from "src/view/browser/ui/Button";
import {
  Surface,
  SurfaceActions,
  SurfaceBody,
  SurfaceDescription,
  SurfaceHeader,
  SurfaceTitle,
} from "src/view/browser/ui/Surface";

/** 設定画面からタイトルバー左端の表示ボタンを個別に変更する入口を提供する。 */
export const TitleBarButtonSettingsPanel: React.FC = () => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const {
    backEnabled,
    forwardEnabled,
    refreshEnabled,
    setBackEnabled,
    setForwardEnabled,
    setRefreshEnabled,
  } = useTitleBarButtonSettings();

  return (
    <>
      <Surface variant="flat">
        <SurfaceHeader>
          <SurfaceTitle>タイトルバー</SurfaceTitle>
          <SurfaceDescription>
            タブバーの配置にかかわらず、タイトルバー左側へ表示する戻る・進む・更新ボタンを選択します。
          </SurfaceDescription>
        </SurfaceHeader>
        <SurfaceBody>
          <SurfaceActions>
            <Button onClick={() => setIsDialogOpen(true)}>タイトルバーのボタン設定</Button>
          </SurfaceActions>
        </SurfaceBody>
      </Surface>
      <TitleBarButtonSettingsDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        backEnabled={backEnabled}
        onBackEnabledChange={setBackEnabled}
        forwardEnabled={forwardEnabled}
        onForwardEnabledChange={setForwardEnabled}
        refreshEnabled={refreshEnabled}
        onRefreshEnabledChange={setRefreshEnabled}
      />
    </>
  );
};
