/**
 * Database Overview — Client-side search
 *
 * Features:
 *  - Cmd+K / Ctrl+K to focus search
 *  - Case-insensitive full-text search over all 268 pages
 *  - Shows context snippets with highlighted matches
 *  - Caches last search results in localStorage
 *  - Click result to navigate
 *  - Arrow-key keyboard navigation
 */

(function () {
  "use strict";

  const DEBOUNCE_MS = 150;
  const MAX_RESULTS = 20;
  const SNIPPET_CONTEXT = 60; // chars of context around match

  let index = null;
  let lastQuery = "";
  let lastResults = [];
  let activeIdx = -1;
  let debounceTimer = null;

  // ── DOM refs ──────────────────────────────────────────
  const topbarInner = document.querySelector(".topbar-inner");
  const input = document.querySelector(".search-input");
  let overlay = null;
  let dropdown = null;
  let closeTimer = null;

  // ── Path helpers ──────────────────────────────────────
  function isContentPage() {
    return window.location.pathname.includes("/pages/");
  }

  function getBasePath() {
    return isContentPage() ? "assets/" : "pages/assets/";
  }

  function resolveUrl(url) {
    // url is like "/pages/001-...html"
    // If on content page, resolve relative
    if (isContentPage()) {
      return url.replace(/^\/pages\//, "");
    }
    return url;
  }

  // ── Overlay / dropdown ────────────────────────────────
  function createOverlay() {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.className = "search-overlay";
    document.body.appendChild(overlay);

    dropdown = document.createElement("div");
    dropdown.className = "search-dropdown";
    document.body.appendChild(dropdown);

    // Navigate on mousedown so the click isn't lost when blur hides the dropdown
    dropdown.addEventListener("mousedown", (e) => {
      const resultEl = e.target.closest(".search-result");
      if (resultEl && resultEl.href) {
        e.preventDefault();
        clearTimeout(closeTimer);
        window.location.href = resultEl.href;
      }
    });
  }

  function openSearch() {
    createOverlay();
    overlay.classList.add("active");
    loadLastResults();
  }

  function closeSearch() {
    clearTimeout(closeTimer);
    if (overlay) overlay.classList.remove("active");
    if (dropdown) dropdown.style.display = "none";
    activeIdx = -1;
  }

  function closeSearchDelayed() {
    clearTimeout(closeTimer);
    closeTimer = setTimeout(closeSearch, 150);
  }

  function positionDropdown() {
    if (!dropdown || !input) return;
    const rect = input.getBoundingClientRect();
    // Position below the input, spanning the content width
    dropdown.style.top = rect.bottom + 8 + "px";
    dropdown.style.left = rect.left + "px";
    dropdown.style.width = Math.max(rect.width, 360) + "px";
    dropdown.style.maxWidth = "calc(100vw - 32px)";
  }

  // ── Index loading ─────────────────────────────────────
  async function loadIndex() {
    if (index) return index;
    try {
      const resp = await fetch(getBasePath() + "search-index.json");
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      index = await resp.json();
      return index;
    } catch (e) {
      console.error("Search: failed to load index", e);
      return null;
    }
  }

  // ── Last results (localStorage) ───────────────────────
  function loadLastResults() {
    try {
      const q = localStorage.getItem("search-last-query");
      const r = localStorage.getItem("search-last-results");
      if (r) {
        lastQuery = q || "";
        lastResults = JSON.parse(r);
      }
    } catch (_) {
      lastResults = [];
    }
    if (lastResults.length > 0 && !input.value.trim()) {
      renderResults(lastResults, lastQuery);
    } else if (!input.value.trim()) {
      renderEmpty("Type to search all topics…");
    }
  }

  function saveLastResults(query, results) {
    try {
      localStorage.setItem("search-last-query", query);
      // Only store up to 10 for localStorage
      localStorage.setItem(
        "search-last-results",
        JSON.stringify(results.slice(0, 10))
      );
    } catch (_) {}
  }

  // ── Search engine ─────────────────────────────────────
  function search(query) {
    if (!query.trim()) {
      if (lastResults.length > 0) {
        renderResults(lastResults, lastQuery);
      } else {
        renderEmpty("Type to search all topics…");
      }
      return;
    }

    const q = query.toLowerCase().trim();
    const results = [];

    for (const page of index) {
      const text = page.text.toLowerCase();
      const titleLow = page.title.toLowerCase();

      // Check text match
      const textIdx = text.indexOf(q);
      // Check title match
      const titleIdx = titleLow.indexOf(q);

      if (textIdx >= 0 || titleIdx >= 0) {
        let snippet, matchIdx, matchLen;
        const hl = q.length;

        if (textIdx >= 0) {
          // Extract snippet around text match
          const start = Math.max(0, textIdx - SNIPPET_CONTEXT);
          const end = Math.min(
            text.length,
            textIdx + hl + SNIPPET_CONTEXT
          );
          snippet =
            (start > 0 ? "…" : "") +
            text.substring(start, end) +
            (end < text.length ? "…" : "");
          matchIdx = textIdx - start + (start > 0 ? 1 : 0);
          matchLen = hl;
        } else {
          // Title match only
          snippet =
            (titleIdx > 0
              ? "…" + page.title.substring(0, titleIdx)
              : "") +
            page.title.substring(titleIdx, titleIdx + hl) +
            page.title.substring(titleIdx + hl) +
            " — " +
            page.text.substring(0, 120) +
            (page.text.length > 120 ? "…" : "");
          matchIdx = titleIdx;
          matchLen = hl;
        }

        results.push({
          title: page.title,
          part: page.part,
          chapter: page.chapter,
          url: page.url,
          snippet,
          matchIdx,
          matchLen,
        });
      }

      if (results.length >= MAX_RESULTS) break;
    }

    lastQuery = query;
    lastResults = results;
    saveLastResults(query, results);
    renderResults(results, query);
  }

  // ── Rendering ─────────────────────────────────────────
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function highlightText(text, matchIdx, matchLen) {
    if (matchIdx < 0 || matchLen <= 0) return escapeHtml(text);
    const before = escapeHtml(text.substring(0, matchIdx));
    const match = escapeHtml(text.substring(matchIdx, matchIdx + matchLen));
    const after = escapeHtml(text.substring(matchIdx + matchLen));
    return before + "<mark>" + match + "</mark>" + after;
  }

  function renderResults(results, query) {
    if (!dropdown) return;
    positionDropdown();

    if (results.length === 0 && query.trim()) {
      dropdown.innerHTML =
        '<div class="search-empty">No results for <strong>' +
        escapeHtml(query) +
        "</strong></div>";
      dropdown.style.display = "block";
      return;
    }

    let html = "";
    results.forEach((r, i) => {
      const activeClass = i === activeIdx ? " active" : "";
      html +=
        '<a class="search-result' +
        activeClass +
        '" href="' +
        resolveUrl(r.url) +
        '" data-idx="' +
        i +
        '">';
      if (r.part || r.chapter) {
        html +=
          '<div class="sr-breadcrumb">' +
          (r.part ? escapeHtml(r.part) : "") +
          (r.part && r.chapter ? " · " : "") +
          (r.chapter ? escapeHtml(r.chapter) : "") +
          "</div>";
      }
      html += '<div class="sr-title">' + escapeHtml(r.title) + "</div>";
      html +=
        '<div class="sr-snippet">' +
        highlightText(r.snippet, r.matchIdx, r.matchLen) +
        "</div>";
      html += "</a>";
    });

    dropdown.innerHTML = html;
    dropdown.style.display = "block";

    // Attach click + hover listeners to results
    dropdown.querySelectorAll(".search-result").forEach((el) => {
      el.addEventListener("mouseenter", () => {
        activeIdx = parseInt(el.dataset.idx, 10);
        updateActiveClass();
      });
    });
  }

  function renderEmpty(msg) {
    if (!dropdown) return;
    positionDropdown();
    dropdown.innerHTML =
      '<div class="search-empty">' + escapeHtml(msg) + "</div>";
    dropdown.style.display = "block";
  }

  function updateActiveClass() {
    if (!dropdown) return;
    dropdown.querySelectorAll(".search-result").forEach((el) => {
      const i = parseInt(el.dataset.idx, 10);
      el.classList.toggle("active", i === activeIdx);
    });
  }

  // ── Event handlers ────────────────────────────────────
  function onInput() {
    clearTimeout(debounceTimer);
    const q = input.value;
    debounceTimer = setTimeout(async () => {
      if (!index) await loadIndex();
      activeIdx = -1;
      search(q);
    }, DEBOUNCE_MS);
  }

  function onFocus() {
    openSearch();
  }

  function onKeyDown(e) {
    // Global: Cmd+K / Ctrl+K
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      if (input) {
        input.focus();
        input.select();
        openSearch();
      }
      return;
    }

    // When focused on input: navigate results
    if (document.activeElement === input) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        activeIdx = Math.min(activeIdx + 1, lastResults.length - 1);
        updateActiveClass();
        scrollToActive();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        activeIdx = Math.max(activeIdx - 1, -1);
        updateActiveClass();
        scrollToActive();
      } else if (e.key === "Enter" && activeIdx >= 0) {
        e.preventDefault();
        const result = lastResults[activeIdx];
        if (result) {
          window.location.href = resolveUrl(result.url);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeSearch();
        input.blur();
      }
    }
  }

  function scrollToActive() {
    if (!dropdown) return;
    const active = dropdown.querySelector(".search-result.active");
    if (active) {
      active.scrollIntoView({ block: "nearest" });
    }
  }

  function onClickOutside(e) {
    if (overlay && overlay.classList.contains("active")) {
      const container = input.closest(".search-container");
      if (
        !dropdown.contains(e.target) &&
        !container.contains(e.target)
      ) {
        closeSearch();
        input.blur();
      }
    }
  }

  function onResize() {
    if (dropdown && dropdown.style.display === "block") {
      positionDropdown();
    }
  }

  // ── Init ──────────────────────────────────────────────
  function init() {
    if (!input) return;

    // Preload index in background
    loadIndex();

    // Restore last results from localStorage
    try {
      lastQuery = localStorage.getItem("search-last-query") || "";
      const r = localStorage.getItem("search-last-results");
      if (r) lastResults = JSON.parse(r);
    } catch (_) {}

    // Events
    input.addEventListener("input", onInput);
    input.addEventListener("focus", onFocus);
    input.addEventListener("blur", closeSearchDelayed);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("click", onClickOutside);
    window.addEventListener("resize", onResize);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
