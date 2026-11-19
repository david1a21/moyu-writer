/* 墨屿写作 · 移动端手势守卫
   1) 禁止像网页一样捏合放大、双击放大；
   2) 禁止 iOS 的整页双指缩放（gesturestart / gesturechange）；
   3) 文本尺寸固定，跟随系统“文字大小”设置时不乱跳。
   不影响正常上下滑动、抽屉横滑与编辑器长按。 */
(function () {
  /* ---------- 视口：锁死缩放 ---------- */
  function lockViewport() {
    var head = document.head
    if (!head) return
    var m = head.querySelector('meta[name="viewport"]')
    if (!m) {
      m = document.createElement('meta')
      m.setAttribute('name', 'viewport')
      head.appendChild(m)
    }
    m.setAttribute(
      'content',
      'width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover'
    )
  }
  lockViewport()

  /* ---------- 样式：禁双击缩放、禁文本自动放大 ---------- */
  function injectStyle() {
    var st = document.createElement('style')
    st.id = '__moyu_guard_style'
    st.textContent =
      'html,body{touch-action:manipulation;-webkit-text-size-adjust:100%;text-size-adjust:100%;}' +
      'html{-webkit-touch-callout:none;}'
    ;(document.head || document.documentElement).appendChild(st)
  }
  injectStyle()

  /* ---------- iOS 双指缩放 ---------- */
  function blockGesture(e) {
    if (e.touches && e.touches.length > 1) e.preventDefault()
  }
  document.addEventListener('gesturestart', function (e) { e.preventDefault() }, { passive: false })
  document.addEventListener('gesturechange', function (e) { e.preventDefault() }, { passive: false })
  document.addEventListener('gestureend', function (e) { e.preventDefault() }, { passive: false })
  document.addEventListener('touchmove', blockGesture, { passive: false })

  /* ---------- 双击放大（旧版 WKWebView 有时不认 touch-action） ---------- */
  var lastTap = 0
  document.addEventListener(
    'touchend',
    function (e) {
      var now = Date.now()
      if (now - lastTap < 260) {
        var t = e.target
        /* 只在非可编辑区域拦截，编辑器里双击选词仍保留 */
        if (!t || !(t.closest && t.closest('textarea, input, [contenteditable="true"]'))) {
          e.preventDefault()
        }
      }
      lastTap = now
    },
    { passive: false }
  )

  /* ---------- 兜底：缩放被系统强行改变时拉回 1 ---------- */
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', function () {
      var s = window.visualViewport.scale
      if (s && s > 1.02) {
        var m = document.querySelector('meta[name="viewport"]')
        if (m) {
          m.setAttribute(
            'content',
            'width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover'
          )
        }
      }
    })
  }
})()
