Even a perfectly correct SQL query can run slowly — or grind a database to a halt — when the query planner makes a poor decision about *how* to execute it. Understanding common planning mistakes helps you write queries that cooperate with the planner, and gives you the vocabulary to diagnose problems when something is inexplicably slow.

## What the Planner Does (in One Sentence)

When you submit a SQL query, the database doesn't execute it literally. It hands the query to the **query planner** (also called the optimizer), which generates a set of candidate *execution plans* — different orderings of joins, index choices, and scan strategies — and picks the one it estimates will cost the least. The estimate is built from **statistics**: approximate counts of rows, the spread of values in a column, and index metadata. When those statistics are wrong or the planner misreads them, the chosen plan can be far worse than the optimal one.

## The Five Most Common Mistakes

### 1. Full table scan instead of index seek

If a column has an index but the query wraps the column in a function or casts it, the planner can no longer use the index efficiently — it must evaluate the expression for every row.

```sql
-- Forces a full scan; the index on `created_at` cannot be used
SELECT * FROM orders WHERE strftime('%Y', created_at) = '2024';

-- Index-friendly: compare against a range instead
SELECT * FROM orders WHERE created_at >= '2024-01-01'
                       AND created_at <  '2025-01-01';
```

The fix is almost always to move the transformation off the indexed column and onto the literal value being compared.

### 2. Stale statistics causing bad cardinality estimates

The planner estimates how many rows a filter will return (its **cardinality**). If statistics haven't been updated after a large data load, the planner may think a table has 10 000 rows when it actually has 10 million. It then chooses a nested-loop join (cheap for small tables) instead of a hash join (better for large ones), and the query slows down by orders of magnitude.

In most databases you fix this by running an explicit statistics update:

```sql
-- PostgreSQL
ANALYZE orders;

-- SQLite (updates stats used by its planner)
ANALYZE;
```

> **Note:** Many databases run `ANALYZE` automatically on a schedule, but after a bulk insert or delete it's worth triggering it manually before running expensive queries.

### 3. Join order producing a giant intermediate result

When joining several tables, the order in which rows are combined matters. Joining two large tables first, *before* filtering with a small lookup table, creates a huge intermediate result that must be sorted or hashed — only to be discarded moments later.

| Join order | Intermediate rows | Cost |
|---|---|---|
| `orders JOIN products JOIN customers WHERE customers.country = 'DE'` | millions, then filtered | high |
| `customers WHERE country = 'DE'` → join `orders` → join `products` | thousands from the start | low |

Most planners sort this out automatically with correct statistics, but explicit `WHERE` clauses and proper indexes on join columns are the best way to give the planner the information it needs.

### 4. Missing index on a foreign key used in a join

A foreign key constraint guarantees referential integrity, but it does not automatically create an index on the referencing column. Without that index, every join on that column requires a full scan of the child table.

```sql
-- If orders.customer_id has no index, this join scans all of orders
SELECT c.name, COUNT(o.id)
FROM customers c
JOIN orders o ON o.customer_id = c.id
GROUP BY c.name;

-- Fix: create the index once
CREATE INDEX idx_orders_customer_id ON orders(customer_id);
```

This is one of the most common performance oversights in schema design.

### 5. LIKE with a leading wildcard

A `LIKE '%term'` pattern cannot use a B-tree index because the matching characters are at the *end* of the value — the index is sorted by the beginning. The planner falls back to a full scan.

```sql
-- Cannot use index on email
SELECT * FROM users WHERE email LIKE '%@example.com';

-- Can use index (leading characters are fixed)
SELECT * FROM users WHERE email LIKE 'alice%';
```

If you need full-text or suffix matching at scale, the right tool is a **full-text search index** (e.g. SQLite's FTS5, Postgres's `GIN` with `tsvector`), not a standard B-tree.

## Try It: Spot the Scan

The widget below creates a small `orders` table with and without an index. Run `EXPLAIN QUERY PLAN` on both versions to see the difference in the plan SQLite chooses. Look for `SCAN` (full table scan) vs. `SEARCH … USING INDEX`.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · Index vs. Full Scan</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY, customer_id INTEGER, amount REAL, created_at TEXT); INSERT INTO orders VALUES (1, 42, 99.99, '2024-03-01'), (2, 17, 149.00, '2024-06-15'), (3, 42, 29.50, '2024-09-10'), (4, 99, 500.00, '2023-12-31'), (5, 17, 75.00, '2024-01-05'); CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);">EXPLAIN QUERY PLAN
SELECT * FROM orders WHERE customer_id = 42;</textarea>
  </div>
</div>

Now edit the query to remove the index hint by wrapping the column: `WHERE customer_id + 0 = 42` — notice the plan switches to a `SCAN`. That one-character arithmetic trick breaks index usability, illustrating exactly how function wrapping kills plans in production.

## Key Takeaways

- The planner is only as good as its statistics — keep them fresh after large data changes.
- Never wrap an indexed column in a function or expression inside a `WHERE` clause if you can avoid it.
- Always index foreign key columns on the *child* table; the constraint alone is not enough.
- Use `EXPLAIN` (or `EXPLAIN QUERY PLAN` in SQLite) early and often — it's free information about what the database is actually going to do.
