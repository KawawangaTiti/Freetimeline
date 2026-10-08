/* FreeTimeline — shared import validator / sanitiser.

   Both Universe and Biography accept JSON and self-contained HTML files.
   Without sanitisation, a malicious file can inject a javascript:-URL into
   a media[].src or character.photo field, which the renderer later interpolates
   into `<img src="…">` — triggering XSS via an onerror handler.

   This module is the single trust boundary for imported files. Both engines
   call ftValidateImport(d, { kind }) before merging an imported object into
   state S. It returns a *sanitised copy* (or throws if the data is unusable).

   Conservative by design:
     - Top-level must be a non-null plain object.
     - File size budget: 50 MB raw text (caller enforces).
     - Every collection field that *should* be an array is filtered to plain
       objects only; anything else is dropped silently.
     - Every URL field is validated — anything other than http(s):, relative,
       or whitelisted data:image/...;base64,... is replaced with empty string.
     - No prototype chain access (Object.create(null) intermediates and
       hasOwnProperty checks everywhere).

   Trust model: the user is importing their own backup or a file shared by a
   friend. We protect against a malicious file but trust the user to choose
   what to open. */
(function () {
  'use strict';
  if (window.ftValidateImport) return;

  /* Max raw-text size we will even try to parse. Generous: a busy 20-year
     personal timeline with thousands of events and embedded base64 thumbnails
     is well under 20 MB. 50 MB is a safety bound, not a target. */
  var MAX_BYTES = 50 * 1024 * 1024;

  function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  /* URL whitelist:
     - empty string (cleared media)
     - http://  https://  (case-insensitive)
     - relative paths starting with /, ./, ../ (rare — saved HTML uses absolute or data: URLs)
     - data:image/<safe-mime>;base64,...  (PNG / JPEG / GIF / WEBP / SVG)

     Explicitly REJECTED:
     - javascript:, vbscript:, file:, blob:, ftp:, jar:
     - data: with non-image MIME or non-base64 payload (SVG via base64 still
       runs in <img> sandbox without script execution; data:text/html would
       not, but we'd reject it anyway because we don't render imported HTML). */
  var SAFE_URL_RE = /^(?:|https?:\/\/[^\s]+|\.{0,2}\/[^\s]*|data:image\/(?:png|jpe?g|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+)$/i;

  function sanitiseUrl(v) {
    if (typeof v !== 'string') return '';
    var s = v.trim();
    if (s.length === 0) return '';
    /* Reject angle brackets, quotes, whitespace and control chars that would break
       attribute parsing — but NOT hyphens (real image URLs are full of them; the
       old class did, silently dropping every hyphenated URL). The anchored
       SAFE_URL_RE below still enforces the protocol whitelist. */
    if (/[<>"\s\x00-\x1f]/.test(s)) return '';
    return SAFE_URL_RE.test(s) ? s : '';
  }

  function sanitiseString(v, maxLen) {
    if (typeof v !== 'string') return '';
    if (maxLen && v.length > maxLen) return v.slice(0, maxLen);
    return v;
  }

  /* CSS colour whitelist — anything else is replaced by '' so the renderer's
     default kicks in. Used by sanitiseTrack/sanitisePerson/sanitiseCategories
     so a malicious import cannot inject CSS-attribute breakouts via .color. */
  var CSS_COLOR_RE = /^(?:|#[0-9a-fA-F]{3,8}|rgb\(\s*\d{1,3}(?:\s*,\s*\d{1,3}){2}\s*\)|rgba\(\s*\d{1,3}(?:\s*,\s*\d{1,3}){2}\s*,\s*(?:0|1|0?\.\d+)\s*\)|[a-zA-Z]{1,30})$/;
  function sanitiseColor(v) {
    if (typeof v !== 'string') return '';
    var s = v.trim();
    return CSS_COLOR_RE.test(s) ? s : '';
  }

  /* Clamp a finite number into [min,max], falling back to dflt for non-numbers
     (used by UE-4 to preserve connection width/opacity without trusting the file). */
  function clampNum(v, min, max, dflt) {
    var n = typeof v === 'number' ? v : parseFloat(v);
    if (!isFinite(n)) return dflt;
    return n < min ? min : (n > max ? max : n);
  }

  /* Non-negative integer, default 0 (UE-4: victories/draws/defeats). */
  function clampInt(v) {
    var n = typeof v === 'number' ? v : parseInt(v, 10);
    return (!isFinite(n) || n < 0) ? 0 : Math.floor(n);
  }

  /* Shallow string→string map with sanitised keys+values (UE-4: counterpartRelations). */
  function sanitiseStringMap(v) {
    var out = {};
    if (!isPlainObject(v)) return out;
    for (var k in v) {
      if (Object.prototype.hasOwnProperty.call(v, k) && typeof v[k] === 'string') {
        out[sanitiseString(k, 64)] = sanitiseString(v[k], 200);
      }
    }
    return out;
  }

  function sanitiseMediaItem(m) {
    if (!isPlainObject(m)) return null;
    return {
      type: sanitiseString(m.type, 16),
      name: sanitiseString(m.name, 200),
      src:  sanitiseUrl(m.src),
      url:  sanitiseUrl(m.url)
    };
  }

  function sanitiseMediaArray(a) {
    if (!Array.isArray(a)) return [];
    var out = [];
    for (var i = 0; i < a.length; i++) {
      var m = sanitiseMediaItem(a[i]);
      if (m) out.push(m);
    }
    return out;
  }

  /* Recursively sanitise an event (events have nested sub-events). */
  function sanitiseEvent(ev) {
    if (!isPlainObject(ev)) return null;
    var clean = {};
    for (var k in ev) {
      if (!Object.prototype.hasOwnProperty.call(ev, k)) continue;
      var v = ev[k];
      if (k === 'media') {
        clean[k] = sanitiseMediaArray(v);
      } else if (k === 'subEvents') {
        clean[k] = Array.isArray(v) ? v.map(sanitiseEvent).filter(Boolean) : [];
      } else if (k === 'characterIds' || k === 'universeIds' || k === 'counterpartIds' ||
                 k === 'placeIds' || k === 'continuityIds') {
        clean[k] = Array.isArray(v) ? v.filter(function (x) { return typeof x === 'string'; }) : [];
      } else if (k === 'tags') {
        /* Tags are a plain string array, so they used to fall through every
           branch below and get dropped — every event lost its tags on import,
           taking the tag filter bar with them. Keep them, bounded and trimmed. */
        clean[k] = Array.isArray(v)
          ? v.filter(function (x) { return typeof x === 'string'; })
              .slice(0, 100)
              .map(function (x) { return sanitiseString(x, 100); })
          : [];
      } else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v === null) {
        clean[k] = v;
      } else if (isPlainObject(v)) {
        /* counterpartRelations etc. — shallow copy of own properties */
        var inner = {};
        for (var ik in v) {
          if (Object.prototype.hasOwnProperty.call(v, ik) &&
              (typeof v[ik] === 'string' || typeof v[ik] === 'number' || typeof v[ik] === 'boolean')) {
            inner[ik] = v[ik];
          }
        }
        clean[k] = inner;
      }
      /* anything else (functions, arrays of arrays etc.) — dropped */
    }
    return clean;
  }

  function sanitiseTrack(t) {
    if (!isPlainObject(t)) return null;
    return {
      id: sanitiseString(t.id, 64),
      name: sanitiseString(t.name, 200),
      color: sanitiseColor(t.color),
      visible: t.visible !== false,
      description: sanitiseString(t.description, 4000),
      notes: sanitiseString(t.notes, 8000),
      dimmed: !!t.dimmed,
      birthDate: typeof t.birthDate === 'string' ? sanitiseString(t.birthDate, 32) : null
    };
  }

  function sanitisePerson(p) {
    if (!isPlainObject(p)) return null;
    var clean = {
      id: sanitiseString(p.id, 64),
      name: sanitiseString(p.name, 200),
      aliases: sanitiseString(p.aliases, 400),
      status: sanitiseString(p.status, 64),
      alignment: sanitiseString(p.alignment, 64),
      species: sanitiseString(p.species, 64),
      color: sanitiseColor(p.color),
      photo: sanitiseUrl(p.photo),
      birthDate: sanitiseString(p.birthDate, 32),
      occupation: sanitiseString(p.occupation, 200),
      affiliation: sanitiseString(p.affiliation, 200),
      locations: sanitiseString(p.locations, 400),
      powers: sanitiseString(p.powers, 4000),
      biography: sanitiseString(p.biography, 16000),
      notes: sanitiseString(p.notes, 8000),
      relationshipNotes: sanitiseString(p.relationshipNotes, 8000),
      yearsKnown: typeof p.yearsKnown === 'number' ? p.yearsKnown : 0,
      howWeMet: sanitiseString(p.howWeMet, 400),
      media: sanitiseMediaArray(p.media),
      universeIds: Array.isArray(p.universeIds)
        ? p.universeIds.filter(function (x) { return typeof x === 'string'; })
        : [],
      /* UE-4: preserve cross-universe counterpart links + battle record on
         round-trip. These were dropped, deleting every character's counterpart
         relationships and win/draw/loss record on import. */
      counterpartIds: Array.isArray(p.counterpartIds)
        ? p.counterpartIds.filter(function (x) { return typeof x === 'string'; })
        : [],
      counterpartRelations: sanitiseStringMap(p.counterpartRelations),
      victories: clampInt(p.victories),
      draws: clampInt(p.draws),
      defeats: clampInt(p.defeats),
      /* WS3: places this person is linked to */
      placeIds: Array.isArray(p.placeIds)
        ? p.placeIds.filter(function (x) { return typeof x === 'string'; })
        : []
    };
    return clean;
  }

  /* WS3: a Place — user-defined location, optionally pinned on the custom map.
     pin coordinates are normalized to the map image (0..1 both axes). */
  function sanitisePlace(pl) {
    if (!isPlainObject(pl)) return null;
    var pin = null;
    if (isPlainObject(pl.pin)) {
      pin = {
        x: clampNum(pl.pin.x, 0, 1, 0.5),
        y: clampNum(pl.pin.y, 0, 1, 0.5)
      };
    }
    return {
      id: sanitiseString(pl.id, 64),
      name: sanitiseString(pl.name, 200),
      description: sanitiseString(pl.description, 4000),
      parentId: sanitiseString(pl.parentId, 64),
      /* nested maps: which map in the tree this place is pinned on ('' ⇒ root) */
      mapId: sanitiseString(pl.mapId, 64),
      color: sanitiseColor(pl.color),
      icon: sanitiseString(pl.icon, 8),
      /* P2: cartographic symbol id + its display scale */
      symbol: sanitiseString(pl.symbol, 32),
      symSize: clampNum(pl.symSize, 0.5, 2, 1),
      pin: pin
    };
  }

  /* Nested maps: one node of the map tree (world → region → city). */
  function sanitiseMapNode(m) {
    if (!isPlainObject(m)) return null;
    var mm = isPlainObject(m.mapMeta) ? {
      has: !!m.mapMeta.has,
      w: clampNum(m.mapMeta.w, 0, 20000, 0),
      h: clampNum(m.mapMeta.h, 0, 20000, 0),
      name: sanitiseString(m.mapMeta.name, 200)
    } : { has: false, w: 0, h: 0, name: '' };
    var id = sanitiseString(m.id, 64);
    if (!id) return null;
    var out = {
      id: id,
      name: sanitiseString(m.name, 200),
      parentMapId: m.parentMapId == null ? null : (sanitiseString(m.parentMapId, 64) || null),
      anchorPlaceId: m.anchorPlaceId == null ? null : (sanitiseString(m.anchorPlaceId, 64) || null),
      mapMeta: mm
    };
    /* universe maps: the node's scale on the universe→city ladder (optional) */
    var SCALES = ['universe', 'galaxy', 'system', 'planet', 'world', 'region', 'city'];
    if (SCALES.indexOf(m.scale) !== -1) out.scale = m.scale;
    return out;
  }
  function sanitiseMaps(a) {
    if (!Array.isArray(a)) return null;
    var out = a.slice(0, 400).map(sanitiseMapNode).filter(Boolean);
    return out.length ? out : null;
  }
  /* Nested maps: the per-map images embedded in an export ([{mapId,dataUrl}]). */
  function sanitiseMapImages(a) {
    if (!Array.isArray(a)) return [];
    return a.slice(0, 400).map(function (it) {
      if (!isPlainObject(it)) return null;
      var du = sanitiseUrl(it.dataUrl);
      if (!du) return null;
      return { mapId: sanitiseString(it.mapId, 64) || 'root', dataUrl: du };
    }).filter(Boolean);
  }

  /* WS4: a Continuity — one named chronology/theory (e.g. "Canon", "Anthology
     theory"). Events with empty continuityIds are shared across all of them. */
  function sanitiseContinuity(c) {
    if (!isPlainObject(c)) return null;
    return {
      id: sanitiseString(c.id, 64),
      name: sanitiseString(c.name, 200),
      color: sanitiseColor(c.color),
      notes: sanitiseString(c.notes, 4000)
    };
  }

  function sanitiseConnection(c) {
    if (!isPlainObject(c)) return null;
    return {
      id: sanitiseString(c.id, 64),
      fromEventId: sanitiseString(c.fromEventId, 64),
      toEventId: sanitiseString(c.toEventId, 64),
      label: sanitiseString(c.label, 200),
      /* UE-4: preserve connection styling on round-trip. These were dropped, so
         every connection's custom look reset to defaults on import. */
      color: sanitiseColor(c.color),
      width: clampNum(c.width, 0.5, 20, 1.5),
      opacity: clampNum(c.opacity, 0, 1, 0.42),
      dashed: !!c.dashed,
      presetId: sanitiseString(c.presetId, 64)
    };
  }

  function sanitiseCategories(obj) {
    if (!isPlainObject(obj)) return {};
    var out = {};
    for (var k in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
      var v = obj[k];
      if (!isPlainObject(v)) continue;
      out[sanitiseString(k, 100)] = {
        color: sanitiseColor(v.color),
        icon: sanitiseString(v.icon, 8)
      };
    }
    return out;
  }

  function sanitiseAffiliations(a) {
    if (!Array.isArray(a)) return [];
    return a.filter(function (x) { return typeof x === 'string'; })
            .map(function (x) { return sanitiseString(x, 200); });
  }

  /* Map-paint P1: the editable terrain grid {w,h,cells:[ints]}. Conservative —
     bounded dimensions, a total-cell cap, and every cell clamped to a small
     terrain-id range so a malicious file cannot smuggle huge/odd payloads. */
  function sanitisePaintGrid(g) {
    if (!isPlainObject(g) || !Array.isArray(g.cells)) return null;
    var w = clampNum(g.w, 1, 4096, 0) | 0;
    var h = clampNum(g.h, 1, 4096, 0) | 0;
    if (!w || !h || w * h > 200000 || g.cells.length !== w * h) return null;
    var cells = g.cells.map(function (v) { var n = v | 0; return (n >= 0 && n <= 15) ? n : 0; });
    return { w: w, h: h, cells: cells };
  }

  /* Map political layer: a country-id grid + the country list. Country ids can
     exceed the terrain range, so this clamps to a larger id bound. */
  function sanitisePolGrid(g) {
    if (!isPlainObject(g) || !Array.isArray(g.cells)) return null;
    var w = clampNum(g.w, 1, 4096, 0) | 0, h = clampNum(g.h, 1, 4096, 0) | 0;
    if (!w || !h || w * h > 200000 || g.cells.length !== w * h) return null;
    var cells = g.cells.map(function (v) { var n = v | 0; return (n >= 0 && n <= 4095) ? n : 0; });
    return { w: w, h: h, cells: cells };
  }
  function sanitiseCountries(a) {
    if (!Array.isArray(a)) return [];
    return a.filter(isPlainObject).map(function (c) {
      return { id: clampNum(c.id, 0, 100000, 0) | 0, name: sanitiseString(c.name, 60), color: sanitiseColor(c.color) };
    }).slice(0, 400);
  }

  /* Map epochs: snapshots of the map through time (each its own paint + political grid). */
  function sanitiseEpochs(a) {
    if (!Array.isArray(a)) return [];
    return a.filter(isPlainObject).map(function (e) {
      return {
        id: clampNum(e.id, 0, 100000, 0) | 0,
        year: sanitiseString(e.year, 40),
        label: sanitiseString(e.label, 40),
        paintGrid: sanitisePaintGrid(e.paintGrid),
        polGrid: sanitisePolGrid(e.polGrid),
        countries: sanitiseCountries(e.countries)
      };
    }).slice(0, 60);
  }

  /* Top-level entry point. */
  window.ftValidateImport = function (d, opts) {
    opts = opts || {};
    var kind = opts.kind === 'biography' ? 'biography' : 'universe';

    if (!isPlainObject(d)) {
      throw new Error('Imported data is not a valid timeline object.');
    }

    /* Track collection: Universe = universes, Biography = lifeTracks (with
       universes fallback for legacy biography exports). */
    var tracksKey = kind === 'biography' ? 'lifeTracks' : 'universes';
    var tracksRaw = d[tracksKey];
    if (!Array.isArray(tracksRaw) && kind === 'biography' && Array.isArray(d.universes)) {
      tracksRaw = d.universes; // legacy
    }

    var peopleKey = kind === 'biography' ? 'people' : 'characters';
    var peopleRaw = d[peopleKey];
    if (!Array.isArray(peopleRaw) && kind === 'biography' && Array.isArray(d.characters)) {
      peopleRaw = d.characters; // legacy
    }

    var clean = {};
    clean[tracksKey] = (tracksRaw || []).map(sanitiseTrack).filter(Boolean);
    clean.events = (Array.isArray(d.events) ? d.events : []).map(sanitiseEvent).filter(Boolean);
    clean.connections = (Array.isArray(d.connections) ? d.connections : []).map(sanitiseConnection).filter(Boolean);
    clean[peopleKey] = (peopleRaw || []).map(sanitisePerson).filter(Boolean);
    clean.categories = sanitiseCategories(d.categories);
    clean.affiliations = sanitiseAffiliations(d.affiliations);
    /* WS3: places + custom map image (dataURL must pass the data:image whitelist) */
    clean.places = (Array.isArray(d.places) ? d.places : []).map(sanitisePlace).filter(Boolean);
    clean.mapImage = sanitiseUrl(d.mapImage);
    /* nested maps: the tree of maps + which one is open + every map's embedded image */
    clean.maps = sanitiseMaps(d.maps);
    clean.currentMapId = sanitiseString(d.currentMapId, 64) || 'root';
    clean.mapImages = sanitiseMapImages(d.mapImages);
    /* Map sketch icons: free-drawn icons placed over the map. Preserve them on
       round-trip — they were dropped, wiping every hand-placed icon on import.
       mapSketchIcons = flat array; mapSketchIconsByMap = { mapKey: [icons] }. */
    clean.mapSketchIcons = Array.isArray(d.mapSketchIcons) ? d.mapSketchIcons.filter(isPlainObject) : undefined;
    clean.mapSketchIconsByMap = (function () {
      if (!isPlainObject(d.mapSketchIconsByMap)) return undefined;
      var out = {};
      for (var k in d.mapSketchIconsByMap) {
        if (!Object.prototype.hasOwnProperty.call(d.mapSketchIconsByMap, k)) continue;
        var v = d.mapSketchIconsByMap[k];
        if (Array.isArray(v)) out[sanitiseString(k, 64)] = v.filter(isPlainObject);
      }
      return out;
    })();
    clean.mapMeta = isPlainObject(d.mapMeta) ? {
      has: !!d.mapMeta.has,
      w: clampNum(d.mapMeta.w, 0, 20000, 0),
      h: clampNum(d.mapMeta.h, 0, 20000, 0),
      name: sanitiseString(d.mapMeta.name, 200)
    } : { has: false, w: 0, h: 0, name: '' };
    /* Map-paint P1: preserve the editable terrain grid on round-trip */
    clean.mapPaintGrid = sanitisePaintGrid(d.mapPaintGrid);
    clean.mapPoliticalGrid = sanitisePolGrid(d.mapPoliticalGrid);
    clean.mapCountries = sanitiseCountries(d.mapCountries);
    clean.mapEpochs = sanitiseEpochs(d.mapEpochs);
    clean.mapEpochIndex = clampNum(d.mapEpochIndex, 0, 60, 0) | 0;
    /* WS4: continuities/theories */
    clean.continuities = (Array.isArray(d.continuities) ? d.continuities : []).map(sanitiseContinuity).filter(Boolean);

    /* Preserve legacy flag — biography importer uses it for a notification */
    clean._wasLegacy = kind === 'biography' && (Array.isArray(d.universes) || Array.isArray(d.characters));

    return clean;
  };

  /* Convenience: size guard for the FileReader path. */
  window.ftImportSizeOK = function (rawText) {
    return typeof rawText === 'string' && rawText.length <= MAX_BYTES;
  };
  window.ftImportMaxBytes = MAX_BYTES;
})();
