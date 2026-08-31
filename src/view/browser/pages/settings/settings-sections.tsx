import {
  Archive,
  Image as ImageIcon,
  MessageCircle,
  MoreHorizontal,
  RefreshCw,
  Settings,
  ShieldAlert,
} from "lucide-react";
import { isTauriRuntime } from "src/app/platform/runtime";
import { container } from "src/service-container/index";
import {
  buildFieldSchema,
  buildUiSchema,
} from "src/view/browser/pages/settings/settings-form-registry";
import type {
  SettingsFieldDefinition,
  SettingsFormState,
  SettingsFormValue,
  SettingsOption,
  SettingsSectionDefinition,
  SettingsSectionFormData,
  SettingsSectionId,
  SettingsSectionItem,
  SettingsSupplementaryPanelId,
} from "src/view/browser/pages/settings/settings-types";
import { isSettingsFieldItem } from "src/view/browser/pages/settings/settings-types";

const THEME_ID_OPTIONS = [
  { const: "system", title: "システム（OSに合わせる）" },
  { const: "default", title: "ライト" },
  { const: "dark", title: "ダーク" },
] as const satisfies readonly SettingsOption[];

const NEW_TAB_PAGE_MODE_OPTIONS = [
  { const: "home", title: "ホーム（整備中）" },
  { const: "related_board", title: "関連する板" },
  { const: "custom_board", title: "指定の板（入力）" },
] as const satisfies readonly SettingsOption[];

const HOW_TO_JUDGMENT_ID_OPTIONS = [
  { const: "first_res", title: "1レス目に存在する場合" },
  { const: "exists_once", title: "1つでも存在する場合" },
] as const satisfies readonly SettingsOption[];

const AUTO_NEXT_THREAD_MODE_OPTIONS = [
  { const: "cautious", title: "慎重（誤移動を優先して防ぐ）" },
  { const: "balanced", title: "標準（精度と追従性のバランス）" },
  { const: "aggressive", title: "積極（スレタイ変化を広く許容）" },
] as const satisfies readonly SettingsOption[];

export const SETTINGS_PAGE_STATE_KEY = "chlens.settings-page.state.v1";
export const AUTO_SAVE_DELAY_MS = 350;
export const NG_PRIMARY_FIELD_KEYS = new Set(["ngwords"]);

function defineSection(
  id: SettingsSectionId,
  title: string,
  description: string,
  icon: React.ReactNode,
  fields: readonly SettingsSectionItem[],
  options?: {
    supplementaryPanelIds?: readonly SettingsSupplementaryPanelId[];
  },
): SettingsSectionDefinition {
  const fieldItems = fields.filter(isSettingsFieldItem);

  // 変更理由: セクション定義を data 中心に寄せると、
  // 設定項目の追加・移動時に巨大 JSX を触らずに済む。
  return {
    id,
    title,
    description,
    icon,
    fields,
    schema: {
      type: "object",
      properties: Object.fromEntries(
        fieldItems.map((field) => [field.key, buildFieldSchema(field)]),
      ),
      additionalProperties: false,
    },
    uiSchema: buildUiSchema(fieldItems),
    supplementaryPanelIds: options?.supplementaryPanelIds,
  };
}

const ALL_SETTINGS_SECTIONS = [
  defineSection(
    "general",
    "一般",
    "タブ動作や表示設定など、ブラウザ全体の基本設定です。",
    <Settings size={20} />,
    [
      {
        kind: "divider",
        id: "new-tab",
        title: "タブ",
      },
      {
        kind: "string",
        key: "new_tab_page_mode",
        title: "新しいタブで開くページ",
        options: NEW_TAB_PAGE_MODE_OPTIONS,
        widget: "radio",
      },
      {
        kind: "boolean",
        key: "focus_new_tab_on_open",
        title: "外部ページから開いたときに新しいタブをフォーカスする",
        description:
          "外部ページの「chlens で開く」からスレを開いたとき、新しいタブをアクティブにします。",
      },
      {
        kind: "string",
        key: "new_tab_page_board_url",
        title: "指定の板 URL",
        description:
          "『指定の板（入力）』を選んだ時に開く板URLです（例: https://example.com/test/read.cgi/software/）。",
      },
      {
        kind: "divider",
        id: "appearance",
        title: "外観",
      },
      {
        kind: "string",
        key: "theme_id",
        title: "テーマ",
        options: THEME_ID_OPTIONS,
        widget: "radio",
      },
      {
        kind: "boolean",
        key: "table_tooltip",
        title: "一覧表でツールチップを表示する",
        description: "行にマウスを重ねたとき、省略されているタイトルの全文を表示します。",
      },
      {
        kind: "divider",
        id: "write",
        title: "書き込み",
      },
      {
        kind: "boolean",
        key: "write_submit_ctrl_enter",
        title: "Ctrl+Enterで書き込む",
      },
      // {
      //   kind: "divider",
      //   id: "network",
      //   title: "通信",
      // },
      // {
      //   kind: "string",
      //   key: "format_2chnet",
      //   title: "2chnetの取得形式",
      //   options: FORMAT_2CH_OPTIONS,
      //   widget: "radio",
      // },
    ],
  ),
  defineSection(
    "reload",
    "更新関連",
    "自動更新と次スレ追従、更新後のスクロール挙動を調整します。",
    <RefreshCw size={20} />,
    [
      {
        kind: "divider",
        id: "operation",
        title: "操作",
      },
      {
        kind: "boolean",
        key: "dblclick_reload",
        title: "空白をダブルクリックで更新する",
      },
      {
        kind: "divider",
        id: "auto-scroll",
        title: "自動スクロール",
      },
      {
        kind: "boolean",
        key: "pause_auto_scroll_on_popup",
        title: "ポップアップ表示中は自動スクロールを一時停止する",
        description: "OFFにすると、レスポップアップなどを表示している間も新着レスへ追従します。",
      },
      {
        kind: "divider",
        id: "auto-next-thread",
        title: "自動次スレ移動",
      },
      {
        kind: "boolean",
        key: "auto_next_thread",
        title: "1000到達やdat落ち後に次スレへ自動移動する",
        description:
          "3秒ごとに最大180秒探索し、標準・積極では移動後も本流候補を短時間だけ監視します。",
      },
      {
        kind: "string",
        key: "auto_next_thread_mode",
        title: "次スレ判定",
        description:
          "慎重ほど有力候補の連続確認と候補間の大きな差を求めます。積極でも別板や古いスレには移動しません。",
        options: AUTO_NEXT_THREAD_MODE_OPTIONS,
        widget: "radio",
      },
    ],
  ),
  defineSection(
    "overlay",
    "コメントOverlay",
    "Tauri版のコメント流し表示を調整します。設定は次回の実況開始時から反映します。",
    <MessageCircle size={20} />,
    [
      {
        kind: "divider",
        id: "display",
        title: "表示",
      },
      {
        kind: "number",
        key: "comment_overlay_speed",
        title: "コメント通過時間",
        description: "コメントがOverlayへ入ってから出るまでの基準時間です（秒）。",
        minimum: 2,
        maximum: 15,
        step: 0.5,
      },
      {
        kind: "number",
        key: "comment_overlay_font_size",
        title: "文字サイズ",
        description: "Overlayへ表示するコメントの文字サイズです（px）。",
        minimum: 10,
        maximum: 48,
        step: 1,
      },
      {
        kind: "number",
        key: "comment_overlay_opacity",
        title: "不透明度",
        description: "コメントの不透明度です。0.1から1.0まで指定できます。",
        minimum: 0.1,
        maximum: 1,
        step: 0.05,
      },
      {
        kind: "number",
        key: "comment_overlay_max_queue",
        title: "待機queue上限",
        description: "strict/queue動作で待機させるコメント数です。0で待機しません。",
        minimum: 0,
        maximum: 3_000,
        step: 1,
      },
    ],
  ),
  defineSection(
    "thumbnail",
    "サムネイル",
    "画像・動画の読み込みとプレビューサイズを調整します。",
    <ImageIcon size={20} />,
    [
      {
        kind: "divider",
        id: "load",
        title: "読み込み設定",
      },
      // {
      //   kind: "boolean",
      //   key: "manual_image_load",
      //   title: "画像を手動で読み込む",
      // },
      {
        kind: "divider",
        id: "blur",
        title: "ぼかし設定",
      },
      {
        kind: "boolean",
        key: "image_blur",
        title: "画像にぼかしを適用する",
      },
      {
        kind: "number",
        key: "image_blur_length",
        title: "ぼかし量",
        minimum: 1,
        maximum: 9,
        step: 1,
      },
      {
        kind: "string",
        key: "image_blur_word",
        title: "ぼかし判定ワード",
        description: "正規表現で指定します。",
      },
    ],
  ),
  defineSection(
    "ng",
    "NG",
    "NGワードと非表示関連の設定をまとめています。",
    <ShieldAlert size={20} />,
    [
      {
        kind: "string",
        key: "ngwords",
        title: "NGワード一覧",
        description:
          "「動作 対象 contains:」または「動作 対象 regex:」の次の行から、条件をインデントして記述します。数値条件は「動作 対象 >= 数値:」の形式です。同じブロックの条件はORです。説明文は // で始められます。詳しくは下の例を参照してください。",
        widget: "ng_editor",
      },
      {
        kind: "divider",
        id: "chain",
        title: "連鎖NG",
      },
      {
        kind: "boolean",
        key: "chain_ng",
        title: "NGレスへの返信を連鎖NGにする",
      },
      {
        kind: "divider",
        id: "judgement",
        title: "判定基準",
      },
      {
        kind: "boolean",
        key: "use_siki_guard",
        title: "しきい値ガードを有効にする",
      },
      {
        kind: "boolean",
        key: "nothing_id_ng",
        title: "IDありスレのIDなしレスをNGにする",
      },
      {
        kind: "boolean",
        key: "nothing_slip_ng",
        title: "SLIPありスレのSLIPなしレスをNGにする",
      },
      {
        kind: "string",
        key: "how_to_judgment_id",
        title: "ID / SLIP 判定方法",
        options: HOW_TO_JUDGMENT_ID_OPTIONS,
        widget: "radio",
      },
    ],
  ),
  defineSection(
    "data",
    "データ",
    "設定・履歴のエクスポート / インポートを行います。",
    <Archive size={20} />,
    [],
    {
      supplementaryPanelIds: ["dataManagement"],
    },
  ),
  defineSection(
    "other",
    "その他",
    "書き込み時の既定値や外部データ設定です。",
    <MoreHorizontal size={20} />,
    [
      {
        kind: "divider",
        id: "external-data",
        title: "bbsmenu",
      },
      {
        kind: "string",
        key: "bbsmenu",
        title: "URL一覧",
        widget: "textarea",
        rows: 6,
      },
      {
        kind: "divider",
        id: "debug",
        title: "デバッグ",
      },
      {
        kind: "boolean",
        key: "debug_log",
        title: "ログを有効にする",
        description: "ONで詳細ログを出力します。",
      },
    ],
    {
      supplementaryPanelIds: ["externalIntegration", "dangerZone"],
    },
  ),
] as const satisfies readonly SettingsSectionDefinition[];

/** Browser版へTauri専用の設定項目を露出させないため、環境判定を一覧生成へ閉じ込める。 */
export function getSettingsSections(isTauri: boolean): readonly SettingsSectionDefinition[] {
  return ALL_SETTINGS_SECTIONS.filter((section) => section.id !== "overlay" || isTauri);
}

export const SETTINGS_SECTIONS = getSettingsSections(isTauriRuntime());

export const SETTINGS_SECTION_MAP = new Map<SettingsSectionId, SettingsSectionDefinition>(
  SETTINGS_SECTIONS.map((section) => [section.id, section]),
);

export function isSettingsSectionId(value: string): value is SettingsSectionId {
  return SETTINGS_SECTION_MAP.has(value as SettingsSectionId);
}

function readFieldValue(field: SettingsFieldDefinition): SettingsFormValue {
  const rawValue = container.config.get(field.key);
  switch (field.kind) {
    case "boolean":
      return rawValue === "on";
    case "number": {
      const parsed = Number(rawValue ?? 0);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    case "string":
      // 変更理由: 未設定時でもラジオ選択が空表示にならないよう、
      // 新規タブ初期ページは実挙動と同じ既定値をUIにも反映する。
      if (field.key === "new_tab_page_mode") {
        return typeof rawValue === "string" && rawValue !== "" ? rawValue : "related_board";
      }
      return typeof rawValue === "string" ? rawValue : "";
  }
}

function writeFieldValue(field: SettingsFieldDefinition, value: SettingsFormValue): string {
  switch (field.kind) {
    case "boolean":
      return value ? "on" : "off";
    case "number":
      return String(typeof value === "number" && Number.isFinite(value) ? value : 0);
    case "string":
      return typeof value === "string" ? value : "";
  }
}

function readSectionFormData(section: SettingsSectionDefinition): SettingsSectionFormData {
  return Object.fromEntries(
    section.fields.filter(isSettingsFieldItem).map((field) => [field.key, readFieldValue(field)]),
  );
}

export function readAllSettings(): SettingsFormState {
  return Object.fromEntries(
    SETTINGS_SECTIONS.map((section) => [section.id, readSectionFormData(section)]),
  ) as SettingsFormState;
}

export async function saveSectionFormData(
  section: SettingsSectionDefinition,
  formData: SettingsSectionFormData,
): Promise<void> {
  await Promise.all(
    section.fields
      .filter(isSettingsFieldItem)
      .map((field) =>
        Promise.resolve(
          container.config.set(field.key, writeFieldValue(field, formData[field.key])),
        ),
      ),
  );
}

export function readBBSMenuUrlsForCheck(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("//"));
}
