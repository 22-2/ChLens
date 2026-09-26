// 変更理由: 保存済み設定がない場合の既定値を一つの一覧に集約し、参照箇所ごとの値ずれを防ぐ。
export const DEFAULT_CONFIG: Readonly<Record<string, string>> = {
  layout: "pane-3",
  theme_id: "system",
  dblclick_reload: "on",
  // 変更理由: 自動更新のON/OFFとは独立した間隔設定で、未変更時の既定間隔は20秒にする。
  auto_load_second: "20000",
  auto_load_second_board: "20000",
  auto_next_thread: "off",
  auto_next_thread_mode: "balanced",
  pause_auto_scroll_on_popup: "on",
  image_blur: "on",
  image_blur_length: "4",
  image_blur_word: ".{0,5}[^ァ-ヺ^ー]グロ(?:[^ァ-ヺ^ー].{0,5}|$)|.{0,5}死ね.{0,5}",
  expand_short_url: "none",
  expand_short_url_timeout: "3000",
  ngwords:
    "hide title contains:\n  5ちゃんねるへようこそ\n\nhide title contains:\n  【新着情報】5chブラウザがやってきた！",
  chain_ng: "off",
  chain_ng_id: "off",
  chain_ng_slip: "off",
  // 旧設定のoffは表示方式のhard-ngへ読み替えるため、保存キーと既定値を維持する。
  display_ng: "off",
  nothing_id_ng: "off",
  nothing_slip_ng: "off",
  how_to_judgment_id: "first_res",
  repeat_message_ng_count: "0",
  use_siki_guard: "off",
  debug_log: "off",
  default_name: "",
  default_mail: "",
  focus_new_tab_on_open: "on",
  new_tab_page_mode: "related_board",
  new_tab_page_board_url: "",
  // 変更理由: 垂直タブバー導入時の既定は水平とし、既存利用者の見た目を変えない。
  tab_bar_orientation: "horizontal",
  // 変更理由: 垂直バーの既定は縮小モード（簡易表示）とし、本文の幅を優先する。
  tab_bar_collapsed: "on",
  // 変更理由: 展開幅の既定はタイトルが省略されにくい208pxとする。
  tab_bar_width: "208",
  // 変更理由: タイトルバー左端の各操作を専用モーダルで個別に切り替えられるよう、
  // 戻る・進む・更新を別々の設定値として保存する。
  title_bar_back: "on",
  title_bar_forward: "on",
  title_bar_refresh: "on",
  write_submit_ctrl_enter: "off",
  // 変更理由: 書き込み後のパネルは利用者が明示的に選んだ場合だけ閉じ、既存の操作感を保つ。
  write_close_panel_after_submit: "off",
  // 変更理由: 投稿前警告は従来どおり表示しつつ、利用者が書き込み設定から任意で無効化できるようにする。
  write_pre_submit_warnings: "on",
  auto_load_idle_stop_timeout: "auto",
  // コメントOverlayの設定はTauri版の実況開始時に読み込み、Browser版の既存挙動には影響させない。
  // speedキーは既存設定との互換性のため残し、新規値はコメントの通過時間（秒）として保存する。
  // 文字サイズは表示倍率を含む描画側の共通コード定数で管理し、保存値による実機差を作らない。
  comment_overlay_speed: "6",
  comment_overlay_opacity: "0.95",
  comment_overlay_max_queue: "64",
  comment_overlay_fetch_all_threads: "off",
  no_history: "off",
  no_writehistory: "off",
  bbsmenu:
    "https://menu.5ch.io/bbsmenu.html\nhttps://menu.2ch.sc/bbsmenu.html\nhttps://fox-tools.pages.dev/html/hinan-bbsmenu.html\nhttps://fox-tools.pages.dev/html/tulip-hinan-bbsmenu.html\n// open2chは一度手動でbbsmenuのURLへアクセスする必要があります。\n// https://menu.open2ch.net/bbsmenu.html\n",
  bbsmenu_option: "",
  other_board_titles: "{}",
  useragent: "",
  imgur_access_token: "",
  imgur_client_id: "",
  format_2chnet: "html",
  sage_flag: "off",
  // サイト・板設定は全体設定へ安全にフォールバックできる空のドキュメントを既定値にする。
  site_board_settings: "{}",
  opened_board_entries: "[]",
  image_replace_dat_obj: "",
  image_replace_dat:
    "^https?:\\/\\/(?:www\\.youtube\\.com\\/watch\\?(?:.+&)?v=|youtu\\.be\\/)([\\w\\-]+).*\thttps://img.youtube.com/vi/$1/default.jpg\nhttp:\\/\\/(?:www\\.)?nicovideon?\\.jp\\/(?:(?:watch|thumb)(?:_naisho)?(?:\\?v=|\\/)|\\?p=)(?!am|fz)[a-z]{2}(\\d+)\thttp://tn-skr.smilevideo.jp/smile?i=$1\n\\.(png|jpe?g|gif|bmp|webp)([\\?#:].*)?$\t.$1$2",
  replace_str_txt_obj: "[]",
  replace_str_txt: "",
};
