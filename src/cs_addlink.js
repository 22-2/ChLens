// 定数定義
const BUTTON_IDS = {
  open: "36e5cda5",
  close: "92a5da13",
};

const STYLES = {
  container: `
    position: fixed;
    right: 10px;
    top: 60px;
    background-color: rgba(255,255,255,0.8);
    color: #000;
    border: 1px solid black;
    border-radius: 4px;
    padding: 5px;
    font-size: 14px;
    font-weight: normal;
    z-index: 255;
  `,
  clickable: "cursor: pointer;",
  underline: "text-decoration: underline;",
  closeButton: "display: inline-block; margin-left: 5px;",
};

// URL パターン定義
const URL_PATTERNS = [
  // 2ch系の通常板・スレッド
  /^https?:\/\/(?!find|info|p2)\w+(?:\.[25]ch\.net|\.2ch\.sc|\.open2ch\.net|\.bbspink\.com)\/(?:subback\/)?\w+\/?(?:index\.html)?(?:#\d+)?$/,

  // read.cgiスレッド
  /^https?:\/\/\w+(?:\.[25]ch\.net|\.2ch\.sc|\.open2ch\.net|\.bbspink\.com)\/(?:\w+\/)?test\/read\.cgi\/\w+\/\d+\/.*/,

  // ula形式URL
  /^https?:\/\/ula\.[25]ch\.net\/2ch\/\w+\/[\w+\.]+\/\d+\/.*/,

  // c.2ch.net板インデックス
  /^https?:\/\/c\.2ch\.net\/test\/-\/\w+\/i?(?:\?.+)?$/,

  // c.2ch.netスレッド
  /^https?:\/\/c\.2ch\.net\/test\/-\/\w+\/\d+\/(?:[ig]|\d+)?(?:\?.+)?$/,

  // したらば板インデックス
  /^https?:\/\/jbbs\.shitaraba\.net\/\w+\/\d+\/(?:index\.html)?(?:#\d+)?$/,

  // したらばスレッド
  /^https?:\/\/jbbs\.shitaraba\.net\/bbs\/read(?:_archive)?\.cgi\/\w+\/\d+\/\d+/,

  // したらば過去ログ
  /^https?:\/\/jbbs\.shitaraba\.net\/\w+\/\d+\/storage\/\d+\.html/,

  // まちBBS板インデックス
  /^https?:\/\/(?:\w+\.)?machi\.to\/\w+\/(?:index\.html)?(?:#\d+)?$/,

  // まちBBSスレッド
  /^https?:\/\/(?:\w+\.)?machi\.to\/bbs\/read\.cgi\/\w+\/\d+/,

  // eddibb
  /^https?:\/\/bbs\.eddibb\.cc\/\w+\/\d+/,
];

/**
 * URLを正規化（必要に応じて変換）
 */
function normalizeUrl(url) {
  // https://bbs.eddibb.cc/BOARD/NUMBER を http://bbs.eddibb.cc/test/read.cgi/BOARD/NUMBER/ に変換
  const eddibbMatch = url.match(/^https:\/\/bbs\.eddibb\.cc\/(\w+)\/(\d+)\/?$/);
  if (eddibbMatch) {
    return `http://bbs.eddibb.cc/test/read.cgi/${eddibbMatch[1]}/${eddibbMatch[2]}/`;
  }
  return url;
}

/**
 * 現在のURLが対象URLパターンにマッチするかチェック
 */
function isTargetUrl(url) {
  return URL_PATTERNS.some((pattern) => pattern.test(url));
}

/**
 * ブラウザAPI取得(Chrome/Firefox対応)
 */
function getBrowserApi() {
  return typeof browser !== "undefined" && browser !== null ? browser : chrome;
}

/**
 * ビューアURLを生成
 */
function createViewerUrl(currentUrl) {
  const baseUrl = getBrowserApi().runtime.getURL("/view/index.html");
  const normalizedUrl = normalizeUrl(currentUrl);
  return `${baseUrl}?q=${encodeURIComponent(normalizedUrl)}`;
}

/**
 * ボタン要素を作成
 */
function createButton(id, text, additionalStyles = "") {
  const button = document.createElement("span");
  button.id = id;
  button.textContent = text;
  button.style.cssText = STYLES.clickable + additionalStyles;
  return button;
}

/**
 * コンテナ要素を作成
 */
function createContainer() {
  const container = document.createElement("div");
  container.style.cssText = STYLES.container;

  const openButton = createButton(
    BUTTON_IDS.open,
    "read.crx 2 で開く",
    STYLES.underline,
  );

  const closeButton = createButton(BUTTON_IDS.close, " x", STYLES.closeButton);

  container.appendChild(openButton);
  container.appendChild(closeButton);

  return container;
}

/**
 * リンクを新しいタブで開く
 */
function openLink(url, button, ctrlKey, shiftKey) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.dispatchEvent(new MouseEvent("click", { button, ctrlKey, shiftKey }));
}

/**
 * マウスダウンイベントハンドラ
 */
function handleMouseDown(event, viewerUrl) {
  const { target, button, ctrlKey, shiftKey } = event;

  if (target.id === BUTTON_IDS.open) {
    openLink(viewerUrl, button, ctrlKey, shiftKey);
  } else if (target.id === BUTTON_IDS.close) {
    document.body.removeChild(target.parentElement);
  }
}

/**
 * 初期化処理
 */
function init() {
  if (!isTargetUrl(location.href)) {
    return;
  }

  const viewerUrl = createViewerUrl(location.href);
  const container = createContainer();

  document.body.addEventListener("mousedown", (event) => {
    handleMouseDown(event, viewerUrl);
  });

  document.body.appendChild(container);
}

// 実行
init();
