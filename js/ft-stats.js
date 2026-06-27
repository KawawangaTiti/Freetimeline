/* FreeTimeline — ECharts stats dashboard.
   Overrides renderStatsFullView() with an interactive ECharts dashboard computed from the
   same global S. ECharts is lazy-loaded on first Stats open (keeps it off the initial load).
   Non-invasive + safe: if ECharts fails to load, it falls back to the original renderer.
   Works for desktop + mobile because renderStatsFullView is a global (window) function. */
(function () {
  if (typeof window.renderStatsFullView !== 'function') return;
  var _orig = window.renderStatsFullView;
  var instances = [];

  function lazyEcharts(cb) {
    if (typeof window.echarts !== 'undefined') return cb(true);
    var existing = document.getElementById('ft-echarts-lib');
    if (existing) { existing.addEventListener('load', function () { cb(true); }); return; }
    var s = document.createElement('script');
    s.id = 'ft-echarts-lib'; s.src = 'js/vendor/echarts.min.js';
    s.onload = function () { cb(true); }; s.onerror = function () { cb(false); };
    document.head.appendChild(s);
  }

  function model() {
    var isUni = !!(typeof S !== 'undefined' && S && S.universes);
    var tracks = isUni ? (S.universes || []) : (S.lifeTracks || []);
    var people = isUni ? (S.characters || []) : (S.people || []);
    var events = (S && S.events) || [];
    var conns = (S && S.connections) || [];
    var totalEvents = events.length, totalTracks = tracks.length, totalPeople = people.length, totalConns = conns.length;

    var cat = {};
    events.forEach(function (e) { var c = e.category || 'Other'; cat[c] = (cat[c] || 0) + 1; });
    var catEntries = Object.keys(cat).map(function (k) { return [k, cat[k]]; }).sort(function (a, b) { return b[1] - a[1]; });

    var trackEntries = tracks.map(function (t) {
      return { name: t.name, color: t.color, cnt: events.filter(function (e) { return e.universeId === t.id; }).length };
    }).sort(function (a, b) { return b.cnt - a.cnt; });

    var dates = events.map(function (e) { try { return parseDate(e.date); } catch (x) { return null; } })
                      .filter(function (d) { return d !== null && !isNaN(d); }).sort(function (a, b) { return a - b; });
    var spanYears = dates.length >= 2 ? Math.floor(dates[dates.length - 1]) - Math.floor(dates[0]) : 0;
    var spanCap = isUni ? 100 : 30;

    var score = Math.min(100, Math.round(
      (Math.min(totalEvents, 50) / 50) * 25 +
      (Math.min(totalTracks, 5) / 5) * 20 +
      (Math.min(totalPeople, 10) / 10) * 20 +
      (Math.min(totalConns, 10) / 10) * 15 +
      (Math.min(catEntries.length, 5) / 5) * 10 +
      (spanYears > 0 ? Math.min(spanYears, spanCap) / spanCap * 10 : 0)
    ));
    var label = isUni
      ? (score >= 80 ? 'Epic' : score >= 60 ? 'Rich' : score >= 40 ? 'Growing' : score >= 20 ? 'Emerging' : 'New')
      : (score >= 80 ? 'Rich' : score >= 60 ? 'Growing' : score >= 40 ? 'Developing' : score >= 20 ? 'Starting' : 'New');

    return {
      isUni: isUni, totalEvents: totalEvents, totalTracks: totalTracks, totalPeople: totalPeople, totalConns: totalConns,
      catEntries: catEntries, trackEntries: trackEntries, spanYears: spanYears, score: score, label: label,
      radar: [
        Math.min(100, Math.round(Math.min(totalEvents, 50) / 50 * 100)),
        Math.min(100, Math.round(Math.min(totalTracks, 5) / 5 * 100)),
        Math.min(100, Math.round(Math.min(totalPeople, 10) / 10 * 100)),
        Math.min(100, Math.round(Math.min(totalConns, 10) / 10 * 100)),
        Math.min(100, Math.round(Math.min(catEntries.length, 5) / 5 * 100))
      ]
    };
  }

  function theme(isUni) {
    return isUni
      ? { bg: '#0b1124', panel: '#111a31', line: '#1e2c4d', ink: '#e7ecf7', muted: '#8a97b8', accent: '#5a80ff', title: 'Chronicle Observatory', font: 'inherit' }
      : { bg: '#faf6ef', panel: '#fffdf8', line: '#e6dac6', ink: '#3d2b1f', muted: '#8a7a63', accent: '#c99b3c', title: 'Life Dashboard', font: "Georgia, 'Times New Roman', serif" };
  }
  function scoreColor(s) { return s >= 80 ? '#2ecc71' : s >= 60 ? '#27ae60' : s >= 40 ? '#f39c12' : s >= 20 ? '#e67e22' : '#e74c3c'; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function render() {
    var el = document.getElementById('stats-full-view');
    if (!el) return;
    var m = model(), t = theme(m.isUni);

    if (!m.totalEvents) { _orig(); return; }   // empty state: let the original handle it

    var tracksLabel = m.isUni ? 'Universes' : 'Tracks', pplLabel = m.isUni ? 'Characters' : 'People';
    el.innerHTML =
      '<div class="ft-dash" style="background:' + t.bg + ';color:' + t.ink + ';min-height:100%;padding:22px;font-family:' + t.font + '">' +
        '<div style="max-width:1080px;margin:0 auto">' +
        '<h2 style="font-size:18px;font-weight:800;margin:0 0 16px;color:' + t.ink + '">◉ ' + t.title + '</h2>' +
        '<div class="ft-dash-metrics" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:14px">' +
          metric(t, m.totalEvents, 'Events') + metric(t, m.totalTracks, tracksLabel) +
          metric(t, m.totalPeople, pplLabel) + metric(t, m.totalConns, 'Connections') +
        '</div>' +
        '<div class="ft-dash-charts" style="display:grid;grid-template-columns:300px 1fr 1fr;gap:12px">' +
          card(t, 'World Richness', '<div id="ft-c-gauge" style="width:100%;height:230px"></div>') +
          card(t, 'Events by category', '<div id="ft-c-cat" style="width:100%;height:230px"></div>') +
          card(t, m.isUni ? 'Universe diversity' : 'Life diversity', '<div id="ft-c-radar" style="width:100%;height:230px"></div>') +
        '</div></div></div>';

    if (typeof window.gsap !== 'undefined') {
      gsap.from('.ft-dash-metrics .ft-metric', { opacity: 0, y: 14, duration: .45, stagger: .07, ease: 'power3.out', clearProps: 'all' });
      el.querySelectorAll('.ft-metric-num').forEach(function (n) {
        var to = +n.getAttribute('data-v') || 0, o = { v: 0 };
        gsap.to(o, { v: to, duration: 1.0, ease: 'power2.out', onUpdate: function () { n.textContent = Math.round(o.v); } });
      });
    }

    lazyEcharts(function (ok) {
      if (!ok || typeof window.echarts === 'undefined') return;   // graceful: metrics still show
      drawCharts(m, t);
    });
  }

  function metric(t, val, label) {
    return '<div class="ft-metric" style="background:' + t.panel + ';border:1px solid ' + t.line + ';border-radius:14px;padding:16px">' +
      '<div class="ft-metric-num" data-v="' + val + '" style="font-size:30px;font-weight:900;color:' + t.ink + ';line-height:1">' + val + '</div>' +
      '<div style="font-size:12px;color:' + t.muted + ';margin-top:4px">' + label + '</div></div>';
  }
  function card(t, title, body) {
    return '<div style="background:' + t.panel + ';border:1px solid ' + t.line + ';border-radius:14px;padding:16px">' +
      '<h3 style="margin:0 0 10px;font-size:13px;font-weight:700;color:' + t.ink + '">' + esc(title) + '</h3>' + body + '</div>';
  }

  function drawCharts(m, t) {
    instances.forEach(function (c) { try { c.dispose(); } catch (e) {} }); instances = [];
    var sc = scoreColor(m.score);
    var g = echarts.init(document.getElementById('ft-c-gauge'));
    g.setOption({ series: [{ type: 'gauge', startAngle: 210, endAngle: -30, min: 0, max: 100, radius: '92%',
      progress: { show: true, width: 13, itemStyle: { color: sc } },
      axisLine: { lineStyle: { width: 13, color: [[1, m.isUni ? '#1a2540' : '#ece2cf']] } },
      axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false }, pointer: { show: false }, anchor: { show: false },
      detail: { valueAnimation: true, fontSize: 32, fontWeight: 800, color: t.ink, offsetCenter: [0, '-2%'], formatter: '{value}' },
      title: { show: true, offsetCenter: [0, '26%'], color: sc, fontSize: 13, fontWeight: 700 },
      data: [{ value: m.score, name: m.label }] }] });

    var cats = m.catEntries.slice(0, 6);
    var c2 = echarts.init(document.getElementById('ft-c-cat'));
    c2.setOption({ grid: { left: 92, right: 16, top: 8, bottom: 18 }, tooltip: { trigger: 'axis' },
      xAxis: { type: 'value', axisLine: { lineStyle: { color: t.line } }, axisLabel: { color: t.muted }, splitLine: { lineStyle: { color: t.line } } },
      yAxis: { type: 'category', data: cats.map(function (e) { return e[0]; }).reverse(), axisLine: { lineStyle: { color: t.line } }, axisLabel: { color: t.muted } },
      series: [{ type: 'bar', data: cats.map(function (e) { return e[1]; }).reverse(), barWidth: '58%',
        itemStyle: { color: t.accent, borderRadius: [0, 6, 6, 0] }, emphasis: { itemStyle: { color: sc } },
        animationDelay: function (i) { return i * 80; } }], animationEasing: 'elasticOut' });

    var c3 = echarts.init(document.getElementById('ft-c-radar'));
    c3.setOption({ tooltip: {},
      radar: { radius: '62%', indicator: [
        { name: 'Events', max: 100 }, { name: m.isUni ? 'Universes' : 'Tracks', max: 100 },
        { name: m.isUni ? 'Chars' : 'People', max: 100 }, { name: 'Links', max: 100 }, { name: 'Categories', max: 100 }],
        splitLine: { lineStyle: { color: t.line } }, splitArea: { areaStyle: { color: [t.bg, t.panel] } },
        axisLine: { lineStyle: { color: t.line } }, name: { color: t.muted, fontSize: 11 } },
      series: [{ type: 'radar', data: [{ value: m.radar, name: m.isUni ? 'Universe' : 'Life',
        areaStyle: { color: t.accent + '40' }, lineStyle: { color: t.accent }, itemStyle: { color: t.accent } }] }] });

    instances = [g, c2, c3];
  }

  window.addEventListener('resize', function () { instances.forEach(function (c) { try { c.resize(); } catch (e) {} }); });
  window.renderStatsFullView = render;
})();
