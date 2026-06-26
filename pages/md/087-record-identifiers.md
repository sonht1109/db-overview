Every record stored in a database needs an address — a way for the engine to say "go fetch *that specific row* off disk." The previous page showed how slotted pages give each record a slot number. Now we zoom out: how does the rest of the database — indexes, the query executor, foreign key constraints — refer to a record? The answer is the **record identifier**, also called a **RID**, **TID** (tuple ID), or **rowid** depending on the system.

## What a Record Identifier Is

A record identifier is the physical address of a row within the storage layer. In a slotted-page heap file it is almost always a two-part value:

```
RID = (page_id, slot_number)
```

- **page_id** — which page in the file holds the record (often a file number + page number pair in multi-file engines).
- **slot_number** — which slot in that page's slot directory points to the record's actual byte offset.

Because the slot directory is the indirection layer, the slot number stays stable even when the record is moved within the page during compaction. External references — indexes, in particular — store the RID, not the raw byte offset.

| Component | Size (typical) | What it means |
|---|---|---|
| File / segment ID | 1–2 bytes | Which physical file on disk |
| Page number | 3–4 bytes | Which page within the file |
| Slot number | 1–2 bytes | Which slot in that page |
| **Total** | **~6 bytes** | The physical address of one row |

> **Note:** PostgreSQL calls this a `ctid` (column tuple ID) and exposes it as a hidden system column you can query directly. SQLite uses a 64-bit integer `rowid`. InnoDB identifies rows by primary key internally — it is a *clustered* index, so there is no separate physical RID at all.

## RIDs in Indexes

The link between logical data and physical rows runs through the index. A typical **B-tree secondary index** stores entries of the form:

```
(indexed_value, RID)
```

When you run a query like `WHERE email = 'alice@example.com'`, the engine:

1. Walks the B-tree to find the leaf entry for that email value.
2. Reads the RID stored there.
3. Goes directly to `(page_id, slot_number)` in the heap file and fetches the full row.

This two-step process is called a **heap fetch** or **bookmark lookup**. It is fast because the RID is an exact physical address — no scanning required.

The widget below simulates the concept of an index that maps values to RIDs. Run it to see how the engine would resolve a lookup.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Index-to-RID lookup</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE heap_pages (page_id INTEGER, slot_num INTEGER, email TEXT, name TEXT, PRIMARY KEY (page_id, slot_num));
INSERT INTO heap_pages VALUES (3, 0, 'alice@example.com', 'Alice');
INSERT INTO heap_pages VALUES (3, 1, 'bob@example.com', 'Bob');
INSERT INTO heap_pages VALUES (5, 0, 'carol@example.com', 'Carol');
INSERT INTO heap_pages VALUES (5, 2, 'dave@example.com', 'Dave');
CREATE TABLE email_index (email TEXT PRIMARY KEY, page_id INTEGER, slot_num INTEGER);
INSERT INTO email_index VALUES ('alice@example.com', 3, 0);
INSERT INTO email_index VALUES ('bob@example.com', 3, 1);
INSERT INTO email_index VALUES ('carol@example.com', 5, 0);
INSERT INTO email_index VALUES ('dave@example.com', 5, 2);">-- Step 1: look up the RID in the index
-- Step 2: use it to fetch the row from the 'heap'
SELECT
  i.email,
  i.page_id,
  i.slot_num,
  h.name AS fetched_name
FROM email_index AS i
JOIN heap_pages AS h
  ON h.page_id = i.page_id AND h.slot_num = i.slot_num
WHERE i.email = 'carol@example.com';</textarea>
  </div>
</div>

Try changing the `WHERE` clause to look up a different email. Notice that the join on `(page_id, slot_num)` is the exact operation the storage engine performs when it follows a RID — your SQL just makes the two-step explicit.

## When RIDs Become Unstable

RIDs are physical addresses, so anything that *moves a row to a different page* breaks them. This matters in two common situations:

**1. VACUUM / page reorganization across pages.**
If the engine moves a row from one page to another (not just within the same page), it must leave a *forwarding pointer* in the old slot so that existing index entries still work. The next time an index uses the old RID, the engine follows the forwarding pointer to the new location — one extra I/O. After a while, stale forwarding pointers are cleaned up, and index entries are updated to the new RID. PostgreSQL calls this `VACUUM`; SQL Server calls it a *ghost record* sweep.

**2. Clustered (index-organized) tables.**
InnoDB (MySQL/MariaDB) and SQL Server's clustered indexes do not use a heap at all. Rows are stored *inside* the B-tree leaf pages, ordered by primary key. There is no separate heap RID; the primary key value itself is the row locator. Secondary indexes store the primary key value rather than a physical RID, which means:

- Secondary index lookups do two B-tree traversals (secondary index → primary key → row).
- Rows never have forwarding pointers — moving a row during a page split just updates the B-tree structure.

<details class="reveal"><summary>Reveal: Why do secondary indexes in InnoDB store the primary key, not a physical RID?</summary><div class="reveal-body">

Because InnoDB rows live inside the primary-key B-tree, their physical location changes every time the B-tree splits or merges pages. If secondary indexes stored physical RIDs they would become stale constantly. Storing the primary key value instead means the address is always logically correct — the engine just does a second B-tree lookup to resolve it. This is why choosing a short, stable primary key matters so much in InnoDB: every secondary index entry carries a copy of it.

</div></details>

## Key Takeaways

- A **record identifier (RID)** is the physical address `(page_id, slot_number)` that pinpoints a row in a heap file.
- Secondary indexes store RIDs so they can jump directly to the right slot after a B-tree lookup.
- RIDs are stable *within* a page because of the slot-directory indirection layer, but become stale if a row migrates to a different page — the engine handles this with forwarding pointers.
- Clustered tables (InnoDB, SQL Server) skip the heap entirely: the primary key *is* the locator, and secondary indexes store the primary key value rather than a physical address.
