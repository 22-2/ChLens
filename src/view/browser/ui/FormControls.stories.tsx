import { useState } from "react";

import { CheckboxField, SelectControl, SettingRow, SwitchControl } from "./FormControls";
import { Surface, SurfaceBody, SurfaceHeader, SurfaceTitle } from "./Surface";

export default { title: "ChLens/共通UI/FormControls" };

const densityOptions = [
  { const: "comfortable", title: "ゆったり" },
  { const: "compact", title: "コンパクト" },
];

export function Settings() {
  const [notifications, setNotifications] = useState(true);
  const [showImages, setShowImages] = useState(false);
  const [density, setDensity] = useState("comfortable");

  return (
    <div className="storybook-demo storybook-demo--narrow">
      <Surface>
        <SurfaceHeader>
          <SurfaceTitle>表示設定</SurfaceTitle>
        </SurfaceHeader>
        <SurfaceBody>
          <SettingRow label="通知を表示" htmlFor="storybook-notifications">
            <SwitchControl
              id="storybook-notifications"
              checked={notifications}
              onCheckedChange={setNotifications}
            />
          </SettingRow>
          <SettingRow label="画像を自動表示" htmlFor="storybook-images">
            <CheckboxField
              id="storybook-images"
              label="有効にする"
              description="画像リンクのサムネイルを表示します。"
              checked={showImages}
              onCheckedChange={setShowImages}
            />
          </SettingRow>
          <SettingRow label="レス一覧の密度" htmlFor="storybook-density">
            <SelectControl
              id="storybook-density"
              value={density}
              options={densityOptions}
              onValueChange={setDensity}
            />
          </SettingRow>
        </SurfaceBody>
      </Surface>
    </div>
  );
}
