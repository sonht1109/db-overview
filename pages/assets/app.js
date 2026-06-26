/* Shared runtime for every DB-learning page.
 * Responsibilities:
 *   1. Render the embedded markdown (#page-md) into #rendered using marked.
 *   2. Mirror the raw markdown into #raw for the HTML <-> Markdown toggle.
 *   3. Wire the toggle button and remember the choice.
 *   4. Mount interactive widgets after render:
 *        - [data-widget="sql"]   real in-browser SQLite (sql.js, lazy-loaded)
 *        - <details class="reveal"> just uses native disclosure (no JS needed)
 */
(function () {
  "use strict";

  function renderMarkdown() {
    var src = document.getElementById("page-md");
    if (!src) return;
    var md = src.textContent.replace(/^\n/, "");
    // raw view
    var rawPre = document.querySelector("#raw pre");
    if (rawPre) rawPre.textContent = md;
    // rendered view
    var target = document.getElementById("rendered");
    if (target && window.marked) {
      marked.setOptions({ gfm: true, breaks: false, headerIds: true, mangle: false });
      target.innerHTML = marked.parse(md);
      mountWidgets(target);
    }
  }

  function setupToggle() {
    var btn = document.getElementById("toggle");
    if (!btn) return;
    var KEY = "db-view-mode";
    function apply(mode) {
      if (mode === "raw") {
        document.body.classList.add("show-raw");
        btn.textContent = "View rendered ↩";
      } else {
        document.body.classList.remove("show-raw");
        btn.textContent = "View markdown </>";
      }
    }
    apply(localStorage.getItem(KEY) || "rendered");
    btn.addEventListener("click", function () {
      var raw = !document.body.classList.contains("show-raw");
      localStorage.setItem(KEY, raw ? "raw" : "rendered");
      apply(raw ? "raw" : "rendered");
    });
  }

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
    var r = res[res.length - 1]; // show last statement's result set
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
            var res = db.exec(ta.value);
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

  function mountWidgets(root) {
    root.querySelectorAll('[data-widget="sql"]').forEach(mountSql);
  }

  function init() {
    renderMarkdown();
    setupToggle();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
