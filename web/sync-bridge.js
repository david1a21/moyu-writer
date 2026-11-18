/* 统一同步层：Tauri / Electron / Capacitor 三端共用
   页面里直接调用 window.Sync.* 即可 */
(function () {
  const tauriInvoke =
    window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke
      ? window.__TAURI__.core.invoke
      : null

  const isTauri = !!tauriInvoke
  const isElectron = !!(window.nativeAPI && window.nativeAPI.isDesktop)
  const isCapacitor = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())
  const supportsLocal = isTauri || isElectron
  const DAV_BASE = 'https://dav.jianguoyun.com/dav/'

  const state = { settings: {}, ready: false, lastSavedAt: null }

  function joinPath (dir, name) {
    return String(dir || '').replace(/\\/g, '/').replace(/\/+$/, '') + '/' + name
  }

  async function nativeFetch (opts) {
    // Tauri：Rust 侧 reqwest，完全不受 CORS 限制
    if (isTauri) {
      return tauriInvoke('dav_request', {
        url: opts.url,
        method: opts.method || 'GET',
        username: opts.username,
        password: opts.password,
        body: opts.body === undefined ? null : opts.body,
        depth: (opts.headers && (opts.headers.Depth || opts.headers.depth)) || null
      })
    }

    // Electron：主进程 fetch
    if (isElectron) return window.nativeAPI.webdavRequest(opts)

    // Capacitor：原生 HTTP 插件，绕过 WebView 跨域
    if (isCapacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp) {
      const { url, method = 'GET', headers = {}, body, username, password } = opts
      const auth = 'Basic ' + btoa(unescape(encodeURIComponent(username + ':' + password)))
      const res = await window.Capacitor.Plugins.CapacitorHttp.request({
        url,
        method,
        headers: { ...headers, Authorization: auth },
        data: body,
        responseType: 'text'
      })
      return {
        ok: res.status >= 200 && res.status < 300,
        status: res.status,
        text: typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
      }
    }

    return { ok: false, status: 0, error: '普通浏览器环境下 WebDAV 会被跨域拦截，请使用桌面版或手机 App' }
  }

  const Sync = {
    isTauri,
    isElectron,
    isCapacitor,
    supportsLocal,
    state,

    async init () {
      try {
        state.settings = JSON.parse(localStorage.getItem('app_settings') || '{}')
      } catch (e) {
        state.settings = {}
      }
      state.ready = true
      return state.settings
    },

    async saveSettings (patch) {
      state.settings = { ...state.settings, ...patch }
      localStorage.setItem('app_settings', JSON.stringify(state.settings))
      return state.settings
    },

    /* ---------- 本地同步文件夹 ---------- */
    async pickLocalFolder () {
      let dir = null
      if (isTauri) {
        dir = await tauriInvoke('plugin:dialog|open', {
          options: { directory: true, multiple: false, title: '选择坚果云同步文件夹' }
        })
      } else if (isElectron) {
        dir = await window.nativeAPI.pickFolder()
      }
      if (dir) await Sync.saveSettings({ localDir: dir })
      return dir || null
    },

    async saveToLocal (content, filename) {
      const dir = state.settings.localDir
      if (!dir) return { ok: false, error: '尚未选择同步文件夹' }
      if (!supportsLocal) return { ok: false, error: '当前平台不支持本地文件夹' }
      const path = joinPath(dir, filename)
      try {
        if (isTauri) {
          const mtime = await tauriInvoke('save_local', { path, content })
          state.lastSavedAt = mtime
          return { ok: true, mtime }
        }
        const r = await window.nativeAPI.writeFile(path, content)
        if (r.ok) state.lastSavedAt = Date.now()
        return r
      } catch (e) {
        return { ok: false, error: String(e) }
      }
    },

    async readFile (absPath) {
      try {
        if (isTauri) return { ok: true, content: await tauriInvoke('read_local', { path: absPath }) }
        if (isElectron) return window.nativeAPI.readFile(absPath)
        return { ok: false, error: '当前平台不支持本地文件' }
      } catch (e) {
        return { ok: false, error: String(e) }
      }
    },

    async listLocal () {
      const dir = state.settings.localDir
      if (!dir) return { ok: false, error: '尚未选择同步文件夹' }
      try {
        if (isTauri) {
          const files = await tauriInvoke('list_local', { dir })
          return { ok: true, files, dir }
        }
        if (isElectron) return window.nativeAPI.listFiles(dir)
        return { ok: false, error: '当前平台不支持本地文件夹' }
      } catch (e) {
        return { ok: false, error: String(e) }
      }
    },

    /* ---------- WebDAV（坚果云） ---------- */
    _davAuth () {
      return {
        username: state.settings.davUser || '',
        password: state.settings.davPass || '',
        dir: state.settings.davDir || 'Writer'
      }
    },

    async davPut (content, filename) {
      const a = Sync._davAuth()
      let r
      if (isTauri) {
        r = await tauriInvoke('dav_put', {
          username: a.username, password: a.password, dir: a.dir, file: filename, content
        })
      } else if (isElectron) {
        r = await window.nativeAPI.webdavPut({
          username: a.username, password: a.password, dir: a.dir, file: filename, content
        })
      } else {
        const prefix = a.dir.replace(/^\/+|\/+$/g, '')
        const url = new URL((prefix ? prefix + '/' : '') + encodeURIComponent(filename), DAV_BASE).href
        r = await nativeFetch({
          url, method: 'PUT', username: a.username, password: a.password,
          headers: { 'Content-Type': 'text/markdown; charset=utf-8' }, body: content
        })
      }
      if (r && r.ok) state.lastSavedAt = Date.now()
      return r
    },

    async davGet (filename) {
      const a = Sync._davAuth()
      if (isTauri) {
        return tauriInvoke('dav_get', { username: a.username, password: a.password, dir: a.dir, file: filename })
      }
      if (isElectron) {
        return window.nativeAPI.webdavGet({ username: a.username, password: a.password, dir: a.dir, file: filename })
      }
      const prefix = a.dir.replace(/^\/+|\/+$/g, '')
      const url = new URL((prefix ? prefix + '/' : '') + encodeURIComponent(filename), DAV_BASE).href
      return nativeFetch({ url, method: 'GET', username: a.username, password: a.password })
    },

    async davList () {
      const a = Sync._davAuth()
      let text = ''
      if (isTauri) {
        const r = await tauriInvoke('dav_list', { username: a.username, password: a.password, dir: a.dir })
        if (!r.ok) return r
        text = r.text
      } else if (isElectron) {
        return window.nativeAPI.webdavList({ username: a.username, password: a.password, dir: a.dir })
      } else {
        const url = new URL(a.dir.replace(/^\/+|\/+$/g, '') + '/', DAV_BASE).href
        const r = await nativeFetch({
          url, method: 'PROPFIND', username: a.username, password: a.password,
          headers: { Depth: '1', 'Content-Type': 'application/xml' },
          body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/></d:prop></d:propfind>'
        })
        if (!r.ok) return r
        text = r.text
      }
      const entries = [...text.matchAll(/<[^>]*href>(.*?)<\/[^>]*href>/gi)].map(m => decodeURIComponent(m[1].trim()))
      return { ok: true, entries }
    },

    async autosave (content) {
      const mode = state.settings.syncMode || (supportsLocal ? 'local' : 'dav')
      const name = state.settings.filename || 'note.md'
      if (mode === 'local' && supportsLocal) return Sync.saveToLocal(content, name)
      if (mode === 'dav') return Sync.davPut(content, name)
      return { ok: false, error: '当前平台不支持该同步模式' }
    }
  }

  window.Sync = Sync
})()
