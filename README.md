# Writer · Tauri 版多端写作软件

Tauri 2 工程，一套代码产出 **Windows exe / macOS dmg / Linux AppImage / Android apk / iOS app**。
相比 Electron：包体从 ~110MB 降到 **约 5–10MB**，内存占用低，启动快。

## 目录结构

```
writer-tauri/
├── package.json                     # 只有 Tauri CLI 一个开发依赖
├── web/                             # 前端（你原来的 HTML 放这里）
│   ├── index.html                   # 界面
│   └── sync-bridge.js               # 三端统一同步层
├── src-tauri/
│   ├── Cargo.toml                   # Rust 依赖
│   ├── tauri.conf.json              # 窗口 / 打包配置
│   ├── capabilities/default.json    # 权限（最小集）
│   ├── icons/                       # 全套图标（png/ico/icns）
│   └── src/
│       ├── main.rs
│       └── lib.rs                   # 本地文件 + 坚果云 WebDAV 命令
├── resources/gen_icons.py           # 图标生成脚本（改配色重新生成）
└── .github/workflows/build.yml      # 一键出五端安装包
```

## 为什么 Tauri 能直连坚果云

浏览器里直接请求 `https://dav.jianguoyun.com/dav/` 会被 **CORS 拦截**，这是单 HTML 做不到自动同步的根本原因。

Tauri 版把 WebDAV 请求全部放到 **Rust 侧（`reqwest`）**发出，不经过 WebView 的同源策略：

```rust
// lib.rs 里的 dav_put / dav_get / dav_list
client.request(method, url).basic_auth(user, Some(pass))
```

前端只负责调用命令，所以：
- **零代理服务器**
- **零 CORS 报错**
- 桌面端一个包 6MB 左右，直接读写云端

## 两条同步通道（设置里可切换）

| 模式 | 原理 | 支持平台 |
|---|---|---|
| 本地同步文件夹 | Rust 直接读写你电脑上的坚果云同步目录，原子写入（临时文件 + rename） | Windows / macOS / Linux |
| 坚果云 WebDAV | Rust 发 HTTP，填邮箱 + 应用密码 | 全平台 |

坚果云应用密码：网页端 → 设置 → 安全选项 → 添加应用密码（**不是登录密码**）。

## 本地构建

```bash
# 前置：Rust（rustup）+ 各平台编译工具链
npm install

npm run dev          # 开发预览
npm run build:linux  # 当前系统直接打包
npm run build:win    # 仅在 Windows 上有效
npm run build:mac    # 仅在 macOS 上有效（universal 二进制）
```

Linux 额外系统库：

```bash
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev \
  libayatana-appindicator3-dev build-essential curl wget file libssl-dev
```

## 一键出全平台（不需要本地有 Mac / Windows）

推到 GitHub，`main` 分支每次 push 自动跑三个 job：

| Job | 产物 |
|---|---|
| `desktop (windows-latest)` | `Writer_1.0.0_x64-setup.exe`（NSIS 安装器）+ `.msi` |
| `desktop (macos-latest)` | `Writer_1.0.0_universal.dmg`（Intel + Apple Silicon 通用） |
| `desktop (ubuntu-22.04)` | `.AppImage` + `.deb` |
| `android` | `app-universal-release-unsigned.apk`（可直接安装） |
| `ios` | 未签名 `App.app`（要装真机需自己签名） |

> macOS 的 dmg 未签名时，首次打开会被 Gatekeeper 拦，右键「打开」即可，自用完全没问题。

## 未签名说明（你已确认可以）

- **Windows**：未签名的 exe 首次运行会有 SmartScreen 提示，点「更多信息 → 仍要运行」。
- **macOS**：右键打开即可，不需要 Apple 开发者账号。
- **iOS**：未签名 `.app` 只能用 Xcode 或 sideload 工具装，7 天有效（免费 Apple ID）。

## 换成你自己的 HTML

1. 把你的页面覆盖 `web/index.html`
2. 页面里引入 `<script src="sync-bridge.js"></script>`
3. 用统一接口：

```js
await Sync.init()
await Sync.saveSettings({ syncMode: 'dav', davUser: '...', davPass: '...', davDir: 'Writer' })
await Sync.autosave(text)        // 按当前模式自动保存
await Sync.davGet('a.md')        // { ok, status, text }
await Sync.listLocal()           // { ok, files: [{ name, path, mtime }] }
await Sync.pickLocalFolder()     // 弹出系统的选目录对话框
```
