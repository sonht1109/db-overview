A database index is a separate data structure the engine keeps alongside a table so it can answer certain queries without reading every row. The most common index type — the one created when you write `CREATE INDEX` with no further qualification — is the **B-tree** (balanced tree). Understanding how it works lets you predict when an index will help, when it will be ignored, and why.

## The Core Idea: Trading Space for Lookup Speed

Without an index, finding rows that match `WHERE email = 'alice@example.com'` means scanning the entire table. On a million-row table that is a million comparisons. A B-tree index solves this by keeping a sorted copy of the indexed column(s), organized as a shallow, wide tree where every lookup takes at most *O(log n)* steps.

A B-tree is made of **nodes**, each holding an ordered list of keys and pointers:

- **Leaf nodes** hold the actual index keys plus a pointer (row ID / page address) back to the matching row in the table.
- **Internal nodes** hold separator keys and pointers to child nodes.
- All leaf nodes are linked left-to-right, making range scans efficient.

A rough sketch for an index on `last_name`:

```
              [Morris]
             /        \
    [Davis | Kim]    [Park | Zhang]
    /      |     \     ...
 rows    rows   rows
```

To find `'Kim'`, the engine reads three nodes (root → internal → leaf) instead of scanning every row. On a table with 1 million rows, a balanced B-tree is roughly 3–4 levels deep — the difference between 4 reads and 1,000,000.

> **Note:** SQLite, PostgreSQL, and MySQL all use B-tree variants as their default index structure. The details differ (PostgreSQL calls its flavor B+tree), but the lookup semantics are the same.

## What B-tree Indexes Are Good At

Because the index is sorted, B-trees naturally support several operation types:

| Query pattern | Example | Works? |
|---|---|---|
| Equality | `WHERE id = 42` | Yes |
| Range | `WHERE age BETWEEN 18 AND 35` | Yes |
| Prefix match | `WHERE name LIKE 'Ali%'` | Yes |
| Suffix / contains | `WHERE name LIKE '%ali%'` | No — B-tree can't help |
| ORDER BY (same column) | `ORDER BY created_at` | Yes — already sorted |
| Arbitrary function | `WHERE LOWER(email) = 'a@b.com'` | No — unless indexed on the expression |

The rule of thumb: if the query can use the sort order of the index, the index can help. If it cannot, the engine falls back to a full table scan.

## Composite Indexes and Column Order

You can index multiple columns together: `CREATE INDEX idx ON orders(customer_id, status)`. This is a **composite index** — the rows are sorted first by `customer_id`, then by `status` within each customer group.

The **leading-column rule** governs when a composite index is usable:

- Filtering on `customer_id` alone — index used.
- Filtering on `customer_id` AND `status` — index used.
- Filtering on `status` alone — index **not** used (the leading column is skipped).

Think of a phone book sorted by last name, then first name: you can look up "Smith, Alice" or all "Smiths", but you cannot efficiently find all "Alices" without knowing the last name.

## Seeing It in Action

The widget below creates a small `orders` table, runs the same query with and without an index, and lets you inspect the query plan. Try running the `EXPLAIN QUERY PLAN` first to see `SCAN orders` (full table scan), then create the index and run it again — the plan should switch to `SEARCH orders USING INDEX`.

<div class="widget" data-widget="sql">
  <div class="widget-head"><span>Interactive SQL · B-tree index vs. full scan</span></div>
  <div class="widget-body">
    <textarea data-setup="CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER, status TEXT, amount REAL); INSERT INTO orders VALUES (1,101,'shipped',250.0),(2,101,'pending',80.0),(3,102,'shipped',430.0),(4,103,'shipped',90.0),(5,103,'pending',310.0),(6,104,'shipped',75.0),(7,105,'shipped',520.0),(8,105,'pending',60.0),(9,106,'shipped',180.0),(10,107,'pending',95.0);">-- Step 1: see the plan WITHOUT an index (look for SCAN orders)
EXPLAIN QUERY PLAN
SELECT * FROM orders WHERE customer_id = 103;

-- Step 2: create the index, then re-run the EXPLAIN above
-- CREATE INDEX idx_orders_customer ON orders(customer_id);</textarea>
  </div>
</div>

Once you create `idx_orders_customer` and re-run the explain, SQLite reports `SEARCH orders USING INDEX idx_orders_customer` — it walks the B-tree to find only the rows where `customer_id = 103` instead of reading the whole table.

## The Cost of an Index

Indexes are not free:

- **Extra storage** — the index is a separate on-disk structure, roughly proportional in size to the indexed column(s) and row count.
- **Write overhead** — every `INSERT`, `UPDATE`, or `DELETE` must also update each affected index. A table with five indexes pays five extra writes per inserted row.
- **Optimizer choices** — the query planner may choose a different (sometimes worse) plan when many indexes are present. Indexes should be added deliberately, not speculatively.

A good rule: create an index when you have a real query that is slow and the column appears in a `WHERE`, `JOIN ON`, or `ORDER BY` clause with high selectivity (many distinct values). An index on a boolean column with two possible values is rarely worth the overhead.

<details class="reveal"><summary>Reveal: Why does LIKE '%term%' skip the B-tree?</summary><div class="reveal-body">A B-tree is sorted left-to-right by the full key value. A leading wildcard (<code>%term</code>) means the engine has no starting point in the sorted order — matching rows could be anywhere in the tree. It would have to visit every leaf node anyway, making the index useless. Only prefix patterns like <code>term%</code> benefit, because the engine can seek to the first key that starts with "term" and stop when the prefix no longer matches.</div></details>
