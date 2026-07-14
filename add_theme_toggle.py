#!/usr/bin/env python3
"""Add a 3-way (system/light/dark) theme toggle to all content pages and index.html."""

import os
import re

PAGES_DIR = "pages"
INDEX_FILE = "index.html"

# Inline, render-blocking snippet placed in <head> so the stored theme
# choice is applied before first paint (avoids a flash of the wrong theme).
HEAD_SNIPPET = (
    '<script>(function(){try{var t=localStorage.getItem("db-theme");'
    'if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);}'
    "}catch(e){}})();</script>"
)

TOGGLE_BTN = (
    '<button type="button" class="theme-toggle" '
    'title="Toggle theme" aria-label="Toggle theme"></button>'
)


def update_content_page(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        html = f.read()

    changed = False

    # 1. Anti-flash inline script, right before </head>
    if "db-theme" not in html:
        html = html.replace("</head>", f"{HEAD_SNIPPET}\n</head>", 1)
        changed = True

    # 2. Toggle button at the end of the topbar (after search box)
    if "theme-toggle" not in html:
        new_html = re.sub(
            r'(<div class="search-container">.*?</div>)(\s*</div></div>)',
            lambda m: m.group(1) + "  " + TOGGLE_BTN + m.group(2),
            html,
            count=1,
            flags=re.DOTALL,
        )
        if new_html != html:
            html = new_html
            changed = True

    # 3. theme.js script tag, alongside the other asset scripts
    if 'assets/theme.js' not in html:
        html = html.replace(
            '<script src="assets/app.js"></script>',
            '<script src="assets/theme.js"></script>\n<script src="assets/app.js"></script>',
            1,
        )
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

    if "db-theme" not in html:
        html = html.replace("</head>", f"{HEAD_SNIPPET}\n</head>", 1)
        changed = True

    if "theme-toggle" not in html:
        new_html = re.sub(
            r'(<a class="last-visit-btn"[^>]*>.*?</a>)(\s*</div>\s*</div>)',
            lambda m: m.group(1) + "\n        " + TOGGLE_BTN + m.group(2),
            html,
            count=1,
            flags=re.DOTALL,
        )
        if new_html != html:
            html = new_html
            changed = True

    if 'pages/assets/theme.js' not in html:
        html = html.replace(
            '<script src="pages/assets/search.js"></script>',
            '<script src="pages/assets/theme.js"></script>\n    <script src="pages/assets/search.js"></script>',
            1,
        )
        changed = True

    if changed:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(html)

    return changed


def main():
    count = 0

    for filename in sorted(os.listdir(PAGES_DIR)):
        if not filename.endswith(".html"):
            continue
        if not filename[0].isdigit():
            continue
        filepath = os.path.join(PAGES_DIR, filename)
        if update_content_page(filepath):
            count += 1

    if update_index_page():
        count += 1

    print(f"Updated {count} files")


if __name__ == "__main__":
    main()
