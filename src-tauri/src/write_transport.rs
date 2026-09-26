use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE, ORIGIN, REFERER, USER_AGENT};
use reqwest::{Client, Response, Url};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use std::time::Duration;
use tauri::State;

const DEFAULT_USER_AGENT: &str = "Monazilla/1.00 ChLens/4.0";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Default)]
pub struct WriteTransportState {
  // 変更理由: 確認POSTの成功後も掲示板が発行した認証Cookieを次回投稿へ渡すため、
  // 書き込み1回ごとにClientを破棄せず、同じサイトの書き込みだけでCookie Jarを共有する。
  clients: Mutex<HashMap<String, Client>>,
  // 変更理由: reqwestのCookie Jarは外部からCookieの有無を確認できないため、
  // Set-Cookieを受け取ったサイトを別に記録して設定画面の表示へ利用する。
  sites_with_cookies: Mutex<HashSet<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteRequest {
  pub action: String,
  pub bootstrap_url: Option<String>,
  pub referer: String,
  pub user_agent: Option<String>,
  pub body: Vec<u8>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteResponse {
  pub status: u16,
  pub url: String,
  pub content_type: Option<String>,
  pub body: Vec<u8>,
}

fn parse_http_url(raw_url: &str, label: &str) -> Result<Url, String> {
  let url = Url::parse(raw_url).map_err(|error| format!("{label}を解釈できませんでした: {error}"))?;
  if !matches!(url.scheme(), "http" | "https") {
    return Err(format!("{label}はHTTPまたはHTTPSである必要があります"));
  }
  Ok(url)
}

fn site_key(url: &Url, label: &str) -> Result<String, String> {
  url.host_str()
    .map(str::to_ascii_lowercase)
    .ok_or_else(|| format!("{label}にホスト名がありません"))
}

fn parse_site_host(raw_site: &str) -> Result<String, String> {
  let trimmed = raw_site.trim();
  if trimmed.is_empty() {
    return Err("Cookieを削除するサイトが指定されていません".to_string());
  }

  let raw_url = if trimmed.contains("://") {
    trimmed.to_string()
  } else {
    format!("https://{trimmed}/")
  };
  let url = parse_http_url(&raw_url, "Cookieを削除するサイト")?;
  if url.username() != ""
    || url.password().is_some()
    || url.port().is_some()
    || (url.path() != "" && url.path() != "/")
    || url.query().is_some()
    || url.fragment().is_some()
  {
    return Err("Cookieを削除するサイトの指定が不正です".to_string());
  }
  site_key(&url, "Cookieを削除するサイト")
}

fn create_client() -> Result<Client, String> {
  Client::builder()
    .cookie_store(true)
    .timeout(REQUEST_TIMEOUT)
    .build()
    .map_err(|error| format!("Tauri版の書き込みHTTPクライアントを初期化できませんでした: {error}"))
}

fn add_header(headers: &mut HeaderMap, name: reqwest::header::HeaderName, value: &str) {
  if let Ok(header_value) = HeaderValue::from_str(value) {
    headers.insert(name, header_value);
  }
}

fn build_headers(
  action: &Url,
  referer: &str,
  user_agent: Option<&str>,
) -> HeaderMap {
  let mut headers = HeaderMap::new();
  headers.insert(
    CONTENT_TYPE,
    HeaderValue::from_static("application/x-www-form-urlencoded"),
  );

  // 変更理由: JavaScriptのHeadersは日本語UAやRefererを渡す段階で例外にするため、
  // Tauri版はRust側でHTTPヘッダーを検証し、壊れた任意設定だけを標準値へ戻す。
  let user_agent_header = user_agent
    .filter(|value| !value.trim().is_empty())
    .and_then(|value| HeaderValue::from_str(value).ok())
    .unwrap_or_else(|| HeaderValue::from_static(DEFAULT_USER_AGENT));
  headers.insert(USER_AGENT, user_agent_header);

  let action_origin = action.origin().ascii_serialization();
  add_header(&mut headers, ORIGIN, &action_origin);

  let fallback_referer = action.as_str();
  let referer = if referer.trim().is_empty() {
    fallback_referer
  } else {
    referer
  };
  if HeaderValue::from_str(referer).is_ok() {
    headers.insert(REFERER, HeaderValue::from_str(referer).expect("Refererを検証済みです"));
  } else {
    headers.insert(
      REFERER,
      HeaderValue::from_str(fallback_referer).expect("URL由来のRefererは有効です"),
    );
    log::warn!("書き込み用RefererにHTTPヘッダーとして使えない文字が含まれていました");
  }

  headers
}

fn get_or_create_client(state: &WriteTransportState, site: &str) -> Result<Client, String> {
  let mut clients = state
    .clients
    .lock()
    .map_err(|_| "Tauri版の書き込みClientをロックできませんでした".to_string())?;

  if let Some(client) = clients.get(site) {
    return Ok(client.clone());
  }

  let new_client = create_client()?;
  clients.insert(site.to_string(), new_client.clone());
  Ok(new_client)
}

fn remember_response_cookies(state: &WriteTransportState, site: &str, response: &Response) {
  if response
    .headers()
    .get_all(reqwest::header::SET_COOKIE)
    .iter()
    .next()
    .is_none()
  {
    return;
  }

  match state.sites_with_cookies.lock() {
    Ok(mut sites) => {
      sites.insert(site.to_string());
    }
    Err(error) => log::error!("Tauri版のCookie状態を更新できませんでした: {error}"),
  }
}

#[tauri::command]
pub fn has_write_cookies(
  state: State<'_, WriteTransportState>,
  site: String,
) -> Result<bool, String> {
  let site = parse_site_host(&site)?;
  let sites = state
    .sites_with_cookies
    .lock()
    .map_err(|_| "Tauri版のCookie状態をロックできませんでした".to_string())?;
  Ok(sites.contains(&site))
}

#[tauri::command]
pub fn has_any_write_cookies(state: State<'_, WriteTransportState>) -> Result<bool, String> {
  let sites = state
    .sites_with_cookies
    .lock()
    .map_err(|_| "Tauri版のCookie状態をロックできませんでした".to_string())?;
  Ok(!sites.is_empty())
}

#[tauri::command]
pub fn clear_write_cookies(
  state: State<'_, WriteTransportState>,
  site: String,
) -> Result<(), String> {
  let site = parse_site_host(&site)?;
  let mut clients = state
    .clients
    .lock()
    .map_err(|_| "Tauri版の書き込みClientをロックできませんでした".to_string())?;
  let mut sites_with_cookies = state
    .sites_with_cookies
    .lock()
    .map_err(|_| "Tauri版のCookie状態をロックできませんでした".to_string())?;

  // 変更理由: reqwestのCookie JarにはCookie単位の公開削除APIがないため、
  // サイトごとのClientを破棄して、次回書き込み時に空のJarを作り直す。
  let removed_client = clients.remove(&site).is_some();
  let removed_cookie_state = sites_with_cookies.remove(&site);
  if removed_client || removed_cookie_state {
    log::info!("サイトの書き込みCookieを削除しました: {site}");
  }
  Ok(())
}

#[tauri::command]
pub fn clear_all_write_cookies(state: State<'_, WriteTransportState>) -> Result<(), String> {
  let mut clients = state
    .clients
    .lock()
    .map_err(|_| "Tauri版の書き込みClientをロックできませんでした".to_string())?;
  let mut sites_with_cookies = state
    .sites_with_cookies
    .lock()
    .map_err(|_| "Tauri版のCookie状態をロックできませんでした".to_string())?;

  // 変更理由: Cookie JarはサイトごとのClientに保持されるため、全Clientを破棄して全サイトの認証状態をまとめて消す。
  let removed_count = clients.len();
  clients.clear();
  sites_with_cookies.clear();
  log::info!("すべての書き込みCookieを削除しました: {removed_count}サイト");
  Ok(())
}

#[tauri::command]
pub async fn write_request(
  state: State<'_, WriteTransportState>,
  request: WriteRequest,
) -> Result<WriteResponse, String> {
  let action = parse_http_url(&request.action, "書き込み先URL")?;
  let site = site_key(&action, "書き込み先URL")?;
  let client = get_or_create_client(&state, &site)?;

  if let Some(bootstrap_url) = request.bootstrap_url.as_deref() {
    match parse_http_url(bootstrap_url, "書き込み前のCookie取得URL") {
      Ok(bootstrap) => {
        let headers = build_headers(&bootstrap, "", request.user_agent.as_deref());
        // 変更理由: 5ch互換サーバーはスレッド閲覧時に確認用Cookieを発行するため、
        // 初回POSTの前に同じRust ClientでGETして共有Cookie Jarへ保存する。
        match client.get(bootstrap).headers(headers).send().await {
          Ok(response) => remember_response_cookies(&state, &site, &response),
          Err(error) => {
            // Cookie取得に失敗してもPOST本体は試し、サーバー側の詳細エラーを表示する。
            log::warn!("書き込み前のCookie取得に失敗しました: {error}");
          }
        }
      }
      Err(error) => log::warn!("{error}"),
    }
  }

  let headers = build_headers(
    &action,
    &request.referer,
    request.user_agent.as_deref(),
  );
  let response = client
    .post(action)
    .headers(headers)
    .body(request.body)
    .send()
    .await
    .map_err(|error| format!("Tauri版の書き込み通信に失敗しました: {error}"))?;
  remember_response_cookies(&state, &site, &response);

  let status = response.status().as_u16();
  let url = response.url().to_string();
  let content_type = response
    .headers()
    .get(reqwest::header::CONTENT_TYPE)
    .and_then(|value| value.to_str().ok())
    .map(str::to_string);
  let body = response
    .bytes()
    .await
    .map_err(|error| format!("Tauri版の書き込み応答を読み込めませんでした: {error}"))?
    .to_vec();

  Ok(WriteResponse {
    status,
    url,
    content_type,
    body,
  })
}

#[cfg(test)]
mod tests {
  use super::parse_site_host;

  #[test]
  fn cookie削除用のサイト識別子をホスト名へ正規化する() {
    assert_eq!(
      parse_site_host("HTTPS://Example.COM/").expect("サイトを正規化できるはずです"),
      "example.com"
    );
  }

  #[test]
  fn cookie削除用のサイト識別子にパスや認証情報を許可しない() {
    assert!(parse_site_host("https://example.com/board/").is_err());
    assert!(parse_site_host("https://user:password@example.com/").is_err());
  }
}
