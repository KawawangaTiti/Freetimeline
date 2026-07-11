/* FreeTimeline — Share by link (Level 0: zero backend, zero servers).
   Packs a timeline into the URL fragment (#s=…) using the browser's native gzip
   (CompressionStream), base64url-encoded. The fragment is NEVER sent to any server
   (RFC 3986) — the data travels only inside the link the user chooses to send, so the
   "your data stays in your browser" promise holds. Maps (big binaries) are not included.
   API: window.ftShare.make(obj) -> Promise<url>; ftShare.openLoadIfPresent(applyFn). */
(function () {
  if (window.ftShare || typeof CompressionStream === 'undefined') { window.ftShare = window.ftShare || null; return; }

  async function gzipB64url(str) {
    var stream = new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'));
    var buf = await new Response(stream).arrayBuffer();
    var u8 = new Uint8Array(buf), bin = '';
    for (var i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  async function gunzipB64url(t) {
    t = t.replace(/-/g, '+').replace(/_/g, '/'); while (t.length % 4) t += '=';
    var bin = atob(t), u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    var stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(stream).text();
  }

  async function make(obj) {
    var enc = await gzipB64url(JSON.stringify(obj));
    return location.origin + location.pathname + '#s=' + enc;
  }

  async function openLoadIfPresent(applyFn) {
    var m = (location.hash || '').match(/[#&]s=([^&]+)/);
    if (!m) return;
    var raw = m[1];
    // Clear the fragment so a refresh doesn't re-prompt, without adding a history entry.
    try { history.replaceState(null, '', location.pathname + location.search); } catch (_) {}
    try {
      var d = JSON.parse(await gunzipB64url(raw));
      applyFn(d);
    } catch (e) {
      try { (window.notify || function () {})('That shared link could not be read (it may be truncated).', 'error'); } catch (_) {}
    }
  }

  window.ftShare = { make: make, openLoadIfPresent: openLoadIfPresent };
})();
