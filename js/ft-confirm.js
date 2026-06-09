/* FreeTimeline — shared mobile-safe confirm dialog.
   Replaces native confirm() for destructive actions across Universe and Biography.

   Usage:
     ftConfirm({
       title:        'Delete this event?',
       message:      'This cannot be undone.',
       confirmLabel: 'Delete',
       cancelLabel:  'Cancel',
       danger:       true
     }).then(function(ok){ if (ok) actuallyDelete(); });

   Returns a Promise<boolean>. Resolves true on confirm, false on cancel / dismiss.
   Native confirm() is a synchronous blocking call — callers using the Promise
   form must either chain .then() or be refactored to async/await. */
(function () {
  'use strict';
  if (window.ftConfirm) return;

  var STYLE_ID = 'ft-confirm-style';
  var ROOT_ID  = 'ft-confirm-root';

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '#ft-confirm-root{position:fixed;inset:0;z-index:99999;display:none;',
      '  align-items:center;justify-content:center;padding:18px;',
      '  background:rgba(5,6,17,0.72);backdrop-filter:blur(6px);}',
      '#ft-confirm-root.open{display:flex}',
      '#ft-confirm-root .ftc-box{max-width:420px;width:100%;background:#13162a;',
      '  border:1px solid rgba(255,255,255,0.12);border-radius:16px;',
      '  padding:24px 22px;color:#e4e8f5;box-shadow:0 24px 64px rgba(0,0,0,0.5);',
      '  font-family:-apple-system,"Segoe UI",system-ui,Arial,sans-serif;}',
      '#ft-confirm-root .ftc-icon{font-size:1.8rem;margin-bottom:10px;line-height:1;}',
      '#ft-confirm-root .ftc-title{font-size:1.05rem;font-weight:700;color:#fff;',
      '  margin-bottom:8px;line-height:1.3;}',
      '#ft-confirm-root .ftc-msg{font-size:0.92rem;color:#aab3cc;line-height:1.6;',
      '  margin-bottom:20px;white-space:pre-wrap;}',
      '#ft-confirm-root .ftc-actions{display:flex;flex-direction:column;gap:8px;}',
      '#ft-confirm-root .ftc-btn{min-height:44px;padding:10px 16px;border-radius:10px;',
      '  font-size:0.95rem;font-weight:600;cursor:pointer;border:1px solid transparent;',
      '  font-family:inherit;}',
      '#ft-confirm-root .ftc-ok{background:linear-gradient(135deg,#3a60d0,#5a80ff);',
      '  color:#fff;border-color:rgba(255,255,255,0.18);}',
      '#ft-confirm-root .ftc-ok.danger{background:linear-gradient(135deg,#a8443a,#d96a55);}',
      '#ft-confirm-root .ftc-cancel{background:rgba(255,255,255,0.06);color:#c8d4ff;',
      '  border-color:rgba(255,255,255,0.12);}',
      '#ft-confirm-root .ftc-btn:focus-visible{outline:3px solid #ffd166;outline-offset:2px;}',
      '@media (min-width:560px){',
      '  #ft-confirm-root .ftc-actions{flex-direction:row-reverse;justify-content:flex-start;}',
      '  #ft-confirm-root .ftc-btn{min-width:120px;}',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function ensureRoot() {
    var root = document.getElementById(ROOT_ID);
    if (root) return root;
    root = document.createElement('div');
    root.id = ROOT_ID;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'ftc-title');
    root.setAttribute('aria-describedby', 'ftc-msg');
    root.innerHTML =
      '<div class="ftc-box">' +
        '<div class="ftc-icon" aria-hidden="true"></div>' +
        '<div class="ftc-title" id="ftc-title"></div>' +
        '<div class="ftc-msg" id="ftc-msg"></div>' +
        '<div class="ftc-actions">' +
          '<button type="button" class="ftc-btn ftc-ok"></button>' +
          '<button type="button" class="ftc-btn ftc-cancel"></button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(root);
    return root;
  }

  function close(root, resolve, result) {
    root.classList.remove('open');
    if (root._ftcKey) {
      document.removeEventListener('keydown', root._ftcKey);
      root._ftcKey = null;
    }
    root._ftcCancel = null; // SUP-02: re-entry teardown hook is now consumed
    resolve(result);
  }

  function ftConfirm(opts) {
    opts = opts || {};
    injectStyle();
    var root = ensureRoot();

    // SUP-02: the dialog reuses a single shared #ft-confirm-root singleton. If a
    // previous ftConfirm() is still open and unresolved when a new one opens, its
    // button handlers and keydown listener get clobbered — orphaning the old
    // Promise (it never resolves) and leaking its listener (close() would later
    // remove the NEW _ftcKey, not the old). Tear the prior one down first:
    // resolve it false and remove its listener before reusing the node.
    if (root._ftcCancel) root._ftcCancel();

    var iconEl   = root.querySelector('.ftc-icon');
    var titleEl  = root.querySelector('.ftc-title');
    var msgEl    = root.querySelector('.ftc-msg');
    var okBtn    = root.querySelector('.ftc-ok');
    var cancBtn  = root.querySelector('.ftc-cancel');

    iconEl.textContent  = opts.icon || (opts.danger ? '⚠️' : '❔');
    titleEl.textContent = opts.title || 'Are you sure?';
    msgEl.textContent   = opts.message || '';
    okBtn.textContent   = opts.confirmLabel || 'OK';
    cancBtn.textContent = opts.cancelLabel  || 'Cancel';
    okBtn.classList.toggle('danger', !!opts.danger);

    var prevFocus = document.activeElement;
    return new Promise(function (resolve) {
      function done(result) {
        close(root, resolve, result);
        // Restore focus to whatever triggered the dialog (SUP-05).
        if (prevFocus && typeof prevFocus.focus === 'function') {
          setTimeout(function () { try { prevFocus.focus(); } catch (_) {} }, 0);
        }
      }
      // SUP-02: expose a teardown hook so a later re-entry can resolve THIS
      // Promise (false) and clear its listener instead of orphaning it.
      root._ftcCancel = function () { done(false); };

      okBtn.onclick   = function () { done(true);  };
      cancBtn.onclick = function () { done(false); };

      // Esc cancels; Enter confirms when focus is on a button.
      root._ftcKey = function (e) {
        if (e.key === 'Escape') { e.preventDefault(); done(false); }
      };
      document.addEventListener('keydown', root._ftcKey);

      root.classList.add('open');
      // Defer focus so screen readers announce the dialog first.
      setTimeout(function () { (opts.danger ? cancBtn : okBtn).focus(); }, 30);
    });
  }

  window.ftConfirm = ftConfirm;

  /* ftConfirmGate — callback-style helper.

     Use to migrate `if (!confirm(msg)) return; <body>` to the mobile-safe
     dialog without making the caller async. Wrap the rest of the function
     body in a closure:

       function delEvent(id) {
         ftConfirmGate('Delete this event? This cannot be undone.', function () {
           // original body here
         });
       }

     If ft-confirm.js failed to load, falls back to the native confirm() so
     the action still works (it just looks uglier on mobile). */
  window.ftConfirmGate = function (msg, onConfirm, opts) {
    opts = opts || {};
    var title = opts.title || 'Are you sure?';
    var confirmLabel = opts.confirmLabel || 'Continue';
    var cancelLabel  = opts.cancelLabel  || 'Cancel';
    var danger = (opts.danger !== false); // default to danger for destructive flows
    ftConfirm({
      title: title,
      message: msg,
      confirmLabel: confirmLabel,
      cancelLabel: cancelLabel,
      danger: danger
    }).then(function (ok) { if (ok) onConfirm(); });
  };
})();
