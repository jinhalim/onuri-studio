// 페이지 로드 직전 <head> 에 인라인 실행되는 스크립트.
// SSR HTML 이 그려지는 첫 paint 전에 html[data-theme] 을 설정 → flash 없음.
// 우선순위: cookie('theme') > localStorage('theme') > system preference > dark.

export const themeBootstrapScript = `(function(){
  try {
    var t = null;
    // cookie 우선 (서버에서 미리 알 수 있도록)
    var m = document.cookie.match(/(?:^|; )theme=(light|dark)/);
    if (m) t = m[1];
    if (!t && typeof localStorage !== 'undefined') {
      var ls = localStorage.getItem('theme');
      if (ls === 'light' || ls === 'dark') t = ls;
    }
    if (!t) {
      t = (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
    }
    document.documentElement.setAttribute('data-theme', t);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();`;
