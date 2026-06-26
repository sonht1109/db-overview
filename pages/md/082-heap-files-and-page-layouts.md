When a database writes a row to disk, it does not just append text to a file the way a spreadsheet might. It places the row inside a precisely structured unit called a **page**, and those pages are collected into a **heap file**. Understanding this physical layer explains why databases behave the way they do — why some queries scan millions of rows quickly, why deleting a row does not instantly reclaim space, and why "bloat" is a real operational concern.

## The Heap File: An Unordered Collection of Pages

A **heap file** is the default storage structure for a table. "Heap" means no inherent order — rows are stored wherever there is space, not sorted by any key. When you insert a row, the engine finds a page with enough free space and writes the row there. When you delete a row, the engine marks it as dead but leaves the space on the page until it is reclaimed later (vacuumed or compacted).

This is deliberately simple:

- **Inserts are fast** — just append to the last page or fill a gap.
- **No insert-time sorting cost** — ordering is the job of indexes, not the heap.
- **Trade-off** — a full-table scan reads every page, including pages with dead rows and free space.

Most relational databases — PostgreSQL, MySQL (for non-InnoDB tables), SQLite — store tables as heap files by default.

> **Note:** InnoDB (MySQL/MariaDB's default engine) uses a **clustered index** instead, which stores rows in primary-key order inside a B-tree. The heap concept still applies to secondary structures in clustered-index engines, and many databases offer both options.

## Page Layout: What Is Inside One Page

A **page** (also called a **block**) is the smallest unit the storage engine reads from or writes to disk. Typical sizes are 4 KB, 8 KB, or 16 KB — matching OS and hardware page sizes for efficiency. Every I/O operation moves at least one full page, even if you only need one column of one row.

A page is divided into three regions:

```
┌────────────────────────────────────────────┐
│  Page Header  (metadata: page ID, LSN, …)  │
├────────────────────────────────────────────┤
│  Slot Array  [slot 0 | slot 1 | slot 2 …]  │  ← grows downward
├────────────────────────────────────────────┤
│              Free Space                    │
├────────────────────────────────────────────┤
│  … record N │ … record 1 │ record 0        │  ← grows upward
└────────────────────────────────────────────┘
```

| Region | Purpose |
|---|---|
| **Page header** | Page ID, checksum, free-space pointer, transaction info (LSN) |
| **Slot array** | Fixed-size array of `(offset, length)` pairs — one entry per record on the page |
| **Free space** | The gap between the slot array and record data; new records consume from here |
| **Record data** | Actual row bytes, packed from the bottom of the page upward |

The slot array is the key insight. Because slots are fixed-size and numbered, the engine can refer to a row by its `(page_id, slot_number)` — called a **record ID** (RID) or **tuple ID** (TID). When a row is updated and moves within the same page, only the slot entry changes; external references (like index entries pointing to this row) remain valid.

### Variable-Length Records

Real rows have variable-length fields — `VARCHAR`, `TEXT`, `BLOB`. The engine stores fixed-width fields first (integers, dates, fixed-length chars), then variable-width fields after, with a small offset array at the start of the record so it can jump directly to any field without scanning the whole row.

## Dead Rows and Fragmentation

When you `DELETE` or `UPDATE` a row, the old version is marked **dead** but stays on the page until the engine's background cleaner runs. This is intentional:

- Other transactions that started before the delete may still need to read the old version (MVCC — covered later).
- Immediately reclaiming space would require rewriting the page under concurrent readers.

Over time, a heavily-updated table accumulates dead rows and fragmented free space spread across many pages. This is **table bloat**. A full-table scan must still read every page, even pages that are 80% dead rows. Databases like PostgreSQL run a background process called `VACUUM` to reclaim that space.

## Try It: Observing Row Storage

SQLite exposes some of its page-level internals through `PRAGMA` commands. Run the query below to see how SQLite allocates pages as you insert data, and observe how page count grows with the table.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Page allocation</span></div>
  <div class="widget-body">
    <textarea data-setup="PRAGMA page_size = 4096; CREATE TABLE products ( id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT, price REAL NOT NULL ); INSERT INTO products VALUES (1, 'Widget A', 'A sturdy widget for everyday use', 9.99); INSERT INTO products VALUES (2, 'Gadget B', 'A compact gadget with many features', 24.99); INSERT INTO products VALUES (3, 'Doohickey C', 'The classic doohickey, now improved', 4.99); INSERT INTO products VALUES (4, 'Thingamajig D', 'Precision-engineered thingamajig', 49.99); INSERT INTO products VALUES (5, 'Contraption E', 'Industrial-strength contraption', 99.99);">-- Check how many pages SQLite has allocated for this database.
-- Try adding more INSERT statements above and re-running to see page_count grow.
SELECT page_count,
       page_size,
       page_count * page_size AS total_bytes_on_disk
FROM pragma_page_count(), pragma_page_size();</textarea>
  </div>
</div>

The `page_count` climbs as the table grows — each page is exactly `page_size` bytes on disk, read and written as a unit regardless of how much of the page is actually occupied by live rows.

## The Key Takeaway

A heap file is simply a collection of fixed-size pages containing variable-size records, with no inherent row ordering. The slot array inside each page makes it possible to locate and reference rows efficiently without re-packing the page on every change. This design — simple, append-friendly, and MVCC-compatible — is the foundation on top of which indexes, vacuum, and the buffer pool all operate.
