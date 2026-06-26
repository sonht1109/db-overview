The most expensive database performance problems are not caused by missing indexes or bad SQL — they are caused by designing a schema before understanding how the application will actually query it. **Access patterns first** is the discipline of enumerating every query the application needs to make, before writing any DDL, and letting those patterns drive schema and index design.

## What an Access Pattern Is

An access pattern is a precise description of one query the system will issue:

- **Which table(s)** are involved?
- **What is the filter predicate?** (equality, range, full-text, geospatial?)
- **What columns are projected** (SELECT'd)?
- **What order is required?**
- **What volume and frequency?** (10 req/s vs 10,000 req/s changes everything)
- **What consistency is required?** (Can it be slightly stale from a replica?)

Write these down as a table before the first `CREATE TABLE`. This sounds like extra ceremony, but it costs 30 minutes to catalogue access patterns up front and weeks to re-schema a production table later.

<figure class="diagram">
<svg viewBox="0 0 640 280" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Flow diagram: Access patterns inform schema, which informs indexes, which informs query plan">
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--accent)"/>
    </marker>
  </defs>

  <!-- Step 1: Access patterns -->
  <rect x="20" y="80" width="140" height="70" rx="8" fill="var(--surface-2)" stroke="var(--accent)" stroke-width="2"/>
  <text x="90" y="107" text-anchor="middle" font-size="12" font-weight="600" fill="var(--text)">Access</text>
  <text x="90" y="123" text-anchor="middle" font-size="12" font-weight="600" fill="var(--text)">Patterns</text>
  <text x="90" y="142" text-anchor="middle" font-size="10" fill="var(--muted)">what + how often</text>

  <line x1="160" y1="115" x2="200" y2="115" stroke="var(--accent)" stroke-width="2" marker-end="url(#arr)"/>

  <!-- Step 2: Schema -->
  <rect x="200" y="80" width="120" height="70" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="260" y="107" text-anchor="middle" font-size="12" font-weight="600" fill="var(--text)">Schema</text>
  <text x="260" y="123" text-anchor="middle" font-size="12" fill="var(--text)">Design</text>
  <text x="260" y="142" text-anchor="middle" font-size="10" fill="var(--muted)">tables + columns</text>

  <line x1="320" y1="115" x2="360" y2="115" stroke="var(--accent)" stroke-width="2" marker-end="url(#arr)"/>

  <!-- Step 3: Indexes -->
  <rect x="360" y="80" width="120" height="70" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="420" y="107" text-anchor="middle" font-size="12" font-weight="600" fill="var(--text)">Index</text>
  <text x="420" y="123" text-anchor="middle" font-size="12" fill="var(--text)">Selection</text>
  <text x="420" y="142" text-anchor="middle" font-size="10" fill="var(--muted)">which + order</text>

  <line x1="480" y1="115" x2="520" y2="115" stroke="var(--accent)" stroke-width="2" marker-end="url(#arr)"/>

  <!-- Step 4: Query plan -->
  <rect x="520" y="80" width="100" height="70" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
  <text x="570" y="107" text-anchor="middle" font-size="12" font-weight="600" fill="var(--text)">Query</text>
  <text x="570" y="123" text-anchor="middle" font-size="12" fill="var(--text)">Plan</text>
  <text x="570" y="142" text-anchor="middle" font-size="10" fill="var(--muted)">fast paths</text>

  <!-- Feedback arrow: query plan back to access patterns -->
  <path d="M570,152 Q570,230 90,230 Q90,195 90,152" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="5,3" fill="none" marker-end="url(#arr2)"/>
  <text x="330" y="248" text-anchor="middle" font-size="11" fill="var(--muted)">profiling reveals new or missing patterns → iterate</text>

  <defs>
    <marker id="arr2" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="var(--muted)"/>
    </marker>
  </defs>
</svg>
<figcaption>Access patterns drive schema, which drives index selection, which drives query plans. Profiling closes the loop.</figcaption>
</figure>

## A Practical Access Pattern Catalogue

Here is a worked example for an e-commerce order system:

| # | Pattern | Filter | Projection | Frequency | Notes |
|---|---|---|---|---|---|
| A1 | Customer order history | `customer_id =` | order_id, total, status, created_at | High (every page load) | Needs index on customer_id |
| A2 | Order detail | `order_id =` | all columns | High | PK lookup, already fast |
| A3 | Pending orders by age | `status = 'pending' AND created_at <` | order_id, created_at | Medium | Composite index on (status, created_at) |
| A4 | Revenue by month | aggregate over all rows | SUM(total) | Low (nightly) | Table scan OK; or a materialized view |
| A5 | Search by product name | full-text on line_items | order_id, product | Low-medium | Full-text index or search service |

Pattern A4 is a full scan that runs nightly — it does not need an index. Indexing it would hurt write performance for no benefit. That is the conclusion you can only reach if you catalogued frequencies up front.

## Schema-First vs Pattern-First

```
Schema-first (common mistake):
  CREATE TABLE orders (...)
  -- later, queries are slow
  -- add indexes reactively
  -- discover columns are missing or misnamed
  -- migration on a live table with millions of rows

Pattern-first (correct approach):
  List all queries first
  Derive the tables and columns needed
  Choose indexes that serve the highest-frequency patterns
  CREATE TABLE orders (...)
  -- schema already fits the workload
```

### Denormalization Driven by Patterns

Sometimes the pattern catalogue reveals that a join is required on every single request. That's the signal to **denormalize**: copy a column from the joined table into the primary table so the join disappears. This is a conscious, documented trade-off, not sloppiness — you're choosing read speed over write simplicity because the access pattern demands it.

## Interactive Example

The widget below simulates an access pattern audit: checking which queries are run most often against an order table, then verifying that the right index supports them.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Access Pattern Audit</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL, status TEXT NOT NULL, total REAL NOT NULL, created_at TEXT NOT NULL); CREATE INDEX idx_orders_customer ON orders(customer_id); CREATE INDEX idx_orders_status_date ON orders(status, created_at); INSERT INTO orders VALUES (1,101,'shipped',49.99,'2024-01-05'),(2,102,'pending',120.00,'2024-01-06'),(3,101,'pending',30.00,'2024-01-07'),(4,103,'cancelled',15.00,'2024-01-08'),(5,101,'shipped',200.00,'2024-01-09'),(6,102,'shipped',85.00,'2024-01-10');">-- A1: Customer order history (high frequency)
SELECT id, total, status, created_at
FROM orders
WHERE customer_id = 101
ORDER BY created_at DESC;

-- A3: Pending orders older than a date (medium frequency)
-- SELECT id, created_at FROM orders
-- WHERE status = 'pending' AND created_at &lt; '2024-01-08';</textarea>
  </div>
</div>

## When Patterns Change

Access patterns change as products grow. A reporting query that ran weekly at launch might become a real-time dashboard queried every second at scale. Build a lightweight process:

1. Log slow queries (pg_stat_statements, MySQL slow query log, SQLite EXPLAIN QUERY PLAN).
2. Compare actual patterns against the original catalogue monthly.
3. Add, remove, or reshape indexes based on the delta.

> **Key takeaway:** Schema and index design are downstream of access patterns, not the other way around. Write down every query — filter, projection, order, and frequency — before the first `CREATE TABLE`. That document is worth more than any post-hoc tuning session.
