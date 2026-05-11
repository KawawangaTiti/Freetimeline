/* FreeTimeline cookie / ad-consent banner.
   Implements the consent flow described in cookies.html section 4 and
   privacy.html "EU Consent & Personalised Ads".

   Storage:
     localStorage["ft_cookie_consent"] = "accepted" | "rejected" | (absent)

   Behaviour:
     - First visit (no key)     -> banner appears, AdSense is NOT loaded.
     - "Accept all" pressed     -> stores "accepted", loads AdSense if the
                                   current page has at least one <ins class=
                                   "adsbygoogle"> placeholder. Fires a
                                   ft:consent:accepted event so ad-slot
                                   stubs can push themselves.
     - "Reject all" pressed     -> stores "rejected", AdSense never loads.
     - Footer "Manage cookie preferences" -> ftConsent.open() reopens the
       banner so the user can change their decision at any time. */
(function () {
  'use strict';
  if (window.ftConsent) return;

  var KEY    = 'ft_cookie_consent';
  var PUB_ID = 'ca-pub-4135034633295293';
  var STYLE_ID = 'ft-consent-style';
  var ROOT_ID  = 'ft-consent-root';
  var ADSENSE_FLAG = '__ftAdSenseLoaded';

  function readKey() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function writeKey(v) {
    try { localStorage.setItem(KEY, v); } catch (e) {}
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '#ft-consent-root{position:fixed;left:0;right:0;bottom:0;z-index:99998;',
      '  display:none;background:rgba(10,12,26,0.97);color:#e4e8f5;',
      '  border-top:1px solid rgba(255,255,255,0.10);',
      '  box-shadow:0 -8px 32px rgba(0,0,0,0.5);',
      '  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);',
      '  font-family:-apple-system,"Segoe UI",system-ui,Arial,sans-serif;',
      '  padding:18px 22px calc(18px + env(safe-area-inset-bottom,0px));}',
      '#ft-consent-root.open{display:block}',
      '#ft-consent-root .ftc-wrap{max-width:1080px;margin:0 auto;',
      '  display:flex;align-items:center;gap:20px;flex-wrap:wrap;}',
      '#ft-consent-root .ftc-text{flex:1 1 320px;min-width:280px;',
      '  font-size:0.88rem;line-height:1.55;color:#c8d4ff;}',
      '#ft-consent-root .ftc-text strong{color:#fff;}',
      '#ft-consent-root .ftc-text a{color:#7aa6ff;text-decoration:underline;',
      '  text-underline-offset:2px;}',
      '#ft-consent-root .ftc-btns{display:flex;gap:10px;flex-wrap:wrap;}',
      '#ft-consent-root .ftc-btn{min-height:44px;padding:10px 22px;',
      '  border-radius:10px;font-size:0.92rem;font-weight:700;cursor:pointer;',
      '  border:1px solid rgba(255,255,255,0.18);font-family:inherit;',
      '  letter-spacing:0.2px;min-width:130px;}',
      '#ft-consent-root .ftc-accept{background:linear-gradient(135deg,#3a60d0,#5a80ff);',
      '  color:#fff;box-shadow:0 4px 14px rgba(80,120,255,0.28);}',
      '#ft-consent-root .ftc-reject{background:rgba(255,255,255,0.06);color:#e4e8f5;}',
      '#ft-consent-root .ftc-btn:focus-visible{outline:3px solid #ffd166;outline-offset:2px;}',
      '@media (max-width:640px){',
      '  #ft-consent-root{padding:14px 16px calc(14px + env(safe-area-inset-bottom,0px));}',
      '  #ft-consent-root .ftc-wrap{flex-direction:column;align-items:stretch;gap:14px;}',
      '  #ft-consent-root .ftc-btns{flex-direction:column;gap:8px;}',
      '  #ft-consent-root .ftc-btn{width:100%;min-width:0;}',
      '  #ft-consent-root .ftc-text{font-size:0.85rem;}',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function ensureBanner() {
    var root = document.getElementById(ROOT_ID);
    if (root) return root;
    injectStyle();
    root = document.createElement('div');
    root.id = ROOT_ID;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Cookie consent');
    root.setAttribute('aria-live', 'polite');
    root.innerHTML =
      '<div class="ftc-wrap">' +
        '<div class="ftc-text">' +
          '<strong>Cookies &amp; advertising.</strong> ' +
          'FreeTimeline stores your timelines in your own browser. ' +
          'To keep the site free we also display ads from Google AdSense, which ' +
          'can set cookies for personalised advertising. You can accept or reject ' +
          'these at any time. See our <a href="cookies.html">Cookie Policy</a> ' +
          'and <a href="privacy.html">Privacy Policy</a>.' +
        '</div>' +
        '<div class="ftc-btns">' +
          '<button type="button" class="ftc-btn ftc-reject" data-ftc-action="reject">Reject all</button>' +
          '<button type="button" class="ftc-btn ftc-accept" data-ftc-action="accept">Accept all</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(root);
    root.addEventListener('click', function (e) {
      var t = e.target.closest('[data-ftc-action]');
      if (!t) return;
      var action = t.getAttribute('data-ftc-action');
      if (action === 'accept') ftConsent.accept();
      else if (action === 'reject') ftConsent.reject();
    });
    return root;
  }

  function show()  { ensureBanner().classList.add('open');  }
  function hide()  {
    var r = document.getElementById(ROOT_ID);
    if (r) r.classList.remove('open');
  }

  function dispatch(name) {
    try { window.dispatchEvent(new CustomEvent('ft:consent:' + name)); }
    catch (e) {
      // IE/older browsers
      var ev = document.createEvent('Event');
      ev.initEvent('ft:consent:' + name, true, true);
      window.dispatchEvent(ev);
    }
  }

  function pageHasAdSlots() {
    return !!document.querySelector('ins.adsbygoogle');
  }

  function loadAdSenseLibrary() {
    if (window[ADSENSE_FLAG]) return;
    window[ADSENSE_FLAG] = true;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + PUB_ID;
    s.crossOrigin = 'anonymous';
    document.head.appendChild(s);
  }

  function pushAllSlots() {
    if (!window.adsbygoogle) {
      window.adsbygoogle = [];
    }
    var slots = document.querySelectorAll('ins.adsbygoogle:not([data-ftc-pushed])');
    for (var i = 0; i < slots.length; i++) {
      slots[i].setAttribute('data-ftc-pushed', '1');
      try { window.adsbygoogle.push({}); } catch (e) {}
    }
  }

  function activateAds() {
    if (!pageHasAdSlots()) return;
    loadAdSenseLibrary();
    // Push slots once the library has had a chance to attach.
    setTimeout(pushAllSlots, 300);
    setTimeout(pushAllSlots, 1500);
  }

  var ftConsent = window.ftConsent = {
    KEY: KEY,
    get: readKey,
    isAccepted: function () { return readKey() === 'accepted'; },
    isRejected: function () { return readKey() === 'rejected'; },
    hasDecided: function () {
      var v = readKey();
      return v === 'accepted' || v === 'rejected';
    },
    accept: function () {
      writeKey('accepted');
      hide();
      dispatch('accepted');
      activateAds();
    },
    reject: function () {
      writeKey('rejected');
      hide();
      dispatch('rejected');
    },
    open: function () { show(); },
    dismiss: hide
  };

  function init() {
    if (!ftConsent.hasDecided()) {
      ensureBanner();
      show();
    } else if (ftConsent.isAccepted()) {
      activateAds();
    }
    // Wire any "Manage cookie preferences" buttons present on the page.
    var btns = document.querySelectorAll(
      '.ft-cookie-prefs, #ft-cookie-prefs, #ft-cookie-prefs-footer'
    );
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function (e) {
        e.preventDefault();
        ftConsent.open();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
