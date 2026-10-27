(function () {
  try {
    var saved = localStorage.getItem('tupi-theme');
    if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
  } catch (error) { /* sem armazenamento: segue o tema do sistema */ }
})();
