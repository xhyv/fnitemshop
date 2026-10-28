/* DropBazaar - unofficial fan app. Plain JavaScript, no build tools.
   Data: https://fortnite-api.com (free). Not affiliated with Epic Games. */
(function () {
  'use strict';

  var APP_VERSION = '1.1.0';
  var API_URL = 'https://fortnite-api.com/v2/shop?language=en';
  var STORE_KEY = 'dropbazaar.shop.v2';
  var FETCH_TIMEOUT_MS = 15000;

  // Preview helpers: add ?demo to the address to use fake data,
  // ?demo=error to simulate the API being down, ?demo=empty for an empty shop.
  var DEMO = (function () {
    var m = /[?&]demo(?:=([^&]*))?/.exec(location.search);
    return m ? (m[1] || 'on') : '';
  })();

  /* ---------------------------------------------------------------
     Small helpers
  --------------------------------------------------------------- */
  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function safeUrl(u) {
    if (typeof u !== 'string') return '';
    if (/^https:\/\//i.test(u) || /^data:image\//i.test(u)) return u;
    return '';
  }

  function fmtPrice(n) {
    return Number(n).toLocaleString('en-US');
  }

  function fmtDate(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function timeAgo(ts) {
    var s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 60) return 'just now';
    var m = Math.round(s / 60);
    if (m < 60) return m + ' min ago';
    var h = Math.round(m / 60);
    if (h < 48) return h + ' h ago';
    return Math.round(h / 24) + ' days ago';
  }

  var toastTimer;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2400);
  }

  /* ---------------------------------------------------------------
     Rarity
  --------------------------------------------------------------- */
  var RARITY_ORDER = { common: 0, uncommon: 1, rare: 2, epic: 3, series: 3.5, legendary: 4, mythic: 5, transcendent: 6, special: 0.5 };
  var SERIES_KEYS = ['marvel', 'dc', 'star wars', 'icon', 'dark', 'gaming', 'lava', 'frozen', 'slurp', 'shadow'];
  var SERIES_CLASS = { 'star wars': 'starwars' };

  function rarityOf(item) {
    // Returns { key (css class suffix), label }
    var seriesName = '';
    if (item && item.series) seriesName = String(item.series.value || item.series.displayValue || '');
    var lower = seriesName.toLowerCase();
    for (var i = 0; i < SERIES_KEYS.length; i++) {
      if (new RegExp('\\b' + SERIES_KEYS[i] + '\\b').test(lower)) {
        return { key: SERIES_CLASS[SERIES_KEYS[i]] || SERIES_KEYS[i], label: seriesName, rank: RARITY_ORDER.series };
      }
    }
    if (seriesName) return { key: 'gaming', label: seriesName, rank: RARITY_ORDER.series };

    var r = item && item.rarity;
    var val = String((r && r.value) || '').toLowerCase();
    if (RARITY_ORDER.hasOwnProperty(val) && val !== 'series' && val !== 'special') {
      return { key: val, label: (r && r.displayValue) || (val.charAt(0).toUpperCase() + val.slice(1)), rank: RARITY_ORDER[val] };
    }
    return { key: 'special', label: (r && r.displayValue) || 'Special', rank: RARITY_ORDER.special };
  }

  /* ---------------------------------------------------------------
     Turn the API response into a small, easy structure
  --------------------------------------------------------------- */
  function pickImage(images) {
    if (!images) return '';
    return safeUrl(images.icon) || safeUrl(images.large) || safeUrl(images.featured) ||
           safeUrl(images.smallIcon) || safeUrl(images.small) || safeUrl(images.albumArt) || '';
  }

  function displayAssetImage(entry) {
    var a = entry.newDisplayAsset;
    if (!a) return '';
    var u = '';
    if (a.materialInstances && a.materialInstances.length) {
      var imgs = a.materialInstances[0].images || {};
      u = safeUrl(imgs.OfferImage);
      if (u) return u;
    }
    if (a.renderImages && a.renderImages.length) {
      u = safeUrl(a.renderImages[0].image);
      if (u) return u;
    }
    if (a.materialInstances && a.materialInstances.length) {
      var im2 = a.materialInstances[0].images || {};
      u = safeUrl(im2.Background);
      if (u) return u;
      var keys = Object.keys(im2);
      for (var i = 0; i < keys.length; i++) { if (safeUrl(im2[keys[i]])) return im2[keys[i]]; }
    }
    return '';
  }

  // Card colours from the API (dark -> light), or null so the rarity colours are used
  function parseHex(c) {
    if (typeof c !== 'string') return null;
    c = c.replace('#', '');
    if (/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(c)) return '#' + c.slice(0, 6).toLowerCase();
    return null;
  }
  function lum(h) {
    var r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16);
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }
  function entryGradient(entry) {
    var c = entry.colors;
    if (!c) return null;
    var arr = [c.color1, c.color2, c.color3].map(parseHex).filter(Boolean);
    if (arr.length < 2) return null;
    arr.sort(function (a, b) { return lum(a) - lum(b); });
    var dark = arr[0], light = arr[arr.length - 1];
    var mid = arr.length > 2 ? arr[1] : light;
    if (lum(light) < 45 || lum(dark) > 190) return null; // too dark or too washed out
    return [dark, mid, light];
  }

  function capitalize(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }

  function collectItems(entry) {
    var out = [];
    (entry.brItems || []).forEach(function (b) {
      var r = rarityOf(b);
      out.push({
        n: b.name || 'Item',
        d: b.description || '',
        t: (b.type && (b.type.displayValue || capitalize(b.type.value))) || 'Item',
        rk: r.key, rl: r.label, rr: r.rank,
        img: pickImage(b.images),
        fe: safeUrl(b.images && b.images.featured)
      });
    });
    (entry.tracks || []).forEach(function (t) {
      out.push({ n: t.title || t.devName || 'Jam Track', d: t.artist ? 'By ' + t.artist : '', t: 'Jam Track', rk: 'special', rl: 'Special', rr: RARITY_ORDER.special, img: safeUrl(t.albumArt) });
    });
    (entry.instruments || []).forEach(function (i) {
      var r = rarityOf(i);
      out.push({ n: i.name || 'Instrument', d: i.description || '', t: 'Instrument', rk: r.key, rl: r.label, rr: r.rank, img: pickImage(i.images) });
    });
    (entry.cars || []).forEach(function (c) {
      var r = rarityOf(c);
      out.push({ n: c.name || 'Car', d: c.description || '', t: 'Car', rk: r.key, rl: r.label, rr: r.rank, img: pickImage(c.images) });
    });
    (entry.legoKits || []).forEach(function (k) {
      var r = rarityOf(k);
      out.push({ n: k.name || 'LEGO Kit', d: k.description || '', t: 'LEGO Kit', rk: r.key, rl: r.label, rr: r.rank, img: pickImage(k.images) });
    });
    return out;
  }

  function normalize(json) {
    var d = json && json.data;
    if (!d) throw new Error('Unexpected response');
    var entries = Array.isArray(d.entries) ? d.entries : [];
    var sectionMap = {};
    var sectionList = [];

    entries.forEach(function (entry, pos) {
      var items = collectItems(entry);
      var bundle = entry.bundle && (entry.bundle.name || entry.bundle.image) ? {
        name: entry.bundle.name || 'Bundle',
        info: entry.bundle.info || '',
        image: safeUrl(entry.bundle.image)
      } : null;
      if (!items.length && !bundle) return;

      // main item = the rarest one
      var main = items[0] || { n: bundle.name, d: '', t: 'Bundle', rk: 'special', rl: 'Special', rr: 0, img: '' };
      items.forEach(function (it) { if (it.rr > main.rr) main = it; });

      var name;
      if (bundle) name = bundle.name;
      else if (items.length === 1) name = items[0].n;
      else name = items[0].n + ' +' + (items.length - 1);

      // Card picture: the shop's own display render if it has one, else the best item picture
      var da = displayAssetImage(entry);
      var img, fit;
      if (da) { img = da; fit = 'da'; }
      else if (!bundle && items.length === 1 && items[0].fe) { img = items[0].fe; fit = 'fe'; }
      else if (bundle && bundle.image) { img = bundle.image; fit = 'bi'; }
      else { img = (items[0] && items[0].img) || ''; fit = 'ic'; }
      // Bigger picture for the detail view
      var det = (!bundle && items.length === 1 && (items[0].fe || items[0].img)) || img;

      var sizeMatch = /Size_(\d+)_x_(\d+)/i.exec(String(entry.tileSize || ''));
      var tileW = sizeMatch ? Number(sizeMatch[1]) : 1;

      var types = [];
      var rars = [];
      items.forEach(function (it) {
        if (types.indexOf(it.t) < 0) types.push(it.t);
        if (rars.indexOf(it.rl) < 0) rars.push(it.rl);
      });
      if (bundle && types.indexOf('Bundle') < 0) types.unshift('Bundle');

      var finalPrice = Number(entry.finalPrice);
      var regularPrice = Number(entry.regularPrice);
      if (!isFinite(finalPrice)) finalPrice = isFinite(regularPrice) ? regularPrice : 0;
      if (!isFinite(regularPrice)) regularPrice = finalPrice;

      var layout = entry.layout || {};
      var secName = layout.name || 'Featured';
      var secId = layout.id || secName;
      var sec = sectionMap[secId];
      if (!sec) {
        sec = sectionMap[secId] = {
          id: secId, name: secName,
          index: typeof layout.index === 'number' ? layout.index : 9999 + sectionList.length,
          order: sectionList.length, items: []
        };
        sectionList.push(sec);
      }

      var bannerText = entry.banner && entry.banner.value ? String(entry.banner.value) : '';

      sec.items.push({
        n: name,
        d: (bundle && bundle.info) || main.d || '',
        ty: bundle ? 'Bundle' : main.t,
        types: types,
        rk: main.rk, rl: main.rl,
        rars: rars,
        p: finalPrice, rp: regularPrice,
        img: img, fit: fit, det: det,
        g: entryGradient(entry),
        bundle: bundle,
        items: items,
        wide: (!!bundle && items.length > 1) || tileW >= 2,
        xwide: !!bundle && items.length >= 4,
        tag: bannerText,
        inn: entry.inDate || '',
        out: entry.outDate || ''
      });
    });

    sectionList.sort(function (a, b) { return (a.index - b.index) || (a.order - b.order); });
    var count = 0;
    sectionList.forEach(function (s, si) {
      s.items.forEach(function (it, ii) { it.uid = si + '-' + ii; count++; });
    });

    return {
      v: 1,
      date: d.date || '',
      hash: d.hash || '',
      vbuck: safeUrl(d.vbuckIcon),
      fetchedAt: Date.now(),
      count: count,
      sections: sectionList
    };
  }

  function prepare(shop) {
    // Build lowercase search text + lookup table (not saved to disk)
    var byUid = {};
    shop.sections.forEach(function (s) {
      s.items.forEach(function (it) {
        byUid[it.uid] = it;
        it._hay = (it.n + ' ' + it.ty + ' ' + (it.bundle ? it.bundle.name : '') + ' ' +
          it.items.map(function (x) { return x.n + ' ' + x.t; }).join(' ') + ' ' + it.rars.join(' ')).toLowerCase();
      });
    });
    shop._byUid = byUid;
    return shop;
  }

  /* ---------------------------------------------------------------
     Fetching + saving
  --------------------------------------------------------------- */
  function fetchShop() {
    if (DEMO) return demoFetch();
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, FETCH_TIMEOUT_MS);
    return fetch(API_URL, { signal: ctrl.signal, cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (json) { return normalize(json); })
      .then(function (s) { clearTimeout(timer); return s; }, function (e) { clearTimeout(timer); throw e; });
  }

  function saveShop(shop) {
    try {
      var copy = JSON.parse(JSON.stringify(shop, function (k, v) { return k.charAt(0) === '_' ? undefined : v; }));
      localStorage.setItem(STORE_KEY, JSON.stringify(copy));
    } catch (e) { /* storage full or blocked - app still works */ }
  }

  function loadSaved() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || s.v !== 1 || !Array.isArray(s.sections) || !s.count) return null;
      return prepare(s);
    } catch (e) { return null; }
  }

  /* ---------------------------------------------------------------
     State
  --------------------------------------------------------------- */
  var state = {
    shop: null,
    shownFromSaved: false,
    loading: false,
    q: '',
    type: '',
    rarity: ''
  };

  /* ---------------------------------------------------------------
     Rendering
  --------------------------------------------------------------- */
  function vbIcon(shop) {
    if (shop && shop.vbuck) return '<img class="vb" src="' + esc(shop.vbuck) + '" alt="V-Bucks" decoding="async">';
    return '<span class="vb-fallback" aria-label="V-Bucks">V</span>';
  }

  function priceHtml(it, shop) {
    if (!it.p) return '<span class="price">Free</span>';
    var old = it.rp > it.p ? '<span class="old">' + fmtPrice(it.rp) + '</span>' : '';
    return '<span class="price">' + vbIcon(shop) + fmtPrice(it.p) + old + '</span>';
  }

  function gradStyle(g) {
    return g ? ' style="--g1:' + g[0] + ';--g2:' + g[1] + ';--g3:' + g[2] + '"' : '';
  }

  function cardHtml(it, shop) {
    var tags = '';
    if (it.tag) tags += '<span class="tag">' + esc(/^new$/i.test(it.tag) ? 'NEW!' : it.tag) + '</span>';
    if (it.rp > it.p && it.p > 0) tags += '<span class="tag off">' + fmtPrice(it.rp - it.p) + ' V-Bucks off</span>';
    var img = it.img ? '<img class="fit-' + esc(it.fit) + '" loading="lazy" decoding="async" alt="" src="' + esc(it.img) + '">' : '';
    return '<button class="card r-' + esc(it.rk) + (it.wide ? ' wide' : '') + (it.xwide ? ' xwide' : '') + '"' +
      gradStyle(it.g) + ' data-uid="' + esc(it.uid) + '"><div class="card-in">' +
      '<div class="art"><span class="ph"></span>' + img + '</div>' +
      '<div class="cinfo">' + (tags ? '<div class="tags">' + tags + '</div>' : '') +
      '<div class="name">' + esc(it.n) + '</div><div class="price-row">' + priceHtml(it, shop) + '</div></div>' +
      '<div class="strip"><i></i>' + esc(it.ty) + ' &middot; ' + esc(it.rl) + '</div>' +
      '</div></button>';
  }

  function matches(it) {
    if (state.type && it.types.indexOf(state.type) < 0) return false;
    if (state.rarity && it.rars.indexOf(state.rarity) < 0) return false;
    if (state.q) {
      var words = state.q.split(/\s+/);
      for (var i = 0; i < words.length; i++) { if (words[i] && it._hay.indexOf(words[i]) < 0) return false; }
    }
    return true;
  }

  function renderShop() {
    var el = $('shop');
    var shop = state.shop;
    if (!shop) return;
    var html = '';
    var shown = 0;
    shop.sections.forEach(function (sec) {
      var list = sec.items.filter(matches);
      if (!list.length) return;
      shown += list.length;
      html += '<section class="section" id="sec-' + esc(String(sec.order)) + '" data-name="' + esc(sec.name) + '">' +
        '<div class="section-head"><h2>' + esc(sec.name) + '</h2></div><div class="grid">' +
        list.map(function (it) { return cardHtml(it, shop); }).join('') + '</div></section>';
    });
    if (!shown) {
      html = '<div class="empty"><div class="big">🔍</div><h3>Nothing found</h3><p>No items match your search or filters.</p>' +
        '<button class="btn" id="clearFromEmpty">Clear filters</button></div>';
    }
    el.innerHTML = html;
    $('resetFilters').hidden = !(state.q || state.type || state.rarity);
    renderMeta();
    renderRail();
  }

  /* Side rail: one dot per section, the current one is highlighted */
  var railObserver = null;
  function renderRail() {
    var rail = $('rail'), dots = $('railDots');
    var secs = document.querySelectorAll('#shop .section');
    if (secs.length < 2) { rail.hidden = true; return; }
    rail.hidden = false;
    var h = '';
    secs.forEach(function (s) {
      h += '<button class="dot" data-target="' + esc(s.id) + '" title="' + esc(s.getAttribute('data-name')) +
        '" aria-label="' + esc(s.getAttribute('data-name')) + '"></button>';
    });
    dots.innerHTML = h;
    if (railObserver) railObserver.disconnect();
    if (!('IntersectionObserver' in window)) return;
    railObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        dots.querySelectorAll('.dot').forEach(function (d) {
          var on = d.getAttribute('data-target') === en.target.id;
          d.classList.toggle('active', on);
          if (on && d.scrollIntoView && dots.scrollHeight > dots.clientHeight) {
            dots.scrollTop = d.offsetTop - dots.clientHeight / 2;
          }
        });
      });
    }, { rootMargin: '-25% 0px -65% 0px' });
    secs.forEach(function (s) { railObserver.observe(s); });
  }

  function renderMeta() {
    var shop = state.shop;
    var m = $('meta');
    if (!shop) { m.textContent = ''; return; }
    var parts = [shop.count + ' offers'];
    if (shop.date) parts.push('shop of ' + String(shop.date).slice(0, 10));
    parts.push((state.shownFromSaved ? 'saved ' : 'updated ') + timeAgo(shop.fetchedAt));
    m.textContent = parts.join(' · ');
    $('aboutUpdated').textContent = new Date(shop.fetchedAt).toLocaleString();
  }

  function renderSkeleton() {
    var s = '';
    for (var i = 0; i < 6; i++) s += '<div class="skel"></div>';
    $('shop').innerHTML = '<section class="section"><div class="grid">' + s + '</div></section>';
    $('rail').hidden = true;
  }

  function renderProblem(icon, title, text) {
    $('shop').innerHTML = '<div class="empty"><div class="big">' + icon + '</div><h3>' + esc(title) + '</h3><p>' +
      esc(text) + '</p><button class="btn" id="retryBtn">Try again</button></div>';
  }

  function buildFilters() {
    var shop = state.shop;
    if (!shop) return;
    var typeCount = {};
    var rarMap = {};
    shop.sections.forEach(function (s) {
      s.items.forEach(function (it) {
        it.types.forEach(function (t) { typeCount[t] = (typeCount[t] || 0) + 1; });
        it.items.forEach(function (x) { if (!(x.rl in rarMap)) rarMap[x.rl] = x.rr; });
      });
    });
    var types = Object.keys(typeCount).sort(function (a, b) { return typeCount[b] - typeCount[a] || (a < b ? -1 : 1); });
    var rars = Object.keys(rarMap).sort(function (a, b) { return rarMap[a] - rarMap[b]; });

    var tSel = $('typeFilter'), rSel = $('rarityFilter');
    tSel.innerHTML = '<option value="">All types</option>' + types.map(function (t) {
      return '<option value="' + esc(t) + '">' + esc(t) + ' (' + typeCount[t] + ')</option>';
    }).join('');
    rSel.innerHTML = '<option value="">All rarities</option>' + rars.map(function (r) {
      return '<option value="' + esc(r) + '">' + esc(r) + '</option>';
    }).join('');
    if (types.indexOf(state.type) < 0) state.type = '';
    if (rars.indexOf(state.rarity) < 0) state.rarity = '';
    tSel.value = state.type;
    rSel.value = state.rarity;
  }

  /* ---------------------------------------------------------------
     Banner (friendly messages)
  --------------------------------------------------------------- */
  function showBanner(html, kind) {
    var b = $('banner');
    b.className = 'banner' + (kind ? ' ' + kind : '');
    b.innerHTML = html;
    b.hidden = false;
  }
  function hideBanner() { $('banner').hidden = true; }

  /* ---------------------------------------------------------------
     Refresh logic
  --------------------------------------------------------------- */
  function setSpinning(on) {
    $('refreshBtn').classList.toggle('spin', on);
  }

  function refresh(manual) {
    if (state.loading) return Promise.resolve(false);
    state.loading = true;
    setSpinning(true);
    var hadShop = !!state.shop;
    if (!hadShop) renderSkeleton();

    return fetchShop().then(function (fresh) {
      if (!fresh.count) {
        if (hadShop) {
          showBanner('The shop came back empty. This can happen right around the daily reset. Showing the last saved shop. <button data-act="retry">Try again</button>');
        } else {
          renderProblem('🛒', 'The shop is empty right now', 'This can happen right around the daily reset at 00:00 UTC. Please try again in a few minutes.');
        }
        return false;
      }
      var changed = !state.shop || state.shop.hash !== fresh.hash;
      state.shop = prepare(fresh);
      state.shownFromSaved = false;
      saveShop(fresh);
      hideBanner();
      buildFilters();
      renderShop();
      if (manual) toast(changed ? 'Shop updated' : 'Already up to date');
      return true;
    }).catch(function (err) {
      var offline = navigator.onLine === false;
      var why = offline ? "You're offline." : "The Fortnite shop service isn't responding right now.";
      if (state.shop) {
        state.shownFromSaved = true;
        showBanner(why + ' Showing the shop saved ' + timeAgo(state.shop.fetchedAt) + '. <button data-act="retry">Try again</button>');
        renderMeta();
      } else {
        renderProblem('📡', offline ? "You're offline" : "Can't reach the shop",
          why + ' There is no saved shop on this device yet, so please connect and try again.');
      }
      return false;
    }).then(function (ok) {
      state.loading = false;
      setSpinning(false);
      return ok;
    });
  }

  /* ---------------------------------------------------------------
     Countdown to 00:00 UTC + auto refresh after reset
  --------------------------------------------------------------- */
  var lastDiff = null;
  function nextResetMs() {
    var n = new Date();
    return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1);
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function tick() {
    var diff = Math.max(0, nextResetMs() - Date.now());
    var s = Math.floor(diff / 1000);
    $('countdown').textContent = pad(Math.floor(s / 3600)) + ':' + pad(Math.floor((s % 3600) / 60)) + ':' + pad(s % 60);
    if (lastDiff !== null && diff > lastDiff + 5000) pollAfterReset(0); // we just crossed midnight UTC
    lastDiff = diff;
  }

  var pollTimer;
  function pollAfterReset(n) {
    clearTimeout(pollTimer);
    var oldHash = state.shop ? state.shop.hash : '';
    pollTimer = setTimeout(function () {
      refresh(false).then(function (ok) {
        var same = state.shop && state.shop.hash === oldHash;
        if ((!ok || same) && n < 12) pollAfterReset(n + 1);
      });
    }, n === 0 ? 20000 : 45000);
  }

  function maybeRefreshOnReturn() {
    if (!state.shop) { refresh(false); return; }
    var age = Date.now() - state.shop.fetchedAt;
    var fetchedDay = new Date(state.shop.fetchedAt).toISOString().slice(0, 10);
    var today = new Date().toISOString().slice(0, 10);
    if (age > 5 * 60 * 1000 || fetchedDay !== today) refresh(false);
  }

  /* ---------------------------------------------------------------
     Detail sheet + About sheet
  --------------------------------------------------------------- */
  function openSheet(id) {
    $(id).hidden = false;
    document.body.classList.add('locked');
  }
  function closeSheets() {
    $('sheet').hidden = true;
    $('about').hidden = true;
    document.body.classList.remove('locked');
  }

  function showDetail(uid) {
    var it = state.shop && state.shop._byUid[uid];
    if (!it) return;
    var shop = state.shop;
    var body = $('sheetContent');
    var cover = it.fit === 'da' || it.fit === 'bi' ? (it.det === it.img) : false;
    var contents = '';
    if (it.items.length > 1) {
      contents = '<div class="d-sec"><h4>Includes (' + it.items.length + ')</h4><div class="contents">' +
        it.items.map(function (x) {
          return '<div class="mini r-' + esc(x.rk) + '">' +
            (x.img ? '<img loading="lazy" alt="" src="' + esc(x.img) + '">' : '') +
            '<div>' + esc(x.n) + '</div></div>';
        }).join('') + '</div></div>';
    }
    var secName = '';
    shop.sections.forEach(function (s) { if (s.items.indexOf(it) >= 0) secName = s.name; });

    var old = it.rp > it.p ? '<span class="old">' + fmtPrice(it.rp) + '</span>' : '';
    var kv = '<dt>Type</dt><dd>' + esc(it.ty) + '</dd>' +
             '<dt>Rarity</dt><dd>' + esc(it.rl) + '</dd>';
    if (it.bundle) kv += '<dt>Bundle</dt><dd>' + esc(it.bundle.name) + '</dd>';
    if (secName) kv += '<dt>Shop section</dt><dd>' + esc(secName) + '</dd>';
    if (it.out) kv += '<dt>Leaves shop</dt><dd>' + esc(fmtDate(it.out)) + '</dd>';

    var desc = it.d ? '<p class="d-desc">' + esc(it.d) + '</p>' : '';
    var pic = it.det || it.img;
    body.innerHTML =
      '<div class="d-wrap r-' + esc(it.rk) + '"' + gradStyle(it.g) + '>' +
      '<div class="d-art' + (cover ? ' cover' : '') + '">' +
        (pic ? '<img alt="' + esc(it.n) + '" src="' + esc(pic) + '">' : '') + '</div>' +
      '<div class="d-main">' +
        '<h2 id="sheetTitle">' + esc(it.n) + '</h2>' +
        '<div class="d-badges"><span class="badge">' + esc(it.ty) + '</span>' +
        '<span class="badge rar-b">' + esc(it.rl) + '</span>' +
        (it.bundle ? '<span class="badge">Bundle</span>' : '') + '</div>' +
        '<div class="d-price">' + (it.p ? vbIcon(shop) + fmtPrice(it.p) + old : 'Free') + '</div>' +
        desc +
        '<dl class="kv">' + kv + '</dl>' +
      '</div>' + contents + '</div>';
    openSheet('sheet');
    $('sheet').querySelector('.sheet-body').scrollTop = 0;
  }

  /* ---------------------------------------------------------------
     Pull to refresh
  --------------------------------------------------------------- */
  function setupPullToRefresh() {
    var ptr = $('ptr'), txt = $('ptrText');
    var startY = 0, pulling = false, pull = 0, THRESH = 62;

    function reset() {
      pulling = false; pull = 0;
      ptr.classList.remove('show', 'pulling');
      ptr.style.removeProperty('--pull');
    }

    document.addEventListener('touchstart', function (e) {
      if (window.scrollY <= 0 && e.touches.length === 1 && document.body.classList.contains('locked') === false) {
        startY = e.touches[0].clientY; pulling = true; pull = 0;
      } else { pulling = false; }
    }, { passive: true });

    document.addEventListener('touchmove', function (e) {
      if (!pulling) return;
      var dy = e.touches[0].clientY - startY;
      if (dy > 0 && window.scrollY <= 0) {
        pull = Math.min(dy * 0.5, 96);
        ptr.classList.add('show', 'pulling');
        ptr.style.setProperty('--pull', pull + 'px');
        txt.textContent = pull >= THRESH ? 'Release to refresh' : 'Pull to refresh';
        if (e.cancelable) e.preventDefault();
      } else if (dy < 0) { reset(); }
    }, { passive: false });

    function end() {
      if (!pulling) return;
      var go = pull >= THRESH;
      ptr.classList.remove('pulling', 'show');
      ptr.style.removeProperty('--pull');
      pulling = false;
      if (go) {
        ptr.classList.add('loading');
        txt.textContent = 'Refreshing...';
        refresh(true).then(function () { setTimeout(function () { ptr.classList.remove('loading'); }, 250); });
      }
    }
    document.addEventListener('touchend', end);
    document.addEventListener('touchcancel', reset);
  }

  /* ---------------------------------------------------------------
     Wiring
  --------------------------------------------------------------- */
  function clearFilters() {
    state.q = ''; state.type = ''; state.rarity = '';
    $('search').value = '';
    $('typeFilter').value = '';
    $('rarityFilter').value = '';
    renderShop();
  }

  function setup() {
    $('aboutVersion').textContent = APP_VERSION;

    // image + click handling (works for cards that are added later)
    var shopEl = $('shop');
    shopEl.addEventListener('load', function (e) {
      if (e.target.tagName === 'IMG') e.target.classList.add('loaded');
    }, true);
    shopEl.addEventListener('error', function (e) {
      var t = e.target;
      if (t.tagName !== 'IMG') return;
      if (t.classList.contains('vb')) {
        var f = document.createElement('span'); f.className = 'vb-fallback'; f.textContent = 'V'; t.replaceWith(f);
      } else { t.style.display = 'none'; }
    }, true);
    shopEl.addEventListener('click', function (e) {
      var card = e.target.closest('.card');
      if (card) { showDetail(card.getAttribute('data-uid')); return; }
      if (e.target.id === 'retryBtn') refresh(true);
      if (e.target.id === 'clearFromEmpty') clearFilters();
    });
    $('sheet').addEventListener('load', function (e) {
      if (e.target.tagName === 'IMG') e.target.classList.add('loaded');
    }, true);
    $('sheet').addEventListener('error', function (e) {
      if (e.target.tagName === 'IMG' && e.target.classList.contains('vb')) {
        var f = document.createElement('span'); f.className = 'vb-fallback'; f.textContent = 'V'; e.target.replaceWith(f);
      }
    }, true);

    document.body.addEventListener('click', function (e) {
      if (e.target.hasAttribute && e.target.hasAttribute('data-close')) closeSheets();
      if (e.target.getAttribute && e.target.getAttribute('data-act') === 'retry') refresh(true);
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheets(); });

    $('refreshBtn').addEventListener('click', function () { refresh(true); });
    $('aboutBtn').addEventListener('click', function () { renderMeta(); openSheet('about'); });
    $('resetFilters').addEventListener('click', clearFilters);

    // side rail: jump to a section, or to the search box
    $('railDots').addEventListener('click', function (e) {
      var d = e.target.closest('.dot');
      if (!d) return;
      var target = document.getElementById(d.getAttribute('data-target'));
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('railFilter').addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setTimeout(function () { $('search').focus(); }, 350);
    });

    var searchTimer;
    $('search').addEventListener('input', function (e) {
      clearTimeout(searchTimer);
      var v = e.target.value;
      searchTimer = setTimeout(function () { state.q = v.trim().toLowerCase(); renderShop(); }, 120);
    });
    $('search').addEventListener('keydown', function (e) { if (e.key === 'Enter') e.target.blur(); });
    $('typeFilter').addEventListener('change', function (e) { state.type = e.target.value; renderShop(); });
    $('rarityFilter').addEventListener('change', function (e) { state.rarity = e.target.value; renderShop(); });

    $('clearData').addEventListener('click', function () {
      try { localStorage.removeItem(STORE_KEY); } catch (e) {}
      var jobs = [];
      if (window.caches) jobs.push(caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); }));
      Promise.all(jobs).then(function () {
        toast('Cleared. Reloading...');
        setTimeout(function () { location.reload(); }, 700);
      });
    });

    setupPullToRefresh();

    window.addEventListener('online', function () { refresh(false); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) maybeRefreshOnReturn(); });
    setInterval(function () { renderMeta(); }, 60000);

    tick();
    setInterval(tick, 1000);

    // show the saved shop instantly, then refresh from the internet
    var saved = loadSaved();
    if (saved) {
      state.shop = saved;
      state.shownFromSaved = true;
      buildFilters();
      renderShop();
    }
    refresh(false);

    // Service worker (makes the app work offline). Needs https or localhost.
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }
  }

  /* ---------------------------------------------------------------
     Demo data (only used with ?demo in the address bar)
  --------------------------------------------------------------- */
  function demoArt(label, hue) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(' + hue + ',75%,55%)"/><stop offset="1" stop-color="hsl(' + ((hue + 60) % 360) + ',70%,25%)"/></linearGradient></defs>' +
      '<rect width="400" height="400" fill="url(#g)"/><circle cx="200" cy="160" r="70" fill="rgba(255,255,255,.25)"/>' +
      '<rect x="110" y="240" width="180" height="90" rx="40" fill="rgba(255,255,255,.2)"/>' +
      '<text x="200" y="372" font-family="Arial" font-size="26" font-weight="700" fill="#fff" text-anchor="middle">' + label + '</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function demoItem(name, type, rarity, hue, series) {
    var o = {
      id: name.toLowerCase().replace(/\W+/g, '_'), name: name, description: 'Demo item. This is sample data used for previewing the layout.',
      type: { value: type.toLowerCase(), displayValue: type }, rarity: { value: rarity.toLowerCase(), displayValue: rarity },
      images: { icon: demoArt(name, hue), smallIcon: demoArt(name, hue), featured: null }
    };
    if (series) o.series = { value: series };
    return o;
  }

  function demoEntry(sec, secIdx, items, price, reg, bundleName) {
    return {
      regularPrice: reg || price, finalPrice: price, devName: 'demo', offerId: 'demo',
      inDate: new Date(Date.now() - 86400000).toISOString(), outDate: new Date(nextResetMs()).toISOString(),
      layout: { id: 'sec' + secIdx, name: sec, index: secIdx * 100 },
      bundle: bundleName ? { name: bundleName, info: 'Demo bundle with several items.', image: demoArt(bundleName, 200) } : null,
      brItems: items, tracks: [], instruments: [], cars: [], legoKits: [],
      colors: secIdx === 1 ? { color1: 'ff6a9bff', color2: 'a01a50ff', color3: '40001cff' } : secIdx === 2 ? { color1: 'c25be2ff', color2: '7a2a9aff', color3: '2a0a4aff' } : null,
      banner: bundleName ? { value: 'New' } : null
    };
  }

  function demoFetch() {
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        if (DEMO === 'error') { reject(new Error('demo error')); return; }
        var entries = [];
        if (DEMO !== 'empty') {
          entries = [
            demoEntry('Featured', 1, [demoItem('Nova Strike', 'Outfit', 'Legendary', 20)], 2000),
            demoEntry('Featured', 1, [demoItem('Crimson Drift', 'Outfit', 'Epic', 340)], 1500),
            demoEntry('Featured', 1, [demoItem('Hex Hero', 'Outfit', 'Epic', 300, 'Marvel Series'), demoItem('Hex Pack', 'Back Bling', 'Rare', 20), demoItem('Hex Edge', 'Harvesting Tool', 'Rare', 40)], 2800, 3200, 'Hex Hero Bundle'),
            demoEntry('Featured', 1, [demoItem('Big Pack A', 'Outfit', 'Legendary', 10), demoItem('Big Pack B', 'Back Bling', 'Epic', 60), demoItem('Big Pack C', 'Emote', 'Rare', 120), demoItem('Big Pack D', 'Glider', 'Epic', 250)], 2000, 2700, 'Big Pack Bundle'),
            demoEntry('Featured', 1, [demoItem('Moss Walker', 'Outfit', 'Uncommon', 110)], 800),
            demoEntry('Daily', 2, [demoItem('Wave Rider', 'Emote', 'Rare', 190)], 500),
            demoEntry('Daily', 2, [demoItem('Sky Skiff', 'Glider', 'Epic', 270)], 1200),
            demoEntry('Daily', 2, [demoItem('Plain Pick', 'Harvesting Tool', 'Common', 60)], 200),
            demoEntry('Daily', 2, [demoItem('Frost Wrap', 'Wrap', 'Rare', 210)], 600),
            demoEntry('Daily', 2, [demoItem('Gold Rush', 'Contrail', 'Uncommon', 50)], 300),
            demoEntry('Music', 3, [demoItem('Neon Beats', 'Music Pack', 'Rare', 280)], 200),
            demoEntry('Music', 3, [demoItem('Jelly Bop', 'Emote', 'Epic', 320)], 800)
          ];
        }
        resolve(normalize({ status: 200, data: { hash: 'demo-' + entries.length, date: new Date().toISOString(), vbuckIcon: '', entries: entries } }));
      }, 600);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})();
