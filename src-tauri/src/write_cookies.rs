use cookie_store::CookieStore;
use reqwest::cookie::CookieStore as ReqwestCookieStore;
use reqwest::header::HeaderValue;
use reqwest::Url;
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard};

pub struct WriteCookies {
  path: PathBuf,
  stores: Mutex<HashMap<String, CookieStore>>,
}

impl WriteCookies {
  pub fn new(path: PathBuf) -> Self {
    // 投稿専用ClientのCookieはWebViewに保存されないため、起動時にアプリのデータ領域から復元する。
    let stores = match fs::read(&path) {
      Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_else(|error| {
        log::error!("投稿Cookieの保存ファイルを読み込めませんでした: {error}");
        HashMap::new()
      }),
      Err(error) if error.kind() == std::io::ErrorKind::NotFound => HashMap::new(),
      Err(error) => {
        log::error!("投稿Cookieの保存ファイルを開けませんでした: {error}");
        HashMap::new()
      }
    };
    Self {
      path,
      stores: Mutex::new(stores),
    }
  }

  fn lock(&self) -> Result<MutexGuard<'_, HashMap<String, CookieStore>>, String> {
    self.stores.lock().map_err(|error| {
      let message = format!("Tauri版の投稿Cookieをロックできませんでした: {error}");
      log::error!("{message}");
      message
    })
  }

  fn save(&self, stores: &HashMap<String, CookieStore>) -> Result<(), String> {
    let result = (|| -> Result<(), Box<dyn std::error::Error>> {
      if let Some(parent) = self.path.parent() {
        fs::create_dir_all(parent)?;
      }
      // CookieStoreのSerializeは期限付きかつ未失効のCookieだけを保存し、セッションCookieは再起動で破棄する。
      // ロック中に一時ファイルを置換し、同時POSTや書き込み途中の終了で保存内容が混ざるのを防ぐ。
      let temporary_path = self.path.with_extension("tmp");
      let mut file = File::create(&temporary_path)?;
      serde_json::to_writer(&mut file, stores)?;
      file.flush()?;
      file.sync_all()?;
      drop(file);
      fs::rename(temporary_path, &self.path)?;
      Ok(())
    })();
    result.map_err(|error| {
      let message = format!("Tauri版の投稿Cookieを保存できませんでした: {error}");
      log::error!("{message}");
      message
    })
  }

  pub fn has_cookies(&self, site: Option<&str>) -> Result<bool, String> {
    let stores = self.lock()?;
    // Set-Cookieの受信履歴では削除・失効を判定できないため、復元後も実際の未失効Cookieを調べる。
    Ok(stores.iter().any(|(host, store)| {
      site.map_or(true, |site| site == host) && store.iter_unexpired().next().is_some()
    }))
  }

  pub fn clear(&self, site: Option<&str>) -> Result<(), String> {
    let mut stores = self.lock()?;
    match site {
      Some(site) => {
        stores.remove(site);
      }
      None => stores.clear(),
    }
    // 設定画面からの削除も直ちに保存し、アプリ再起動で認証Cookieが復活しないようにする。
    self.save(&stores)
  }

  pub fn jar(self: &Arc<Self>, site: &str) -> Arc<SiteCookieJar> {
    Arc::new(SiteCookieJar {
      cookies: Arc::clone(self),
      site: site.to_string(),
    })
  }
}

pub struct SiteCookieJar {
  cookies: Arc<WriteCookies>,
  site: String,
}

impl ReqwestCookieStore for SiteCookieJar {
  fn set_cookies(&self, headers: &mut dyn Iterator<Item = &HeaderValue>, url: &Url) {
    let Ok(mut stores) = self.cookies.lock() else {
      return;
    };
    let store = stores.entry(self.site.clone()).or_default();
    for header in headers {
      match header.to_str() {
        Ok(value) => {
          if let Err(error) = store.parse(value, url) {
            log::warn!("投稿Cookieを登録できませんでした: {error}");
          }
        }
        Err(error) => log::warn!("投稿Cookieのヘッダーを解釈できませんでした: {error}"),
      }
    }
    // reqwestの受信コールバックで保存することで、リダイレクト途中の認証Cookieも取りこぼさない。
    // traitはエラーを返せないため、保存失敗の詳細はsave内でログへ記録する。
    let _ = self.cookies.save(&stores);
  }

  fn cookies(&self, url: &Url) -> Option<HeaderValue> {
    let stores = self.cookies.lock().ok()?;
    let value = stores
      .get(&self.site)?
      .get_request_values(url)
      .map(|(name, value)| format!("{name}={value}"))
      .collect::<Vec<_>>()
      .join("; ");
    if value.is_empty() {
      return None;
    }
    match HeaderValue::from_str(&value) {
      Ok(header) => Some(header),
      Err(error) => {
        log::error!("投稿Cookieの送信ヘッダーを作成できませんでした: {error}");
        None
      }
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::sync::atomic::{AtomicU64, Ordering};

  static NEXT_FILE: AtomicU64 = AtomicU64::new(0);

  struct TestFile(PathBuf);
  impl TestFile {
    fn new() -> Self {
      Self(std::env::temp_dir().join(format!(
        "chlens-cookies-{}-{}-{}.json", std::process::id(),
        std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos(),
        NEXT_FILE.fetch_add(1, Ordering::Relaxed),
      )))
    }
    fn load(&self) -> Arc<WriteCookies> {
      Arc::new(WriteCookies::new(self.0.clone()))
    }
  }
  impl Drop for TestFile {
    fn drop(&mut self) {
      for path in [&self.0, &self.0.with_extension("tmp")] {
        if let Err(error) = fs::remove_file(path) {
          if error.kind() != std::io::ErrorKind::NotFound {
            eprintln!("テスト用Cookieファイルを削除できませんでした: {error}");
          }
        }
      }
    }
  }

  fn receive(store: &Arc<WriteCookies>, site: &str, cookie: &str) {
    let url = Url::parse(&format!("https://{site}/test/bbs.cgi")).unwrap();
    store
      .jar(site)
      .set_cookies(&mut [HeaderValue::from_str(cookie).unwrap()].iter(), &url);
  }

  #[test]
  fn 再起動後も期限付きの認証cookieを送信できる() {
    let file = TestFile::new();
    receive(
      &file.load(),
      "example.com",
      "auth=token; Max-Age=3600; Path=/; Secure; HttpOnly",
    );
    let restored = file.load();
    assert!(restored.has_cookies(Some("example.com")).unwrap());
    assert!(restored.has_cookies(None).unwrap());
    let jar = restored.jar("example.com");
    assert_eq!(
      jar
        .cookies(&Url::parse("https://example.com/test/bbs.cgi").unwrap())
        .unwrap(),
      "auth=token"
    );
    assert!(jar
      .cookies(&Url::parse("http://example.com/test/bbs.cgi").unwrap())
      .is_none());
    assert!(jar
      .cookies(&Url::parse("https://other.example.com/test/bbs.cgi").unwrap())
      .is_none());
  }

  #[test]
  fn セッションcookieは起動中だけ保持する() {
    let file = TestFile::new();
    let store = file.load();
    receive(&store, "example.com", "session=token; Path=/");
    assert!(store.has_cookies(None).unwrap());
    assert!(!file.load().has_cookies(None).unwrap());
  }

  #[test]
  fn サーバーによるcookie削除が保存状態にも反映される() {
    let file = TestFile::new();
    let store = file.load();
    receive(&store, "example.com", "auth=token; Max-Age=3600; Path=/");
    receive(&store, "example.com", "auth=; Max-Age=0; Path=/");
    assert!(!store.has_cookies(None).unwrap());
    assert!(!file.load().has_cookies(None).unwrap());
  }

  #[test]
  fn サイト別削除と全削除は再起動後も維持される() {
    let file = TestFile::new();
    let store = file.load();
    receive(&store, "example.com", "auth=one; Max-Age=3600; Path=/");
    receive(&store, "example.org", "auth=two; Max-Age=3600; Path=/");
    let existing_jar = store.jar("example.com");
    store.clear(Some("example.com")).unwrap();
    assert!(existing_jar
      .cookies(&Url::parse("https://example.com/").unwrap())
      .is_none());
    let restored = file.load();
    assert!(!restored.has_cookies(Some("example.com")).unwrap());
    assert!(restored.has_cookies(Some("example.org")).unwrap());
    restored.clear(None).unwrap();
    assert!(!file.load().has_cookies(None).unwrap());
  }

  #[test]
  fn 別サイトや別パスへcookieを送信しない() {
    let file = TestFile::new();
    receive(
      &file.load(),
      "example.com",
      "auth=token; Max-Age=3600; Path=/test",
    );
    let restored = file.load();
    assert!(restored
      .jar("example.org")
      .cookies(&Url::parse("https://example.com/test/bbs.cgi").unwrap())
      .is_none());
    assert!(restored
      .jar("example.com")
      .cookies(&Url::parse("https://example.com/other/").unwrap())
      .is_none());
  }

  #[test]
  fn 保存中に期限切れになったcookieは復元しない() {
    let file = TestFile::new();
    receive(
      &file.load(),
      "example.com",
      "auth=token; Max-Age=3600; Path=/",
    );
    let mut saved: serde_json::Value = serde_json::from_slice(&fs::read(&file.0).unwrap()).unwrap();
    saved["example.com"][0]["expires"]["AtUtc"] = "2000-01-01T00:00:00Z".into();
    fs::write(&file.0, serde_json::to_vec(&saved).unwrap()).unwrap();
    assert!(!file.load().has_cookies(None).unwrap());
  }

  #[test]
  fn リダイレクトで受信したcookieを保存し新しいclientの投稿へ引き継ぐ() {
    use std::io::Read;
    use std::net::TcpListener;
    use std::time::Duration;

    let file = TestFile::new();
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    // 実在の掲示板へ投稿せず、ローカルHTTP応答でreqwestの受信・再送信経路を検証する。
    let server = std::thread::spawn(move || {
      for index in 0..3 {
        let (mut stream, _) = listener.accept().unwrap();
        stream
          .set_read_timeout(Some(Duration::from_secs(5)))
          .unwrap();
        let mut request = Vec::new();
        while !request.ends_with(b"\r\n\r\n") {
          let mut byte = [0];
          stream.read_exact(&mut byte).unwrap();
          request.push(byte[0]);
        }
        let request = String::from_utf8(request).unwrap().to_ascii_lowercase();
        if index > 0 {
          assert!(request.contains("\r\ncookie: auth=token\r\n"));
        }
        if index == 2 {
          assert!(request.starts_with("post /write "));
        }
        let response = if index == 0 {
          "HTTP/1.1 302 Found\r\nLocation: /finish\r\nSet-Cookie: auth=token; Max-Age=3600; Path=/\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
        } else {
          "HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
        };
        stream.write_all(response.as_bytes()).unwrap();
      }
    });
    tauri::async_runtime::block_on(async {
      let client = reqwest::Client::builder()
        .cookie_provider(file.load().jar("127.0.0.1"))
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap();
      client
        .get(format!("http://{address}/redirect"))
        .send()
        .await
        .unwrap();
      drop(client);
      let restored_client = reqwest::Client::builder()
        .cookie_provider(file.load().jar("127.0.0.1"))
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap();
      assert_eq!(
        restored_client
          .post(format!("http://{address}/write"))
          .send()
          .await
          .unwrap()
          .status(),
        200
      );
    });
    server.join().unwrap();
  }

  #[test]
  fn 保存失敗を削除操作の呼び出し元へ返す() {
    let file = TestFile::new();
    fs::write(&file.0, b"[]").unwrap();
    let store = WriteCookies::new(file.0.join("cookies.json"));
    assert!(store.clear(None).is_err());
  }
}
