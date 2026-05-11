(function () {
  'use strict';

  var ARTICLES = [
    { slug: 'how-to-build-consistent-timeline-fantasy-novel',
      title: 'How to Build a Consistent Timeline for Your Fantasy Novel',
      description: 'Master the art of timeline consistency in fiction. Learn techniques for tracking character ages, historical events, and avoiding plot holes in your fantasy world.',
      category: 'World-Building', readMin: 8 },
    { slug: 'why-local-browser-storage-safer-for-diary',
      title: '5 Reasons Why Local Browser Storage is Safer for Your Diary',
      description: 'Discover why keeping your personal memories in local storage offers better privacy protection than cloud-based alternatives. Your data, your control.',
      category: 'Privacy', readMin: 6 },
    { slug: 'organizing-complex-storylines-multiple-characters',
      title: 'Organizing Complex Storylines with Multiple Characters',
      description: 'Managing an ensemble cast across multiple plot threads can be overwhelming. Learn practical techniques for keeping track of who did what, when, and why.',
      category: 'Storytelling', readMin: 10 },
    { slug: 'creating-personal-memory-journal-tips',
      title: 'Creating a Personal Memory Journal: Tips for Meaningful Entries',
      description: 'Transform your Biography Timeline into a meaningful record of your life. Practical tips for what to record, how often, and ways to make entries more valuable.',
      category: 'Personal', readMin: 7 },
    { slug: 'timeline-mapping-tabletop-rpg-campaigns',
      title: 'Timeline Mapping for Tabletop RPG Campaigns',
      description: 'Game Masters rejoice! Learn how to use timeline tools to track campaign history, faction movements, player choices, and world events for immersive RPG storytelling.',
      category: 'RPG & Gaming', readMin: 9 }
  ];

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function slugify(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function currentSlug() {
    var p = location.pathname.split('/').pop() || '';
    return p.replace(/\.html$/, '');
  }

  function computeReadingTime(content) {
    var text = content ? (content.innerText || content.textContent || '') : '';
    var words = text.trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 220));
  }

  /* ---- Reading-time badge: replace any "X min read" span ---- */
  function applyReadingTime(content) {
    var minutes = computeReadingTime(content);
    var meta = document.querySelector('.article-meta');
    if (!meta) return;
    var spans = meta.querySelectorAll('span');
    var hit = false;
    spans.forEach(function (s) {
      if (/\bmin read\b/i.test(s.textContent)) {
        s.innerHTML = '\u23F1 ' + minutes + ' min read';
        s.style.display = 'inline-flex';
        s.style.alignItems = 'center';
        s.style.gap = '4px';
        hit = true;
      }
    });
    if (!hit) {
      var b = document.createElement('span');
      b.textContent = '\u23F1 ' + minutes + ' min read';
      meta.insertBefore(b, meta.firstChild);
    }
  }

  /* ---- Auto-built Table of Contents from <h2> ---- */
  function buildTOC(content) {
    var h2s = content.querySelectorAll('h2');
    if (h2s.length < 2) return;
    var seen = {};
    var items = [];
    h2s.forEach(function (h) {
      var base = slugify(h.textContent) || 'section';
      var id = base, n = 2;
      while (seen[id]) { id = base + '-' + n++; }
      seen[id] = true;
      h.id = id;
      items.push({ id: id, text: h.textContent });
    });
    var box = document.createElement('nav');
    box.className = 'guide-toc';
    box.setAttribute('aria-label', 'Table of contents');
    box.style.cssText =
      'background:var(--surface,#0d0f20);border:1px solid var(--border-mid,rgba(255,255,255,0.1));' +
      'border-radius:12px;padding:18px 22px;margin:0 0 36px;';
    var html = '<div style="font-size:.72rem;font-weight:800;letter-spacing:2px;text-transform:uppercase;' +
               'color:var(--muted,#7a84a0);margin-bottom:10px">On this page</div><ol style="margin:0;padding-left:20px">';
    items.forEach(function (it) {
      html += '<li style="margin:4px 0"><a href="#' + it.id + '" style="color:var(--accent,#4a8fde);text-decoration:none">' +
              it.text.replace(/</g, '&lt;') + '</a></li>';
    });
    html += '</ol>';
    box.innerHTML = html;
    content.insertBefore(box, content.firstChild);
  }

  /* ---- Related guides: same category, fallback to most recent ---- */
  function buildRelated(content) {
    var slug = currentSlug();
    var here = ARTICLES.find(function (a) { return a.slug === slug; });
    var pool = here
      ? ARTICLES.filter(function (a) { return a.slug !== slug && a.category === here.category; })
      : [];
    if (pool.length < 3) {
      ARTICLES.forEach(function (a) {
        if (a.slug !== slug && pool.indexOf(a) === -1) pool.push(a);
      });
    }
    var picks = pool.slice(0, 3);
    if (picks.length === 0) return;

    var sec = document.createElement('section');
    sec.className = 'related-guides';
    sec.setAttribute('aria-label', 'Related guides');
    sec.style.cssText = 'margin:56px 0 0;padding-top:32px;border-top:1px solid var(--border,rgba(255,255,255,0.06))';
    var html = '<h2 style="font-size:1.3rem;font-weight:800;color:var(--text-bright,#fff);margin:0 0 18px;border:0;padding:0">Related guides</h2>' +
               '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px">';
    picks.forEach(function (a) {
      html +=
        '<a href="' + a.slug + '.html" style="display:flex;flex-direction:column;gap:8px;padding:18px;' +
        'background:var(--surface,#0d0f20);border:1px solid var(--border,rgba(255,255,255,0.06));' +
        'border-radius:12px;text-decoration:none;color:inherit;transition:transform .2s,border-color .2s">' +
        '<span style="font-size:.7rem;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;' +
        'color:var(--accent,#4a8fde)">' + a.category + '</span>' +
        '<span style="font-size:1rem;font-weight:700;color:var(--text-bright,#fff);line-height:1.35">' +
        a.title.replace(/</g, '&lt;') + '</span>' +
        '<span style="font-size:.82rem;color:var(--accent,#4a8fde);margin-top:4px">Read \u2192</span>' +
        '</a>';
    });
    html += '</div>';
    sec.innerHTML = html;
    var ctx = content.parentNode;
    if (ctx) ctx.appendChild(sec);
  }

  /* ---- Hub: BreadcrumbList JSON-LD + tag badges ---- */
  function enhanceHub() {
    var jl = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://freetimeline.pt/' },
        { '@type': 'ListItem', position: 2, name: 'Guides', item: 'https://freetimeline.pt/guides.html' }
      ]
    };
    var s = document.createElement('script');
    s.type = 'application/ld+json';
    s.textContent = JSON.stringify(jl);
    document.head.appendChild(s);
  }

  /* ---- Article boot ---- */
  function enhanceArticle() {
    var content = document.querySelector('.article-content');
    if (!content) return;
    applyReadingTime(content);
    buildTOC(content);
    buildRelated(content);
  }

  ready(function () {
    if (/\/guides\.html?$/.test(location.pathname) || /\/guides\/?$/.test(location.pathname)) {
      enhanceHub();
    } else if (document.querySelector('.article-content')) {
      enhanceArticle();
    }
  });
})();
