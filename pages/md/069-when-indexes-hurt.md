Indexes are one of the most powerful tuning tools in your kit — but they are not free. Adding an index in the wrong place can slow writes, bloat storage, and even confuse the query planner into making worse decisions. Knowing when *not* to index is just as important as knowing when to.

## The Cost Side of Every Index

Every index is a secondary data structure that the database maintains in sync with the base table. That maintenance cost shows up in three places:

| Operation | What the index adds |
|---|---|
| `INSERT` | Write new index entry for every indexed column |
| `UPDATE` (indexed col) | Delete old entry, insert new one |
| `DELETE` | Remove the index entry |
| `SELECT` (wrong shape) | Extra lookup step if the index is not selective enough |

On a table that is read far more than it is written, this overhead is usually worth it. On a table receiving thousands of writes per second — think event logs, audit trails, or sensor data — each extra index is a tax on every write.

## Low-Selectivity Columns

An index on a **low-selectivity** column — one with very few distinct values — rarely helps. If 40 % of your rows have `status = 'active'`, the database often finds it cheaper to scan the whole table than to bounce between the index and the heap for 400,000 rows out of 1,000,000.

> **Note:** A common rule of thumb: if a column has fewer than ~10–20 distinct values and rows are spread roughly evenly across them, a full table scan usually beats an index scan. Always verify with `EXPLAIN QUERY PLAN` before assuming an index will help.

Try it below. The `events` table has a `type` column with only two values. Notice that even with an index, SQLite's planner may choose a full scan for the high-frequency value but use the index for a rare one.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Low-selectivity index</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE events (id INTEGER PRIMARY KEY, type TEXT, payload TEXT); INSERT INTO events WITH RECURSIVE cnt(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM cnt WHERE x < 900) SELECT x, 'common', 'data-' || x FROM cnt; INSERT INTO events WITH RECURSIVE cnt(x) AS (SELECT 901 UNION ALL SELECT x+1 FROM cnt WHERE x < 1000) SELECT x, 'rare', 'data-' || x FROM cnt; CREATE INDEX idx_type ON events(type);">-- 900 rows are 'common', only 100 are 'rare'
-- Compare the plans for each value:
EXPLAIN QUERY PLAN SELECT * FROM events WHERE type = 'common';

-- Now try the rare value — does the planner behave differently?
-- EXPLAIN QUERY PLAN SELECT * FROM events WHERE type = 'rare';</textarea>
  </div>
</div>

## Write-Heavy Tables

Consider a `page_views` table that records every click on a website. If you add indexes on `user_id`, `page_id`, `session_id`, and `created_at` separately, each page view triggers four index writes in addition to the row insert. Under heavy load, those writes compete for I/O and locks — you can turn a fast insert path into a bottleneck.

```sql
-- A table drowning in indexes
CREATE TABLE page_views (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER,
  page_id    INTEGER,
  session_id TEXT,
  created_at TEXT
);

CREATE INDEX idx_user    ON page_views(user_id);
CREATE INDEX idx_page    ON page_views(page_id);
CREATE INDEX idx_session ON page_views(session_id);
CREATE INDEX idx_ts      ON page_views(created_at);
-- Every INSERT now updates 4 additional B-trees
```

The fix is usually to keep only the index(es) that real queries actually use, and to lean on a composite index that serves multiple query patterns at once (as covered in the previous topic).

## Index Maintenance During Bulk Loads

A related trap: if you bulk-load millions of rows into a table that already has indexes, the database updates each index incrementally — row by row. This can make a load that would otherwise take seconds take minutes.

The classic solution is to **drop indexes before bulk loading and recreate them after**:

```sql
-- 1. Drop the index
DROP INDEX IF EXISTS idx_user;

-- 2. Load millions of rows (fast — no index to maintain)
INSERT INTO page_views ...;

-- 3. Recreate the index in one efficient pass
CREATE INDEX idx_user ON page_views(user_id);
```

Building the index in a single pass over sorted data is much faster than updating the B-tree one row at a time.

## Redundant and Duplicate Indexes

It is easy to accumulate indexes that overlap. If you already have a composite index on `(user_id, created_at)`, a separate single-column index on `user_id` is usually redundant — the composite index already satisfies queries that filter only on `user_id` (the left-prefix rule from the previous topic). Keeping both wastes space and write overhead with no query benefit.

<details class="reveal"><summary>Reveal: When would you keep the single-column index anyway?</summary><div class="reveal-body">If the composite index is very wide (many bytes per key) and a high-volume query filters only on <code>user_id</code>, the narrow single-column index might produce smaller I/O — fewer bytes read per index entry. In practice this is rare; start by dropping the redundant index and measure.</div></details>

## The Bottom Line

Indexes are a deliberate trade: you pay in write overhead and storage to gain read speed. Before adding an index, ask:

1. **Is this query actually slow?** Profile first — don't index speculatively.
2. **Is the column selective enough?** Low-cardinality columns rarely benefit.
3. **How write-heavy is the table?** The more writes, the higher the cost per index.
4. **Does a composite index already cover this?** Avoid redundant single-column indexes.
5. **Will this be used for a bulk load?** Consider dropping and recreating afterward.

A lean, well-chosen set of indexes almost always outperforms a table buried under a dozen half-considered ones.
