Adding an index is often presented as a free optimization — an index can only make things faster, right? In reality, indexes are a deliberate trade-off: they speed up reads at the cost of write performance, storage, and query planner complexity. Understanding when indexes hurt as much as they help is one of the most practical skills in database engineering.

## The Myth: More Indexes, More Speed

The reasoning sounds logical: indexes let the database skip rows it doesn't need, so adding more indexes means more skipping, which means faster queries. Junior developers often respond to any slow query by adding an index. DBAs call this "index hoarding," and it is surprisingly common in production systems.

## What an Index Actually Costs

Every index is a secondary data structure — a B-tree (or hash, or GiST, etc.) — that the database maintains alongside the primary table. That maintenance is not free:

| Operation | Without extra indexes | With N extra indexes |
|---|---|---|
| `INSERT` | Write one row | Write one row + update N index trees |
| `UPDATE` (indexed column) | Update one row | Update row + update affected indexes |
| `DELETE` | Delete one row | Delete row + remove from all indexes |
| Storage | Table pages only | Table + index pages (often 20–50% overhead) |
| Vacuum / ANALYZE | Cheaper | More work per maintenance cycle |

On write-heavy tables — event logs, time-series ingestion, audit trails — over-indexing can cut write throughput in half. A table with 15 indexes on a high-velocity append workload is a performance anti-pattern.

## When the Planner Ignores Your Index

Even when an index exists, the query planner may choose not to use it. This is not a bug — it is the planner doing its job correctly. Planners skip indexes when:

1. **Selectivity is low.** If `status` has only three values (`pending`, `shipped`, `delivered`) and 60% of rows are `delivered`, an index on `status` for `WHERE status = 'delivered'` is worse than a full scan — the planner would jump back to the heap for 60% of rows anyway.
2. **The result set is large.** If a query returns 40% of the table, sequential scan beats random index reads.
3. **The column is used inside a function.** `WHERE LOWER(email) = 'alice@example.com'` won't use a plain index on `email`; you need a functional index `ON LOWER(email)`.
4. **Statistics are stale.** If `ANALYZE` hasn't been run recently, the planner may have wrong estimates and make poor choices.

<figure class="diagram">
<svg viewBox="0 0 660 280" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Index selectivity decision: high selectivity (few matching rows) favors index scan; low selectivity (many matching rows) favors sequential scan">
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--accent)"/>
    </marker>
    <marker id="arr-muted" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--muted)"/>
    </marker>
  </defs>

  <!-- Table representation -->
  <rect x="20" y="40" width="80" height="200" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="60" y="30" text-anchor="middle" font-size="12" font-weight="600" fill="var(--text)">Table</text>
  <!-- Rows, some highlighted -->
  <rect x="28" y="48" width="64" height="12" rx="2" fill="var(--border)" opacity="0.4"/>
  <rect x="28" y="64" width="64" height="12" rx="2" fill="var(--accent)" opacity="0.7"/>
  <rect x="28" y="80" width="64" height="12" rx="2" fill="var(--border)" opacity="0.4"/>
  <rect x="28" y="96" width="64" height="12" rx="2" fill="var(--border)" opacity="0.4"/>
  <rect x="28" y="112" width="64" height="12" rx="2" fill="var(--border)" opacity="0.4"/>
  <rect x="28" y="128" width="64" height="12" rx="2" fill="var(--accent)" opacity="0.7"/>
  <rect x="28" y="144" width="64" height="12" rx="2" fill="var(--border)" opacity="0.4"/>
  <rect x="28" y="160" width="64" height="12" rx="2" fill="var(--border)" opacity="0.4"/>
  <rect x="28" y="176" width="64" height="12" rx="2" fill="var(--accent)" opacity="0.7"/>
  <rect x="28" y="192" width="64" height="12" rx="2" fill="var(--border)" opacity="0.4"/>
  <rect x="28" y="208" width="64" height="12" rx="2" fill="var(--border)" opacity="0.4"/>
  <rect x="28" y="224" width="64" height="12" rx="2" fill="var(--border)" opacity="0.4"/>

  <!-- High selectivity path -->
  <text x="200" y="30" text-anchor="middle" font-size="12" font-weight="600" fill="var(--accent)">High Selectivity</text>
  <text x="200" y="46" text-anchor="middle" font-size="11" fill="var(--muted)">id = 42 (0.001% of rows)</text>
  <rect x="140" y="55" width="120" height="50" rx="6" fill="var(--surface-2)" stroke="var(--accent)" stroke-width="1.5"/>
  <text x="200" y="77" text-anchor="middle" font-size="11" fill="var(--text)">B-tree index</text>
  <text x="200" y="95" text-anchor="middle" font-size="11" fill="var(--accent)">→ 1 row fetched</text>
  <line x1="100" y1="75" x2="138" y2="75" stroke="var(--accent)" stroke-width="2" marker-end="url(#arr)"/>
  <text x="200" y="130" text-anchor="middle" font-size="11" fill="var(--accent)" font-weight="600">USE INDEX ✓</text>

  <!-- Low selectivity path -->
  <text x="480" y="30" text-anchor="middle" font-size="12" font-weight="600" fill="var(--muted)">Low Selectivity</text>
  <text x="480" y="46" text-anchor="middle" font-size="11" fill="var(--muted)">status = 'delivered' (60% of rows)</text>
  <rect x="420" y="55" width="120" height="50" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="480" y="77" text-anchor="middle" font-size="11" fill="var(--muted)">B-tree index</text>
  <text x="480" y="95" text-anchor="middle" font-size="11" fill="var(--muted)">→ 600K heap fetches</text>
  <line x1="100" y1="150" x2="418" y2="80" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="5,3"/>
  <text x="480" y="130" text-anchor="middle" font-size="11" fill="var(--muted)">SKIP INDEX, seq scan faster</text>

  <!-- Legend -->
  <rect x="28" y="256" width="12" height="10" rx="2" fill="var(--accent)" opacity="0.7"/>
  <text x="46" y="265" font-size="10" fill="var(--text)">matching rows</text>
  <rect x="150" y="256" width="12" height="10" rx="2" fill="var(--border)" opacity="0.6"/>
  <text x="168" y="265" font-size="10" fill="var(--muted)">non-matching rows</text>
</svg>
<figcaption>Selectivity determines whether an index helps. High-selectivity predicates (few matching rows) justify the index overhead; low-selectivity predicates often make a sequential scan faster.</figcaption>
</figure>

## The Write Amplification Problem

Consider an event logging table receiving 50,000 inserts per second. With 10 indexes on that table, every insert triggers 10 B-tree updates. Each update may cause page splits, which trigger additional writes. This write amplification can make the index maintenance cost several times the cost of the raw insert.

LSM-tree engines (RocksDB, Cassandra's SSTables) handle write amplification differently — they batch writes in memory and flush to disk in sorted order — but they still pay a cost for secondary indexes during compaction.

## Over-Indexing Anti-Patterns

- **Indexing every column "just in case"** — query patterns should drive index decisions, not column count.
- **Duplicate indexes** — `(a)` and `(a, b)` where all queries that use `(a)` alone also match `(a, b)`. The single-column index is redundant.
- **Indexing low-cardinality boolean columns** — an index on `is_deleted` (two values) almost never helps.
- **Unused indexes** — PostgreSQL's `pg_stat_user_indexes` shows index usage; indexes with zero scans are pure overhead.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · When the Index Hurts</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE events (id INTEGER PRIMARY KEY, type TEXT, user_id INTEGER, payload TEXT); WITH RECURSIVE gs(value) AS (SELECT 1 UNION ALL SELECT value+1 FROM gs WHERE value &lt; 3000) INSERT INTO events SELECT value, CASE abs(random()%3) WHEN 0 THEN 'click' WHEN 1 THEN 'view' ELSE 'purchase' END, abs(random()%200), 'data' FROM gs; CREATE INDEX idx_events_type ON events(type);">-- Low selectivity: 'click' is ~33% of rows.
-- The planner often prefers a full scan over the index here.
-- Check the query plan:
EXPLAIN QUERY PLAN
SELECT id, user_id FROM events WHERE type = 'click';

-- High selectivity: specific user narrows results significantly.
-- The index on user_id would be much more useful:
-- EXPLAIN QUERY PLAN SELECT id, type FROM events WHERE user_id = 42;</textarea>
  </div>
</div>

> **Tip:** Before adding an index, ask two questions: (1) How selective is this predicate? (2) Is this table read-heavy or write-heavy? A write-heavy table with a low-selectivity column is the worst candidate for a new index.

## Partial and Covering Indexes

When a standard index is too broad, reach for targeted alternatives:

- **Partial index** — index only the rows you actually query: `CREATE INDEX ON orders(created_at) WHERE status = 'pending'`. Smaller, faster, and more selective than indexing all orders.
- **Covering index** — include all columns a query needs so it never hits the heap: `CREATE INDEX ON orders(customer_id) INCLUDE (status, amount)`. Zero heap fetches for covered queries.
- **Expression index** — `CREATE INDEX ON users(LOWER(email))` so that `WHERE LOWER(email) = ?` uses the index.

## Key Takeaways

- Indexes speed up reads but slow down writes and consume storage — they are always a trade-off, not a free optimization.
- The query planner may correctly choose to ignore an index when selectivity is low or the result set is large.
- Over-indexing write-heavy tables is a real production problem that can halve write throughput.
- Use `EXPLAIN` / `EXPLAIN ANALYZE` to verify that an index is actually used before declaring victory.
- Partial, covering, and expression indexes often outperform broad general indexes for specific query patterns.
