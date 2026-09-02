/* ClavaMetrics — unified i18n runtime (app + marketing)
 * ---------------------------------------------------------------------------
 * Translations live in /locales/<lang>.json (flat "dotted.key": "value" maps).
 * Adding a language = drop a new JSON file + register the code in LANGS below.
 * No build step. Loaded via <script src="assets/i18n.js" defer></script>.
 *
 * DOM contracts (all optional, mix freely):
 *   data-i18n="key"            -> element.textContent = t(key)
 *   data-i18n-html="key"       -> element.innerHTML  = t(key)   (trusted markup)
 *   data-i18n-ph="key"         -> element.placeholder = t(key)
 *   data-i18n-attr="title:key;aria-label:key2"  -> arbitrary attributes
 *   data-i18n-vars='{"name":"Joaco"}'           -> interpolation vars ({name})
 *
 * Programmatic:
 *   PR_I18N.t("key", { name:"Joaco", count:3 })
 *   PR_I18N.setLang("es")           // persists (local + cloud hook)
 *   PR_I18N.current                 // "es"
 *   PR_I18N.ready.then(() => ...)   // resolves once first locale is applied
 *   document.addEventListener("pr:langchanged", e => e.detail.lang)
 *
 * Detection priority (first hit wins):
 *   1. explicit user choice   -> localStorage "pr_lang"  (set via setLang)
 *   2. cloud user preference  -> PR_I18N.setUserPref(lang) from profiles.settings.language
 *   3. club country           -> PR_I18N.setCountry("BR") -> country->lang map
 *   4. IP geolocation         -> PR_I18N.setGeoCountry("AR")  (from an edge fn header)
 *   5. navigator.languages
 *   6. fallback: "en"
 * Signals 2–4 are supplied by the app after auth; they only apply while the
 * visitor has NOT made an explicit choice (step 1 empty).
 */
(function () {
  "use strict";

  // ── Registry: add a language here + a /locales/<code>.json file. ────────────
  var LANGS = ["en", "es", "pt"];
  var LABEL = { en: "EN", es: "ES", pt: "PT" };
  var NAME  = { en: "English", es: "Español", pt: "Português" };
  var FALLBACK = "en";
  var LS_KEY = "pr_lang";
  var CACHE_PREFIX = "pr_i18n_cache.v1.";

  // Country (ISO-3166 alpha-2, upper) -> language. Extend as markets open.
  var COUNTRY_LANG = {
    ES:"es", AR:"es", UY:"es", CL:"es", CO:"es", PE:"es", MX:"es", VE:"es",
    EC:"es", BO:"es", PY:"es", GT:"es", CR:"es", PA:"es", DO:"es", HN:"es",
    NI:"es", SV:"es", PR:"es",
    BR:"pt", PT:"pt", AO:"pt", MZ:"pt"
    // everything else -> FALLBACK (en)
  };

  // ── State ───────────────────────────────────────────────────────────────────
  var dict = {};            // active-language flat map (merged over en fallback)
  var enDict = {};          // en fallback map
  var current = FALLBACK;
  var userPref = null;      // cloud preference (profiles.settings.language)
  var clubCountry = null;
  var geoCountry = null;
  var cloudSaver = null;    // fn(lang) -> persists to Supabase, set by the app
  var readyResolve;
  var ready = new Promise(function (r) { readyResolve = r; });

  function normalize(code) {
    if (!code) return null;
    code = String(code).toLowerCase();
    for (var i = 0; i < LANGS.length; i++) {
      var l = LANGS[i];
      if (code === l || code.indexOf(l + "-") === 0) return l;
    }
    return null;
  }

  function fromLocalStorage() {
    try { return normalize(localStorage.getItem(LS_KEY)); } catch (e) { return null; }
  }
  function fromCountry(cc) {
    if (!cc) return null;
    return COUNTRY_LANG[String(cc).toUpperCase()] || null;
  }
  function fromNavigator() {
    var navs = (navigator.languages && navigator.languages.length)
      ? navigator.languages : [navigator.language || FALLBACK];
    for (var i = 0; i < navs.length; i++) {
      var n = normalize(navs[i]);
      if (n) return n;
    }
    return null;
  }

  function detect() {
    return fromLocalStorage()          // 1. explicit choice
      || normalize(userPref)           // 2. cloud user pref
      || fromCountry(clubCountry)      // 3. club country
      || fromCountry(geoCountry)       // 4. IP geo
      || fromNavigator()               // 5. browser
      || FALLBACK;                     // 6. default
  }

  // ── Locale loading (fetch JSON, cache in localStorage to kill FOUC) ──────────
  function cacheGet(lang) {
    try {
      var raw = localStorage.getItem(CACHE_PREFIX + lang);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function cacheSet(lang, obj) {
    try { localStorage.setItem(CACHE_PREFIX + lang, JSON.stringify(obj)); } catch (e) {}
  }

  function localesBase() {
    // Resolve /locales relative to this script so nested paths still work.
    var s = document.currentScript;
    if (s && s.src) return s.src.replace(/\/assets\/i18n\.js.*$/, "/locales/");
    return "locales/";
  }
  var BASE = localesBase();

  function fetchLocale(lang) {
    return fetch(BASE + lang + ".json", { cache: "no-cache" })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (json) { cacheSet(lang, json); return json; })
      .catch(function () { return cacheGet(lang) || {}; });
  }

  function loadLang(lang) {
    var jobs = [
      enDict && Object.keys(enDict).length ? Promise.resolve(enDict) : fetchLocale(FALLBACK),
      lang === FALLBACK ? Promise.resolve(null) : fetchLocale(lang)
    ];
    // Apply from cache instantly if present (repeat visits render with no flash).
    var cached = cacheGet(lang) || (lang !== FALLBACK ? cacheGet(FALLBACK) : null);
    return Promise.all(jobs).then(function (res) {
      enDict = res[0] || {};
      var langMap = res[1] || (lang === FALLBACK ? enDict : {});
      dict = Object.assign({}, enDict, langMap);
      return dict;
    }).catch(function () {
      if (cached) { dict = cached; }
      return dict;
    });
  }

  // ── Lookup + interpolation + plurals ────────────────────────────────────────
  function raw(key) {
    if (dict[key] != null) return dict[key];
    if (enDict[key] != null) return enDict[key];
    return null;
  }

  function pluralPick(value, count) {
    // "one form|other form" (or "zero|one|other"). Uses Intl.PluralRules.
    if (typeof value !== "string" || value.indexOf("|") === -1) return value;
    var parts = value.split("|");
    var cat;
    try { cat = new Intl.PluralRules(current).select(count); } catch (e) { cat = count === 1 ? "one" : "other"; }
    if (parts.length === 2) return cat === "one" ? parts[0] : parts[1];       // one|other
    if (parts.length >= 3) {                                                    // zero|one|other
      if (count === 0) return parts[0];
      return cat === "one" ? parts[1] : parts[2];
    }
    return parts[0];
  }

  function interpolate(str, vars) {
    if (!vars || typeof str !== "string") return str;
    return str.replace(/\{(\w+)\}/g, function (m, k) {
      return (vars[k] != null) ? vars[k] : m;
    });
  }

  function t(key, vars) {
    var v = raw(key);
    if (v == null) return key;                 // show the key when missing (easy to spot)
    if (vars && vars.count != null) v = pluralPick(v, vars.count);
    return interpolate(v, vars);
  }

  // ── Apply to the DOM ────────────────────────────────────────────────────────
  function parseVars(el) {
    var j = el.getAttribute("data-i18n-vars");
    if (!j) return null;
    try { return JSON.parse(j); } catch (e) { return null; }
  }

  function applyTo(root) {
    root = root || document;
    var els, i, v;

    els = root.querySelectorAll("[data-i18n]");
    for (i = 0; i < els.length; i++) {
      v = t(els[i].getAttribute("data-i18n"), parseVars(els[i]));
      if (v != null) els[i].textContent = v;
    }
    els = root.querySelectorAll("[data-i18n-html]");
    for (i = 0; i < els.length; i++) {
      v = t(els[i].getAttribute("data-i18n-html"), parseVars(els[i]));
      if (v != null) els[i].innerHTML = v;
    }
    els = root.querySelectorAll("[data-i18n-ph]");
    for (i = 0; i < els.length; i++) {
      v = t(els[i].getAttribute("data-i18n-ph"), parseVars(els[i]));
      if (v != null) els[i].setAttribute("placeholder", v);
    }
    els = root.querySelectorAll("[data-i18n-attr]");
    for (i = 0; i < els.length; i++) {
      var spec = els[i].getAttribute("data-i18n-attr"); // "title:key;aria-label:key2"
      var pairs = spec.split(";");
      for (var p = 0; p < pairs.length; p++) {
        var kv = pairs[p].split(":");
        if (kv.length === 2) {
          var av = t(kv[1].trim(), parseVars(els[i]));
          if (av != null) els[i].setAttribute(kv[0].trim(), av);
        }
      }
    }
  }

  function applyChrome() {
    document.documentElement.setAttribute("lang", current);

    // Marketing language button (.mk-lang) — keep legacy behaviour.
    var cur = document.querySelector(".mk-lang .lang-cur");
    if (cur) cur.textContent = LABEL[current];

    // Marketing rotator + how-it-works panels (data lives under _rotator/_how).
    api.rotator = raw("_rotator") || [];
    api.how = raw("_how") || {};
    var rot = document.getElementById("rotator");
    if (rot && api.rotator.length) rot.innerHTML = "<span>" + api.rotator[0] + "</span>";
    if (typeof window.__startRotator === "function") window.__startRotator();
    if (typeof window.__renderHow === "function") window.__renderHow();
  }

  function render() {
    applyChrome();
    applyTo(document);
    try {
      document.dispatchEvent(new CustomEvent("pr:langchanged", { detail: { lang: current } }));
    } catch (e) {}
  }

  // ── Public: switch language ─────────────────────────────────────────────────
  function apply(lang, opts) {
    opts = opts || {};
    current = normalize(lang) || FALLBACK;
    return loadLang(current).then(function () {
      render();
      if (opts.persistLocal !== false) { try { localStorage.setItem(LS_KEY, current); } catch (e) {} }
      if (opts.persistCloud && typeof cloudSaver === "function") { try { cloudSaver(current); } catch (e) {} }
      return current;
    });
  }

  function setLang(lang) {
    if (!normalize(lang)) return;
    apply(lang, { persistLocal: true, persistCloud: true });
    syncMenu();
  }

  // Re-detect using current signals but ONLY if the user has no explicit choice.
  function reevaluate() {
    if (fromLocalStorage()) return;            // explicit choice locked in
    var next = detect();
    if (next !== current) apply(next, { persistLocal: false });
    else syncMenu();
  }

  // Signal setters the app calls after auth / club load.
  function setUserPref(lang)   { userPref = normalize(lang) || null; reevaluate(); }
  function setCountry(cc)  { clubCountry = cc || null; reevaluate(); }
  function setGeoCountry(cc)   { geoCountry = cc || null; reevaluate(); }
  function setCloudSaver(fn)   { cloudSaver = typeof fn === "function" ? fn : null; }

  // ── Language menu (marketing .mk-lang button) ───────────────────────────────
  function syncMenu() {
    var cur = document.querySelector(".mk-lang .lang-cur");
    if (cur) cur.textContent = LABEL[current];
    var menu = document.querySelector(".mk-lang-menu");
    if (!menu) return;
    var items = menu.querySelectorAll("[data-lang]");
    for (var k = 0; k < items.length; k++)
      items[k].classList.toggle("is-on", items[k].getAttribute("data-lang") === current);
  }

  function injectStyles() {
    if (document.getElementById("cm-i18n-style")) return;
    var s = document.createElement("style");
    s.id = "cm-i18n-style";
    s.textContent =
      ".mk-lang{cursor:pointer;}" +
      ".mk-lang-menu{display:none;position:fixed;z-index:2000;min-width:148px;background:var(--pr-surface,#fff);" +
      "border:1px solid var(--pr-border,#e3e8e5);border-radius:12px;box-shadow:var(--pr-shadow-3,0 18px 40px -12px rgba(0,0,0,.25));padding:6px;}" +
      ".mk-lang-menu.open{display:block;}" +
      ".mk-lang-menu button{display:flex;width:100%;align-items:center;gap:8px;background:transparent;border:0;cursor:pointer;" +
      "text-align:left;padding:9px 10px;border-radius:8px;font:500 13px/1 var(--pr-font-sans,system-ui);color:var(--pr-fg,#1a201d);}" +
      ".mk-lang-menu button:hover{background:var(--pr-bg-soft,#f3f6f4);}" +
      ".mk-lang-menu button.is-on{color:var(--pr-accent,#15803d);font-weight:600;}";
    document.head.appendChild(s);
  }

  function wireButton() {
    var btn = document.querySelector(".mk-lang");
    if (!btn) return;
    btn.innerHTML = '<span class="lang-cur">' + LABEL[current] + '</span><i class="ti ti-chevron-down"></i>';

    var menu = document.querySelector(".mk-lang-menu");
    if (!menu) {
      menu = document.createElement("div");
      menu.className = "mk-lang-menu";
      var html = "";
      for (var i = 0; i < LANGS.length; i++) {
        var l = LANGS[i];
        html += '<button type="button" data-lang="' + l + '"' + (l === current ? ' class="is-on"' : "") +
                ">" + LABEL[l] + " · " + NAME[l] + "</button>";
      }
      menu.innerHTML = html;
      document.body.appendChild(menu);
    }
    function place() {
      var r = btn.getBoundingClientRect();
      menu.style.top = (r.bottom + 6) + "px";
      menu.style.right = (window.innerWidth - r.right) + "px";
    }
    btn.addEventListener("click", function (e) { e.stopPropagation(); place(); menu.classList.toggle("open"); });
    menu.addEventListener("click", function (e) {
      var b = e.target.closest("[data-lang]");
      if (!b) return;
      setLang(b.getAttribute("data-lang"));
      menu.classList.remove("open");
    });
    document.addEventListener("click", function () { menu.classList.remove("open"); });
    window.addEventListener("resize", function () { menu.classList.remove("open"); });
  }

  // ── API ─────────────────────────────────────────────────────────────────────
  var api = {
    t: t,
    setLang: setLang,
    applyTo: applyTo,
    setUserPref: setUserPref,
    setCountry: setCountry,
    setGeoCountry: setGeoCountry,
    setCloudSaver: setCloudSaver,
    langs: LANGS.slice(),
    label: LABEL,
    name: NAME,
    ready: ready,
    rotator: [],
    how: {},
    get current() { return current; }
  };
  window.PR_I18N = api;

  // ── Boot ────────────────────────────────────────────────────────────────────
  function init() {
    injectStyles();
    // Optional pre-boot config (set before this script runs).
    var cfg = window.PR_I18N_CONFIG || {};
    if (cfg.userPref) userPref = cfg.userPref;
    if (cfg.clubCountry) clubCountry = cfg.clubCountry;
    if (cfg.geoCountry) geoCountry = cfg.geoCountry;
    if (typeof cfg.cloudSaver === "function") cloudSaver = cfg.cloudSaver;

    current = detect();
    wireButton();
    apply(current, { persistLocal: false }).then(function () {
      syncMenu();
      readyResolve(current);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
