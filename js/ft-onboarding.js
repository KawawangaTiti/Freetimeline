/* FreeTimeline — first-run onboarding card.

   Appears once, in the bottom-right corner, when:
     - the user has no saved work in localStorage, AND
     - the per-app "I've seen the welcome" flag is not yet set.

   Tells the visitor that the visible events are examples, how to add their
   own, and that data lives in their browser. Dismissable. Persistent — once
   dismissed, never shown again on that device unless localStorage is cleared.

   Use:
     ftOnboarding.maybeShow({
       kind: 'universe',                  // or 'biography'
       flagKey: 'ft_uni_onboarded',        // localStorage flag
       title: 'Welcome to Universe Timeline',
       lines: ['…', '…', '…'],
       actionLabel: '+ Event',
       actionCallback: () => UI.addEvent()
     });

   The module itself decides whether to render (checks the flag). If the
   flag is already set, the call is a no-op. */
(function () {
  'use strict';
  if (window.ftOnboarding) return;

  var STYLE_ID = 'ft-onboarding-style';
  var ROOT_ID = 'ft-onboarding-root';

  function getFlag(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function setFlag(key, val) {
    try { localStorage.setItem(key, val); } catch (e) {}
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '#ft-onboarding-root{position:fixed;right:24px;bottom:24px;z-index:99500;',
      '  width:340px;max-width:calc(100vw - 32px);',
      '  background:linear-gradient(180deg,#13162a,#0d0f20);',
      '  color:#e4e8f5;border:1px solid rgba(120,150,255,0.32);',
      '  border-radius:14px;padding:20px 22px;',
      '  box-shadow:0 14px 44px rgba(0,0,0,0.55);',
      '  font-family:-apple-system,"Segoe UI",system-ui,Arial,sans-serif;',
      '  animation:ftOnboardingIn 0.35s ease;}',
      '@keyframes ftOnboardingIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}',
      '#ft-onboarding-root.dismissed{display:none}',
      '#ft-onboarding-root .ftob-title{font-size:1.05rem;font-weight:800;color:#fff;',
      '  margin-bottom:10px;display:flex;align-items:center;gap:8px}',
      '#ft-onboarding-root .ftob-title .ftob-glyph{font-size:1.2em}',
      '#ft-onboarding-root .ftob-list{margin:0 0 14px;padding:0;list-style:none;',
      '  font-size:0.88rem;line-height:1.55;color:#c8d0e8}',
      '#ft-onboarding-root .ftob-list li{margin:0 0 8px;padding-left:18px;position:relative}',
      '#ft-onboarding-root .ftob-list li::before{content:"•";position:absolute;left:6px;',
      '  color:#7aa6ff;font-weight:700}',
      '#ft-onboarding-root .ftob-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
      '#ft-onboarding-root .ftob-btn{min-height:38px;padding:8px 14px;border-radius:8px;',
      '  font-size:0.85rem;font-weight:700;cursor:pointer;font-family:inherit;',
      '  border:1px solid rgba(255,255,255,0.18)}',
      '#ft-onboarding-root .ftob-primary{background:linear-gradient(135deg,#3a60d0,#5a80ff);color:#fff}',
      '#ft-onboarding-root .ftob-dismiss{background:rgba(255,255,255,0.06);color:#c8d4ff}',
      '#ft-onboarding-root .ftob-btn:focus-visible{outline:3px solid #ffd166;outline-offset:2px}',
      '#ft-onboarding-root .ftob-close{position:absolute;top:8px;right:10px;',
      '  background:none;border:0;color:#7a84a0;font-size:1.1rem;cursor:pointer;',
      '  padding:4px 8px;border-radius:4px}',
      '#ft-onboarding-root .ftob-close:hover{color:#fff;background:rgba(255,255,255,0.06)}',
      '@media (max-width:640px){',
      '  #ft-onboarding-root{right:12px;left:12px;bottom:12px;width:auto;padding:16px 18px;',
      '    padding-bottom:calc(16px + env(safe-area-inset-bottom,0px))}',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function buildCard(opts) {
    injectStyle();
    var root = document.createElement('div');
    root.id = ROOT_ID;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', opts.title || 'Welcome');
    root.style.position = 'fixed';

    /* Title row + close (X) — close behaves the same as dismiss. */
    var html = '<button type="button" class="ftob-close" aria-label="Dismiss">✕</button>';
    html += '<div class="ftob-title"><span class="ftob-glyph" aria-hidden="true">' + (opts.glyph || '✦') + '</span><span>' + escText(opts.title || 'Welcome') + '</span></div>';
    html += '<ul class="ftob-list">';
    (opts.lines || []).forEach(function (line) {
      html += '<li>' + escText(line) + '</li>';
    });
    html += '</ul>';
    html += '<div class="ftob-actions">';
    if (opts.actionLabel) {
      html += '<button type="button" class="ftob-btn ftob-primary" data-ftob-action="primary">' + escText(opts.actionLabel) + '</button>';
    }
    html += '<button type="button" class="ftob-btn ftob-dismiss" data-ftob-action="dismiss">Got it</button>';
    html += '</div>';

    root.innerHTML = html;
    return root;
  }

  /* Tiny local escape — module is intentionally standalone and does not
     depend on the engine's esc() helper, which loads later. */
  function escText(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function dismiss(root, flagKey) {
    if (root && root.parentNode) root.parentNode.removeChild(root);
    setFlag(flagKey, '1');
  }

  function show(opts) {
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', function () { show(opts); }, { once: true });
      return;
    }
    if (document.getElementById(ROOT_ID)) return;  // already on screen
    var root = buildCard(opts);
    document.body.appendChild(root);
    root.addEventListener('click', function (e) {
      var t = e.target.closest('[data-ftob-action], .ftob-close');
      if (!t) return;
      var action = t.getAttribute('data-ftob-action');
      if (action === 'primary' && typeof opts.actionCallback === 'function') {
        try { opts.actionCallback(); } catch (err) { /* swallow */ }
      }
      dismiss(root, opts.flagKey);
    });
  }

  window.ftOnboarding = {
    /* Shows the card only if the flag isn't already set. Safe to call from
       both first-run and post-render. */
    maybeShow: function (opts) {
      if (!opts || !opts.flagKey) return;
      if (getFlag(opts.flagKey) === '1') return;
      show(opts);
    },
    /* Force-show. Used by a future "Show welcome again" debug hook. */
    show: show,
    /* Reset for testing. */
    reset: function (flagKey) { try { localStorage.removeItem(flagKey); } catch (e) {} }
  };
})();
