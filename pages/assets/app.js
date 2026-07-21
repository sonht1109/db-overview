/* Shared runtime for every DB-learning page.
 * Responsibilities:
 *   1. Mount interactive SQL widgets after page load (sql.js)
 *   2. Mount other interactive widgets as needed
 *   3. Track reading progress — mark page as done 10s after user reaches the bottom
 */
(function () {
  "use strict";

  /* ---------------- Interactive SQL widget (PGlite) ---------------- */
  var PGliteModule = null;
  function loadPGlite() {
    if (PGliteModule) return PGliteModule;
    PGliteModule = import("https://cdn.jsdelivr.net/npm/@electric-sql/pglite/dist/index.js")
      .then(function (m) { return m.PGlite; })
      .catch(function () { throw new Error("Could not load PGlite (offline?)"); });
    return PGliteModule;
  }

  function renderResult(box, res) {
    if (!res || !res.rows || !res.rows.length) {
      box.innerHTML = '<span class="muted">Query ran successfully — no rows returned.</span>';
      return;
    }
    var cols = res.fields.map(function (f) { return f.name; });
    var html = "<table><thead><tr>";
    cols.forEach(function (c) { html += "<th>" + esc(c) + "</th>"; });
    html += "</tr></thead><tbody>";
    res.rows.forEach(function (row) {
      html += "<tr>";
      cols.forEach(function (c) {
        var v = row[c];
        html += "<td>" + esc(v === null ? "NULL" : v) + "</td>";
      });
      html += "</tr>";
    });
    html += "</tbody></table>";
    box.innerHTML = html;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function mountSql(widget) {
    var ta = widget.querySelector("textarea");
    if (!ta) return;
    var setup = ta.getAttribute("data-setup") || "";
    var body = widget.querySelector(".widget-body") || widget;

    var btn = document.createElement("button");
    btn.className = "run-btn";
    btn.textContent = "Run query ▶";
    var out = document.createElement("div");
    out.className = "result";
    body.appendChild(btn);
    body.appendChild(out);

    btn.addEventListener("click", function () {
      out.innerHTML = '<span class="muted">Loading SQL engine…</span>';
      loadPGlite()
        .then(function (PGlite) {
          var db = new PGlite();
          var query = ta.value.replace(/<[^>]*>/g, '');
          return (setup ? db.exec(setup) : Promise.resolve())
            .then(function () { return db.exec(query); })
            .then(function (results) {
              // exec returns an array of results (one per statement).
              // Show the last result that returned rows, or the last result overall.
              var res = null;
              if (Array.isArray(results) && results.length) {
                for (var i = results.length - 1; i >= 0; i--) {
                  if (results[i] && results[i].rows && results[i].rows.length) { res = results[i]; break; }
                }
                if (!res) res = results[results.length - 1];
              }
              renderResult(out, res);
            })
            .catch(function (e) { out.innerHTML = '<div class="err">' + esc(e.message) + "</div>"; })
            .then(function () { return db.close(); });
        })
        .catch(function (e) {
          out.innerHTML = '<div class="err">' + esc(e.message) + "</div>";
        });
    });
  }

  function mountWidgets() {
    document.querySelectorAll('[data-widget="sql"]').forEach(mountSql);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountWidgets);
  } else {
    mountWidgets();
  }

  /* ---------------- Reading progress tracker ---------------- */
  var DONE_KEY = "db-done";
  var SCROLL_THRESHOLD = 80; // px from bottom to consider "at bottom"
  var BOTTOM_DWELL_MS = 10000; // must stay at bottom for 10s to mark read
  var dwellTimer = null;

  function pageSlug() {
    var path = window.location.pathname;
    var m = path.match(/\/([^/]+)\.html$/);
    return m ? m[1] : null;
  }

  function getDoneSlugs() {
    try {
      var raw = localStorage.getItem(DONE_KEY);
      return raw ? raw.split(",") : [];
    } catch (_) {
      return [];
    }
  }

  function isDone(slug) {
    return getDoneSlugs().indexOf(slug) >= 0;
  }

  function markDone(slug) {
    try {
      var slugs = getDoneSlugs();
      if (slugs.indexOf(slug) < 0) {
        slugs.push(slug);
        localStorage.setItem(DONE_KEY, slugs.join(","));
      }
    } catch (_) {}
  }

  function showDoneIndicator() {
    var topbar = document.querySelector(".topbar-inner");
    if (!topbar || topbar.querySelector(".done-indicator")) return;
    var badge = document.createElement("span");
    badge.className = "done-indicator";
    badge.textContent = "✓ Read";
    topbar.appendChild(badge);
  }

  function atBottom() {
    var scrollBottom = window.innerHeight + window.scrollY;
    var docHeight = document.documentElement.scrollHeight;
    return scrollBottom >= docHeight - SCROLL_THRESHOLD;
  }

  function onScrollCheck() {
    var slug = pageSlug();
    if (!slug || isDone(slug)) return;

    if (atBottom() && !dwellTimer) {
      dwellTimer = setTimeout(function () {
        markDone(slug);
        showDoneIndicator();
        window.removeEventListener("scroll", onScrollCheck);
      }, BOTTOM_DWELL_MS);
    }
  }

  /* ---------------- Last visit tracker ---------------- */
  var VISITS_KEY = "db-last-visits";
  var MAX_VISITS = 5;

  function getVisits() {
    try {
      var raw = localStorage.getItem(VISITS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (_) {
      return [];
    }
  }

  function trackLastVisit() {
    var slug = pageSlug();
    if (!slug) return;
    try {
      var visits = getVisits();
      visits = visits.filter(function (v) { return v.slug !== slug; });
      visits.unshift({
        slug: slug,
        title: document.title,
        time: Date.now()
      });
      if (visits.length > MAX_VISITS) visits.length = MAX_VISITS;
      localStorage.setItem(VISITS_KEY, JSON.stringify(visits));
    } catch (_) {}
  }

  function initProgress() {
    var slug = pageSlug();
    if (!slug) return;

    trackLastVisit();

    if (isDone(slug)) {
      showDoneIndicator();
    } else {
      window.addEventListener("scroll", onScrollCheck, { passive: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initProgress);
  } else {
    initProgress();
  }
})();
