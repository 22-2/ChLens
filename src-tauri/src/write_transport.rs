use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE, COOKIE, ORIGIN, REFERER, USER_AGENT};
use reqwest::{Client, Url};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;
use tauri::State;

const DEFAULT_USER_AGENT: &str = "Monazilla/1.00 ChLens/4.0";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Default)]
pub struct WriteTransportState {
  sessions: Mutex<HashMap<String, Client>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteRequest {
  pub session_id: String,
  pub action: String,
  pub bootstrap_url: Option<String>,
  pub referer: String,
  pub user_agent: Option<String>,
  pub cookie: Option<String>,
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
  cookie: Option<&str>,
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

  if let Some(cookie) = cookie.filter(|value| !value.is_empty()) {
    if let Ok(cookie_header) = HeaderValue::from_str(cookie) {
      headers.insert(COOKIE, cookie_header);
    } else {
      log::warn!("書き込み用CookieにHTTPヘッダーとして使えない文字が含まれていました");
    }
  }

  headers
}

fn get_or_create_client(
  state: &WriteTransportState,
  session_id: &str,
) -> Result<(Client, bool), String> {
  let mut sessions = state
    .sessions
    .lock()
    .map_err(|_| "Tauri版の書き込みセッションをロックできませんでした".to_string())?;

  if let Some(client) = sessions.get(session_id) {
    return Ok((client.clone(), false));
  }

  let client = create_client()?;
  sessions.insert(session_id.to_string(), client.clone());
  Ok((client, true))
}

#[tauri::command]
pub async fn write_request(
  state: State<'_, WriteTransportState>,
  request: WriteRequest,
) -> Result<WriteResponse, String> {
  if request.session_id.trim().is_empty() {
    return Err("書き込みセッションIDが空です".to_string());
  }

  let action = parse_http_url(&request.action, "書き込み先URL")?;
  let (client, is_new_session) = get_or_create_client(&state, &request.session_id)?;

  if is_new_session {
    if let Some(bootstrap_url) = request.bootstrap_url.as_deref() {
      match parse_http_url(bootstrap_url, "書き込み前のCookie取得URL") {
        Ok(bootstrap) => {
          let headers = build_headers(&bootstrap, "", request.user_agent.as_deref(), None);
          // 変更理由: 5ch互換サーバーはスレッド閲覧時に確認用Cookieを発行するため、
          // 初回POSTの前に同じRust ClientでGETしてCookie Jarへ保存する。
          if let Err(error) = client.get(bootstrap).headers(headers).send().await {
            // Cookie取得に失敗してもPOST本体は試し、サーバー側の詳細エラーを表示する。
            log::warn!("書き込み前のCookie取得に失敗しました: {error}");
          }
        }
        Err(error) => log::warn!("{error}"),
      }
    }
  }

  let headers = build_headers(
    &action,
    &request.referer,
    request.user_agent.as_deref(),
    request.cookie.as_deref(),
  );
  let response = client
    .post(action)
    .headers(headers)
    .body(request.body)
    .send()
    .await
    .map_err(|error| format!("Tauri版の書き込み通信に失敗しました: {error}"))?;

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

#[tauri::command]
pub fn clear_write_session(
  state: State<'_, WriteTransportState>,
  session_id: String,
) -> Result<(), String> {
  let mut sessions = state
    .sessions
    .lock()
    .map_err(|_| "Tauri版の書き込みセッションをロックできませんでした".to_string())?;
  sessions.remove(&session_id);
  Ok(())
}
