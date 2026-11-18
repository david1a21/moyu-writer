<div align="center">

<img src="docs/icon.png" width="120" alt="墨屿写作" />

# 墨屿写作 · INKWELL STUDIO

**一个把「写作」当成正事的离线写作工作台。**
书架子管理、专注编辑器、云端同步，全部装进一个不到 25 MB 的客户端里。

<sub>Desktop · Windows / macOS / Linux &nbsp;|&nbsp; Mobile · Android / iOS</sub>

<img src="docs/screenshot.png" width="820" alt="墨屿写作主界面" />

</div>

---

## 这是什么

墨屿写作原本是一个单文件 HTML —— 打开浏览器就能写。后来它被装进了 [Tauri 2](https://tauri.app)，于是它有了自己独立的窗口、独立的图标、可以双击安装的身板，以及**不再被浏览器 CORS 挡住**的坚果云同步。

前端还是那份 HTML，一行没改结构；外层用 Rust 包了一层壳，顺手把云同步的跨域问题解决了。

## 功能一览

| 能力 | 说明 |
| --- | --- |
| 📚 书架管理 | 作品分册、封面、进度一目了然 |
| ✍️ 专注编辑器 | 所见即所得，排版规则、字数统计、主题切换 |
| 🎨 三套主题 | 日间、夜间、纸感，长文写作不刺眼 |
| ☁️ 坚果云同步 | 两条路线：本地同步文件夹 / WebDAV 直连，设置里可切换 |
| 💾 本地存档 | 原子写入，断电不丢稿 |
| 🌙 移动端适配 | 状态栏、刘海、手势条全部避让 |

## 下载安装

前往 **[Releases](https://github.com/david1a21/moyu-writer/releases)** 页面下载对应平台的文件。

| 平台 | 文件 | 安装方式 |
| --- | --- | --- |
| Windows | `墨屿写作_*_x64-setup.exe` | 双击安装；SmartScreen 拦截时点「更多信息 → 仍要运行」 |
| Windows | `墨屿写作_*_x64_en-US.msi` | 域控 / 企业环境用这个 |
| macOS | `墨屿写作_*_universal.dmg` | 拖进 Applications；首次打开右键「打开」，或执行 `xattr -dr com.apple.quarantine /Applications/墨屿写作.app` |
| Android | `墨屿写作-Android.apk` | 允许「未知来源」后安装 |
| iOS | `墨屿写作-iOS-unsigned.zip` | 未签名 `.app`，需自行用 Apple ID / 开发者证书签名后安装 |

> ⚠️ 所有桌面与移动产物均为**未签名**构建。Windows 与 macOS 会有系统安全提示，属于正常现象，不是文件损坏。

## 坚果云同步怎么配

浏览器里的 WebDAV 请求一定会被 CORS 拦死，所以这里做了两层：

```
前端 fetch  →  Tauri 命令 proxy_http  →  reqwest  →  https://dav.jianguoyun.com/dav/
```

前端代码完全不用改，`window.fetch` 在启动时被接管道，`http(s)` 请求自动转交 Rust 层发出，回来再包成一个标准 `Response`。失败时回落到原生 fetch。

配置步骤：

1. 打开坚果云网页端 → **设置 → 安全选项 → 添加应用密码**，生成一串专用密码（**不是登录密码**）；
2. 在应用内「设置 → 同步」里选择路线：
   - **本地同步文件夹**：选一个坚果云客户端的同步目录，读写直接走本地文件，最稳，不依赖网络；
   - **WebDAV 直连**：填邮箱 + 应用密码，远程路径默认 `墨屿/inkwell-sync.json`；
3. 点「测试连接」，绿了就说明通了。

## 自己构建

需要 Node 20+、Rust stable，以及各平台的原生依赖（Linux 需 `libwebkit2gtk-4.1-dev`，Windows 需 WebView2，macOS 需 Xcode Command Line Tools）。

```bash
git clone https://github.com/david1a21/moyu-writer.git
cd moyu-writer
npm install
npx tauri build
```

移动端：

```bash
npx tauri android init && npx tauri android build --apk
npx tauri ios init && npx tauri ios build
```

不想折腾本地环境的话，仓库自带 GitHub Actions 流水线，改完 push 到 `main` 就自动出 Windows / Linux 包；macOS、Android、iOS 各有一条独立工作流，可以在 Actions 页面手动触发，产物在 Artifacts 里取。

## 工程结构

```
.
├── web/                        # 前端：单文件应用 + 三个注入脚本
│   ├── index.html              # 墨屿写作主程序
│   ├── native-fetch-shim.js    # 劫持 fetch，转交 Rust 代理
│   ├── sync-bridge.js          # 三端统一同步层
│   ├── mobile-safe.css         # 移动端安全区
│   └── mobile-safe.js          # 安全区探测
├── src-tauri/
│   ├── src/lib.rs              # 命令：存取文件 / WebDAV / 通用代理
│   ├── src/main.rs
│   ├── tauri.conf.json
│   ├── capabilities/           # 权限声明
│   └── icons/                  # 全平台图标
├── resources/
│   ├── patch-android.py        # 给 MainActivity 注入 insets 补丁
│   └── icon-source.png         # 1024 图标源文件
└── .github/workflows/          # 桌面 / macOS / Android / iOS 四条流水线
```

## 技术细节

- **Tauri 2 + WRY**：桌面用系统 WebView（WebView2 / WKWebView / WebKitGTK），安装包只有几 MB，内存占用远低于 Electron；
- **原子写入**：先写临时文件再 `rename`，写一半断电也不会坏档；
- **TLS 用 `rustls-tls-native-roots`**：坚果云的证书链走系统根证书，避免内置根证书不认导致的手握失败；
- **Android 安全区**：`ViewCompat.setOnApplyWindowInsetsListener` 读取 system bars + cutout，给根 View 打 padding，即使系统强制 edge-to-edge 也不会压住标题栏；
- **iOS 安全区**：`viewport-fit=cover` + `env(safe-area-inset-*)` 换算成 CSS 变量，页面按真实安全区留白。

## 已知限制

- iOS 产物是未签名 `.app`，真机安装需要自己签名，免费 Apple ID 的有效期是 7 天；
- macOS 未做公证（notarization），首次打开需手动放行；
- 坚果云 WebDAV 的写入以整文件为单位，暂未做增量合并，多人同时编辑同一份稿件会以后写覆盖为先。

## License

MIT © Patrick
