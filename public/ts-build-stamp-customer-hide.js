(function () {
  try {
    if (new URLSearchParams(location.search).get('debug') === '1') {
      document.documentElement.setAttribute('data-ts-debug-build', '1');
    }
  } catch (e) {}
})();
