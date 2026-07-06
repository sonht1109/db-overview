#!/usr/bin/env python3
"""Add search box to all content pages and index.html."""

import os
import re

PAGES_DIR = "pages"
INDEX_FILE = "index.html"

# ── Search HTML to inject ──────────────────────────────
SEARCH_HTML = (
    '<div class="search-container">'
    '<input type="text" class="search-input" placeholder="Search topics…" autocomplete="off" spellcheck="false" />'
    '<kbd class="search-shortcut" title="Press ⌘K to search">⌘K</kbd>'
    "</div>"
)

# ── For content pages: inject into topbar ──────────────
# The current topbar is:
#   <div class="topbar"><div class="topbar-inner">
#     <a class="home-link" href="../index.html">← All topics</a></div></div>
# We need to insert SEARCH_HTML before the closing </div></div>

OLD_TOPBAR_PATTERN = re.compile(
    r'(<div class="topbar"><div class="topbar-inner">\s*'
    r'<a class="home-link" href="\.\./index\.html">.*?</a>)'
    r'(\s*</div></div>)',
    re.DOTALL,
)

NEW_TOPBAR = r"\1  " + SEARCH_HTML + r"\n\2"

# Script tag to add before </body>
SEARCH_SCRIPT = '<script src="assets/search.js"></script>'

# For index.html: different paths, and needs a topbar
INDEX_TOPBAR = (
    '<div class="topbar"><div class="topbar-inner">'
    '<a class="home-link" href=".">← All topics</a>  '
    + SEARCH_HTML +
    "</div></div>"
)

INDEX_SCRIPT = '<script src="pages/assets/search.js"></script>'


def update_content_page(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        html = f.read()

    changed = False

    # Replace topbar
    new_html = OLD_TOPBAR_PATTERN.sub(NEW_TOPBAR, html, count=1)
    if new_html != html:
        changed = True
        html = new_html

    # Add search.js before </body> if not already present
    if "search.js" not in html:
        html = html.replace("</body>", f"  {SEARCH_SCRIPT}\n</body>", 1)
        changed = True

    if changed:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(html)

    return changed


def update_index_page():
    filepath = INDEX_FILE
    with open(filepath, "r", encoding="utf-8") as f:
        html = f.read()

    changed = False

    # The index page has no topbar. Add one right after <body>
    # and wrap the existing content in a proper structure.
    # Current structure: <body> <main class="wrap"> ... </main> </body>
    if "search-input" not in html:
        html = html.replace("<body>", "<body>\n" + INDEX_TOPBAR + "\n", 1)
        changed = True

    # Add search.js
    if "search.js" not in html:
        html = html.replace("</body>", f"  {INDEX_SCRIPT}\n</body>", 1)
        changed = True

    if changed:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(html)

    return changed


def main():
    count = 0

    # Content pages
    for filename in sorted(os.listdir(PAGES_DIR)):
        if not filename.endswith(".html"):
            continue
        if not filename[0].isdigit():
            continue  # Only numbered pages
        filepath = os.path.join(PAGES_DIR, filename)
        if update_content_page(filepath):
            count += 1

    # Index page
    if update_index_page():
        count += 1

    print(f"Updated {count} files")


if __name__ == "__main__":
    main()
