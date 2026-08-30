import Callbacks from "src/app/Callbacks";
import LocalStorage from "src/app/LocalStorage";
import { assertArg, log } from "src/app/Log";
import message from "src/app/Message";

export default class Config {
  private static readonly _default: ReadonlyMap<string, string> = new Map([
    ["layout", "pane-3"],
    ["theme_id", "system"],
    ["table_tooltip", "on"],
    ["default_scrollbar", "off"],
    ["write_window_x", "0"],
    ["write_window_y", "0"],
    ["always_new_tab", "on"],
    ["button_change_netsc_newtab", "off"],
    ["button_change_scheme_newtab", "off"],
    ["open_all_unread_lazy", "on"],
    ["enable_link_with_res_number", "on"],
    ["bookmark_sort_save_type", "none"],
    ["dblclick_reload", "on"],
    ["auto_load_second", "0"],
    ["auto_load_second_board", "0"],
    ["auto_load_second_bookmark", "0"],
    ["auto_load_all", "off"],
    ["auto_load_move", "off"],
    ["auto_next_thread", "off"],
    ["auto_next_thread_mode", "balanced"],
    ["pause_auto_scroll_on_popup", "on"],
    ["auto_bookmark_notify", "on"],
    ["show_next_unread", "off"],
    ["manual_image_load", "off"],
    ["image_blur", "on"],
    ["image_blur_length", "4"],
    ["image_blur_word", ".{0,5}[^ァ-ヺ^ー]グロ(?:[^ァ-ヺ^ー].{0,5}|$)|.{0,5}死ね.{0,5}"],
    ["image_width", "150"],
    ["image_height", "100"],
    ["audio_supported", "off"],
    ["audio_supported_ogg", "off"],
    ["audio_width", "320"],
    ["video_supported", "off"],
    ["video_supported_ogg", "off"],
    ["video_controls", "on"],
    ["video_width", "360"],
    ["video_height", "240"],
    ["zoom_image_mode", "off"],
    ["zoom_ratio_image", "200"],
    ["zoom_video_mode", "off"],
    ["zoom_ratio_video", "200"],
    ["image_height_fix", "on"],
    ["delay_scroll_time", "600"],
    ["live_style_playback_rate", "1"],
    ["expand_short_url", "none"],
    ["expand_short_url_timeout", "3000"],
    ["aa_font", "aa"],
    ["aa_min_ratio", "40"],
    ["popup_trigger", "click"],
    ["popup_delay_time", "0"],
    [
      "ngwords",
      "hide title contains:\n  5ちゃんねるへようこそ\n\nhide title contains:\n  【新着情報】5chブラウザがやってきた！",
    ],
    ["chain_ng", "off"],
    ["chain_ng_id", "off"],
    ["chain_ng_id_by_chain", "off"],
    ["chain_ng_slip", "off"],
    ["chain_ng_slip_by_chain", "off"],
    ["display_ng", "off"],
    ["nothing_id_ng", "off"],
    ["nothing_slip_ng", "off"],
    ["how_to_judgment_id", "first_res"],
    ["repeat_message_ng_count", "0"],
    ["forward_link_ng", "off"],
    ["ng_id_expire", "none"],
    ["ng_id_expire_date", "0"],
    ["ng_id_expire_day", "0"],
    ["ng_slip_expire", "none"],
    ["ng_slip_expire_date", "0"],
    ["ng_slip_expire_day", "0"],
    ["reject_ng_rep", "off"],
    ["use_siki_guard", "off"],
    ["debug_log", "off"],
    ["debug_log_target_res_num", "0"],
    ["ng_debug_log", "off"],
    ["ng_debug_target_res_num", "0"],
    ["bookmark_show_dat", "on"],
    ["default_name", ""],
    ["default_mail", ""],
    ["focus_new_tab_on_open", "on"],
    ["write_submit_ctrl_enter", "off"],
    // コメントOverlayの設定はTauri版の実況開始時に読み込み、Browser版の既存挙動には影響させない。
    ["comment_overlay_speed", "90"],
    ["comment_overlay_font_size", "18"],
    ["comment_overlay_opacity", "0.95"],
    ["comment_overlay_max_queue", "64"],
    ["no_history", "off"],
    ["no_writehistory", "off"],
    ["user_css", ""],
    [
      "bbsmenu",
      "https://menu.5ch.io/bbsmenu.html\nhttps://menu.2ch.sc/bbsmenu.html\nhttps://fox-tools.pages.dev/html/hinan-bbsmenu.html\nhttps://fox-tools.pages.dev/html/tulip-hinan-bbsmenu.html\n// open2chは一度手動でbbsmenuのURLへアクセスする必要があります。\n// https://menu.open2ch.net/bbsmenu.html\n",
    ],
    ["bbsmenu_option", ""],
    ["useragent", ""],
    ["format_2chnet", "html"],
    ["sage_flag", "on"],
    ["mousewheel_change_tab", "on"],
    ["image_replace_dat_obj", ""],
    [
      "image_replace_dat",
      "^https?:\\/\\/(?:www\\.youtube\\.com\\/watch\\?(?:.+&)?v=|youtu\\.be\\/)([\\w\\-]+).*\thttps://img.youtube.com/vi/$1/default.jpg\nhttp:\\/\\/(?:www\\.)?nicovideon?\\.jp\\/(?:(?:watch|thumb)(?:_naisho)?(?:\\?v=|\\/)|\\?p=)(?!am|fz)[a-z]{2}(\\d+)\thttp://tn-skr.smilevideo.jp/smile?i=$1\n\\.(png|jpe?g|gif|bmp|webp)([\\?#:].*)?$\t.$1$2",
    ],
    ["replace_str_txt_obj", "[]"],
    ["replace_str_txt", ""],
  ]);

  private readonly _cache = new Map<string, string>();
  private readonly _pendingStorageChanges = new Map<string, string | null>();
  readonly ready: (callback: (...args: unknown[]) => void) => void;
  private readonly _onChanged: (
    change: Record<string, { oldValue: string | null; newValue: string | null }>,
  ) => void;
  private readonly _storageListener: ((event: StorageEvent) => void) | null;

  private _normalizeStorageEventValue(rawValue: string | null): string | null {
    if (rawValue == null) {
      return null;
    }

    try {
      const parsed = JSON.parse(rawValue) as unknown;
      if (typeof parsed === "string") {
        return parsed;
      }
      if (typeof parsed === "number" || typeof parsed === "boolean") {
        return String(parsed);
      }
    } catch {
      // 旧実装などで生文字列が格納されている場合はそのまま扱う。
    }

    return rawValue;
  }

  constructor() {
    const ready = new Callbacks();
    this.ready = ready.add.bind(ready);

    // キャッシュを常にLocalStorageから再読み込みして、最新の設定値を確保する。
    // ページリロード後や他のタブからの更新を反映するため、cached.size チェックを削除した。
    void (async () => {
      const res = await LocalStorage.getAll();
      for (const [key, val] of Object.entries(res)) {
        if (key.startsWith("config_") && (typeof val === "string" || typeof val === "number")) {
          this._cache.set(key, val.toString());
        }
      }
      ready.call();
    })();

    this._onChanged = (
      change: Record<string, { oldValue: string | null; newValue: string | null }>,
    ) => {
      for (const [key, val] of Object.entries(change)) {
        if (!key.startsWith("config_")) continue;
        const { newValue } = val;

        const pendingValue = this._pendingStorageChanges.get(key);
        const normalizedValue = typeof newValue === "string" ? newValue : null;

        if (pendingValue === normalizedValue) {
          this._pendingStorageChanges.delete(key);
          continue;
        }

        this._applyChange(key, normalizedValue);
      }
    };

    if (typeof window !== "undefined") {
      this._storageListener = (event: StorageEvent) => {
        if (typeof event.key !== "string" || !event.key.startsWith("config_")) {
          return;
        }

        this._onChanged({
          [event.key]: {
            oldValue: this._normalizeStorageEventValue(event.oldValue),
            newValue: this._normalizeStorageEventValue(event.newValue),
          },
        });
      };

      // 変更理由: config保存をstore2(localStorage)に統一したため、
      // 同期通知もbrowser.storage.onChangedではなくstorageイベントで受ける。
      window.addEventListener("storage", this._storageListener);
    } else {
      this._storageListener = null;
    }
  }

  get(key: string): string | null {
    if (this._cache.has(`config_${key}`)) {
      return this._cache.get(`config_${key}`);
    }
    if (Config._default.has(key)) {
      return Config._default.get(key);
    }
    return null;
  }

  getAll(): Record<string, string> {
    const object: Record<string, string> = {};
    for (const [key, val] of Config._default) {
      object[`config_${key}`] = val;
    }
    Object.assign(object, Object.fromEntries(this._cache));
    return object;
  }

  isOn(key: string): boolean {
    return this.get(key) === "on";
  }

  private _applyChange(storageKey: string, value: string | null) {
    const configKey = storageKey.slice(7);
    const oldValue = this.get(configKey);

    if (value == null) {
      this._cache.delete(storageKey);
    } else {
      this._cache.set(storageKey, value);
    }

    const newValue = this.get(configKey);

    if (oldValue !== newValue) {
      message.send("config_updated", {
        key: configKey,
        val: newValue,
      });
    }
  }

  async set(key: string, val: string) {
    if (typeof key !== "string" || !(typeof val === "string" || typeof val === "number")) {
      log("error", "app.Config::setに不適切な値が渡されました", arguments);
      throw new Error("app.Config::setに不適切な値が渡されました");
    }

    const storageKey = `config_${key}`;
    const nextValue = val.toString();

    await LocalStorage.set(storageKey, nextValue);
    this._pendingStorageChanges.set(storageKey, nextValue);
    this._applyChange(storageKey, nextValue);
    // 変更理由: store2ベースの同一タブ更新ではstorage changeイベントを前提にできないため、
    // pendingを即時解放して不要なメモリ保持を避ける。
    this._pendingStorageChanges.delete(storageKey);
  }

  async del(key: string) {
    if (assertArg("app.Config::del", [[key, "string"]])) {
      throw new Error("app.Config::delにstring以外の値が渡されました");
    }
    const storageKey = `config_${key}`;

    await LocalStorage.del(storageKey);
    this._pendingStorageChanges.set(storageKey, null);
    this._applyChange(storageKey, null);
    // 変更理由: setと同様に、イベント待ちせず同期的に反映した更新は即時確定する。
    this._pendingStorageChanges.delete(storageKey);
  }

  destroy() {
    this._cache.clear();
    this._pendingStorageChanges.clear();
    if (this._storageListener && typeof window !== "undefined") {
      window.removeEventListener("storage", this._storageListener);
    }
  }
}
