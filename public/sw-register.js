// Registers the StreetWatch service worker. External file so the page CSP can
// stay strict (script-src 'self' — no 'unsafe-inline' needed).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/sw.js").catch(function () {});
  });
}
