/* Shared runtime for every DB-learning page.
 * Responsibilities:
 *   1. Mount interactive SQL widgets after page load (sql.js)
 *   2. Mount other interactive widgets as needed
 *   3. Track reading progress — mark page as done when scrolled to bottom
 */
(function () {
  "use strict";

  /* ---------------- Interactive SQL widget (sql.js) ---------------- */
  var sqlReady = null;
  function loadSqlJs() {
    if (sqlReady) return sqlReady;
    sqlReady = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js";
      s.onload = function () {
        window
          .initSqlJs({
            locateFile: function (f) {
              return "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/" + f;
            },
          })
          .then(resolve)
          .catch(reject);
      };
      s.onerror = function () { reject(new Error("Could not load sql.js (offline?)")); };
      document.head.appendChild(s);
    });
    return sqlReady;
  }

  function renderResult(box, res) {
    if (!res || !res.length) {
      box.innerHTML = '<span class="muted">Query ran successfully — no rows returned.</span>';
      return;
    }
    var r = res[res.length - 1];
    var html = "<table><thead><tr>";
    r.columns.forEach(function (c) { html += "<th>" + esc(c) + "</th>"; });
    html += "</tr></thead><tbody>";
    r.values.forEach(function (row) {
      html += "<tr>";
      row.forEach(function (v) { html += "<td>" + esc(v === null ? "NULL" : v) + "</td>"; });
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
      loadSqlJs()
        .then(function (SQL) {
          var db = new SQL.Database();
          if (setup) db.run(setup);
          try {
            var query = ta.value.replace(/<[^>]*>/g, '');
            var res = db.exec(query);
            renderResult(out, res);
          } catch (e) {
            out.innerHTML = '<div class="err">' + esc(e.message) + "</div>";
          }
          db.close();
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
  var SCROLL_THRESHOLD = 80; // px from bottom to consider "done"

  function pageSlug() {
    var path = window.location.pathname;
    // Extract filename without extension, e.g. "/pages/007-why-database-systems-matter.html" -> "007-why-database-systems-matter"
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

  function onScrollCheck() {
    var slug = pageSlug();
    if (!slug || isDone(slug)) return;

    var scrollBottom = window.innerHeight + window.scrollY;
    var docHeight = document.documentElement.scrollHeight;

    if (scrollBottom >= docHeight - SCROLL_THRESHOLD) {
      markDone(slug);
      showDoneIndicator();
      window.removeEventListener("scroll", onScrollCheck);
    }
  }

  function initProgress() {
    var slug = pageSlug();
    if (!slug) return;

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
