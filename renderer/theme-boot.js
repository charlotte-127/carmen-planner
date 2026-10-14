// Applies the saved theme before the page is drawn, so it doesn't flash.
(function () {
  try {
    const id = JSON.parse(localStorage.getItem('cp.theme') || '"scarlet"');
    const pic = localStorage.getItem('cp.picture');
    window.Themes.apply(id, pic || null);
  } catch {
    try {
      window.Themes.apply('scarlet', null);
    } catch {}
  }
})();
