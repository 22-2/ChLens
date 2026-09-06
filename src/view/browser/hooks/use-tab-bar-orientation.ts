import { useEffect, useState } from "react";
import { container } from "src/service-container/index";

export type TabBarOrientation = "horizontal" | "vertical";

export const TAB_BAR_ORIENTATION_CONFIG_KEY = "tab_bar_orientation";

function parseOrientation(raw: string | null | undefined): TabBarOrientation {
  // 変更理由: 垂直タブバー導入前の既存環境や未知値では水平として扱い、
  // 設定を持たない利用者の見た目を変えない。
  if (raw === "vertical") {
    return "vertical";
  }
  return "horizontal";
}

function readOrientation(): TabBarOrientation {
  try {
    return parseOrientation(container.config.get(TAB_BAR_ORIENTATION_CONFIG_KEY));
  } catch (error) {
    // LiveのようにChlensのservice containerを使わないhostでも、水平タブバーで表示できる。
    console.error("[TabBarOrientation] config service is unavailable; using horizontal", error);
    return "horizontal";
  }
}

/** tab_bar_orientation 設定値を監視し、タブバーの配置方向を返すフック */
export function useTabBarOrientation(): TabBarOrientation {
  const [orientation, setOrientation] = useState(readOrientation);

  useEffect(() => {
    const sync = () => setOrientation(readOrientation());
    const handleConfigUpdated = ({ key }: { key?: string }) => {
      if (key === TAB_BAR_ORIENTATION_CONFIG_KEY) {
        sync();
      }
    };

    try {
      // 変更理由: Config は localStorage の読み込み後に確定するため、初回レンダー時の
      // 既定値だけで方向を決めると、再起動後に保存済みの vertical 設定を取りこぼす。
      container.config.ready(sync);
      container.message.on("config_updated", handleConfigUpdated);
    } catch (error) {
      // 設定serviceが後から登録されるhostでは購読を省略し、初期値のまま表示を継続する。
      console.error("[TabBarOrientation] config service subscription is unavailable", error);
      return;
    }

    return () => {
      container.message.off("config_updated", handleConfigUpdated);
    };
  }, []);

  return orientation;
}
