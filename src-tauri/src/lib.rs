use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use url::Url;

const DAV_BASE: &str = "https://dav.jianguoyun.com/dav/";

#[derive(Serialize, Clone)]
pub struct DavResp {
    ok: bool,
    status: u16,
    text: String,
    error: Option<String>,
}

#[derive(Serialize)]
pub struct FileInfo {
    name: String,
    path: String,
    mtime: u64,
    size: u64,
}

fn dir_url(dir: &str) -> Result<Url, String> {
    let mut url = Url::parse(DAV_BASE).map_err(|e| e.to_string())?;
    {
        let mut seg = url.path_segments_mut().map_err(|_| "invalid base url".to_string())?;
        seg.pop_if_empty();
        for part in dir.split('/') {
            if !part.is_empty() {
                seg.push(part);
            }
        }
        seg.push("");
    }
    Ok(url)
}

fn file_url(dir: &str, file: &str) -> Result<Url, String> {
    let mut url = Url::parse(DAV_BASE).map_err(|e| e.to_string())?;
    {
        let mut seg = url.path_segments_mut().map_err(|_| "invalid base url".to_string())?;
        seg.pop_if_empty();
        for part in dir.split('/') {
            if !part.is_empty() {
                seg.push(part);
            }
        }
        seg.push(file);
    }
    Ok(url)
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

async fn raw_request(
    method: &str,
    url: Url,
    user: &str,
    pass: &str,
    body: Option<String>,
    extra: Vec<(&'static str, String)>,
) -> DavResp {
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(45))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return DavResp { ok: false, status: 0, text: String::new(), error: Some(e.to_string()) }
        }
    };

    let m = match reqwest::Method::from_bytes(method.as_bytes()) {
        Ok(m) => m,
        Err(e) => {
            return DavResp { ok: false, status: 0, text: String::new(), error: Some(e.to_string()) }
        }
    };

    let mut req = client.request(m, url).basic_auth(user, Some(pass));
    for (k, v) in extra {
        req = req.header(k, v);
    }
    if let Some(b) = body {
        req = req.body(b);
    }

    match req.send().await {
        Ok(res) => {
            let status = res.status().as_u16();
            let ok = res.status().is_success();
            let text = res.text().await.unwrap_or_default();
            DavResp { ok, status, text, error: None }
        }
        Err(e) => DavResp {
            ok: false,
            status: 0,
            text: String::new(),
            error: Some(format!("网络请求失败：{e}")),
        },
    }
}

/* ---------------- 本地文件（坚果云同步文件夹） ---------------- */

#[tauri::command]
async fn save_local(path: String, content: String) -> Result<u64, String> {
    let p = PathBuf::from(&path);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    // 临时文件 + rename，避免同步客户端读到半截文件
    let tmp = p.with_extension(format!("tmp{}", std::process::id()));
    fs::write(&tmp, content).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &p).map_err(|e| e.to_string())?;
    let mtime = fs::metadata(&p)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or_else(now_millis);
    Ok(mtime)
}

#[tauri::command]
async fn read_local(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_local(dir: String) -> Result<Vec<FileInfo>, String> {
    let mut out = Vec::new();
    let rd = fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for ent in rd.flatten() {
        let p = ent.path();
        let name = ent.file_name().to_string_lossy().to_string();
        let lower = name.to_lowercase();
        if !(lower.ends_with(".md") || lower.ends_with(".markdown") || lower.ends_with(".txt")) {
            continue;
        }
        let meta = match ent.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        let mtime = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        out.push(FileInfo {
            name,
            path: p.to_string_lossy().to_string(),
            mtime,
            size: meta.len(),
        });
    }
    out.sort_by(|a, b| b.mtime.cmp(&a.mtime));
    Ok(out)
}

/* ---------------- 坚果云 WebDAV ---------------- */

#[tauri::command]
async fn dav_put(
    username: String,
    password: String,
    dir: String,
    file: String,
    content: String,
) -> DavResp {
    let url = match file_url(&dir, &file) {
        Ok(u) => u,
        Err(e) => return DavResp { ok: false, status: 0, text: String::new(), error: Some(e) },
    };
    raw_request(
        "PUT",
        url,
        &username,
        &password,
        Some(content),
        vec![("Content-Type", "text/markdown; charset=utf-8".into())],
    )
    .await
}

#[tauri::command]
async fn dav_get(username: String, password: String, dir: String, file: String) -> DavResp {
    let url = match file_url(&dir, &file) {
        Ok(u) => u,
        Err(e) => return DavResp { ok: false, status: 0, text: String::new(), error: Some(e) },
    };
    raw_request("GET", url, &username, &password, None, vec![]).await
}

#[tauri::command]
async fn dav_list(username: String, password: String, dir: String) -> DavResp {
    let url = match dir_url(&dir) {
        Ok(u) => u,
        Err(e) => return DavResp { ok: false, status: 0, text: String::new(), error: Some(e) },
    };
    raw_request(
        "PROPFIND",
        url,
        &username,
        &password,
        Some(
            "<?xml version=\"1.0\" encoding=\"utf-8\"?>\
             <d:propfind xmlns:d=\"DAV:\"><d:prop><d:displayname/>\
             <d:getlastmodified/><d:getcontentlength/></d:prop></d:propfind>"
                .to_string(),
        ),
        vec![
            ("Depth", "1".to_string()),
            ("Content-Type", "application/xml; charset=utf-8".to_string()),
        ],
    )
    .await
}

#[tauri::command]
async fn dav_request(
    url: String,
    method: String,
    username: String,
    password: String,
    body: Option<String>,
    depth: Option<String>,
) -> DavResp {
    let u = match Url::parse(&url) {
        Ok(u) => u,
        Err(e) => return DavResp { ok: false, status: 0, text: String::new(), error: Some(e.to_string()) },
    };
    let extra = match depth {
        Some(d) => vec![("Depth", d)],
        None => vec![],
    };
    raw_request(&method, u, &username, &password, body, extra).await
}

#[derive(Serialize)]
pub struct ProxyResp {
    ok: bool,
    status: u16,
    text: String,
    error: Option<String>,
    headers: Vec<(String, String)>,
}

/// 通用 HTTP 代理：前端窗口的 fetch 请求从这里发出，绕过 WebView 的同源策略。
/// 只转发，不改写，鉴权信息（如 Basic Auth）由页面自己放进 headers。
#[tauri::command]
async fn proxy_http(
    method: String,
    url: String,
    headers: Vec<(String, String)>,
    body: Option<String>,
    timeout_secs: Option<u64>,
) -> ProxyResp {
    let fail = |msg: String| ProxyResp {
        ok: false,
        status: 0,
        text: String::new(),
        error: Some(msg),
        headers: Vec::new(),
    };

    let parsed = match Url::parse(&url) {
        Ok(u) => u,
        Err(e) => return fail(format!("地址无效：{e}")),
    };
    if !matches!(parsed.scheme(), "http" | "https") {
        return fail("只允许 http/https 地址".into());
    }

    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_secs.unwrap_or(45).min(180)))
        .build()
    {
        Ok(c) => c,
        Err(e) => return fail(e.to_string()),
    };

    let m = match reqwest::Method::from_bytes(method.to_uppercase().as_bytes()) {
        Ok(m) => m,
        Err(e) => return fail(format!("请求方法无效：{e}")),
    };

    let mut req = client.request(m, parsed);
    for (k, v) in headers {
        let lk = k.to_lowercase();
        // 这些头由底层客户端自行管理，手动设置会出错
        if matches!(
            lk.as_str(),
            "host" | "content-length" | "connection" | "accept-encoding" | "transfer-encoding"
        ) {
            continue;
        }
        req = req.header(&k, v);
    }
    if let Some(b) = body {
        req = req.body(b);
    }

    match req.send().await {
        Ok(res) => {
            let status = res.status().as_u16();
            let ok = res.status().is_success();
            let resp_headers: Vec<(String, String)> = res
                .headers()
                .iter()
                .map(|(k, v)| (k.as_str().to_string(), v.to_str().unwrap_or("").to_string()))
                .collect();
            let text = match res.text().await {
                Ok(t) => t,
                Err(e) => return fail(format!("读取响应失败：{e}")),
            };
            ProxyResp { ok, status, text, error: None, headers: resp_headers }
        }
        Err(e) => fail(format!("网络请求失败：{e}")),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            save_local,
            read_local,
            list_local,
            dav_put,
            dav_get,
            dav_list,
            dav_request,
            proxy_http
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
