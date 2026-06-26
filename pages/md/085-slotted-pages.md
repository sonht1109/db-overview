When a database engine reads or writes data, it works in fixed-size chunks called **pages** (typically 4 KB–16 KB). Each page holds multiple records, but those records are rarely the same length — a `VARCHAR(1000)` column might store 3 bytes in one row and 900 in another. The *slotted page* format is the near-universal answer to this problem: a layout that packs variable-length records tightly while still letting the engine jump directly to any record by number.

## The Layout

A slotted page is divided into three regions that grow toward each other:

```
┌──────────────────────────────────────────────────┐
│  Page header (fixed, at the top)                 │
├──────────────────────────────────────────────────┤
│  Slot array  →  [slot 0][slot 1][slot 2]...      │  grows ↓
├──────────────────────────────────────────────────┤
│                   free space                     │
├──────────────────────────────────────────────────┤
│  ...← record N  ← record 1  ← record 0          │  grows ↑
└──────────────────────────────────────────────────┘
```

- **Page header** — stores the page ID, free-space pointer, number of slots, and a checksum.
- **Slot array** — a compact array of `(offset, length)` pairs, one per record. Slot 0 points to record 0, slot 1 to record 1, and so on. The array grows *downward* from just below the header.
- **Record area** — records are packed *upward* from the bottom of the page. When a new record arrives it is written just above the last one; its position is recorded in the next slot.

Because every record is addressed through a slot, external references (indexes, foreign keys, page-level pointers) only need to store `(page_id, slot_number)` — a **record ID (RID)** or **tuple ID (TID)**. The slot acts as an indirection layer.

## Why Indirection Matters

Without the slot array, moving a record inside the page (to compact free space after a deletion) would require updating every index entry that points to the old byte offset. With slots, you just update the single `(offset, length)` entry in the slot array and leave every external pointer untouched.

| Operation | Without slots | With slots |
|---|---|---|
| Delete a record | Must compact immediately or leave a "hole" with a forwarding pointer | Mark slot as free (`length = 0`), compact later |
| Update a record (grows) | May need to move other records; all pointers break | Move the record within the page, update one slot entry |
| External index points to | Byte offset (fragile) | `(page_id, slot_number)` (stable) |

> **Note:** When a record outgrows the page entirely after an update, the engine writes a *forwarding record* in the old slot — a tiny pointer to the new page. Queries that follow the original RID transparently follow one hop to the new location.

## Deletions and Compaction

Deleting a record marks its slot as invalid and leaves the bytes as dead space. Over time, a page can become fragmented — many small gaps between live records. The engine **reorganizes** (compacts) the page lazily: it slides all live records to the bottom, rewrites the slot array with fresh offsets, and reclaims the free space in one contiguous block. Because only the slot array changes, no external pointer breaks.

Explore this idea below. The query simulates what a slot directory might look like by tracking offset and length for each record on a hypothetical 8 KB page.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Slot directory simulation</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE slot_directory (slot_num INTEGER PRIMARY KEY, record_offset INTEGER, record_length INTEGER, is_live INTEGER DEFAULT 1);
INSERT INTO slot_directory VALUES (0, 8100, 80, 1);
INSERT INTO slot_directory VALUES (1, 7950, 150, 1);
INSERT INTO slot_directory VALUES (2, 7890, 60, 0);
INSERT INTO slot_directory VALUES (3, 7700, 190, 1);
INSERT INTO slot_directory VALUES (4, 7640, 60, 0);
INSERT INTO slot_directory VALUES (5, 7580, 60, 1);
CREATE TABLE page_meta (page_id INTEGER, page_size INTEGER, free_start INTEGER, free_end INTEGER);
INSERT INTO page_meta VALUES (42, 8192, 96, 7580);">-- Which slots are live, and how much space do they use?
SELECT
  slot_num,
  record_offset,
  record_length,
  CASE WHEN is_live = 1 THEN 'live' ELSE 'deleted' END AS status
FROM slot_directory
ORDER BY record_offset DESC;

-- Try: compute total wasted space from deleted slots
-- SELECT SUM(record_length) AS reclaimable_bytes
-- FROM slot_directory WHERE is_live = 0;</textarea>
  </div>
</div>

Uncomment the second query to see how much space compaction would recover. In a real engine (PostgreSQL calls this **VACUUM**, SQLite does it via `REINDEX` or auto-reorganization), this reclaimed space becomes available for new inserts on the same page.

## Key Takeaways

- A slotted page stores a **slot array** at the top and **records** packed from the bottom, with free space in the middle.
- Each record is referenced by a stable `(page_id, slot_number)` pair — not a raw byte offset — so records can be moved within the page without breaking indexes.
- Deletions are cheap (mark the slot); compaction is deferred and only touches the page itself.
- Almost every relational engine uses this layout or a close variant: PostgreSQL's *heap* pages, InnoDB's *row format*, SQLite's *leaf pages* for rowid tables all follow the same principle.
