When you run `SELECT * FROM employees WHERE id = 712`, the database engine has to physically locate that one row on disk — possibly among millions. This chapter explains the machinery that makes that possible: how rows live inside pages, how the engine navigates from a query down to a specific byte offset, and what happens when there is no shortcut.

## Pages Are the Unit of I/O

The engine never reads a single row directly from disk. It always reads a **page** — a fixed-size block, typically 4 KB to 16 KB depending on the engine. A page is the smallest unit the storage layer moves between disk and memory (the buffer pool).

Inside each page, rows are stored as **records** — a sequence of fields, with a small header describing things like which columns are NULL, and the length of any variable-width data (like `TEXT`). At the start of the page is a **slot array**: a compact list of offsets pointing to where each record begins within that page.

```
┌─────────────────────────────────────────┐  Page 7
│ Page header (page id, free space, ...)  │
│─────────────────────────────────────────│
│ Slot array: [slot 0 → offset 120,       │
│              slot 1 → offset 185,       │
│              slot 2 → offset 251, ...]  │
│─────────────────────────────────────────│
│  ... free space ...                     │
│─────────────────────────────────────────│
│ Record 2  (row 3 of the table)          │  ← offset 251
│ Record 1  (row 2 of the table)          │  ← offset 185
│ Record 0  (row 1 of the table)          │  ← offset 120
└─────────────────────────────────────────┘
```

A row's **physical address** is therefore a pair: `(page_number, slot_number)`. In PostgreSQL this is called a `ctid`. In other engines the concept is the same even if it goes by a different name.

## Finding a Row: Two Paths

### Path 1 — Table Scan (No Index)

Without an index, the engine has no shortcut. It reads every page of the table from the first to the last, checks each record against the `WHERE` predicate, and returns any that match. This is called a **sequential scan** or **full table scan**.

For large tables a sequential scan is expensive — but it is always *correct*. It is the fallback that guarantees any row can be found.

### Path 2 — Index Lookup

An index is a separate on-disk structure (usually a B-tree) that maps a column's values to physical row addresses. When the engine uses an index, the process has two steps:

1. **Traverse the index** to find the physical address `(page, slot)` for the matching key.
2. **Fetch the page** that contains that slot, then read the record.

Step 2 is called a **heap fetch** (or in PostgreSQL, a "heap access"). It is a random I/O — the index tells you exactly which page to load, so you load only that page rather than all of them.

| Access method | Pages read (example: 1 row in 1 M-row table) | When the engine chooses it |
|---|---|---|
| Sequential scan | All pages (~8,000 for 8 KB pages, 1 M rows) | No usable index, or query returns many rows |
| Index + heap fetch | 2–4 pages (index levels + 1 data page) | Selective filter with a matching index |
| Index-only scan | 1–3 pages (index only, no heap) | All needed columns are in the index |

> **Note:** An **index-only scan** skips the heap fetch entirely — it reads the answer directly out of the index leaf. This only works when every column the query needs is stored in the index itself. PostgreSQL additionally checks a visibility map to confirm the row's commit status before skipping the heap.

## Watching It Happen in SQLite

SQLite stores each table as a B-tree of rows keyed by the `rowid` (an implicit 64-bit integer). A lookup by `rowid` is a B-tree traversal directly into the table — no separate heap fetch needed. A lookup on any other column without an index is a full scan.

The query below seeds a small `products` table and looks up a row. Try running `EXPLAIN QUERY PLAN` variants to see SQLite describe the access path it chose.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Heap scan vs. index lookup</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE products (id INTEGER PRIMARY KEY, sku TEXT NOT NULL, name TEXT, price REAL); INSERT INTO products VALUES (1, 'A100', 'Wireless Mouse', 29.99); INSERT INTO products VALUES (2, 'B200', 'USB Hub', 19.99); INSERT INTO products VALUES (3, 'C300', 'Mechanical Keyboard', 89.99); INSERT INTO products VALUES (4, 'D400', 'Monitor Stand', 49.99); INSERT INTO products VALUES (5, 'E500', 'Webcam', 74.99);">-- Lookup by primary key: SQLite walks the rowid B-tree directly.
EXPLAIN QUERY PLAN
SELECT name, price FROM products WHERE id = 3;

-- Now try a lookup by sku (no index yet):
-- EXPLAIN QUERY PLAN
-- SELECT name, price FROM products WHERE sku = 'C300';

-- Then create an index and repeat:
-- CREATE INDEX idx_sku ON products (sku);
-- EXPLAIN QUERY PLAN
-- SELECT name, price FROM products WHERE sku = 'C300';</textarea>
  </div>
</div>

Uncomment and run the `sku` queries one at a time. Before the index exists, SQLite reports `SCAN products` — every page, every row. After `CREATE INDEX`, it reports `SEARCH products USING INDEX idx_sku` — it jumps straight to the matching leaf.

## Deleted Rows and Free Space

When a row is deleted, the engine marks its slot as free but does not immediately reclaim the space on disk. The page now has a **hole**. Over time, pages accumulate holes and the engine can reuse that space for new inserts, a process called **compaction** or (in PostgreSQL) **VACUUM**.

This means a row's physical address can become stale. Indexes that store physical addresses must handle this — PostgreSQL's B-tree indexes store `ctid` values and tolerate the need to re-check the heap. SQLite's B-tree tables store the data directly in the tree, so a deleted key simply disappears from the tree with no dangling pointer.

Understanding this chain — from SQL predicate, to index lookup, to page number, to slot, to bytes on disk — is what separates guessing about performance from reasoning about it.
