When users type "cheap bluetooth headphones under $50," they expect results ranked by relevance — not rows that match an exact string. That capability requires a fundamentally different data structure from a B-tree index: an **inverted index** that maps each word to the documents containing it, with scoring information attached. This case study explains how search indexes work as databases in their own right and how you can simulate the core concepts in SQL.

## The Inverted Index

A relational index answers "which rows have column = value?" An inverted index answers "which documents contain this word, and how prominently?" The data structure looks like a dictionary:

```
"bluetooth" → [(doc:12, tf:3, pos:[5,22,41]), (doc:47, tf:1, pos:[3]), ...]
"headphone"  → [(doc:12, tf:5, pos:[1,8,15,29,44]), ...]
"cheap"      → [(doc:7, tf:2, pos:[0,6]), (doc:12, tf:1, pos:[18]), ...]
```

`tf` is **term frequency** — how many times the word appears in that document. Combined with **IDF** (inverse document frequency — how rare the word is across all documents), you get TF-IDF: the classic relevance score.

## Schema: Search Index in SQL

SQLite includes **FTS5** (full-text search), which builds an inverted index internally. This schema shows how to use it alongside a main documents table:

```sql
-- The canonical document store
CREATE TABLE documents (
  id          INTEGER PRIMARY KEY,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  url         TEXT NOT NULL UNIQUE,
  author_id   INTEGER,
  published_at INTEGER,
  category    TEXT
);

-- FTS5 virtual table (SQLite's full-text search)
CREATE VIRTUAL TABLE doc_search USING fts5(
  title,
  body,
  content='documents',
  content_rowid='id'
);

-- Keep FTS index in sync with the documents table
CREATE TRIGGER doc_ai AFTER INSERT ON documents BEGIN
  INSERT INTO doc_search(rowid, title, body)
  VALUES (new.id, new.title, new.body);
END;

CREATE TRIGGER doc_au AFTER UPDATE ON documents BEGIN
  INSERT INTO doc_search(doc_search, rowid, title, body)
  VALUES ('delete', old.id, old.title, old.body);
  INSERT INTO doc_search(rowid, title, body)
  VALUES (new.id, new.title, new.body);
END;

CREATE TRIGGER doc_ad AFTER DELETE ON documents BEGIN
  INSERT INTO doc_search(doc_search, rowid, title, body)
  VALUES ('delete', old.id, old.title, old.body);
END;
```

<figure class="diagram">
<svg viewBox="0 0 700 320" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Search index architecture: documents table feeds an inverted index (FTS5); queries hit the index and retrieve ranked document IDs, then fetch details from documents">
  <defs>
    <marker id="arr" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L9,3 z" fill="var(--accent)"/>
    </marker>
    <marker id="arr2" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L9,3 z" fill="var(--muted)"/>
    </marker>
  </defs>

  <!-- documents -->
  <rect x="10" y="80" width="170" height="120" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <rect x="10" y="80" width="170" height="26" rx="6" fill="var(--accent)" opacity="0.2"/>
  <text x="95" y="98" text-anchor="middle" font-size="13" font-weight="700" fill="var(--text)">documents</text>
  <text x="24" y="122" font-size="11" fill="var(--muted)">PK id</text>
  <text x="24" y="138" font-size="11" fill="var(--text)">title, body</text>
  <text x="24" y="154" font-size="11" fill="var(--text)">url, category</text>
  <text x="24" y="170" font-size="11" fill="var(--text)">published_at</text>
  <text x="24" y="186" font-size="11" fill="var(--text)">author_id</text>

  <!-- FTS5 inverted index -->
  <rect x="260" y="60" width="190" height="150" rx="6" fill="var(--surface-2)" stroke="var(--accent)" stroke-width="2"/>
  <rect x="260" y="60" width="190" height="26" rx="6" fill="var(--accent)" opacity="0.3"/>
  <text x="355" y="78" text-anchor="middle" font-size="13" font-weight="700" fill="var(--text)">doc_search (FTS5)</text>
  <text x="274" y="102" font-size="11" fill="var(--text)">Inverted Index</text>
  <text x="274" y="120" font-size="11" fill="var(--muted)">"bluetooth" → [12,47,89]</text>
  <text x="274" y="136" font-size="11" fill="var(--muted)">"cheap"     → [7,12,33]</text>
  <text x="274" y="152" font-size="11" fill="var(--muted)">"wireless"  → [12,47,91]</text>
  <text x="274" y="170" font-size="11" fill="var(--muted)">+ TF scores, positions</text>
  <text x="274" y="186" font-size="10" fill="var(--muted)">content='documents'</text>
  <text x="274" y="200" font-size="10" fill="var(--muted)">(content table = documents)</text>

  <!-- Query -->
  <rect x="510" y="100" width="170" height="80" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <rect x="510" y="100" width="170" height="26" rx="6" fill="var(--accent)" opacity="0.15"/>
  <text x="595" y="118" text-anchor="middle" font-size="13" font-weight="700" fill="var(--text)">Query</text>
  <text x="524" y="142" font-size="11" fill="var(--text)">&quot;bluetooth headphone&quot;</text>
  <text x="524" y="158" font-size="11" fill="var(--text)">→ ranked doc IDs</text>
  <text x="524" y="172" font-size="11" fill="var(--text)">→ fetch from documents</text>

  <!-- Arrows -->
  <line x1="180" y1="140" x2="258" y2="140" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="5,3" marker-end="url(#arr2)"/>
  <text x="213" y="133" text-anchor="middle" font-size="10" fill="var(--muted)">INSERT trigger</text>
  <line x1="510" y1="145" x2="452" y2="145" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arr)"/>
  <line x1="595" y1="180" x2="595" y2="240" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arr)"/>
  <line x1="595" y1="240" x2="180" y2="180" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#arr)"/>
  <text x="390" y="258" text-anchor="middle" font-size="10" fill="var(--muted)">fetch full doc by ID</text>
</svg>
<figcaption>Search query flow: terms are looked up in the FTS5 inverted index to produce ranked document IDs, then full document details are fetched from the canonical table.</figcaption>
</figure>

## Relevance Ranking

SQLite FTS5 returns results in arbitrary order by default. To rank by relevance, use the built-in `bm25()` function, which computes the BM25 score (an industry-standard improvement over TF-IDF):

```sql
SELECT d.id, d.title, bm25(doc_search) AS score
FROM doc_search
JOIN documents d ON d.id = doc_search.rowid
WHERE doc_search MATCH 'bluetooth headphone'
ORDER BY score;
-- Note: bm25() returns negative scores; ORDER BY score = most relevant first
```

> **Note:** BM25 (Best Match 25) accounts for document length — a document that mentions "bluetooth" 5 times is not necessarily 5× more relevant than one that mentions it once, especially if it's a much longer document. BM25 normalizes for document length.

## Faceted Search and Filtering

Pure text search often needs **faceting**: "show me all results for 'headphone', then let me filter by category or price range." This is a hybrid query — FTS for relevance, then a join to the documents table for attribute filtering:

```sql
SELECT d.id, d.title, d.category, bm25(doc_search) AS score
FROM doc_search
JOIN documents d ON d.id = doc_search.rowid
WHERE doc_search MATCH 'headphone'
  AND d.category = 'electronics'
  AND d.published_at >= strftime('%s','now','-30 days')
ORDER BY score
LIMIT 20;
```

Indexes on `documents(category)` and `documents(published_at)` speed up the filter side.

## Dedicated Search Engines vs. SQL

| Capability | SQLite FTS5 | Elasticsearch / Typesense |
|---|---|---|
| Full-text search | Yes | Yes |
| BM25 ranking | Yes | Yes, tunable |
| Fuzzy / typo tolerance | Limited | Yes |
| Synonym expansion | No | Yes |
| Distributed sharding | No | Yes |
| Vector (semantic) search | No | Yes (in modern versions) |
| Operational simplicity | Very high | Moderate |

SQLite FTS5 is excellent for applications with up to a few million documents on a single node. Beyond that, or when you need typo tolerance, semantic search, or horizontal scaling, a dedicated search engine is the right tool.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Full-Text Search</span></div>
  <div class="widget-body">
    <textarea data-setup="
CREATE TABLE documents (id INTEGER PRIMARY KEY, title TEXT, body TEXT, url TEXT UNIQUE, category TEXT, published_at INTEGER);
CREATE VIRTUAL TABLE doc_search USING fts5(title, body, content='documents', content_rowid='id');
INSERT INTO documents VALUES (1,'Bluetooth Headphones Review','These wireless bluetooth headphones offer great sound quality and noise cancellation.','/reviews/bt-headphones','electronics',1700000000);
INSERT INTO documents VALUES (2,'Budget Audio Guide','Finding cheap affordable headphones under 50 dollars for casual listening.','/guides/budget-audio','electronics',1700100000);
INSERT INTO documents VALUES (3,'Remote Work Setup','Our top picks for microphones cameras and accessories for working from home.','/guides/remote-work','productivity',1700200000);
INSERT INTO documents VALUES (4,'Wireless Earbuds 2024','The best wireless bluetooth earbuds for running and gym workouts.','/reviews/earbuds-2024','electronics',1700300000);
INSERT INTO doc_search(rowid, title, body) SELECT id, title, body FROM documents;
">-- Full-text search: rank by BM25 relevance
SELECT d.id, d.title, d.category,
       ROUND(bm25(doc_search), 4) AS bm25_score
FROM doc_search
JOIN documents d ON d.id = doc_search.rowid
WHERE doc_search MATCH 'bluetooth wireless'
ORDER BY bm25_score;

-- Try: filter by category too
-- SELECT d.title, d.category, ROUND(bm25(doc_search),4) AS score
-- FROM doc_search
-- JOIN documents d ON d.id = doc_search.rowid
-- WHERE doc_search MATCH 'headphone'
--   AND d.category = 'electronics'
-- ORDER BY score;</textarea>
  </div>
</div>

## Key Takeaways

- An **inverted index** maps terms to document lists with frequency scores — the opposite data structure from a B-tree row index.
- **BM25** is the standard relevance ranking algorithm; SQLite FTS5 provides it out of the box.
- **Triggers** keep the FTS index synchronized with the canonical documents table automatically.
- **Hybrid queries** (FTS + attribute filters) combine the inverted index with regular B-tree indexes for faceted search.
- SQLite FTS5 covers single-node use cases well; Elasticsearch, Typesense, or Meilisearch add typo tolerance, synonyms, and horizontal scale.
