import Form, { type IChangeEvent } from "@rjsf/core";
import type { RJSFSchema, UiSchema, ValidatorType } from "@rjsf/utils";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { container } from "src/service-container/index";
import { NGEditor } from "src/view/browser/components/NGEditor";

type SettingsSectionId =
  | "general"
  | "reload"
  | "thumbnail"
  | "popup"
  | "ng"
  | "other"
  | "data";

type SettingsFormValue = boolean | number | string | undefined;
type SettingsSectionFormData = Record<string, SettingsFormValue>;
type SettingsFormState = Record<SettingsSectionId, SettingsSectionFormData>;

interface SettingsOption {
  const: string;
  title: string;
}

interface SettingsFieldBase {
  key: string;
  title: string;
  description?: string;
  widget?: "radio" | "textarea";
  rows?: number;
}

interface SettingsBooleanField extends SettingsFieldBase {
  kind: "boolean";
}

interface SettingsNumberField extends SettingsFieldBase {
  kind: "number";
  minimum?: number;
  maximum?: number;
  step?: number;
}

interface SettingsStringField extends SettingsFieldBase {
  kind: "string";
  options?: readonly SettingsOption[];
}

type SettingsFieldDefinition =
  | SettingsBooleanField
  | SettingsNumberField
  | SettingsStringField;

interface SettingsSectionDefinition {
  id: SettingsSectionId;
  title: string;
  description: string;
  fields: readonly SettingsFieldDefinition[];
  schema: RJSFSchema;
  uiSchema: UiSchema<SettingsSectionFormData>;
}

const AA_FONT_OPTIONS = [
  { const: "aa", title: "AAフォント" },
  { const: "normal", title: "通常フォント" },
] as const satisfies readonly SettingsOption[];

const FORMAT_2CH_OPTIONS = [
  { const: "html", title: "HTML" },
  { const: "dat", title: "dat" },
] as const satisfies readonly SettingsOption[];

const AUTO_LOAD_MOVE_OPTIONS = [
  { const: "off", title: "しない" },
  { const: "new", title: "未読がない場合新着レス" },
  { const: "surely_new", title: "新着レス" },
  { const: "latest50", title: "既読でない場合最新50レス" },
  { const: "newest", title: "最終レス" },
  { const: "live_style", title: "ライブチャット風" },
] as const satisfies readonly SettingsOption[];

const POPUP_TRIGGER_OPTIONS = [
  { const: "click", title: "クリック" },
  { const: "mouseenter", title: "マウスを重ねる" },
] as const satisfies readonly SettingsOption[];

const EXPAND_SHORT_URL_OPTIONS = [
  { const: "none", title: "何もしない" },
  { const: "inline", title: "本文内に表示する" },
  { const: "popup", title: "ポップアップで表示する" },
] as const satisfies readonly SettingsOption[];

const ZOOM_MODE_OPTIONS = [
  { const: "off", title: "無効" },
  { const: "hover", title: "ホバー" },
  { const: "click", title: "クリック" },
] as const satisfies readonly SettingsOption[];

const ZOOM_RATIO_OPTIONS = [
  { const: "original", title: "オリジナル" },
  { const: "150", title: "150%" },
  { const: "200", title: "200%" },
  { const: "250", title: "250%" },
  { const: "300", title: "300%" },
  { const: "400", title: "400%" },
  { const: "500", title: "500%" },
] as const satisfies readonly SettingsOption[];

const THEME_ID_OPTIONS = [
  { const: "system", title: "システム（OSに合わせる）" },
  { const: "default", title: "ライト" },
  { const: "dark", title: "ダーク" },
] as const satisfies readonly SettingsOption[];

const HOW_TO_JUDGMENT_ID_OPTIONS = [
  { const: "first_res", title: "1レス目に存在する場合" },
  { const: "exists_once", title: "1つでも存在する場合" },
] as const satisfies readonly SettingsOption[];

// 拡張機能ページのCSPではAJVの実行時コンパイル(new Function)が失敗するため、
// 設定画面は保存を優先した最小バリデータで動かし、コンソールエラーを防ぐ。
const settingsValidator: ValidatorType<SettingsSectionFormData, RJSFSchema> = {
  validateFormData: () => ({ errors: [], errorSchema: {} }),
  isValid: () => true,
  rawValidation: () => ({ errors: [] }),
};
const AUTO_SAVE_DELAY_MS = 350;
const SETTINGS_PAGE_STATE_KEY = "readcrx.settings-page.state.v1";

interface SettingsPageUiState {
  activeSectionId?: SettingsSectionId;
  mainScrollTop?: number;
  ngAdvancedOpen?: boolean;
}

function buildFieldSchema(field: SettingsFieldDefinition): RJSFSchema {
  const schema: RJSFSchema = {
    title: field.title,
  };

  if (field.description) {
    schema.description = field.description;
  }

  switch (field.kind) {
    case "boolean":
      schema.type = "boolean";
      break;
    case "number":
      schema.type = "number";
      if (field.minimum !== undefined) {
        schema.minimum = field.minimum;
      }
      if (field.maximum !== undefined) {
        schema.maximum = field.maximum;
      }
      break;
    case "string":
      schema.type = "string";
      if (field.options) {
        schema.oneOf = field.options.map((option) => ({
          const: option.const,
          title: option.title,
        }));
      }
      break;
  }

  return schema;
}

function buildUiSchema(
  fields: readonly SettingsFieldDefinition[],
): UiSchema<SettingsSectionFormData> {
  const uiSchema: UiSchema<SettingsSectionFormData> = {
    "ui:submitButtonOptions": {
      norender: true,
    },
  };

  for (const field of fields) {
    const fieldUi: Record<string, unknown> = {};
    if (field.widget) {
      fieldUi["ui:widget"] = field.widget;
    }
    if (field.kind === "number" && field.step !== undefined) {
      fieldUi["ui:options"] = {
        step: field.step,
      };
    }
    if (field.widget === "textarea") {
      fieldUi["ui:options"] = {
        rows: field.rows ?? 6,
      };
    }
    uiSchema[field.key] = fieldUi;
  }

  return uiSchema;
}

function defineSection(
  id: SettingsSectionId,
  title: string,
  description: string,
  fields: readonly SettingsFieldDefinition[],
): SettingsSectionDefinition {
  return {
    id,
    title,
    description,
    fields,
    schema: {
      type: "object",
      properties: Object.fromEntries(
        fields.map((field) => [field.key, buildFieldSchema(field)]),
      ),
      additionalProperties: false,
    },
    uiSchema: buildUiSchema(fields),
  };
}

const SETTINGS_SECTIONS = [
  defineSection(
    "general",
    "一般",
    "タブ動作やAA表示など、ブラウザ全体の基本設定です。",
    [
      {
        kind: "string",
        key: "theme_id",
        title: "テーマ",
        options: THEME_ID_OPTIONS,
        widget: "radio",
      },
      {
        // 書き込み欄のショートカットは日常的に切り替える需要があるため、
        // 「その他」ではなく一般設定に置いて到達しやすくする。
        kind: "boolean",
        key: "write_submit_ctrl_enter",
        title: "Ctrl+Enterで書き込む",
      },
      // { kind: "boolean", key: "always_new_tab", title: "スレッドを常に新しいタブで開く" },
      // {
      //   kind: "boolean",
      //   key: "button_change_netsc_newtab",
      //   title: "5ch / 2ch.sc 切り替えを新しいタブで開く",
      // },
      // {
      //   kind: "boolean",
      //   key: "button_change_scheme_newtab",
      //   title: "http / https 切り替えを新しいタブで開く",
      // },

      // TODO: どういう意味か分かりづらいので、調査してから説明を加える
      // { kind: "boolean", key: "open_all_unread_lazy", title: "未読一括オープンを遅延実行する" },
      // { kind: "boolean", key: "mousewheel_change_tab", title: "マウスホイールでタブを切り替える" },

      // TODO: どういう意味か分かりづらいので、調査してから説明を加える
      // {
      //   kind: "boolean",
      //   key: "enable_link_with_res_number",
      //   title: "レス番号付きリンクを開く機能を有効にする",
      // },
      // {
      //   kind: "string",
      //   key: "aa_font",
      //   title: "AA表示フォント",
      //   options: AA_FONT_OPTIONS,
      //   widget: "radio",
      // },
      // {
      //   kind: "number",
      //   key: "aa_min_ratio",
      //   title: "AA最小縮小率",
      //   description: "AAを自動縮小する下限値です。",
      //   minimum: 1,
      //   maximum: 100,
      //   step: 1,
      // },
      {
        kind: "string",
        key: "format_2chnet",
        title: "2chnetの取得形式",
        options: FORMAT_2CH_OPTIONS,
        widget: "radio",
      },
    ],
  ),
  defineSection(
    "reload",
    "更新関連",
    "自動更新と更新後のスクロール挙動を調整します。",
    [
      // TODO: スクロールで更新するようにする
      {
        kind: "boolean",
        key: "dblclick_reload",
        title: "空白をダブルクリックで更新する",
      },
      // {
      //   kind: "number",
      //   key: "auto_load_second",
      //   title: "スレッド自動更新間隔 (秒)",
      //   minimum: 0,
      //   step: 1,
      // },
      // {
      //   kind: "number",
      //   key: "auto_load_second_board",
      //   title: "板自動更新間隔 (秒)",
      //   minimum: 0,
      //   step: 1,
      // },
      // {
      //   kind: "number",
      //   key: "auto_load_second_bookmark",
      //   title: "ブックマーク自動更新間隔 (秒)",
      //   minimum: 0,
      //   step: 1,
      // },
      // { kind: "boolean", key: "auto_load_all", title: "自動更新時に全文を再取得する" },
      // { kind: "boolean", key: "auto_bookmark_notify", title: "ブックマーク更新を通知する" },
      // { kind: "boolean", key: "show_next_unread", title: "次の未読ブックマークを表示する" },

      // TODO: 自動でスレを移動する機能（EdgeLiveViewerの機能を参考にする）

      // {
      //   kind: "string",
      //   key: "auto_load_move",
      //   title: "自動更新後の移動",
      //   options: AUTO_LOAD_MOVE_OPTIONS,
      //   widget: "radio",
      // },
      // {
      //   kind: "number",
      //   key: "live_style_playback_rate",
      //   title: "ライブチャット風の再生速度",
      //   description: "auto_load_move が live_style の時に使われます。",
      //   minimum: 1,
      //   maximum: 10,
      //   step: 0.5,
      // },
    ],
  ),
  defineSection(
    "thumbnail",
    "サムネイル",
    "画像・動画の読み込みとプレビューサイズを調整します。",
    [
      // TODO: Not implemented
      {
        kind: "boolean",
        key: "manual_image_load",
        title: "画像を手動で読み込む",
      },
      // TODO: Not implemented
      { kind: "boolean", key: "image_blur", title: "画像にぼかしを適用する" },
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
      // { kind: "number", key: "image_width", title: "画像サムネイル幅", minimum: 150, maximum: 800, step: 10 },
      // { kind: "number", key: "image_height", title: "画像サムネイル高さ", minimum: 100, maximum: 600, step: 10 },
      // { kind: "boolean", key: "audio_supported", title: "音声サムネイルを有効にする" },

      // TODO: 項目を削除し、デフォルトで有効にする
      // { kind: "boolean", key: "audio_supported_ogg", title: "OGG音声を有効にする" },
      // { kind: "number", key: "audio_width", title: "音声サムネイル幅", minimum: 240, maximum: 480, step: 10 },

      // TODO: Not implemented -> 画像ビューアと同じUIで拡大表示するようにする
      // { kind: "boolean", key: "video_supported", title: "動画サムネイルを有効にする" },
      // TODO: 項目を削除し、デフォルトで有効にする
      // { kind: "boolean", key: "video_supported_ogg", title: "OGG動画を有効にする" },
      // TODO: 項目を削除し、デフォルトで有効にする
      // { kind: "boolean", key: "video_controls", title: "動画コントロールを表示する" },
      // { kind: "number", key: "video_width", title: "動画サムネイル幅", minimum: 160, maximum: 800, step: 10 },
      // { kind: "number", key: "video_height", title: "動画サムネイル高さ", minimum: 160, maximum: 600, step: 10 },
      // {
      //   kind: "string",
      //   key: "zoom_image_mode",
      //   title: "画像ズーム",
      //   options: ZOOM_MODE_OPTIONS,
      // },
      // {
      //   kind: "string",
      //   key: "zoom_ratio_image",
      //   title: "画像ズーム倍率",
      //   options: ZOOM_RATIO_OPTIONS,
      // },
      // {
      //   kind: "string",
      //   key: "zoom_video_mode",
      //   title: "動画ズーム",
      //   options: ZOOM_MODE_OPTIONS,
      // },
      // {
      //   kind: "string",
      //   key: "zoom_ratio_video",
      //   title: "動画ズーム倍率",
      //   options: ZOOM_RATIO_OPTIONS,
      // },
      // { kind: "boolean", key: "image_height_fix", title: "コンテナ高さを固定して位置ずれを防ぐ" },
      // {
      //   kind: "number",
      //   key: "delay_scroll_time",
      //   title: "位置合わせ待機時間 (ms)",
      //   minimum: 0,
      //   maximum: 3000,
      //   step: 100,
      // },
    ],
  ),
  // defineSection(
  //   "popup",
  //   "ポップアップ",
  //   "ID/参照ポップアップと短縮URL展開の挙動を制御します。",
  //   [
  //     {
  //       kind: "string",
  //       key: "popup_trigger",
  //       title: "ポップアップ表示方法",
  //       options: POPUP_TRIGGER_OPTIONS,
  //       widget: "radio",
  //     },
  //     {
  //       kind: "number",
  //       key: "popup_delay_time",
  //       title: "ポップアップ遅延時間 (ms)",
  //       minimum: 0,
  //       maximum: 3000,
  //       step: 50,
  //     },
  //     {
  //       kind: "string",
  //       key: "expand_short_url",
  //       title: "短縮URLの展開方法",
  //       options: EXPAND_SHORT_URL_OPTIONS,
  //       widget: "radio",
  //     },
  //     {
  //       kind: "number",
  //       key: "expand_short_url_timeout",
  //       title: "短縮URLタイムアウト (ms)",
  //       minimum: 0,
  //       step: 100,
  //     },
  //   ],
  // ),
  defineSection("ng", "NG", "NGワードと非表示関連の設定をまとめています。", [
    {
      kind: "string",
      key: "ngwords",
      title: "NGワード一覧",
      description: "DSL形式で編集できます。JSON5を貼り付けても読み込みます。",
      widget: "ng_editor" as any,
    },
    { kind: "boolean", key: "chain_ng", title: "NGレスへの返信を連鎖NGにする" },

    // TODO: どういう意味か分かりづらいので、調査してから説明を加える
    // TODO: Not implemented
    // { kind: "boolean", key: "chain_ng_id", title: "NG ID を連鎖NGにする" },
    // { kind: "boolean", key: "chain_ng_slip", title: "NG SLIP を連鎖NGにする" },

    // TODO: どういう意味か分かりづらいので、調査してから説明を加える
    // TODO: Not implemented
    // {
    //   kind: "boolean",
    //   key: "forward_link_ng",
    //   title: "前方リンクをNG判定に含める",
    // },

    // TODO: Not implemented
    // {
    //   kind: "boolean",
    //   key: "display_ng",
    //   title: "NGレスを展開可能なまま表示する",
    // },
    // {
    //   kind: "boolean",
    //   key: "bookmark_show_dat",
    //   title: "dat落ちしたブックマークを表示する",
    // },

    // TODO: Not implemented
    // {
    //   kind: "boolean",
    //   key: "reject_ng_rep",
    //   title: "NGレスへの返信も非表示にする",
    // },

    // TODO: どういう意味か分かりづらいので、調査してから説明を加える
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
    // TODO: Not implemented
    // {
    //   kind: "number",
    //   key: "repeat_message_ng_count",
    //   title: "連投レスをNGにする回数（0で無効）",
    //   minimum: 0,
    //   maximum: 99,
    //   step: 1,
    // },
  ]),
  defineSection("other", "その他", "書き込み時の既定値や外部データ設定です。", [
    // { kind: "string", key: "default_name", title: "既定の名前" },
    // { kind: "string", key: "default_mail", title: "既定のメール欄" },
    {
      kind: "number",
      key: "bbsmenu_update_interval",
      title: "BBSMENU更新間隔 (日)",
      minimum: 1,
      step: 1,
    },
    {
      kind: "string",
      key: "bbsmenu",
      title: "BBSMENU URL一覧",
      widget: "textarea",
      rows: 6,
    },

    // TODO: どういう意味か分かりづらいので、調査してから説明を加える
    // {
    //   kind: "string",
    //   key: "bbsmenu_option",
    //   title: "BBSMENUオプション",
    //   widget: "textarea",
    //   rows: 4,
    // },
    // {
    //   kind: "string",
    //   key: "user_css",
    //   title: "ユーザーCSS",
    //   widget: "textarea",
    //   rows: 8,
    // },
    // { kind: "boolean", key: "default_scrollbar", title: "既定のスクロールバーを使う" },
    // {
    //   kind: "string",
    //   key: "replace_str_txt",
    //   title: "文字列置換ルール",
    //   widget: "textarea",
    //   rows: 6,
    // },
    // { kind: "string", key: "useragent", title: "ユーザーエージェント" },
  ]),
  // TODO: インポートやエクスポートなど、既存の設定を移植する
  // defineSection(
  //   "data",
  //   "データ",
  //   "履歴や書き込み履歴の保存有無を制御します。",
  //   [
  //     { kind: "boolean", key: "no_history", title: "履歴を保存しない" },
  //     { kind: "boolean", key: "no_writehistory", title: "書き込み履歴を保存しない" },
  //   ],
  // ),
] as const satisfies readonly SettingsSectionDefinition[];

const SETTINGS_SECTION_MAP = new Map<
  SettingsSectionId,
  SettingsSectionDefinition
>(SETTINGS_SECTIONS.map((section) => [section.id, section]));

const NG_PRIMARY_FIELD_KEYS = new Set(["ngwords"]);

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
      return typeof rawValue === "string" ? rawValue : "";
  }
}

function writeFieldValue(
  field: SettingsFieldDefinition,
  value: SettingsFormValue,
): string {
  switch (field.kind) {
    case "boolean":
      return value ? "on" : "off";
    case "number":
      return String(
        typeof value === "number" && Number.isFinite(value) ? value : 0,
      );
    case "string":
      return typeof value === "string" ? value : "";
  }
}

function readSectionFormData(
  section: SettingsSectionDefinition,
): SettingsSectionFormData {
  return Object.fromEntries(
    section.fields.map((field) => [field.key, readFieldValue(field)]),
  );
}

function readAllSettings(): SettingsFormState {
  const state = {} as SettingsFormState;
  for (const section of SETTINGS_SECTIONS) {
    state[section.id] = readSectionFormData(section);
  }
  return state;
}

async function saveSectionFormData(
  section: SettingsSectionDefinition,
  formData: SettingsSectionFormData,
): Promise<void> {
  await Promise.all(
    section.fields.map((field) =>
      Promise.resolve(
        container.config.set(
          field.key,
          writeFieldValue(field, formData[field.key]),
        ),
      ),
    ),
  );
}

const widgets = {
  ng_editor: (props: any) => {
    return <NGEditor value={props.value} onChange={props.onChange} />;
  },
};

export const SettingsPage: React.FC = () => {
  const [activeSectionId, setActiveSectionId] =
    useState<SettingsSectionId>("general");
  const [formState, setFormState] = useState<SettingsFormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingSectionId, setSavingSectionId] =
    useState<SettingsSectionId | null>(null);
  const [autoSaveError, setAutoSaveError] = useState<string | null>(null);
  const [isNgAdvancedOpen, setIsNgAdvancedOpen] = useState(false);
  const autoSaveTimerRef = useRef<number | null>(null);
  const mainPanelRef = useRef<HTMLDivElement | null>(null);
  const restoredScrollTopRef = useRef<number>(0);
  const shouldRestoreScrollRef = useRef(false);

  const activeSection = useMemo(
    () => SETTINGS_SECTION_MAP.get(activeSectionId) ?? SETTINGS_SECTIONS[0],
    [activeSectionId],
  );

  const ngPrimaryFields = useMemo(() => {
    if (activeSection.id !== "ng") {
      return [] as SettingsFieldDefinition[];
    }
    return activeSection.fields.filter((field) =>
      NG_PRIMARY_FIELD_KEYS.has(field.key),
    );
  }, [activeSection]);

  const ngAdvancedFields = useMemo(() => {
    if (activeSection.id !== "ng") {
      return [] as SettingsFieldDefinition[];
    }
    return activeSection.fields.filter(
      (field) => !NG_PRIMARY_FIELD_KEYS.has(field.key),
    );
  }, [activeSection]);

  const ngPrimarySchema = useMemo<RJSFSchema>(() => {
    if (ngPrimaryFields.length === 0) {
      return { type: "object", properties: {}, additionalProperties: false };
    }
    return {
      type: "object",
      properties: Object.fromEntries(
        ngPrimaryFields.map((field) => [field.key, buildFieldSchema(field)]),
      ),
      additionalProperties: false,
    };
  }, [ngPrimaryFields]);

  const ngAdvancedSchema = useMemo<RJSFSchema>(() => {
    if (ngAdvancedFields.length === 0) {
      return { type: "object", properties: {}, additionalProperties: false };
    }
    return {
      type: "object",
      properties: Object.fromEntries(
        ngAdvancedFields.map((field) => [field.key, buildFieldSchema(field)]),
      ),
      additionalProperties: false,
    };
  }, [ngAdvancedFields]);

  const ngPrimaryUiSchema = useMemo<UiSchema<SettingsSectionFormData>>(
    () => buildUiSchema(ngPrimaryFields),
    [ngPrimaryFields],
  );

  const ngAdvancedUiSchema = useMemo<UiSchema<SettingsSectionFormData>>(
    () => buildUiSchema(ngAdvancedFields),
    [ngAdvancedFields],
  );

  useEffect(() => {
    try {
      const rawState = localStorage.getItem(SETTINGS_PAGE_STATE_KEY);
      if (!rawState) {
        return;
      }
      const parsed = JSON.parse(rawState) as SettingsPageUiState;
      if (
        typeof parsed.activeSectionId === "string" &&
        SETTINGS_SECTION_MAP.has(parsed.activeSectionId as SettingsSectionId)
      ) {
        setActiveSectionId(parsed.activeSectionId as SettingsSectionId);
      }
      if (typeof parsed.ngAdvancedOpen === "boolean") {
        setIsNgAdvancedOpen(parsed.ngAdvancedOpen);
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
      // 破損データは読み飛ばして既定状態で表示する。
    }
  }, []);

  const persistPageUiState = useCallback(() => {
    const nextState: SettingsPageUiState = {
      activeSectionId,
      mainScrollTop: mainPanelRef.current?.scrollTop ?? 0,
      ngAdvancedOpen: isNgAdvancedOpen,
    };

    try {
      localStorage.setItem(SETTINGS_PAGE_STATE_KEY, JSON.stringify(nextState));
    } catch {
      // private modeなどでlocalStorageが使えない場合は永続化をスキップする。
    }
  }, [activeSectionId, isNgAdvancedOpen]);

  const loadSettings = useCallback(() => {
    setLoading(true);
    setError(null);

    container.config.ready(() => {
      try {
        setFormState(readAllSettings());
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "設定の読み込みに失敗しました",
        );
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
    if (loading) {
      return;
    }
    if (!shouldRestoreScrollRef.current) {
      return;
    }
    if (mainPanelRef.current == null) {
      return;
    }

    mainPanelRef.current.scrollTop = restoredScrollTopRef.current;
    shouldRestoreScrollRef.current = false;
  }, [loading]);

  const scheduleAutoSave = useCallback(
    (
      sectionId: SettingsSectionId,
      sectionFormData: SettingsSectionFormData,
    ) => {
      const section = SETTINGS_SECTION_MAP.get(sectionId);
      if (!section) {
        return;
      }

      if (autoSaveTimerRef.current != null) {
        window.clearTimeout(autoSaveTimerRef.current);
      }

      // 入力のたびに即保存するとI/Oが過剰になるため、短い遅延でまとめて保存する。
      autoSaveTimerRef.current = window.setTimeout(() => {
        autoSaveTimerRef.current = null;
        setSavingSectionId(sectionId);
        setAutoSaveError(null);
        void (async () => {
          try {
            // app.config は文字列保存なので、RJSFの型付き入力をここで旧設定形式へ戻して保存する。
            await saveSectionFormData(section, sectionFormData);
          } catch (saveError) {
            const message =
              saveError instanceof Error
                ? saveError.message
                : "設定の自動保存に失敗しました";
            setAutoSaveError(message);
            container.notification.error(message);
          } finally {
            setSavingSectionId((prev) => (prev === sectionId ? null : prev));
          }
        })();
      }, AUTO_SAVE_DELAY_MS);
    },
    [],
  );

  const handleFormChange = useCallback(
    (
      sectionId: SettingsSectionId,
      event: IChangeEvent<SettingsSectionFormData>,
    ) => {
      const nextSectionFormData = event.formData ?? {};
      setFormState((prev) => {
        if (!prev) {
          return prev;
        }
        return {
          ...prev,
          [sectionId]: nextSectionFormData,
        };
      });
      scheduleAutoSave(sectionId, nextSectionFormData);
    },
    [scheduleAutoSave],
  );

  const handleNgPartialFormChange = useCallback(
    (event: IChangeEvent<SettingsSectionFormData>) => {
      const partialFormData = event.formData ?? {};
      let mergedSectionFormData: SettingsSectionFormData | null = null;

      setFormState((prev) => {
        if (!prev) {
          return prev;
        }
        mergedSectionFormData = {
          ...(prev.ng ?? {}),
          ...partialFormData,
        };
        return {
          ...prev,
          ng: mergedSectionFormData,
        };
      });

      // NGセクションはUIを2つに分割しているため、部分更新をマージしてから保存する。
      if (mergedSectionFormData != null) {
        scheduleAutoSave("ng", mergedSectionFormData);
      }
    },
    [scheduleAutoSave],
  );

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current != null) {
        window.clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  if (loading) {
    return <div className="page-status">設定を読み込み中...</div>;
  }

  if (error || !formState) {
    return (
      <div className="page-status page-status--error">
        <p>{error ?? "設定の読み込みに失敗しました"}</p>
        <button className="page-status__retry" onClick={loadSettings}>
          再試行
        </button>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <aside className="settings-page__sidebar">
        <div className="settings-page__sidebar-title">設定カテゴリ</div>
        <div className="settings-page__section-list">
          {SETTINGS_SECTIONS.map((section) => (
            <button
              key={section.id}
              className={`settings-page__section-btn${
                activeSectionId === section.id
                  ? " settings-page__section-btn--active"
                  : ""
              }`}
              onClick={() => setActiveSectionId(section.id)}
            >
              <span className="settings-page__section-name">
                {section.title}
              </span>
              <span className="settings-page__section-desc">
                {section.description}
              </span>
            </button>
          ))}
        </div>
      </aside>

      <div
        className="settings-page__main"
        ref={mainPanelRef}
        onScroll={persistPageUiState}
      >
        <div className="settings-page__card">
          <div className="settings-page__eyebrow">React Settings</div>
          <h1 className="settings-page__title">{activeSection.title}</h1>
          <p className="settings-page__description">
            {activeSection.description}
          </p>
          <p className="settings-page__note">
            設定は自動保存されます
          </p>

          <div className="settings-page__form">
            {activeSection.id !== "ng" ? (
              <Form<SettingsSectionFormData>
                schema={activeSection.schema}
                uiSchema={activeSection.uiSchema}
                validator={settingsValidator}
                formData={formState[activeSection.id]}
                noHtml5Validate
                showErrorList={false}
                onChange={(event) => handleFormChange(activeSection.id, event)}
                widgets={widgets}
              />
            ) : (
              <>
                <Form<SettingsSectionFormData>
                  schema={ngPrimarySchema}
                  uiSchema={ngPrimaryUiSchema}
                  validator={settingsValidator}
                  formData={formState.ng}
                  noHtml5Validate
                  showErrorList={false}
                  onChange={handleNgPartialFormChange}
                  widgets={widgets}
                />

                <details
                  className="settings-page__advanced-group"
                  open={isNgAdvancedOpen}
                  onToggle={(event) => {
                    const nextOpen = event.currentTarget.open;
                    setIsNgAdvancedOpen(nextOpen);
                  }}
                >
                  <summary className="settings-page__advanced-summary">
                    高度なNG設定
                  </summary>
                  <div className="settings-page__advanced-body">
                    <Form<SettingsSectionFormData>
                      schema={ngAdvancedSchema}
                      uiSchema={ngAdvancedUiSchema}
                      validator={settingsValidator}
                      formData={formState.ng}
                      noHtml5Validate
                      showErrorList={false}
                      onChange={handleNgPartialFormChange}
                      widgets={widgets}
                    />
                  </div>
                </details>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
