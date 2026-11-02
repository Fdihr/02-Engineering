// Shared shell behaviour for the concept pages: theme toggle and toast.
(function () {
  try { if (localStorage.getItem('app_theme') === 'dark') document.documentElement.classList.add('dark'); }
  catch (error) {}

  document.addEventListener('DOMContentLoaded', function () {
    var toggle = document.getElementById('theme-toggle');
    if (!toggle) return;
    var sync = function () {
      var dark = document.documentElement.classList.contains('dark');
      toggle.textContent = dark ? 'Light theme' : 'Dark theme';
      toggle.setAttribute('aria-pressed', String(dark));
    };
    sync();
    toggle.addEventListener('click', function () {
      var dark = document.documentElement.classList.toggle('dark');
      try { localStorage.setItem('app_theme', dark ? 'dark' : 'light'); } catch (error) {}
      sync();
    });
  });

  var timer;
  window.showToast = function (text) {
    var toast = document.getElementById('toast');
    if (!toast) return;
    toast.innerHTML = '<span class="mark done">Done</span><span></span>';
    toast.lastChild.textContent = text;
    toast.classList.add('show');
    clearTimeout(timer);
    timer = setTimeout(function () { toast.classList.remove('show'); }, 3200);
  };

  window.escapeHtml = function (value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
})();
