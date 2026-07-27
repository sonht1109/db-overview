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
  var SCROLL_THRESHOLD = 150; // px from bottom to consider "at bottom"
  var BOTTOM_DWELL_MS = 10000; // must stay at bottom for 10s to mark read
  var dwellTimer = null;
  var spinnerEl = null;

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

  function showSpinner() {
    var topbar = document.querySelector(".topbar-inner");
    if (!topbar || spinnerEl) return;
    spinnerEl = document.createElement("span");
    spinnerEl.className = "spinner-indicator";
    spinnerEl.innerHTML = '<svg width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8"/></svg>';
    topbar.appendChild(spinnerEl);
  }

  function removeSpinner() {
    if (spinnerEl) {
      spinnerEl.remove();
      spinnerEl = null;
    }
  }

  function onScrollCheck() {
    var slug = pageSlug();
    if (!slug || isDone(slug)) return;

    if (atBottom() && !dwellTimer) {
      showSpinner();
      dwellTimer = setTimeout(function () {
        removeSpinner();
        markDone(slug);
        showDoneIndicator();
        window.removeEventListener("scroll", onScrollCheck);
      }, BOTTOM_DWELL_MS);
    } else if (!atBottom() && dwellTimer) {
      clearTimeout(dwellTimer);
      dwellTimer = null;
      removeSpinner();
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

    initNav(slug);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initProgress);
  } else {
    initProgress();
  }

  /* ---------------- Page slugs (for "mark all previous") ---------------- */
  var PAGE_SLUGS = ["001-data-information-and-records","002-database-vs-file-storage","003-database-table-row-column","004-queries-transactions-and-schemas","005-the-role-of-the-database-engine","006-clients-servers-and-drivers","007-why-database-systems-matter","008-common-kinds-of-database-workloads","009-a-first-mental-model","010-chapter-1-summary","011-logical-structure-vs-physical-structure","012-tables-and-relations","013-keys-and-identifiers","014-constraints-and-rules","015-null-and-missing-values","016-data-types-and-domains","017-normalized-and-denormalized-data","018-documents-graphs-and-key-value-shapes","019-choosing-the-right-model","020-chapter-2-summary","021-relations-tuples-and-attributes","022-primary-keys-and-foreign-keys","023-set-based-thinking","024-projection-selection-and-join","025-why-relations-are-powerful","026-data-independence","027-integrity-by-design","028-common-misunderstandings","029-where-the-relational-model-shines","030-chapter-3-summary","031-from-real-world-to-schema","032-entities-and-relationships","033-one-to-one-one-to-many-many-to-many","034-lookup-tables-and-enums","035-derived-data-and-computed-columns","036-naming-tables-and-columns","037-avoiding-duplication","038-evolving-a-schema-safely","039-tradeoffs-in-modeling","040-chapter-4-summary","041-what-sql-is-for","042-select-insert-update-delete","043-filtering-rows-with-where","044-sorting-with-order-by","045-limiting-results","046-aggregates-and-group-by","047-joining-tables","048-subqueries-and-common-table-expressions","049-reading-sql-as-a-data-flow","050-chapter-5-summary","051-parsing-and-validation","052-logical-plans","053-physical-plans","054-operators-such-as-scan-filter-join","055-cost-estimation","056-rule-based-and-cost-based-planning","057-why-the-same-query-can-run-differently","058-reading-an-explain-plan","059-query-planning-mistakes","060-chapter-6-summary","061-why-scanning-everything-is-slow","062-what-an-index-really-is","063-b-tree-indexes","064-hash-indexes","065-composite-indexes","066-covering-indexes","067-unique-indexes","068-secondary-indexes","069-when-indexes-hurt","070-chapter-7-summary","071-nested-loop-joins","072-hash-joins","073-merge-joins","074-grouping-and-aggregation","075-external-sort","076-memory-limits-and-spill-to-disk","077-join-order-matters","078-cardinality-and-row-counts","079-practical-query-tuning","080-chapter-8-summary","081-why-databases-use-pages","082-heap-files-and-page-layouts","083-row-stores-and-column-stores","084-fixed-length-and-variable-length-records","085-slotted-pages","086-free-space-management","087-record-identifiers","088-updates-and-fragmentation","089-how-rows-are-found-on-disk","090-chapter-9-summary","091-b-tree-structure-in-detail","092-splits-merges-and-rebalancing","093-write-ahead-logging-basics","094-checkpoints","095-buffer-pools","096-dirty-pages-and-flushing","097-crash-recovery-overview","098-space-amplification","099-read-amplification-and-write-amplification","100-chapter-10-summary","101-why-transactions-exist","102-the-meaning-of-atomicity","103-consistency-in-practice","104-isolation-and-interference","105-durability-and-persistence","106-transaction-boundaries","107-commit-and-rollback","108-multi-step-updates","109-real-examples-of-broken-logic","110-chapter-11-summary","111-the-lost-update-problem","112-dirty-reads-and-non-repeatable-reads","113-phantom-reads","114-locks-and-lock-modes","115-two-phase-locking","116-deadlocks-and-detection","117-multiversion-concurrency-control","118-snapshot-isolation","119-choosing-isolation-levels","120-chapter-12-summary","121-what-can-go-wrong","122-the-write-ahead-log","123-redo-and-undo","124-checkpoints-and-restart","125-steal-and-no-steal","126-force-and-no-force","127-crash-safe-commits","128-recovering-unfinished-work","129-why-recovery-shapes-design","130-chapter-13-summary","131-why-distribute-a-database","132-replication-and-sharding","133-shared-nothing-systems","134-partition-keys","135-cross-node-queries","136-rebalancing-data","137-hot-partitions","138-failure-becomes-normal","139-new-tradeoffs-at-scale","140-chapter-14-summary","141-leader-follower-replication","142-synchronous-vs-asynchronous-replication","143-read-replicas","144-replication-lag","145-failover-and-promotion","146-conflict-handling","147-multi-leader-systems","148-replication-logs","149-operational-pitfalls","150-chapter-15-summary","151-why-local-transactions-are-easier","152-two-phase-commit","153-coordinator-failure","154-consensus-in-simple-terms","155-quorums","156-raft-and-leader-election","157-what-consensus-solves","158-what-consensus-does-not-solve","159-cost-of-coordination","160-chapter-16-summary","161-strong-consistency","162-eventual-consistency","163-read-your-writes","164-monotonic-reads","165-causal-consistency","166-cap-as-a-tradeoff-lens","167-latency-vs-correctness","168-conflict-free-approaches","169-picking-the-right-guarantee","170-chapter-17-summary","171-the-key-value-model","172-fast-lookups-and-simple-apis","173-range-scans-and-ordered-keys","174-common-storage-engines","175-caching-vs-persistence","176-when-key-value-is-enough","177-limits-of-the-model","178-real-world-examples","179-design-patterns","180-chapter-18-summary","181-json-as-a-data-model","182-flexible-schema","183-nested-data-and-arrays","184-secondary-indexes-on-documents","185-querying-document-fields","186-document-updates-and-rewrites","187-embedding-vs-referencing","188-strengths-and-weaknesses","189-good-use-cases","190-chapter-19-summary","191-wide-rows-and-sparse-data","192-partitioning-and-clustering-keys","193-write-optimized-design","194-lsm-trees","195-compaction","196-time-series-and-event-workloads","197-modeling-for-query-patterns","198-what-is-hard-in-these-systems","199-good-use-cases","200-chapter-20-summary","201-nodes-edges-and-properties","202-traversals-and-path-queries","203-modeling-relationships-directly","204-graph-query-languages","205-when-joins-become-graph-walks","206-performance-characteristics","207-strengths-of-graph-storage","208-limits-and-tradeoffs","209-good-use-cases","210-chapter-21-summary","211-oltp-vs-olap","212-columnar-storage","213-compression-and-vectorized-execution","214-star-schemas-and-fact-tables","215-batch-loading","216-materialized-views","217-data-lakes-and-lakehouses","218-why-analytics-engines-feel-different","219-good-use-cases","220-chapter-22-summary","221-latency-throughput-and-concurrency","222-read-heavy-vs-write-heavy-workloads","223-access-patterns-first","224-picking-the-right-indexes","225-avoiding-unnecessary-joins","226-caching-and-invalidation","227-batch-work-vs-online-work","228-measuring-before-tuning","229-performance-tradeoffs","230-chapter-23-summary","231-backups-and-restores","232-point-in-time-recovery","233-high-availability-basics","234-failure-testing","235-schema-migrations-in-production","236-monitoring-and-alerts","237-capacity-planning","238-operational-runbooks","239-common-failure-stories","240-chapter-24-summary","241-authentication-and-authorization","242-roles-and-permissions","243-encryption-in-transit-and-at-rest","244-auditing-and-logging","245-secrets-management","246-multi-tenant-isolation","247-sql-injection-and-safe-queries","248-privacy-and-data-retention","249-secure-database-habits","250-chapter-25-summary","251-start-from-workload-not-fashion","252-questions-to-ask-before-choosing","253-one-database-or-many","254-build-vs-buy","255-managed-vs-self-hosted","256-cost-team-and-operations","257-portability-and-lock-in","258-when-to-switch-systems","259-a-practical-decision-framework","260-chapter-26-summary","261-a-toy-table-format","262-insert-and-scan","263-add-a-simple-index","264-add-a-parser","265-add-a-planner","266-add-transactions","267-add-recovery","268-add-concurrency-control","269-what-this-teaches-you","270-chapter-27-summary","271-a-to-do-app-database","272-an-e-commerce-database","273-a-chat-system-database","274-an-analytics-pipeline-database","275-a-time-series-metrics-database","276-a-search-index-as-a-database-system","277-a-multi-tenant-saas-schema","278-mistakes-and-redesigns","279-lessons-from-each-system","280-chapter-28-summary","281-sql-is-slow","282-nosql-means-no-schema","283-indexes-always-help","284-acid-means-no-scale","285-distributed-means-faster","286-flexible-schema-means-easy-design","287-denormalization-always-improves-performance","288-one-database-can-do-everything","289-what-to-believe-instead","290-chapter-29-summary","291-how-to-read-database-papers","292-how-to-study-a-real-engine","293-how-to-benchmark-correctly","294-open-source-databases-to-explore","295-what-to-build-for-practice","296-topics-beyond-this-book","297-a-database-engineers-mindset","298-suggested-learning-path","299-final-review"];

  function markAllPreviousDone(slug) {
    var idx = PAGE_SLUGS.indexOf(slug);
    if (idx < 0) return false;
    var slugs = getDoneSlugs();
    var added = false;
    for (var i = 0; i < idx; i++) {
      if (slugs.indexOf(PAGE_SLUGS[i]) < 0) {
        slugs.push(PAGE_SLUGS[i]);
        added = true;
      }
    }
    if (added) {
      localStorage.setItem(DONE_KEY, slugs.join(","));
    }
    return added;
  }

  function mountMarkAllPrevBtn(slug) {
    var topbar = document.querySelector(".topbar-inner");
    if (!topbar) return;
    var idx = PAGE_SLUGS.indexOf(slug);
    if (idx <= 0) return;
    var btn = document.createElement("button");
    btn.className = "mark-all-prev-btn";
    btn.textContent = "Mark all previous ✓";
    btn.title = "Mark all " + idx + " previous pages as read";
    btn.addEventListener("click", function () {
      if (markAllPreviousDone(slug)) {
        btn.textContent = "✓ All marked";
        btn.classList.add("done");
        if (!isDone(slug)) {
          markDone(slug);
        }
        showDoneIndicator();
      }
    });
    topbar.appendChild(btn);
  }

  /* ---------------- Next-button guard ---------------- */
  function mountNextGuard(slug) {
    var nextLink = document.querySelector(".pagenav a.next");
    if (!nextLink) return;
    nextLink.addEventListener("click", function (e) {
      if (isDone(slug)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      showConfirmModal(slug, nextLink.href);
    });
  }

  function showConfirmModal(slug, href) {
    var existing = document.querySelector(".confirm-overlay");
    if (existing) existing.remove();

    var overlay = document.createElement("div");
    overlay.className = "confirm-overlay";

    var dialog = document.createElement("div");
    dialog.className = "confirm-dialog";
    dialog.innerHTML =
      '<p class="confirm-msg">You haven\'t marked this page as read yet.</p>' +
      '<p class="confirm-sub">Mark it as read before proceeding?</p>' +
      '<div class="confirm-actions">' +
        '<button class="confirm-btn primary" data-action="mark">✓ Mark as read &amp; go</button>' +
        '<button class="confirm-btn" data-action="skip">Just go →</button>' +
        '<button class="confirm-btn cancel" data-action="cancel">Cancel</button>' +
      '</div>';

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    function cleanup() {
      overlay.remove();
    }

    overlay.addEventListener("click", function (ev) {
      if (ev.target === overlay) cleanup();
    });

    dialog.querySelector('[data-action="mark"]').addEventListener("click", function () {
      markDone(slug);
      showDoneIndicator();
      cleanup();
      window.location.href = href;
    });

    dialog.querySelector('[data-action="skip"]').addEventListener("click", function () {
      cleanup();
      window.location.href = href;
    });

    dialog.querySelector('[data-action="cancel"]').addEventListener("click", cleanup);
  }

  function initNav(slug) {
    mountMarkAllPrevBtn(slug);
    mountNextGuard(slug);
    initSidebar(slug);
  }

  /* ---------------- Sidebar Navigation ---------------- */
  var sidebarOpen = false;
  var sidebarEl = null;
  var overlayEl = null;
  var toggleBtn = null;

  function initSidebar(slug) {
    if (typeof NAV_DATA === 'undefined') return;
    buildSidebar(slug);
  }

  function buildSidebar(slug) {
    if (typeof NAV_DATA === 'undefined') return;

    // Create overlay
    overlayEl = document.createElement('div');
    overlayEl.className = 'sidebar-overlay';
    overlayEl.addEventListener('click', closeSidebar);
    document.body.appendChild(overlayEl);

    // Create sidebar
    sidebarEl = document.createElement('nav');
    sidebarEl.className = 'sidebar';

    // Header
    var header = document.createElement('div');
    header.className = 'sidebar-header';
    var h2 = document.createElement('h2');
    h2.textContent = 'Contents';
    var closeBtn = document.createElement('button');
    closeBtn.className = 'sidebar-close';
    closeBtn.innerHTML = '&#x2715;';
    closeBtn.title = 'Close sidebar';
    closeBtn.addEventListener('click', closeSidebar);
    header.appendChild(h2);
    header.appendChild(closeBtn);
    sidebarEl.appendChild(header);

    // Body
    var body = document.createElement('div');
    body.className = 'sidebar-body';

    var doneSet = {};
    getDoneSlugs().forEach(function (s) { doneSet[s] = true; });

    NAV_DATA.forEach(function (part) {
      var partEl = document.createElement('div');
      partEl.className = 'sidebar-part';
      partEl.textContent = part.title;
      body.appendChild(partEl);

      part.chapters.forEach(function (ch) {
        var chEl = document.createElement('div');
        chEl.className = 'sidebar-chapter';
        chEl.textContent = ch.title;
        body.appendChild(chEl);

        ch.pages.forEach(function (pg) {
          var link = document.createElement('a');
          link.className = 'sidebar-link';
          link.href = pg.slug + '.html';
          link.textContent = pg.title;

          // Summary styling
          if (/summary/i.test(pg.title)) {
            link.classList.add('summary');
          }

          // Current page
          if (pg.slug === slug) {
            link.classList.add('current');
          }

          // Read/unread status
          if (doneSet[pg.slug]) {
            link.classList.add('read');
          } else if (pg.slug !== slug) {
            link.classList.add('unread');
          }

          link.addEventListener('click', function (e) {
            if (pg.slug === slug) {
              e.preventDefault();
              closeSidebar();
            }
            // Otherwise navigate naturally
          });

          body.appendChild(link);
        });
      });
    });

    sidebarEl.appendChild(body);

    // Hint
    var hint = document.createElement('div');
    hint.className = 'sidebar-hint';
    hint.innerHTML = 'Press <kbd>Esc</kbd> to close';
    sidebarEl.appendChild(hint);

    document.body.appendChild(sidebarEl);

    // Toggle button in topbar
    var topbar = document.querySelector('.topbar-inner');
    if (topbar) {
      toggleBtn = document.createElement('button');
      toggleBtn.className = 'nav-toggle';
      toggleBtn.innerHTML = '&#x2630;';
      toggleBtn.title = 'Toggle navigation sidebar';
      toggleBtn.addEventListener('click', toggleSidebar);
      // Append at the end (rightmost)
      topbar.appendChild(toggleBtn);
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', function (e) {
      // Escape to close
      if (e.key === 'Escape' && sidebarOpen) {
        closeSidebar();
      }
      // Ctrl+B or Cmd+B to toggle
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        toggleSidebar();
      }
    });

    // Scroll current page into view
    var currentLink = sidebarEl.querySelector('.sidebar-link.current');
    if (currentLink) {
      setTimeout(function () {
        currentLink.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 100);
    }
  }

  function openSidebar() {
    if (sidebarOpen) return;
    sidebarOpen = true;
    sidebarEl.classList.add('open');
    overlayEl.classList.add('open');
    if (toggleBtn) toggleBtn.classList.add('active');
    // Scroll current into view
    var currentLink = sidebarEl.querySelector('.sidebar-link.current');
    if (currentLink) {
      setTimeout(function () {
        currentLink.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 250);
    }
  }

  function closeSidebar() {
    if (!sidebarOpen) return;
    sidebarOpen = false;
    sidebarEl.classList.remove('open');
    overlayEl.classList.remove('open');
    if (toggleBtn) toggleBtn.classList.remove('active');
  }

  function toggleSidebar() {
    if (sidebarOpen) {
      closeSidebar();
    } else {
      openSidebar();
    }
  }
})();
