#!/usr/bin/env python3
"""Extract text from all content pages and build a search index JSON."""

import re
import json
import os
from html.parser import HTMLParser

PAGES_DIR = "pages"
OUTPUT = os.path.join(PAGES_DIR, "assets", "search-index.json")


class ContentExtractor(HTMLParser):
    """Extract structured content from a page."""

    def __init__(self):
        super().__init__()
        self.reset_state()

    def reset_state(self):
        self.title = None
        self.eyebrow = None
        self.chapter = None
        self.content_title = None
        self.in_title = False
        self.in_eyebrow = False
        self.in_chapter = False
        self.in_content_title = False
        self.in_rendered = False
        self.skip_depth = 0
        self.text_parts = []
        self.current_tag = None

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)

        if tag == "title":
            self.in_title = True
        elif tag == "svg":
            self.skip_depth += 1
        elif tag == "script" or tag == "style" or tag == "textarea":
            self.skip_depth += 1
        elif attrs_dict.get("class") == "eyebrow" or (
            tag == "p" and "eyebrow" in (attrs_dict.get("class", ""))
        ):
            self.in_eyebrow = True
        elif attrs_dict.get("class") == "chapter-label" or (
            tag == "p" and "chapter-label" in (attrs_dict.get("class", ""))
        ):
            self.in_chapter = True
        elif attrs_dict.get("class") == "content-title" or (
            tag == "h1" and "content-title" in (attrs_dict.get("class", ""))
        ):
            self.in_content_title = True
        elif attrs_dict.get("id") == "rendered":
            self.in_rendered = True

    def handle_endtag(self, tag):
        if tag == "title":
            self.in_title = False
        elif tag == "svg" and self.skip_depth > 0:
            self.skip_depth -= 1
        elif (tag == "script" or tag == "style" or tag == "textarea") and self.skip_depth > 0:
            self.skip_depth -= 1
        elif tag == "p" and self.in_eyebrow:
            self.in_eyebrow = False
        elif tag == "p" and self.in_chapter:
            self.in_chapter = False
        elif tag == "h1" and self.in_content_title:
            self.in_content_title = False
        elif tag == "div" and self.in_rendered:
            # The rendered div may contain nested divs; only close on the outermost
            # This is a bit fragile but works for our structure
            pass

    def handle_data(self, data):
        if self.skip_depth > 0:
            return
        if self.in_title:
            self.title = (self.title or "") + data
        elif self.in_eyebrow:
            self.eyebrow = (self.eyebrow or "") + data
        elif self.in_chapter:
            self.chapter = (self.chapter or "") + data
        elif self.in_content_title:
            self.content_title = (self.content_title or "") + data
        elif self.in_rendered:
            text = data.strip()
            if text:
                self.text_parts.append(text)


def extract_page(filepath):
    """Extract metadata and text from a single HTML page."""
    with open(filepath, "r", encoding="utf-8") as f:
        html = f.read()

    # Remove SVG blocks before parsing (parser gets confused by inline SVG)
    html_no_svg = re.sub(r"<svg[^>]*>.*?</svg>", "", html, flags=re.DOTALL)

    extractor = ContentExtractor()
    extractor.feed(html_no_svg)

    # Title: prefer content-title h1, fallback to <title>
    title = extractor.content_title or extractor.title or ""
    title = title.strip()
    # Remove " — Database Overview" suffix from <title>
    title = re.sub(r"\s*—\s*Database\s+Overview\s*$", "", title).strip()

    part = (extractor.eyebrow or "").strip()
    chapter = (extractor.chapter or "").strip()
    text = " ".join(extractor.text_parts)
    # Collapse whitespace
    text = re.sub(r"\s+", " ", text).strip()

    return {
        "title": title,
        "part": part,
        "chapter": chapter,
        "text": text,
    }


def main():
    pages = []
    files = sorted(
        f for f in os.listdir(PAGES_DIR)
        if f.endswith(".html") and f[0].isdigit()
    )

    for filename in files:
        filepath = os.path.join(PAGES_DIR, filename)
        try:
            data = extract_page(filepath)
            data["url"] = f"/{PAGES_DIR}/{filename}"
            pages.append(data)
        except Exception as e:
            print(f"Warning: failed to parse {filename}: {e}")

    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(pages, f, ensure_ascii=False, separators=(",", ":"))

    # Also print summary
    total_chars = sum(len(p["text"]) for p in pages)
    print(f"Index built: {len(pages)} pages, {total_chars:,} characters of text")
    print(f"Output: {OUTPUT}")


if __name__ == "__main__":
    main()
