/* 墨屿写作 · 内容热更新
   目的：改了 HTML 之后不必重新打包安装。
   1) 启动时若本地缓存里有比内置更新的整份页面，直接把它替换成当前文档；
   2) 后台从仓库拉取最新的 web/index.html，存进缓存，提示“下次打开生效”。
   只在本机缓存里换内容，不联网也能用内置版，断网不受影响。 */
(function () {
  var KEY = 'moyu_html_cache'
  /* 国内优先 jsDelivr（有国内节点），不通再走 GitHub raw */
  var SOURCES = [
    'https://cdn.jsdelivr.net/gh/david1a21/moyu-writer@main/web/index.html',
    'https://raw.githubusercontent.com/david1a21/moyu-writer/main/web/index.html'
  ]
  var MARK = 'native-fetch-shim'

  /* document.write 会把本脚本重新跑一遍，用全局标记挡住递归 */
  if (window.__MOYU_HOT) return
  window.__MOYU_HOT = 1

  /* ---------- 启动：缓存优先 ---------- */
  try {
    var cached = null
    try { cached = localStorage.getItem(KEY) } catch (e) {}
    if (cached && cached.length > 10000 && cached.indexOf(MARK) !== -1) {
      document.open()
      document.write(cached)
      document.close()
      /* 白屏自愈：新文档若没解析出内容，丢掉缓存回到内置版 */
      setTimeout(function () {
        try {
          var ok = document.body && document.body.children.length > 0 && document.body.innerHTML.length > 500
          if (!ok) {
            try { localStorage.removeItem(KEY) } catch (e) {}
            location.replace(location.pathname)
          }
        } catch (e) {}
      }, 2600)
      return
    }
  } catch (e) {}

  /* ---------- 提示条 ---------- */
  function toast(msg) {
    try {
      var box = document.createElement('div')
      box.textContent = msg
      box.style.cssText =
        'position:fixed;left:50%;transform:translateX(-50%) translateY(12px);bottom:26px;z-index:99999;' +
        'background:rgba(18,22,30,.94);color:#eef3fa;font-size:13px;line-height:1.5;padding:11px 18px;' +
        'border-radius:14px;box-shadow:0 12px 34px rgba(0,0,0,.28);font-family:system-ui,-apple-system,sans-serif;' +
        'letter-spacing:.2px;opacity:0;transition:opacity .28s ease,transform .28s ease;pointer-events:none;' +
        'max-width:82vw;text-align:center'
      document.body.appendChild(box)
      requestAnimationFrame(function () {
        box.style.opacity = '1'
        box.style.transform = 'translateX(-50%) translateY(0)'
      })
      setTimeout(function () {
        box.style.opacity = '0'
        box.style.transform = 'translateX(-50%) translateY(8px)'
        setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box) }, 320)
      }, 3400)
    } catch (e) {}
  }

  /* ---------- 后台拉取最新版 ---------- */
  function check() {
    var done = false
    function finish(text) {
      if (done || !text) return
      done = true
      if (text.length < 10000 || text.indexOf(MARK) === -1) return
      var old = null
      try { old = localStorage.getItem(KEY) } catch (e) {}
      if (text === old) return
      try {
        localStorage.setItem(KEY, text)
        toast('已取到新版本，下次打开墨屿自动生效')
      } catch (e) {
        toast('新版本较大，缓存写入失败')
      }
    }
    var i = 0
    function next() {
      if (done || i >= SOURCES.length) return
      var url = SOURCES[i++] + '?t=' + Date.now()
      try {
        fetch(url, { cache: 'no-store' })
          .then(function (r) { return r.ok ? r.text() : null })
          .then(function (t) {
            if (t && t.length > 10000) finish(t)
            else next()
          })
          .catch(function () { next() })
      } catch (e) { next() }
    }
    next()
  }

  if (document.readyState === 'complete') setTimeout(check, 900)
  else window.addEventListener('load', function () { setTimeout(check, 900) })
})()
