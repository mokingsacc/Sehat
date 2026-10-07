// Inlined into index.html by the Android app (WebAppPathHandler). Runs before the app's own scripts.
// The Android WebView has no Web Share API, so navigator.share / canShare are provided through window.FHBAndroid:
//  - sharing a file (the recordings zip) opens the Android share sheet with that file,
//  - sharing the app's own address (when no public appUrl is set it is the in-APK address) sends the APK instead,
//  - other text/links open the share sheet as text.
(function () {
  var B = window.FHBAndroid;
  if (!B) return;
  document.documentElement.classList.add('fhb-android');
  if (navigator.share) return;
  function b64(buf) {
    var bytes = new Uint8Array(buf), out = '', step = 0x8000;
    for (var i = 0; i < bytes.length; i += step) out += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
    return btoa(out);
  }
  function fail() { return Promise.reject(new DOMException('Share failed', 'AbortError')); }
  function def(name, fn) {
    try { Object.defineProperty(navigator, name, { value: fn, configurable: true, writable: true }); } catch (e) { navigator[name] = fn; }
  }
  def('canShare', function (d) {
    if (!d) return false;
    if (d.files) return d.files.length === 1;
    return !!(d.url || d.text || d.title);
  });
  def('share', function (d) {
    d = d || {};
    if (d.files && d.files.length) {
      var f = d.files[0];
      return new Response(f).arrayBuffer().then(function (ab) {
        if (!B.shareFile(b64(ab), f.name || 'file', f.type || 'application/octet-stream')) throw new DOMException('Share failed', 'AbortError');
      });
    }
    if (d.url && /^https:\/\/appassets\.androidplatform\.net\//.test(d.url)) { B.shareApp(); return Promise.resolve(); }
    var text = [d.text, d.url].filter(Boolean).join(' ');
    return B.shareText(d.title || '', text) ? Promise.resolve() : fail();
  });
})();
