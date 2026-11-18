/* 原生 fetch 接管层（零侵入）
   墨屿写作内部用 fetch 访问坚果云 WebDAV / 自定义端点，
   浏览器里会被 CORS 拦截。这里把请求转交 Rust(reqwest) 发出，
   应用原有代码、原有界面、原有同步逻辑一律不用改。 */
(function () {
  if (!window.__TAURI__ || !window.__TAURI__.core) return

  const invoke = window.__TAURI__.core.invoke
  const origFetch = window.fetch.bind(window)

  function headersToArray(h) {
    const out = []
    if (!h) return out
    if (typeof Headers !== 'undefined' && h instanceof Headers) {
      h.forEach((v, k) => out.push([k, v]))
      return out
    }
    if (Array.isArray(h)) {
      h.forEach(p => out.push([String(p[0]), String(p[1])]))
      return out
    }
    for (const k of Object.keys(h)) {
      if (h[k] !== null && h[k] !== undefined) out.push([k, String(h[k])])
    }
    return out
  }

  window.fetch = async function (input, init) {
    let url = typeof input === 'string' ? input : (input && input.url) || ''
    if (!/^https?:\/\//i.test(url)) return origFetch(input, init)

    const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase()
    const headers = headersToArray((init && init.headers) || (input && input.headers))

    let body = init && init.body !== undefined && init.body !== null ? init.body : null
    if (body !== null && typeof body !== 'string') {
      try {
        body = JSON.stringify(body)
      } catch (e) {
        body = String(body)
      }
    }

    try {
      const r = await invoke('proxy_http', {
        method,
        url,
        headers,
        body,
        timeoutSecs: 45
      })
      if (r && r.error) throw new Error(r.error)

      const hdrs = new Headers()
      for (const pair of r.headers || []) {
        // 这些头由浏览器自己管理，硬设会报错
        const lower = String(pair[0]).toLowerCase()
        if (['content-length', 'content-encoding', 'transfer-encoding', 'connection'].includes(lower)) continue
        try { hdrs.append(pair[0], pair[1]) } catch (e) {}
      }

      const text = method === 'HEAD' || r.status === 204 || r.status === 304 ? null : (r.text || '')
      return new Response(text, {
        status: r.status || 200,
        headers: hdrs
      })
    } catch (e) {
      // 代理不可用时回退浏览器原生请求，把错误交回应用自己处理
      return origFetch(input, init)
    }
  }
})()
