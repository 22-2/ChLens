import { createSpotlight } from "@mantine/spotlight";

// 変更理由: メニュー・ショートカット・コンポーネント内の閉じる処理で同一の
// Spotlight状態を共有し、初期選択とキーボード移動の状態がずれないようにする。
export const [commandPaletteStore, commandPalette] = createSpotlight();
