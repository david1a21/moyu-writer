/* 移动端原生交互桥：Android 返回键回退 + 状态栏安全区 */
(function () {
  function visible(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  }

  function esc() {
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true
    }));
    window.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true
    }));
  }

  function currentView() {
    var v = document.querySelector('.view.on');
    return v ? (v.id || '').replace('view-', '') : '';
  }

  window.__moyuHandleBack = function () {
    try {
      // 1) 先关弹层 / 面板
      var masks = [].slice.call(document.querySelectorAll(
        '.mask, .cmd-mask, .ink-mask, .deck-mask, .lock-mask, .modal'
      )).filter(visible);
      if (masks.length) {
        esc();
        return '1';
      }

      // 2) 再关抽屉
      var side = document.getElementById('side');
      var insp = document.getElementById('inspector');
      if ((side && side.classList.contains('open')) || (insp && insp.classList.contains('open'))) {
        esc();
        return '1';
      }

      // 3) 专注模式退回普通写作
      if (document.body.classList.contains('focus')) {
        var fb = document.getElementById('focusExit') ||
                 document.querySelector('.focus-fab [data-act], .focus-exit');
        if (fb) { fb.click(); return '1'; }
        document.body.classList.remove('focus');
        return '1';
      }

      // 4) 视图回退：write -> book -> shelf，其余 tab -> shelf
      var cur = currentView();
      var parent = { write: 'book', book: 'shelf', world: 'shelf', ideas: 'shelf',
                     stats: 'shelf', mine: 'shelf', sync: 'shelf' }[cur];
      if (parent) {
        var scope = document.querySelector('.view.on') || document;
        var btn = scope.querySelector('[data-act="go"][data-view="' + parent + '"]');
        if (btn) { btn.click(); return '1'; }
        var brand = document.querySelector('.brand[data-act="go"][data-view="shelf"]');
        if (brand) { brand.click(); return '1'; }
      }

      return '0';
    } catch (e) {
      return '0';
    }
  };

  // 原生注入状态栏高度后，通知页面重算布局
  window.__moyuApplyNativeInsets = function (top, bottom) {
    window.__MOYU_STATUS_TOP = top || 0;
    window.__MOYU_NAV_BOTTOM = bottom || 0;
    if (typeof window.__moyuSyncViewport === 'function') window.__moyuSyncViewport();
  };
})();
