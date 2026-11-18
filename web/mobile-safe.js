/* 移动端安全区探测：把 env(safe-area-inset-*) 换算成 px 变量挂到 :root，
   让 body 的 padding 精确避开状态栏 / 刘海 / 底部横条。
   桌面端直接跳过，不影响原有布局。 */
(function () {
  var ua = navigator.userAgent || '';
  var isMobile = /Android|iPhone|iPad|iPod|HarmonyOS|Mobile/i.test(ua);
  if (!isMobile) return;

  function apply() {
    if (!document.body || document.body.classList.contains('moyu-safe')) return;

    var probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = [
      'position:fixed',
      'top:0',
      'left:0',
      'width:0',
      'height:0',
      'visibility:hidden',
      'pointer-events:none',
      'padding-top:env(safe-area-inset-top,0px)',
      'padding-bottom:env(safe-area-inset-bottom,0px)',
      'padding-left:env(safe-area-inset-left,0px)',
      'padding-right:env(safe-area-inset-right,0px)'
    ].join(';');
    document.documentElement.appendChild(probe);

    var cs = getComputedStyle(probe);
    var sat = parseFloat(cs.paddingTop) || 0;
    var sab = parseFloat(cs.paddingBottom) || 0;
    var sal = parseFloat(cs.paddingLeft) || 0;
    var sar = parseFloat(cs.paddingRight) || 0;
    probe.parentNode.removeChild(probe);

    document.documentElement.classList.add('moyu-mobile');
    document.documentElement.style.setProperty('--moyu-sat', sat + 'px');
    document.documentElement.style.setProperty('--moyu-sab', sab + 'px');
    document.documentElement.style.setProperty('--moyu-sal', sal + 'px');
    document.documentElement.style.setProperty('--moyu-sar', sar + 'px');
    document.body.classList.add('moyu-safe');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }
})();
